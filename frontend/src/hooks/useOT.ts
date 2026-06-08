// frontend/src/hooks/useOT.ts
// Client-side OT state machine.
//
// Key invariant at all times:
//   visibleElements = apply(pendingOps, confirmedElements)
//
// Two transitions:
//   A) Local action  → create Op → apply optimistically → add to pending → emit to server
//   B) Server op ACK → if mine: advance confirmed + drop pending
//                    → if others: rebase all pending ops against it

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import { nextHLC, receiveHLC } from '../ot/hlc';
import { applyOp, transformBatch } from '../ot/transform';
import type { AtomicOp, ClientOp, AcceptedOp } from '../ot/types';

// ─── Helpers to build AtomicOps ───────────────────────────────────────────────

export function setPropertyOp(elementId: string, key: string, value: unknown): AtomicOp {
  return { type: 'SetProperty', elementId, key, value };
}

/**
 * Diff two element snapshots and produce SetProperty ops for every changed key.
 * Used to bridge the existing "full element update" API to granular OT ops.
 */
export function diffElementOps(before: any, after: any): AtomicOp[] {
  if (!before || !after || before.id !== after.id) return [];
  const ops: AtomicOp[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === 'id' || key === 'type' || key === 'element_type') continue;
    const bv = JSON.stringify(before[key]);
    const av = JSON.stringify(after[key]);
    if (bv !== av) {
      ops.push({ type: 'SetProperty', elementId: after.id, key, value: after[key] });
    }
  }
  return ops;
}

export function insertElementOp(pageId: string, element: any, afterId: string | null): AtomicOp {
  return { type: 'InsertElement', pageId, afterId, element };
}

export function deleteElementOp(pageId: string, elementId: string): AtomicOp {
  return { type: 'DeleteElement', elementId, pageId };
}

export function moveElementOp(pageId: string, elementId: string, afterId: string | null): AtomicOp {
  return { type: 'MoveElement', elementId, pageId, afterId };
}

// ─── Internal state (NOT React state — never causes re-renders) ───────────────

