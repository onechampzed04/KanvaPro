import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface CollaboratorInfo {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  socketId: string;
  joinedAt: number;
}

// ─── Delta Update interface: chỉ gửi các field thay đổi thay vì toàn bộ mảng ─
export interface ElementDelta {
  pageId: string;
  elementId: string;
  action: 'update' | 'add' | 'delete' | 'reorder';
  changes?: Record<string, any>;
}

interface UseCollaborationOptions {
  designId: string | undefined;
  onRemoteUpdate: (pageId: string, elements: any[]) => void;
  onRemotePageAdded?: (newPage: any, addedByName: string) => void;
  onRemotePageDeleted?: (pageId: string, deletedByName: string) => void;
  onRemoteCursorMove?: (userId: string, name: string, color: string, x: number, y: number) => void;
  onRemotePageResized?: (pageId: string, width: number, height: number, isLive: boolean, userName: string) => void;
  onRemoteDelta?: (delta: ElementDelta) => void;
}

interface UseCollaborationReturn {
  activeUsers: CollaboratorInfo[];
  isConnected: boolean;
  socketId: string | null;
  emitElementsUpdate: (pageId: string, elements: any[]) => void;
  emitElementsUpdateImmediate: (pageId: string, elements: any[]) => void;
  emitElementDelta: (delta: ElementDelta) => void;
  emitPageChanged: (pageId: string) => void;
  emitPageAdded: (newPage: any) => void;
  emitPageDeleted: (pageId: string) => void;
  emitCursorMove: (designId: string, x: number, y: number) => void;
  emitPageResize: (pageId: string, width: number, height: number, isLive: boolean) => void;
}

