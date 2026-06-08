// src/hooks/useCollaboration.ts
// ─── [FIX Vấn đề 2] Loại bỏ hoàn toàn cơ chế song hành State-Ref ─────────────
// TRƯỚC: Dùng useRef song song cho onRemoteUpdate, onRemotePageAdded... để tránh
//        stale closure. Việc đồng bộ thủ công cực kỳ dễ bị thiếu sót.
//
// SAU:   Tất cả socket event listeners gọi trực tiếp CALLBACK PROP thông qua một
//        ref DUY NHẤT (callbacksRef). Đây là pattern "stable ref to latest callbacks"
//        — sạch hơn, an toàn hơn và không cần cập nhật store song song.
//        Trạng thái presence (activeUsers, isConnected, elementLocks) được quản lý
//        tập trung bởi Zustand store (useCollabStore), tránh re-render không cần thiết.
// ─────────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCollabStore } from '../store/useCollabStore';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface CollaboratorInfo {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  socketId: string;
  joinedAt: number;
}

export interface ElementDelta {
  pageId: string;
  elementId: string;
  action: 'update' | 'add' | 'delete' | 'reorder';
  changes?: Record<string, any>;
}

export interface ElementLockInfo {
  userId: string;
  name: string;
  avatarColor: string;
  pageId: string;
}

// ─── Hook Interface ───────────────────────────────────────────────────────────

interface UseCollaborationOptions {
  designId: string | undefined;
  onRemoteUpdate: (pageId: string, elements: any[]) => void;
  onRemotePageAdded?: (newPage: any, addedByName: string) => void;
  onRemotePageDeleted?: (pageId: string, deletedByName: string) => void;
  onRemoteCursorMove?: (userId: string, name: string, color: string, x: number, y: number) => void;
  onRemotePageResized?: (pageId: string, width: number, height: number, isLive: boolean, userName: string) => void;
  onRemoteDelta?: (delta: ElementDelta) => void;
  onInitialRevision?: (revision: number) => void;
  // [FIX 6] Callback khi nhận thumbnail mới từ collaborator khác
  onRemotePageThumbnailUpdated?: (pageId: string, thumbUrl: string) => void;
}

