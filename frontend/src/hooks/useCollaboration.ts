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

interface UseCollaborationOptions {
  designId: string | undefined;
  /** Callback gọi khi nhận elements từ user khác */
  onRemoteUpdate: (pageId: string, elements: any[]) => void;
}

interface UseCollaborationReturn {
  activeUsers: CollaboratorInfo[];
  isConnected: boolean;
  /** Gọi sau khi syncElements() để broadcast cho người khác */
  emitElementsUpdate: (pageId: string, elements: any[]) => void;
  /** Gọi khi đổi page */
  emitPageChanged: (pageId: string) => void;
}


export function useCollaboration({
  designId,
  onRemoteUpdate,
}: UseCollaborationOptions): UseCollaborationReturn {
  const socketRef = useRef<Socket | null>(null);
  const [activeUsers, setActiveUsers] = useState<CollaboratorInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Dùng ref để tránh stale closure trong callbacks socket
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  useEffect(() => { onRemoteUpdateRef.current = onRemoteUpdate; }, [onRemoteUpdate]);

  useEffect(() => {
    if (!designId) return;

    const token = localStorage.getItem('token') || '';

    console.log('[Collab] Connecting for design:', designId);

    const socket = io({
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
      socket.emit('join-design', { designId, token });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Collab] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Collab] Connection error:', err.message);
    });

    socket.on('error', (err: any) => {
      console.error('[Collab] Server error:', err);
    });

    socket.on('presence-sync', ({ users }: { users: CollaboratorInfo[] }) => {
      console.log('[Collab] Presence sync:', users.map(u => u.name));
      setActiveUsers(users);
    });

    socket.on('user-joined', ({ activeUsers: users }: { user: CollaboratorInfo; activeUsers: CollaboratorInfo[] }) => {
      console.log('[Collab] User joined, total:', users.length);
      setActiveUsers(users);
    });

    socket.on('user-left', ({ activeUsers: users }: { userId: string; socketId: string; activeUsers: CollaboratorInfo[] }) => {
      console.log('[Collab] User left, total:', users.length);
      setActiveUsers(users);
    });

    socket.on('elements-updated', ({
      pageId, elements, senderName
    }: {
      pageId: string;
      elements: any[];
      userId: string;
      senderName: string;
    }) => {
      console.log('[Collab] Elements updated by', senderName, '- elements count:', elements.length);
      onRemoteUpdateRef.current(pageId, elements);
    });

    return () => {
      console.log('[Collab] Cleaning up socket for design:', designId);
      socket.emit('leave-design', { designId });
      socket.disconnect();
      socketRef.current = null;
      setActiveUsers([]);
      setIsConnected(false);
    };
  }, [designId]); // chỉ re-run khi designId thay đổi

  const emitElementsUpdate = useCallback((pageId: string, elements: any[]) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('update-elements', { designId, pageId, elements });
    }
  }, [designId]);

  const emitPageChanged = useCallback((pageId: string) => {
    if (socketRef.current?.connected && designId) {
      socketRef.current.emit('page-changed', { designId, pageId });
    }
  }, [designId]);

  return { activeUsers, isConnected, emitElementsUpdate, emitPageChanged };
}
