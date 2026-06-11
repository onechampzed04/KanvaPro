// frontend/src/hooks/useCommandHistory.ts
// === FIX #3: Undo/Redo bằng Command Diff Pattern ===
// Thay vì clone toàn bộ array (JSON.parse/stringify tốn RAM),
// mỗi command chỉ lưu sự khác biệt (diff) của các element bị thay đổi.

import { useRef, useCallback } from 'react';

// ─── Kiểu dữ liệu Command ─────────────────────────────────────────────────────

type CommandAction =
  | { type: 'UPDATE'; elementId: string; before: Record<string, any>; after: Record<string, any> }
  | { type: 'ADD'; elements: any[] }        // Thêm 1 hoặc nhiều element
  | { type: 'DELETE'; elements: any[] }     // Xóa 1 hoặc nhiều element
  | { type: 'REORDER'; before: any[]; after: any[] } // Thay đổi thứ tự (Z-index, page reorder)
  | { type: 'BATCH'; commands: CommandAction[] }; // Nhóm nhiều lệnh thành 1 bước undo

const MAX_HISTORY = 80; // Số bước lưu tối đa

// ─── Hàm tính diff giữa 2 object (chỉ lưu field thay đổi) ───────────────────
function diffObjects(before: Record<string, any>, after: Record<string, any>): {
  before: Record<string, any>;
  after: Record<string, any>;
} {
  const beforeDiff: Record<string, any> = {};
  const afterDiff: Record<string, any> = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const bVal = JSON.stringify(before[key]);
    const aVal = JSON.stringify(after[key]);
    if (bVal !== aVal) {
      beforeDiff[key] = before[key];
      afterDiff[key] = after[key];
    }
  }
  return { before: beforeDiff, after: afterDiff };
}

// ─── Apply command: thực thi lệnh lên mảng elements ─────────────────────────
function applyCommand(elements: any[], command: CommandAction, direction: 'undo' | 'redo'): any[] {
  switch (command.type) {
    case 'UPDATE': {
      const patch = direction === 'undo' ? command.before : command.after;
      
      const currentEl = elements.find(el => el.id === command.elementId);
      if (!currentEl) {
        throw new Error('SYNC_CONFLICT');
      }

      return elements.map(el =>
        el.id === command.elementId ? { ...el, ...patch } : el
      );
    }
    case 'ADD': {
      const ids = new Set(command.elements.map(e => e.id));
      if (direction === 'undo') {
        return elements.filter(el => !ids.has(el.id));
      } else {
        const existingIds = new Set(elements.map(e => e.id));
        return [...elements, ...command.elements.filter(e => !existingIds.has(e.id))];
      }
    }
    case 'DELETE': {
      const ids = new Set(command.elements.map(e => e.id));
      if (direction === 'undo') {
        // Khôi phục lại đúng vị trí cũ (z_index)
        return [...elements, ...command.elements].sort((a, b) =>
          (a.z_index ?? 0) - (b.z_index ?? 0)
        );
      } else {
        return elements.filter(el => !ids.has(el.id));
      }
    }
    case 'REORDER': {
      return direction === 'undo' ? command.before : command.after;
    }
    case 'BATCH': {
      const cmds = direction === 'undo' ? [...command.commands].reverse() : command.commands;
      return cmds.reduce((els, cmd) => applyCommand(els, cmd, direction), elements);
    }
  }
}

// ─── Hook chính ───────────────────────────────────────────────────────────────

export function useCommandHistory() {
  const undoStack = useRef<CommandAction[]>([]);
  const redoStack = useRef<CommandAction[]>([]);
  const isApplyingRef = useRef(false); // Cờ ngăn ghi lịch sử khi đang undo/redo

  /**
   * Push một command vào undo stack.
   * Nên gọi TRƯỚC khi thực hiện thao tác.
   */
  const pushCommand = useCallback((command: CommandAction) => {
    if (isApplyingRef.current) return;
    undoStack.current.push(command);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = []; // Clear redo khi có thao tác mới
  }, []);

  /**
   * Shortcut: tạo command UPDATE tự động bằng cách diff before/after.
   * Chỉ lưu các field thực sự thay đổi → tiết kiệm RAM.
   */
  const pushUpdate = useCallback((elementId: string, before: Record<string, any>, after: Record<string, any>) => {
    const diff = diffObjects(before, after);
    // Không lưu nếu không có gì thay đổi
    if (Object.keys(diff.after).length === 0) return;
    pushCommand({ type: 'UPDATE', elementId, before: diff.before, after: diff.after });
  }, [pushCommand]);

  /**
   * Shortcut: tạo command ADD (thêm element).
   */
  const pushAdd = useCallback((addedElements: any[]) => {
    pushCommand({ type: 'ADD', elements: addedElements });
  }, [pushCommand]);

  /**
   * Shortcut: tạo command DELETE (xóa element).
   * Lưu lại snapshot nhỏ của các element bị xóa để khôi phục.
   */
  const pushDelete = useCallback((deletedElements: any[]) => {
    pushCommand({ type: 'DELETE', elements: deletedElements });
  }, [pushCommand]);

  /**
   * Shortcut: tạo command REORDER (thay đổi thứ tự layer).
   * Cần truyền cả before (mảng cũ) và after (mảng mới).
   * CHÚ Ý: Dùng cho thao tác reorder ít element, không phải toàn bộ.
   */
  const pushReorder = useCallback((before: any[], after: any[]) => {
    pushCommand({ type: 'REORDER', before, after });
  }, [pushCommand]);

  /**
   * Undo: lấy command cuối từ undoStack, áp ngược lại elements.
   * Trả về mảng elements mới sau khi undo (hoặc null nếu stack rỗng).
   */
  const undo = useCallback((currentElements: any[]): any[] | null => {
    if (undoStack.current.length === 0) return null;
    const command = undoStack.current.pop()!;
    redoStack.current.push(command);
    isApplyingRef.current = true;
    try {
      const result = applyCommand(currentElements, command, 'undo');
      isApplyingRef.current = false;
      return result;
    } catch (err: any) {
      isApplyingRef.current = false;
      if (err.message === 'SYNC_CONFLICT') {
        alert('Không thể hoàn tác do phần tử này đã bị thay đổi hoặc xóa bởi người khác (Xung đột đồng bộ).');
        redoStack.current.pop(); // Remove from redo since it failed
        return currentElements;
      }
      throw err;
    }
  }, []);

  /**
   * Redo: lấy command từ redoStack, áp lại elements.
   */
  const redo = useCallback((currentElements: any[]): any[] | null => {
    if (redoStack.current.length === 0) return null;
    const command = redoStack.current.pop()!;
    undoStack.current.push(command);
    isApplyingRef.current = true;
    try {
      const result = applyCommand(currentElements, command, 'redo');
      isApplyingRef.current = false;
      return result;
    } catch (err: any) {
      isApplyingRef.current = false;
      if (err.message === 'SYNC_CONFLICT') {
        alert('Không thể tiến tác do phần tử này đã bị thay đổi hoặc xóa bởi người khác.');
        undoStack.current.pop();
        return currentElements;
      }
      throw err;
    }
  }, []);

  const canUndo = () => undoStack.current.length > 0;
  const canRedo = () => redoStack.current.length > 0;
  const clearHistory = () => {
    undoStack.current = [];
    redoStack.current = [];
  };

  return {
    pushCommand,
    pushUpdate,
    pushAdd,
    pushDelete,
    pushReorder,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    isApplyingRef,
  };
}