interface OTInternalState {
  confirmedElements: any[];
  confirmedRevision: number;
  pendingOps: ClientOp[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseOTOptions {
  designId: string | undefined;
  pageId: string | undefined;
  socket: Socket | null;
  /** Called whenever visibleElements changes (due to local or remote op). */
  onElementsChange: (elements: any[]) => void;
  onRemoteOpAccepted?: (pageId: string, ops: AtomicOp[], revision: number) => void;
}

export interface UseOTReturn {
  /** Current visible elements (confirmedState + pending). */
  visibleElements: any[];
  /** Stable client identifier for this session. */
  clientId: string;
  /**
   * Apply a batch of atomic ops optimistically and emit to server.
   * Returns the new visible elements (so callers can use them synchronously).
   */
  pushOps: (atomicOps: AtomicOp[]) => any[];
  /**
   * Convenience: diff old vs new element and push SetProperty ops for changes.
   */
  pushElementUpdate: (before: any, after: any) => void;
  /**
   * Convenience: push an InsertElement op.
   */
  pushInsert: (element: any, afterId: string | null) => void;
  /**
   * Convenience: push a DeleteElement op.
   */
  pushDelete: (elementId: string) => void;
  /**
   * Convenience: push a MoveElement op (z-index reorder).
   */
  pushMove: (elementId: string, afterId: string | null) => void;
  /**
   * Set the initial confirmed state (called once when design loads).
   */
  setInitialState: (elements: any[], revision: number) => void;
  /**
   * Called by useCollaboration when socket reconnects.
   * Triggers catch-up request to server.
   */
  onReconnect: () => void;
  /**
   * Get the current confirmed revision.
   */
  getConfirmedRevision: () => number;
}

export function useOT({ designId, pageId, socket, onElementsChange, onRemoteOpAccepted }: UseOTOptions): UseOTReturn {
  // Stable client ID for this browser session.
  const clientId = useMemo(() => crypto.randomUUID(), []);

  // Internal OT state — in a ref so ops never cause re-render loops.
  const stateRef = useRef<OTInternalState>({
    confirmedElements: [],
    confirmedRevision: 0,
    pendingOps: [],
  });

  // Visible elements: the one React state that drives the UI.
  const [visibleElements, setVisibleElements] = useState<any[]>([]);

  // Ref to avoid stale closure in socket callbacks.
  const onElementsChangeRef = useRef(onElementsChange);
  useEffect(() => { onElementsChangeRef.current = onElementsChange; }, [onElementsChange]);

  const onRemoteOpAcceptedRef = useRef(onRemoteOpAccepted);
  useEffect(() => { onRemoteOpAcceptedRef.current = onRemoteOpAccepted; }, [onRemoteOpAccepted]);

  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  const pageIdRef = useRef(pageId);
  useEffect(() => { pageIdRef.current = pageId; }, [pageId]);

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Recompute visible state and trigger React update. */
  function _setVisible(elements: any[]) {
    setVisibleElements(elements);
    // Notify EditorPage synchronously (via callback) so pages store stays in sync.
    onElementsChangeRef.current(elements);
  }

  function _recomputeVisible(confirmed: any[], pending: ClientOp[]): any[] {
    return pending.reduce((els, op) => applyOp(els, op), confirmed);
  }

  // ── Socket listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    // Every accepted op — our own (ACK) or someone else's.
    const handleAccepted = (accepted: AcceptedOp & { designId: string }) => {
      if (accepted.designId !== designId) return;

      receiveHLC(accepted.timestamp);

      if (accepted.pageId !== pageIdRef.current) {
        onRemoteOpAcceptedRef.current?.(accepted.pageId, accepted.ops, accepted.acceptedRevision);
        return;
      }

      const state = stateRef.current;

      if (accepted.clientId === clientId) {
        // ── Our own op confirmed ──────────────────────────────────────────────
        // Advance confirmedState to include this op.
        state.confirmedElements = applyOp(state.confirmedElements, accepted);
        state.confirmedRevision = accepted.acceptedRevision;
        // Remove it from pending (match by opId).
        state.pendingOps = state.pendingOps.filter(p => p.opId !== accepted.opId);
        // Recompute visible from new confirmed + remaining pending.
        const visible = _recomputeVisible(state.confirmedElements, state.pendingOps);
        _setVisible(visible);

      } else {
        // ── Someone else's op ─────────────────────────────────────────────────
        // 1. Apply to confirmedState.
        state.confirmedElements = applyOp(state.confirmedElements, accepted);
        state.confirmedRevision = accepted.acceptedRevision;

        // 2. Rebase each pending op against the server op.
        state.pendingOps = state.pendingOps.map(pending => ({
          ...pending,
          ops: transformBatch(pending.ops, accepted.ops),
          revision: accepted.acceptedRevision,
        }));

        // 3. Recompute visible state (user sees their work preserved).
        const visible = _recomputeVisible(state.confirmedElements, state.pendingOps);
        _setVisible(visible);
      }
    };

    // Catch-up response after reconnect.
    // [FIX Vấn đề 7] Hybrid mode: 'delta' hoặc 'snapshot' tuỳ ngưỡng server quyết định.
    const handleCatchUp = (payload: {
      designId: string;
      type?: 'delta' | 'snapshot';        // 'delta' (default cũ) hoặc 'snapshot'
      ops?: AcceptedOp[];                 // Chỉ có khi type='delta'
      elements?: any[];                   // Chỉ có khi type='snapshot'
      currentRevision: number;
      pageId?: string | null;             // pageId của snapshot (nếu có)
    }) => {
      if (payload.designId !== designId) return;

      if (payload.type === 'snapshot' && payload.elements) {
        // ── Mode 2: Full Snapshot ────────────────────────────────────────────
        // Thay thế toàn bộ elements của OT state bằng snapshot từ DB.
        // Bỏ qua hoàn toàn việc replay op — ngăn CPU freeze với hàng nghìn ops.
        console.log(`[OT] Catch-up SNAPSHOT: replacing ${payload.elements.length} elements (rev=${payload.currentRevision})`);

        stateRef.current.confirmedElements = payload.elements;
        stateRef.current.confirmedRevision = payload.currentRevision;
        stateRef.current.pendingOps = [];    // Xóa pending ops — snapshot là trạng thái cuối cùng

        const visible = _recomputeVisible(stateRef.current.confirmedElements, []);
        _setVisible(visible);
        return;
      }

      // ── Mode 1: Delta Replay (mặc định) ──────────────────────────────────
      const ops = payload.ops ?? [];
      console.log(`[OT] Catch-up DELTA: applying ${ops.length} missed ops`);

      // Apply all missed server ops sequentially.
      for (const op of ops) {
        if (op.clientId === clientId) {
          // Our own op — it was accepted while we were offline.
          stateRef.current.confirmedElements = applyOp(stateRef.current.confirmedElements, op);
          stateRef.current.confirmedRevision = op.acceptedRevision;
          stateRef.current.pendingOps = stateRef.current.pendingOps.filter(p => p.opId !== op.opId);
        } else {
          stateRef.current.confirmedElements = applyOp(stateRef.current.confirmedElements, op);
          stateRef.current.confirmedRevision = op.acceptedRevision;
          stateRef.current.pendingOps = stateRef.current.pendingOps.map(pending => ({
            ...pending,
            ops: transformBatch(pending.ops, op.ops),
            revision: op.acceptedRevision,
          }));
        }
      }

      // Discard pending ops that became pure no-ops after rebase.
      stateRef.current.pendingOps = stateRef.current.pendingOps.filter(
        p => p.ops.some(op => op.type !== 'NoOp')
      );

      // Re-emit still-pending ops (they weren't confirmed while offline).
      for (const pending of stateRef.current.pendingOps) {
        socketRef.current?.emit('ot-op', { designId, ...pending });
      }

      const visible = _recomputeVisible(
        stateRef.current.confirmedElements,
        stateRef.current.pendingOps
      );
      _setVisible(visible);
    };

    socket.on('ot-accepted', handleAccepted);
    socket.on('ot-catchup-response', handleCatchUp);

    return () => {
      socket.off('ot-accepted', handleAccepted);
      socket.off('ot-catchup-response', handleCatchUp);
    };
  }, [socket, designId, clientId]);