export function useCollaboration({
  designId,
  onRemoteUpdate,
  onRemotePageAdded,
  onRemotePageDeleted,
  onRemoteCursorMove,
  onRemotePageResized,
  onRemoteDelta,
}: UseCollaborationOptions): UseCollaborationReturn {
  const socketRef = useRef<Socket | null>(null);
  const [activeUsers, setActiveUsers] = useState<CollaboratorInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  // ─── Dùng Ref để tránh stale closure trong socket callbacks ────────────────
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  const onRemotePageAddedRef = useRef(onRemotePageAdded);
  const onRemotePageDeletedRef = useRef(onRemotePageDeleted);
  const onRemoteCursorMoveRef = useRef(onRemoteCursorMove);
  const onRemotePageResizedRef = useRef(onRemotePageResized);
  const onRemoteDeltaRef = useRef(onRemoteDelta);

  useEffect(() => { onRemoteUpdateRef.current = onRemoteUpdate; }, [onRemoteUpdate]);
  useEffect(() => { onRemotePageAddedRef.current = onRemotePageAdded; }, [onRemotePageAdded]);
  useEffect(() => { onRemotePageDeletedRef.current = onRemotePageDeleted; }, [onRemotePageDeleted]);
  useEffect(() => { onRemoteCursorMoveRef.current = onRemoteCursorMove; }, [onRemoteCursorMove]);
  useEffect(() => { onRemotePageResizedRef.current = onRemotePageResized; }, [onRemotePageResized]);
  useEffect(() => { onRemoteDeltaRef.current = onRemoteDelta; }, [onRemoteDelta]);

  // ─── Throttle ref để giới hạn tần suất emit (30ms = ~33fps) ─────────────
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEmitRef = useRef<{ pageId: string; elements: any[] } | null>(null);

  const throttleResizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResizeEmitRef = useRef<{ pageId: string; width: number; height: number; isLive: boolean } | null>(null);

  useEffect(() => {
    if (!designId) return;

    const token = localStorage.getItem('token') || '';

    // FIX TS2339: Dùng window.location.hostname thay vì import.meta.env.DEV
    // để tránh lỗi TypeScript khi kiểu ImportMeta không có property 'env'
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

    socket.on('connect', () => {
      console.log('[Collab] Connected! Socket ID:', socket.id);
      setIsConnected(true);
      setSocketId(socket.id ?? null);
      socket.emit('join-design', { designId, token });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Collab] Disconnected:', reason);
      setIsConnected(false);
      setSocketId(null);
    });

    socket.on('connect_error', (err) => {
      console.error('[Collab] Connection error:', err.message);
    });

    socket.on('presence-sync', ({ users }: { users: CollaboratorInfo[] }) => {
      setActiveUsers(users);
    });

    socket.on('user-joined', ({ activeUsers: users }: { user: CollaboratorInfo; activeUsers: CollaboratorInfo[] }) => {
      setActiveUsers(users);
    });

    socket.on('user-left', ({ activeUsers: users }: { userId: string; socketId: string; activeUsers: CollaboratorInfo[] }) => {
      setActiveUsers(users);
    });

    // ─── Nhận full elements update từ user khác ───────────────────────────
    socket.on('elements-updated', ({
      pageId, elements,
    }: {
      pageId: string;
      elements: any[];
      userId: string;
      senderName: string;
    }) => {
      onRemoteUpdateRef.current(pageId, elements);
    });

    // ─── Nhận Delta Update (chỉ cập nhật 1 element cụ thể) ───────────────
    socket.on('element-delta', (delta: ElementDelta) => {
      onRemoteDeltaRef.current?.(delta);
    });

    // ─── Page events ─────────────────────────────────────────────────────
    socket.on('page-added', ({ newPage, addedBy }: { newPage: any; addedBy: { userId: string; name: string } }) => {
      onRemotePageAddedRef.current?.(newPage, addedBy.name);
    });

    socket.on('page-deleted', ({ pageId, deletedBy }: { pageId: string; deletedBy: { userId: string; name: string } }) => {
      onRemotePageDeletedRef.current?.(pageId, deletedBy.name);
    });

    // ─── Cursor events ────────────────────────────────────────────────────
    socket.on('cursor-moved', ({ userId, name, avatarColor, x, y }: {
      userId: string; name: string; avatarColor: string; x: number; y: number;
    }) => {
      onRemoteCursorMoveRef.current?.(userId, name, avatarColor, x, y);
    });

    // ─── Page Resize event ───────────────────────────────────────────────
    socket.on('page-resized', ({ pageId, width, height, isLive, userName }: {
      pageId: string; width: number; height: number; isLive: boolean; userName: string;
    }) => {
      onRemotePageResizedRef.current?.(pageId, width, height, isLive, userName);
    });

    return () => {
      socket.emit('leave-design', { designId });
      socket.disconnect();
      socketRef.current = null;
      setActiveUsers([]);
      setIsConnected(false);
      setSocketId(null);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      if (throttleResizeTimerRef.current) clearTimeout(throttleResizeTimerRef.current);
    };
  }, [designId]);

  // ─── Throttled emit: tối đa 1 lần / 30ms (DragMove/onChange liên tục) ──
  const emitElementsUpdate = useCallback((pageId: string, elements: any[]) => {
    if (!socketRef.current?.connected || !designId) return;

    pendingEmitRef.current = { pageId, elements };

    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        const pending = pendingEmitRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit('update-elements', {
            designId,
            pageId: pending.pageId,
            elements: pending.elements,
          });
        }
        pendingEmitRef.current = null;
        throttleTimerRef.current = null;
      }, 30);
    }
  }, [designId]);

  // ─── Immediate emit: DragEnd/TransformEnd (gửi ngay) ────────────────────
  const emitElementsUpdateImmediate = useCallback((pageId: string, elements: any[]) => {
    if (!socketRef.current?.connected || !designId) return;
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    pendingEmitRef.current = null;
    socketRef.current.emit('update-elements', { designId, pageId, elements });
  }, [designId]);

  // ─── Delta emit: chỉ gửi changes của 1 element (tiết kiệm băng thông) ──
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

  const emitCursorMove = useCallback((dId: string, x: number, y: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('cursor-move', { designId: dId, x, y });
    }
  }, []);

  const emitPageResize = useCallback((pageId: string, width: number, height: number, isLive: boolean) => {
    if (!socketRef.current?.connected || !designId) return;

    if (!isLive) {
      if (throttleResizeTimerRef.current) {
        clearTimeout(throttleResizeTimerRef.current);
        throttleResizeTimerRef.current = null;
      }
      pendingResizeEmitRef.current = null;
      socketRef.current.emit('resize-page', { designId, pageId, width, height, isLive });
      return;
    }

    pendingResizeEmitRef.current = { pageId, width, height, isLive };

    if (!throttleResizeTimerRef.current) {
      throttleResizeTimerRef.current = setTimeout(() => {
        const pending = pendingResizeEmitRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit('resize-page', {
            designId,
            pageId: pending.pageId,
            width: pending.width,
            height: pending.height,
            isLive: pending.isLive,
          });
        }
        pendingResizeEmitRef.current = null;
        throttleResizeTimerRef.current = null;
      }, 30);
    }
  }, [designId]);

  return {
    activeUsers,
    isConnected,
    socketId,
    emitElementsUpdate,
    emitElementsUpdateImmediate,
    emitElementDelta,
    emitPageChanged,
    emitPageAdded,
    emitPageDeleted,
    emitCursorMove,
    emitPageResize,
  };
}