interface UseCollaborationReturn {
  // ── Presence (đọc từ Zustand, không cần return riêng) ────────────────────
  socket: Socket | null;
  // ── Element broadcast ────────────────────────────────────────────────────
  emitElementsUpdate: (pageId: string, elements: any[]) => void;
  emitElementsUpdateImmediate: (pageId: string, elements: any[]) => void;
  emitElementDelta: (delta: ElementDelta) => void;
  // ── Presence emitters ────────────────────────────────────────────────────
  emitPageChanged: (pageId: string) => void;
  emitPageAdded: (newPage: any) => void;
  emitPageDeleted: (pageId: string) => void;
  emitCursorMove: (designId: string, x: number, y: number) => void;
  emitPageResize: (pageId: string, width: number, height: number, isLive: boolean) => void;
  // [FIX 6] Emitter broadcast thumbnail mới cho tất cả collaborator
  emitPageThumbnailUpdated: (pageId: string, thumbUrl: string) => void;
  // [FIX #8] Emitters cho element locking (text edit)
  emitElementLock: (designId: string, pageId: string, elementId: string) => void;
  emitElementUnlock: (designId: string, elementId: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCollaboration({
  designId,
  onRemoteUpdate,
  onRemotePageAdded,
  onRemotePageDeleted,
  onRemoteCursorMove,
  onRemotePageResized,
  onRemoteDelta,
  onInitialRevision,
  onRemotePageThumbnailUpdated,
}: UseCollaborationOptions): UseCollaborationReturn {

  const socketRef = useRef<Socket | null>(null);

  // [FIX Vấn đề 2] Đây là DUYỆT NHẤT một ref cần thiết:
  // Gom tất cả callbacks vào một object, tự động cập nhật khi props thay đổi.
  // Socket listeners gọi callbacksRef.current.xxx() → luôn lấy hàm MỚI NHẤT.
  // Không còn hàng chục useRef riêng lẻ + useEffect đồng bộ từng cái.
  const callbacksRef = useRef({
    onRemoteUpdate,
    onRemotePageAdded,
    onRemotePageDeleted,
    onRemoteCursorMove,
    onRemotePageResized,
    onRemoteDelta,
    onInitialRevision,
    onRemotePageThumbnailUpdated,
  });
  // Đồng bộ tất cả callbacks trong 1 useEffect duy nhất — tránh dependency hell
  useEffect(() => {
    callbacksRef.current = {
      onRemoteUpdate,
      onRemotePageAdded,
      onRemotePageDeleted,
      onRemoteCursorMove,
      onRemotePageResized,
      onRemoteDelta,
      onInitialRevision,
      onRemotePageThumbnailUpdated,
    };
  }); // Không có dependency array → chạy mỗi render để luôn sync mới nhất

  // ── Zustand actions (không gây re-render khi chỉ gọi actions) ──────────────
  const {
    setActiveUsers,
    setIsConnected,
    setSocketId,
    setElementLock,
    removeElementLock,
    removeElementLocksBatch,
    syncElementLocks,
    setRemoteCursor,
    resetCollabState,
  } = useCollabStore.getState();

  // ── Throttle timers ────────────────────────────────────────────────────────
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEmitRef = useRef<{ pageId: string; elements: any[] } | null>(null);
  const throttleResizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResizeEmitRef = useRef<{ pageId: string; width: number; height: number; isLive: boolean } | null>(null);
  // [FIX Vấn đề 15] Throttle cursor emit — giới hạn 50ms (20 updates/s thay vì 60/s)
  const throttleCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursorEmitRef = useRef<{ designId: string; x: number; y: number } | null>(null);

  // ── Socket Setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!designId) return;

    const token = localStorage.getItem('token') || '';
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const socketUrl = isDev ? 'http://localhost:3000' : '';

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    // ── Connection Events ──────────────────────────────────────────────────
    socket.on('connect', () => {
      console.log('[Collab] Connected! Socket ID:', socket.id);
      // [FIX]: Ghi trực tiếp vào Zustand — không cần mirror useRef
      useCollabStore.getState().setIsConnected(true);
      useCollabStore.getState().setSocketId(socket.id ?? null);
      socket.emit('join-design', { designId, token });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Collab] Disconnected:', reason);
      useCollabStore.getState().setIsConnected(false);
      useCollabStore.getState().setSocketId(null);
    });

    socket.on('connect_error', (err) => {
      console.error('[Collab] Connection error:', err.message);
    });

    // ── Presence Events ────────────────────────────────────────────────────
    socket.on('presence-sync', ({ users, revision }: { users: CollaboratorInfo[]; revision?: number }) => {
      useCollabStore.getState().setActiveUsers(users);
      if (typeof revision === 'number') {
        // [FIX]: callbacksRef.current luôn là hàm mới nhất — không bao giờ stale
        callbacksRef.current.onInitialRevision?.(revision);
      }
    });

    socket.on('user-joined', ({ activeUsers: users }: { user: CollaboratorInfo; activeUsers: CollaboratorInfo[] }) => {
      useCollabStore.getState().setActiveUsers(users);
    });

    socket.on('user-left', ({ activeUsers: users }: { userId: string; socketId: string; activeUsers: CollaboratorInfo[] }) => {
      useCollabStore.getState().setActiveUsers(users);
    });

    // ── Element Events ─────────────────────────────────────────────────────
    socket.on('elements-updated', ({
      pageId, elements,
    }: { pageId: string; elements: any[]; userId: string; senderName: string }) => {
      callbacksRef.current.onRemoteUpdate(pageId, elements);
    });

    socket.on('element-delta', (delta: ElementDelta) => {
      callbacksRef.current.onRemoteDelta?.(delta);
    });

    // ── Element Lock Events ────────────────────────────────────────────────
    socket.on('element-locked', ({ pageId, elementId, lockedBy }: {
      pageId: string;
      elementId: string;
      lockedBy: { userId: string; name: string; avatarColor: string };
    }) => {
      useCollabStore.getState().setElementLock(elementId, { ...lockedBy, pageId });
    });

    socket.on('element-unlocked', ({ elementId }: { elementId: string }) => {
      useCollabStore.getState().removeElementLock(elementId);
    });

    socket.on('elements-unlocked-batch', ({ elementIds }: { elementIds: string[] }) => {
      useCollabStore.getState().removeElementLocksBatch(elementIds);
    });

    socket.on('locks-sync', ({ locks }: {
      locks: Record<string, { userId: string; name: string; avatarColor: string; pageId: string }>;
    }) => {
      useCollabStore.getState().syncElementLocks(locks);
    });

    // ── Page Events ────────────────────────────────────────────────────────
    socket.on('page-added', ({ newPage, addedBy }: { newPage: any; addedBy: { userId: string; name: string } }) => {
      callbacksRef.current.onRemotePageAdded?.(newPage, addedBy.name);
    });

    socket.on('page-deleted', ({ pageId, deletedBy }: { pageId: string; deletedBy: { userId: string; name: string } }) => {
      callbacksRef.current.onRemotePageDeleted?.(pageId, deletedBy.name);
    });

    // ── Cursor Events ──────────────────────────────────────────────────────
    socket.on('cursor-moved', ({ userId, name, avatarColor, x, y }: {
      userId: string; name: string; avatarColor: string; x: number; y: number;
    }) => {
      // Ghi vào Zustand store VÀ gọi callback để EditorPage cập nhật canvas cursor
      useCollabStore.getState().setRemoteCursor(userId, { name, color: avatarColor, x, y });
      callbacksRef.current.onRemoteCursorMove?.(userId, name, avatarColor, x, y);
    });

    // ── Page Resize Event ──────────────────────────────────────────────────
    socket.on('page-resized', ({ pageId, width, height, isLive, userName }: {
      pageId: string; width: number; height: number; isLive: boolean; userName: string;
    }) => {
      callbacksRef.current.onRemotePageResized?.(pageId, width, height, isLive, userName);
    });

    // ── [FIX 6] Page Thumbnail Updated Event ──────────────────────────────
    // Khi collaborator khác upload thumbnail mới, server broadcast về cho tất cả
    socket.on('page-thumbnail-updated', ({ pageId, thumbUrl }: { pageId: string; thumbUrl: string }) => {
      callbacksRef.current.onRemotePageThumbnailUpdated?.(pageId, thumbUrl);
    });

    // ── Cleanup ────────────────────────────────────────────────────
    return () => {
      socket.emit('leave-design', { designId });
      socket.disconnect();
      socketRef.current = null;
      // Reset toàn bộ presence state về mặc định
      useCollabStore.getState().resetCollabState();
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      if (throttleResizeTimerRef.current) clearTimeout(throttleResizeTimerRef.current);
      // [FIX Vấn đề 15] Dọn cursor throttle timer khi unmount
      if (throttleCursorTimerRef.current) clearTimeout(throttleCursorTimerRef.current);
    };
  }, [designId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ Chỉ phụ thuộc vào designId — callbacksRef tự sync mỗi render

  // ─── Emitters ─────────────────────────────────────────────────────────────

  const emitElementsUpdate = useCallback((pageId: string, elements: any[]) => {
    if (!socketRef.current?.connected || !designId) return;
    pendingEmitRef.current = { pageId, elements };
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        const pending = pendingEmitRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit('update-elements', { designId, pageId: pending.pageId, elements: pending.elements });
        }
        pendingEmitRef.current = null;
        throttleTimerRef.current = null;
      }, 30);
    }
  }, [designId]);

  const emitElementsUpdateImmediate = useCallback((pageId: string, elements: any[]) => {
    if (!socketRef.current?.connected || !designId) return;
    if (throttleTimerRef.current) { clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
    pendingEmitRef.current = null;
    socketRef.current.emit('update-elements', { designId, pageId, elements });
  }, [designId]);

  const emitElementDelta = useCallback((delta: ElementDelta) => {
    if (!socketRef.current?.connected || !designId) return;
    socketRef.current.emit('element-delta', { designId, ...delta });
  }, [designId]);

  const emitPageChanged = useCallback((pageId: string) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('page-changed', { designId, pageId });
    }
  }, [designId]);

  const emitPageAdded = useCallback((newPage: any) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('page-added', { designId, newPage });
    }
  }, [designId]);

  const emitPageDeleted = useCallback((pageId: string) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('page-deleted', { designId, pageId });
    }
  }, [designId]);

  // [FIX Vấn đề 15] emitCursorMove với throttle 50ms — 20 updates/s thay vì 60/s
  const emitCursorMove = useCallback((dId: string, x: number, y: number) => {
    if (!socketRef.current?.connected) return;
    pendingCursorEmitRef.current = { designId: dId, x, y };
    if (!throttleCursorTimerRef.current) {
      throttleCursorTimerRef.current = setTimeout(() => {
        const pending = pendingCursorEmitRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit('cursor-move', { designId: pending.designId, x: pending.x, y: pending.y });
        }
        pendingCursorEmitRef.current = null;
        throttleCursorTimerRef.current = null;
      }, 50); // 50ms = 20fps cursor — đủ smooth, giảm 3x số socket events
    }
  }, []);

  const emitPageResize = useCallback((pageId: string, width: number, height: number, isLive: boolean) => {
    if (!socketRef.current?.connected || !designId) return;
    if (!isLive) {
      if (throttleResizeTimerRef.current) { clearTimeout(throttleResizeTimerRef.current); throttleResizeTimerRef.current = null; }
      pendingResizeEmitRef.current = null;
      socketRef.current.emit('resize-page', { designId, pageId, width, height, isLive });
      return;
    }
    pendingResizeEmitRef.current = { pageId, width, height, isLive };
    if (!throttleResizeTimerRef.current) {
      throttleResizeTimerRef.current = setTimeout(() => {
        const pending = pendingResizeEmitRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit('resize-page', { designId, pageId: pending.pageId, width: pending.width, height: pending.height, isLive: pending.isLive });
        }
        pendingResizeEmitRef.current = null;
        throttleResizeTimerRef.current = null;
      }, 30);
    }
  }, [designId]);

  // [FIX 6] emitPageThumbnailUpdated — relay URL thumbnail Cloud lên server để broadcast
  // Dùng emitter pattern giống emitPageDeleted — tránh stale socket reference
  const emitPageThumbnailUpdated = useCallback((pageId: string, thumbUrl: string) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('page-thumbnail-updated', { designId, pageId, thumbUrl });
    }
  }, [designId]);

  // [FIX #8] emitElementLock — định một element cho người hiện tại để edit text
  const emitElementLock = useCallback((dId: string, pageId: string, elementId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('element-lock', { designId: dId, pageId, elementId });
    }
  }, []);

  // [FIX #8] emitElementUnlock — giải phóng lock khi kết thúc edit
  const emitElementUnlock = useCallback((dId: string, elementId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('element-unlock', { designId: dId, elementId });
    }
  }, []);

  return useMemo(() => ({
    socket: socketRef.current,
    emitElementsUpdate,
    emitElementsUpdateImmediate,
    emitElementDelta,
    emitPageChanged,
    emitPageAdded,
    emitPageDeleted,
    emitCursorMove,
    emitPageResize,
    emitPageThumbnailUpdated,
    emitElementLock,
    emitElementUnlock,
  }), [
    emitElementsUpdate,
    emitElementsUpdateImmediate,
    emitElementDelta,
    emitPageChanged,
    emitPageAdded,
    emitPageDeleted,
    emitCursorMove,
    emitPageResize,
    emitPageThumbnailUpdated,
    emitElementLock,
    emitElementUnlock,
  ]);
}