  // ── Public API ──────────────────────────────────────────────────────────────

  const setInitialState = useCallback((elements: any[], revision: number) => {
    stateRef.current = {
      confirmedElements: elements,
      confirmedRevision: revision,
      pendingOps: [],
    };
    setVisibleElements(elements);
  }, []);

  const pushOps = useCallback((atomicOps: AtomicOp[]): any[] => {
    if (!designId || !pageId) return stateRef.current.confirmedElements;
    const meaningful = atomicOps.filter(op => op.type !== 'NoOp');
    if (meaningful.length === 0) return _recomputeVisible(
      stateRef.current.confirmedElements, stateRef.current.pendingOps
    );

    const op: ClientOp = {
      opId: crypto.randomUUID(),
      clientId,
      pageId,
      revision: stateRef.current.confirmedRevision,
      timestamp: nextHLC(),
      ops: meaningful,
    };

    // Optimistic apply to visible state.
    const currentVisible = _recomputeVisible(
      stateRef.current.confirmedElements, stateRef.current.pendingOps
    );
    const newVisible = applyOp(currentVisible, op);

    // Queue as pending.
    stateRef.current.pendingOps.push(op);

    // React update.
    setVisibleElements(newVisible);
    onElementsChangeRef.current(newVisible);

    // Emit to server.
    socketRef.current?.emit('ot-op', { designId, ...op });

    return newVisible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, pageId, clientId]);

  const pushElementUpdate = useCallback((before: any, after: any) => {
    const ops = diffElementOps(before, after);
    if (ops.length > 0) pushOps(ops);
  }, [pushOps]);

  const pushInsert = useCallback((element: any, afterId: string | null) => {
    if (!pageId) return;
    pushOps([insertElementOp(pageId, element, afterId)]);
  }, [pushOps, pageId]);

  const pushDelete = useCallback((elementId: string) => {
    if (!pageId) return;
    pushOps([deleteElementOp(pageId, elementId)]);
  }, [pushOps, pageId]);

  const pushMove = useCallback((elementId: string, afterId: string | null) => {
    if (!pageId) return;
    pushOps([moveElementOp(pageId, elementId, afterId)]);
  }, [pushOps, pageId]);

  const onReconnect = useCallback(() => {
    if (!designId || !socketRef.current?.connected) return;
    const { confirmedRevision } = stateRef.current;
    console.log(`[OT] Requesting catch-up from revision ${confirmedRevision} (pageId=${pageId})`);
    // [FIX Vấn đề 7] Truyền pageId để server có thể lấy snapshot đúng trang nếu cần
    socketRef.current.emit('ot-catchup', { designId, sinceRevision: confirmedRevision, pageId });
  }, [designId, pageId]);

  const getConfirmedRevision = useCallback(() => {
    return stateRef.current.confirmedRevision;
  }, []);

  return {
    visibleElements,
    clientId,
    pushOps,
    pushElementUpdate,
    pushInsert,
    pushDelete,
    pushMove,
    setInitialState,
    onReconnect,
    getConfirmedRevision,
  };
}
