// backend/sockets/collaboration.ts
// Xử lý real-time collaboration: presence tracking + element sync

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../config/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollaboratorInfo {
  userId: string;
  name: string;
  email: string;
  avatarColor: string; // HSL color riêng cho từng user
  socketId: string;
  joinedAt: number;
}

// room key = designId, value = Map<socketId, CollaboratorInfo>
const rooms = new Map<string, Map<string, CollaboratorInfo>>();

// Bảng màu cố định để tô màu avatar theo userId (hash đơn giản)
const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#06b6d4', // Cyan
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

// JWT_SECRET phải khớp chính xác với authController.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

function verifySocketToken(token: string): { id: string; name: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: decoded.id || decoded.userId,
      name: decoded.name || decoded.email?.split('@')[0] || 'Anonymous',
      email: decoded.email || '',
    };
  } catch (err) {
    console.warn('[Collab] Token verify failed:', (err as any)?.message);
    return null;
  }
}


// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupCollaboration(io: Server) {
  io.on('connection', (socket: Socket) => {
    let currentDesignId: string | null = null;
    let currentUser: CollaboratorInfo | null = null;

    // ── 1. Join design room ──────────────────────────────────────────────────
    socket.on('join-design', async ({ designId, token }: { designId: string; token: string }) => {
      let finalToken = token;
      
      // Nếu không có token từ client, thử lấy từ cookie trong request
      if (!finalToken && socket.request.headers.cookie) {
        const cookies = socket.request.headers.cookie.split(';').map(c => c.trim());
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        if (tokenCookie) {
          finalToken = tokenCookie.split('=')[1];
        }
      }

      const userData = verifySocketToken(finalToken);
      if (!userData) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Query DB for name if it's 'Anonymous' or if we want the accurate name
      let finalName = userData.name;
      try {
        const dbUser = await db.getOne('SELECT name, email FROM users WHERE id = $1', [userData.id]);
        if (dbUser) {
          finalName = dbUser.name || dbUser.email?.split('@')[0] || userData.name;
          userData.email = dbUser.email || userData.email;
        }
      } catch (err) {
        console.error('[Collab] DB fetch user error:', err);
      }

      // Rời room cũ nếu có
      if (currentDesignId && rooms.has(currentDesignId)) {
        handleLeave(socket, currentDesignId, io);
      }

      currentDesignId = designId;
      currentUser = {
        userId: userData.id,
        name: finalName,
        email: userData.email,
        avatarColor: getAvatarColor(userData.id),
        socketId: socket.id,
        joinedAt: Date.now(),
      };

      // Tham gia room Socket.io
      socket.join(`design:${designId}`);

      // Ghi nhớ trong Map
      if (!rooms.has(designId)) {
        rooms.set(designId, new Map());
      }
      rooms.get(designId)!.set(socket.id, currentUser);

      // Gửi danh sách users hiện tại cho người vừa join
      const activeUsers = Array.from(rooms.get(designId)!.values());
      socket.emit('presence-sync', { users: activeUsers });

      // Thông báo cho mọi người trong room (kể cả người join)
      io.to(`design:${designId}`).emit('user-joined', {
        user: currentUser,
        activeUsers,
      });

      console.log(`[Collab] ${currentUser.name} joined design:${designId} (${activeUsers.length} online)`);
    });

    // ── 2. Elements update ───────────────────────────────────────────────────
    socket.on('update-elements', ({
      designId, pageId, elements
    }: {
      designId: string;
      pageId: string;
      elements: any[];
    }) => {
      if (!currentUser) return;

      // Broadcast cho tất cả TRONG ROOM, TRỪ người gửi
      socket.to(`design:${designId}`).emit('elements-updated', {
        pageId,
        elements,
        userId: currentUser.userId,
        senderName: currentUser.name,
      });
    });

    // ── 3. Page change notification ──────────────────────────────────────────
    socket.on('page-changed', ({ designId, pageId }: { designId: string; pageId: string }) => {
      if (!currentUser) return;
      socket.to(`design:${designId}`).emit('user-page-changed', {
        userId: currentUser.userId,
        pageId,
      });
    });

    // ── 4. Cursor position (optional UX touch) ───────────────────────────────
    socket.on('cursor-move', ({ designId, x, y }: { designId: string; x: number; y: number }) => {
      if (!currentUser) return;
      socket.to(`design:${designId}`).emit('cursor-moved', {
        userId: currentUser.userId,
        name: currentUser.name,
        avatarColor: currentUser.avatarColor,
        x, y,
      });
    });

    // ── 5. Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (currentDesignId) {
        handleLeave(socket, currentDesignId, io);
      }
    });

    // ── 6. Explicit leave ────────────────────────────────────────────────────
    socket.on('leave-design', ({ designId }: { designId: string }) => {
      handleLeave(socket, designId, io);
      currentDesignId = null;
      currentUser = null;
    });
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function handleLeave(socket: Socket, designId: string, io: Server) {
  const room = rooms.get(designId);
  if (!room) return;

  const user = room.get(socket.id);
  room.delete(socket.id);
  socket.leave(`design:${designId}`);

  // Dọn room rỗng
  if (room.size === 0) {
    rooms.delete(designId);
  }

  const activeUsers = room ? Array.from(room.values()) : [];

  // Thông báo cho những người còn lại
  io.to(`design:${designId}`).emit('user-left', {
    userId: user?.userId,
    socketId: socket.id,
    activeUsers,
  });

  if (user) {
    console.log(`[Collab] ${user.name} left design:${designId} (${activeUsers.length} online)`);
  }
}
