// backend/sockets/collaboration.ts
// [FIX Vấn đề 6] Thay thế in-memory Map bằng RedisPresenceService → Horizontal Scaling
// [FIX Vấn đề 7] Hybrid Catch-up: delta replay vs full snapshot dựa trên ngưỡng
// [FIX Vấn đề 8] markDirty() sau mỗi ot-op → Server-Side Write-Behind flush xuống DB

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../config/db';
import { revisionStore } from '../ot/revisionStore';
import { designElementService } from '../services/designElementService';
import { RedisPresenceService, CollaboratorInfo } from '../services/redisPresenceService';
import { markDirty, flushNow } from '../services/designWriteService';
import { JWT_SECRET } from '../config/jwt'; // [FIX Vấn đề 20] Dùng từ config tập trung
import type { ClientOp, AcceptedOp } from '../ot/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// [FIX Vấn đề 7] Ngưỡng op delta: nếu client lạc hậu quá CATCHUP_THRESHOLD ops,
// gửi Full Snapshot thay vì danh sách op. Ngăn chặn CPU freeze khi replay hàng nghìn ops.
const CATCHUP_THRESHOLD = 50;

// Bảng màu cố định để tô màu avatar theo userId (hash đơn giản)
const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
  '#f97316', '#06b6d4',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// [FIX Vấn đề 20] Dùng JWT_SECRET tập trung từ config/jwt.ts (bỏ khai báo thừa)

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

// ─── Global IO + Online Users ─────────────────────────────────────────────────

export let globalIo: Server | null = null;

// [FIX Vấn đề 6] globalOnlineUsers vẫn dùng in-memory Map để track socketId per userId.
// Đây là dữ liệu per-process cần thiết để emitForceLogout có thể disconnect đúng socket.
// Không cần Redis vì forceLogout chỉ cần chạy trên đúng node đang giữ socket đó.
const globalOnlineUsers = new Map<string, Set<string>>(); // userId → Set<socketId>

export function forceLogoutUser(userId: string, reason: string) {
  if (globalIo) {
    globalIo.to(`user-${userId}`).emit('auth:force_logout', { reason });
    const userSockets = globalOnlineUsers.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        globalIo!.sockets.sockets.get(socketId)?.disconnect(true);
      });
      globalOnlineUsers.delete(userId);
    }
  }
}

export function emitTeamMemberRemoved(teamId: string, removedUserId: string, actorName: string) {
  if (!globalIo) return;
  globalIo.to(`team-${teamId}`).emit('team:members_changed', { teamId });
  globalIo.to(`user-${removedUserId}`).emit('team:you_were_removed', {
    teamId,
    message: `Bạn đã bị ${actorName} xóa khỏi nhóm.`,
  });
}

export function emitTeamOwnershipTransferred(teamId: string, newOwnerId: string, actorName: string) {
  if (!globalIo) return;
  globalIo.to(`team-${teamId}`).emit('team:members_changed', { teamId });
  globalIo.to(`user-${newOwnerId}`).emit('team:you_are_now_owner', {
    teamId,
    message: `${actorName} vừa chuyển nhượng quyền Chủ nhóm (Owner) cho bạn!`,
  });
}

export function emitTeamMemberAdded(teamId: string, targetUserId: string, actorName: string) {
  if (!globalIo) return;
  globalIo.to(`team-${teamId}`).emit('team:members_changed', { teamId });
  globalIo.to(`user-${targetUserId}`).emit('team:you_were_invited', {
    teamId,
    message: `${actorName} vừa mời bạn vào nhóm của họ!`,
  });
}

export function getGlobalOnlineUsers(): string[] {
  return Array.from(globalOnlineUsers.keys());
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupCollaboration(io: Server) {
  globalIo = io;

  io.on('connection', (socket: Socket) => {
    let currentDesignId: string | null = null;
    let currentUser: CollaboratorInfo | null = null;
    let globalUserId: string | null = null;

    // ── 0. Join global room (AuthContext) ─────────────────────────────────────────
    socket.on('join-global', ({ token }: { token: string }) => {
      const userData = verifySocketToken(token);
      if (userData) {
        globalUserId = userData.id;
        socket.join(`user-${userData.id}`);
        if (!globalOnlineUsers.has(userData.id)) globalOnlineUsers.set(userData.id, new Set());
        globalOnlineUsers.get(userData.id)!.add(socket.id);
        // [FIX 2] Dùng tên event chuẩn hóa để frontend AdminUsers lắng nghe
        io.to('admin-dashboard').emit('admin:user-online', { userId: userData.id });
      }
    });

    // ── 0a. Join admin dashboard room ──────────────────────────────────────
    // [FIX 2] Chỉ cho phép admin/moderator join room này
    socket.on('join-admin-dashboard', ({ token }: { token: string }) => {
      const userData = verifySocketToken(token);
      if (!userData) return;
      // Kiểm tra role từ DB để chắc chắn admin không giả mạo token
      db.getOne('SELECT role FROM users WHERE id = $1', [userData.id]).then(user => {
        if (user && (user.role === 'admin' || user.role === 'moderator')) {
          socket.join('admin-dashboard');
          console.log(`[Admin Socket] ${userData.email} joined admin-dashboard room`);
        }
      }).catch(() => {});
    });

    // ── 0b. Join team room (Có kiểm tra membership) ─────────────────────────
    socket.on('join-team', async ({ teamId, token }: { teamId: string; token: string }) => {
      const userData = verifySocketToken(token);
      if (!userData) return; // Token không hợp lệ → bỏ qua

      // [FIX Vấn đề 16] Kiểm tra user thực sự là thành viên của team này.
      // Trước đây: bất kỳ user nào biết teamId đều join được → nhận sự kiện real-time của team.
      try {
        const membership = await db.getOne(
          'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
          [teamId, userData.id]
        );
        if (!membership) {
          console.warn(`[Collab] User ${userData.id} không phải thành viên team ${teamId}, từ chối join-team`);
          return; // Silently deny — không emit error để tránh leak thông tin team
        }
        socket.join(`team-${teamId}`);
      } catch (err) {
        console.error('[Collab] join-team membership check failed:', err);
      }
    });

    socket.on('leave-team', ({ teamId }: { teamId: string }) => {
      socket.leave(`team-${teamId}`);
    });

    // ── 1. Join design room ──────────────────────────────────────────────────
    socket.on('join-design', async ({ designId, token }: { designId: string; token: string }) => {
      let finalToken = token;
      if (!finalToken && socket.request.headers.cookie) {
        const cookies = socket.request.headers.cookie.split(';').map(c => c.trim());
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        if (tokenCookie) finalToken = tokenCookie.split('=')[1];
      }

      const userData = verifySocketToken(finalToken);
      if (!userData) { socket.emit('error', { message: 'Unauthorized' }); return; }

      if (!globalUserId) {
        globalUserId = userData.id;
        socket.join(`user-${userData.id}`);
        if (!globalOnlineUsers.has(userData.id)) globalOnlineUsers.set(userData.id, new Set());
        globalOnlineUsers.get(userData.id)!.add(socket.id);
      }

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

      // [SECURITY FIX - BOLA/IDOR in WebSockets]
      // Verify RBAC before allowing user to join the design room.
      let designRole: 'owner' | 'editor' | 'commenter' | 'viewer' | null = null;
      try {
        const designRes = await db.query('SELECT user_id, is_public FROM designs WHERE id = $1 AND is_deleted = false', [designId]);
        if (designRes.rows.length === 0) {
          socket.emit('error', { message: 'Bản vẽ không tồn tại' });
          return;
        }
        const design = designRes.rows[0];

        if (design.user_id === userData.id) {
          designRole = 'owner';
        } else {
          const shareRes = await db.query('SELECT role FROM design_shares WHERE design_id = $1 AND user_id = $2', [designId, userData.id]);
          if (shareRes.rows.length > 0) {
            designRole = shareRes.rows[0].role as any;
          } else if (design.is_public) {
            designRole = 'viewer';
          }
        }
      } catch (err) {
        console.error('[Collab] DB access check error:', err);
        socket.emit('error', { message: 'Lỗi máy chủ nội bộ' });
        return;
      }

      if (!designRole) {
        socket.emit('error', { message: 'Bạn không có quyền truy cập bản vẽ này' });
        return;
      }

      // Rời room cũ nếu có
      if (currentDesignId) await handleLeave(socket, currentDesignId, io);

      currentDesignId = designId;
      currentUser = {
        userId: userData.id,
        name: finalName,
        email: userData.email,
        avatarColor: getAvatarColor(userData.id),
        socketId: socket.id,
        joinedAt: Date.now(),
        role: designRole, // Lưu role để chặn thao tác sửa đổi phía dưới
      };

      socket.join(`design:${designId}`);

      // [FIX Vấn đề 6] Ghi vào Redis thay vì in-memory Map
      await RedisPresenceService.addCollaborator(designId, socket.id, currentUser);

      const [activeUsers, currentLocks] = await Promise.all([
        RedisPresenceService.getCollaborators(designId),
        RedisPresenceService.getAllLocks(designId),
      ]);

      const currentRevision = revisionStore.getCurrentRevision(designId);

      // Gửi presence + revision + locks cho user vừa join
      socket.emit('presence-sync', { users: activeUsers, revision: currentRevision });
      if (Object.keys(currentLocks).length > 0) {
        socket.emit('locks-sync', { locks: currentLocks });
      }

      io.to(`design:${designId}`).emit('user-joined', { user: currentUser, activeUsers });

      const roomSize = await RedisPresenceService.getRoomSize(designId);
      console.log(`[Collab] ${currentUser.name} joined design:${designId} (${roomSize} online, rev=${currentRevision})`);
    });

    // ── OT: Process incoming Op ──────────────────────────────────────────────
    socket.on('ot-op', async (clientOp: ClientOp & { designId: string }) => {
      if (!currentUser) return;
      if (currentUser.role !== 'owner' && currentUser.role !== 'editor') {
        socket.emit('ot-error', { opId: clientOp.opId, message: 'Bạn chỉ có quyền xem, không thể chỉnh sửa' });
        return;
      }
      const { designId, ...op } = clientOp;
      if (!designId) return;

      const sanitized: ClientOp = { ...op, clientId: currentUser.userId };

      try {
        const accepted: AcceptedOp | null = await revisionStore.processOp(designId, sanitized);
        if (!accepted) return;

        io.to(`design:${designId}`).emit('ot-accepted', { ...accepted, designId });

        // [FIX Vấn đề 8] Đánh dấu dirty để Write-Behind Scheduler flush xuống DB sau 8s
        markDirty(designId);
      } catch (err) {
        console.error('[OT] processOp failed:', err);
        socket.emit('ot-error', { opId: op.opId, message: 'Server error processing op' });
      }
    });

    // ── OT: Hybrid Catch-up on reconnect ────────────────────────────────────
    // [FIX Vấn đề 7] Quyết định gửi delta ops hay Full Snapshot dựa trên ngưỡng CATCHUP_THRESHOLD.
    socket.on('ot-catchup', async ({
      designId, sinceRevision, pageId,
    }: { designId: string; sinceRevision: number; pageId?: string }) => {
      if (!currentUser) return;

      const currentRevision = revisionStore.getCurrentRevision(designId);
      const delta = currentRevision - sinceRevision;

      if (delta <= CATCHUP_THRESHOLD) {
        // ── Mode 1: Delta Replay (ít ops) ────────────────────────────────────
        // Gửi danh sách op để client tự replay theo thứ tự
        const missed = revisionStore.getOpsSince(designId, sinceRevision);
        socket.emit('ot-catchup-response', {
          type: 'delta',
          ops: missed,
          currentRevision,
        });
        console.log(`[OT] Catch-up DELTA for ${currentUser.name}: ${missed.length} ops since rev ${sinceRevision}`);
      } else {
        // ── Mode 2: Full Snapshot (quá nhiều ops bị trễ) ─────────────────────
        // Bỏ qua toàn bộ lịch sử op, tải trực tiếp trạng thái hiện tại từ DB.
        // Client sẽ thay thế toàn bộ elements hiện tại → không cần replay.
        try {
          let snapshotElements: any[] = [];

          if (pageId) {
            // Nếu client cung cấp pageId → chỉ snapshot trang đang mở
            snapshotElements = await designElementService.getElementsByPageId(pageId);
          } else {
            // Fallback: lấy tất cả pages của design rồi gộp elements
            const pages = await db.query(
              'SELECT id FROM design_pages WHERE design_id = $1 ORDER BY page_order ASC',
              [designId]
            );
            const allPageElements = await Promise.all(
              pages.rows.map((p: any) => designElementService.getElementsByPageId(p.id)
                .then(els => els.map(el => ({ ...el, page_id: p.id })))
              )
            );
            snapshotElements = allPageElements.flat();
          }

          socket.emit('ot-catchup-response', {
            type: 'snapshot',
            elements: snapshotElements,
            currentRevision,
            pageId: pageId ?? null,
          });
          console.log(`[OT] Catch-up SNAPSHOT for ${currentUser.name}: ${snapshotElements.length} elements (delta=${delta} > threshold=${CATCHUP_THRESHOLD})`);
        } catch (err) {
          console.error('[OT] Snapshot fetch failed, falling back to delta:', err);
          const missed = revisionStore.getOpsSince(designId, sinceRevision);
          socket.emit('ot-catchup-response', { type: 'delta', ops: missed, currentRevision });
        }
      }
    });

    // ── 2. Elements update (fallback: full array broadcast) ─────────────────
    socket.on('update-elements', ({ designId, pageId, elements }: {
      designId: string; pageId: string; elements: any[];
    }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      socket.to(`design:${designId}`).emit('elements-updated', {
        pageId, elements,
        userId: currentUser.userId,
        senderName: currentUser.name,
      });
    });

    // ── 2b. Element Delta ────────────────────────────────────────────────────
    socket.on('element-delta', ({ designId, pageId, elementId, action, changes }: {
      designId: string; pageId: string; elementId: string;
      action: 'update' | 'add' | 'delete' | 'reorder'; changes?: Record<string, any>;
    }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      socket.to(`design:${designId}`).emit('element-delta', {
        pageId, elementId, action, changes,
        userId: currentUser.userId,
      });
    });

    // ── 2c. Element Lock (nguyên tử với Redis HSETNX) ───────────────────────
    socket.on('element-lock', async ({ designId, pageId, elementId }: {
      designId: string; pageId: string; elementId: string;
    }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;

      // [FIX Vấn đề 6] Dùng HSETNX nguyên tử — tránh race condition giữa 2 server
      const lockInfo = {
        userId: currentUser.userId,
        name: currentUser.name,
        avatarColor: currentUser.avatarColor,
        pageId,
      };
      const locked = await RedisPresenceService.lockElement(designId, elementId, lockInfo);

      if (locked) {
        socket.to(`design:${designId}`).emit('element-locked', {
          pageId, elementId,
          lockedBy: {
            userId: currentUser.userId,
            name: currentUser.name,
            avatarColor: currentUser.avatarColor,
          },
        });
      }
      // Nếu locked=false: element đã bị người khác giữ, không emit gì cả
    });

    // ── 2d. Element Unlock ───────────────────────────────────────────────────
    socket.on('element-unlock', async ({ designId, elementId }: {
      designId: string; elementId: string;
    }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      const unlocked = await RedisPresenceService.unlockElement(designId, elementId, currentUser.userId);
      if (unlocked) {
        socket.to(`design:${designId}`).emit('element-unlocked', { elementId });
      }
    });

    // ── 3. Page change ───────────────────────────────────────────────────────
    socket.on('page-changed', async ({ designId, pageId }: { designId: string; pageId: string }) => {
      if (!currentUser) return;
      await RedisPresenceService.updateCollaboratorPage(designId, socket.id, pageId);
      socket.to(`design:${designId}`).emit('user-page-changed', {
        userId: currentUser.userId, pageId,
      });
    });

    // ── 3.5. Page Resize ─────────────────────────────────────────────────────
    socket.on('resize-page', ({ designId, pageId, width, height, isLive }: {
      designId: string; pageId: string; width: number; height: number; isLive: boolean;
    }) => {
      if (!currentUser) return;
      socket.to(`design:${designId}`).emit('page-resized', {
        pageId, width, height, isLive,
        userId: currentUser.userId,
        userName: currentUser.name,
      });
    });

    socket.on('update-page-background', ({ designId, pageId, background_color }: { designId: string; pageId: string; background_color: string }) => {
      if (!currentUser) return;
      socket.to(`design:${designId}`).emit('page-background-updated', {
        pageId, background_color,
        userId: currentUser.userId,
        userName: currentUser.name,
      });
    });

    // ── 4. Cursor position ───────────────────────────────────────────────────
    socket.on('cursor-move', ({ designId, x, y }: { designId: string; x: number; y: number }) => {
      if (!currentUser) return;
      socket.to(`design:${designId}`).emit('cursor-moved', {
        userId: currentUser.userId,
        name: currentUser.name,
        avatarColor: currentUser.avatarColor,
        x, y,
      });
    });

    // ── 5. Page Added ────────────────────────────────────────────────────────
    socket.on('page-added', ({ designId, newPage }: { designId: string; newPage: any }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      socket.to(`design:${designId}`).emit('page-added', {
        newPage,
        addedBy: { userId: currentUser.userId, name: currentUser.name },
      });
    });

    // ── 6. Page Deleted ──────────────────────────────────────────────────────
    socket.on('page-deleted', ({ designId, pageId }: { designId: string; pageId: string }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      socket.to(`design:${designId}`).emit('page-deleted', {
        pageId,
        deletedBy: { userId: currentUser.userId, name: currentUser.name },
      });
    });

    // ── 6a. Pages Reordered ──────────────────────────────────────────────────
    socket.on('pages-reordered', ({ designId, pageIds }: { designId: string; pageIds: string[] }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor')) return;
      socket.to(`design:${designId}`).emit('pages-reordered', { pageIds });
    });

    // ── 6b. Page Thumbnail Updated ───────────────────────────────────────────
    // [FIX 6] Khi 1 client upload thumbnail mới lên Cloud và phát sự kiện này,
    // server relay ngay cho tất cả collaborator khác trong phòng.
    // Các client nhận được sẽ cập nhật thumbnail trong sidebar mà không cần reload.
    socket.on('page-thumbnail-updated', ({
      designId, pageId, thumbUrl,
    }: { designId: string; pageId: string; thumbUrl: string }) => {
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'editor') || !designId || !pageId || !thumbUrl) return;
      // Dùng socket.to() (không gửi lại cho chính mình, vì người gửi đã tự cập nhật)
      socket.to(`design:${designId}`).emit('page-thumbnail-updated', {
        pageId,
        thumbUrl,
      });
      console.log(`[Collab] Thumbnail updated for page ${pageId} by ${currentUser.name}`);
    });

    // ── 7. Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (currentDesignId && currentUser) {
        // [FIX Vấn đề 6] Giải phóng locks qua RedisPresenceService
        const unlockedIds = await RedisPresenceService.clearUserLocks(currentDesignId, currentUser.userId);
        if (unlockedIds.length > 0) {
          io.to(`design:${currentDesignId}`).emit('elements-unlocked-batch', { elementIds: unlockedIds });
        }

        // [FIX Vấn đề 8] Flush ngay khi user rời phòng — đảm bảo không mất data
        await flushNow(currentDesignId);

        await handleLeave(socket, currentDesignId, io);
      }
      if (globalUserId) {
        const userSockets = globalOnlineUsers.get(globalUserId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            globalOnlineUsers.delete(globalUserId);
            // [FIX 2] Dùng tên event chuẩn hóa
            io.to('admin-dashboard').emit('admin:user-offline', { userId: globalUserId });
          }
        }
      }
    });

    // ── 8. Explicit leave ────────────────────────────────────────────────────
    socket.on('leave-design', async ({ designId }: { designId: string }) => {
      if (currentUser) {
        await RedisPresenceService.clearUserLocks(designId, currentUser.userId);
        await flushNow(designId);
      }
      await handleLeave(socket, designId, io);
      currentDesignId = null;
      currentUser = null;
    });

    // ── 9. Doc Collaboration (Cursor sync cho text editor) ────────────────────
    // Tách khỏi canvas room: dùng room `doc:${designId}` riêng để tránh nhiễu OT canvas.
    let currentDocDesignId: string | null = null;
    let docUser: { userId: string; email: string; name: string; avatarColor: string } | null = null;

    socket.on('doc:join', async ({ designId: dId, token }: { designId: string; token: string }) => {
      const userData = verifySocketToken(token);
      if (!userData) return;

      // Lấy email từ DB
      let email = userData.email;
      try {
        const dbUser = await db.getOne('SELECT email FROM users WHERE id = $1', [userData.id]);
        if (dbUser) email = dbUser.email || email;
      } catch {}

      // [SECURITY FIX - BOLA/IDOR in WebSockets]
      // Verify RBAC trước khi cho phép user join vào document room để nghe lén.
      let designRole: 'owner' | 'editor' | 'commenter' | 'viewer' | null = null;
      try {
        const designRes = await db.query('SELECT user_id, is_public FROM designs WHERE id = $1 AND is_deleted = false', [dId]);
        if (designRes.rows.length === 0) {
          socket.emit('error', { message: 'Tài liệu không tồn tại' });
          return;
        }
        const design = designRes.rows[0];

        if (design.user_id === userData.id) {
          designRole = 'owner';
        } else {
          const shareRes = await db.query('SELECT role FROM design_shares WHERE design_id = $1 AND user_id = $2', [dId, userData.id]);
          if (shareRes.rows.length > 0) {
            designRole = shareRes.rows[0].role as any;
          } else if (design.is_public) {
            designRole = 'viewer';
          }
        }
      } catch (err) {
        console.error('[DocCollab] DB access check error:', err);
        return;
      }

      if (!designRole) {
        // Cố tình nghe lén → Bỏ qua hoặc báo lỗi
        socket.emit('error', { message: 'Bạn không có quyền truy cập tài liệu này' });
        return;
      }

      // Rời doc room cũ nếu có
      if (currentDocDesignId) socket.leave(`doc:${currentDocDesignId}`);
      currentDocDesignId = dId;
      docUser = {
        userId: userData.id,
        email,
        name: userData.name || email.split('@')[0],
        avatarColor: getAvatarColor(userData.id),
      };

      socket.join(`doc:${dId}`);
      // Thông báo cho người khác biết user mới join
      socket.to(`doc:${dId}`).emit('doc:user-joined', {
        userId: docUser.userId,
        email: docUser.email,
        avatarColor: docUser.avatarColor,
      });
      console.log(`[DocCollab] ${docUser.email} joined doc:${dId}`);
    });

    socket.on('doc:cursor-move', ({ designId: dId, from, to }: { designId: string; from: number; to: number }) => {
      if (!docUser) return;
      // Broadcast cursor position (ProseMirror offset) tới người dùng khác trong cùng doc room
      socket.to(`doc:${dId}`).emit('doc:cursor-moved', {
        userId: docUser.userId,
        email: docUser.email,
        avatarColor: docUser.avatarColor,
        from,
        to,
      });
    });

    // Broadcast nội dung doc tới các collaborator khác (last-write-wins)
    socket.on('doc:content-change', ({ designId: dId, html, cursorFrom, cursorTo }: {
      designId: string; html: string; cursorFrom?: number; cursorTo?: number;
    }) => {
      if (!docUser) return;
      // Relay cho tất cả người khác trong cùng doc room, kèm cursor position
      // để receiver cập nhật content VÀ cursor trong cùng 1 event → không race condition
      socket.to(`doc:${dId}`).emit('doc:content-changed', {
        html,
        userId: docUser.userId,
        email: docUser.email,
        avatarColor: docUser.avatarColor,
        cursorFrom: cursorFrom ?? 0,
        cursorTo: cursorTo ?? 0,
      });
    });

    socket.on('doc:leave', ({ designId: dId }: { designId: string }) => {
      socket.leave(`doc:${dId}`);
      if (docUser) {
        socket.to(`doc:${dId}`).emit('doc:user-left', { userId: docUser.userId });
        console.log(`[DocCollab] ${docUser.email} left doc:${dId}`);
      }
      currentDocDesignId = null;
      docUser = null;
    });
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function handleLeave(socket: Socket, designId: string, io: Server) {
  // [FIX Vấn đề 6] Đọc/ghi state từ Redis thay vì in-memory Map
  const collaboratorBefore = (await RedisPresenceService.getCollaborators(designId))
    .find(c => c.socketId === socket.id);

  await RedisPresenceService.removeCollaborator(designId, socket.id);
  socket.leave(`design:${designId}`);

  const remainingUsers = await RedisPresenceService.getCollaborators(designId);

  // Dọn sạch room khi không còn ai
  if (remainingUsers.length === 0) {
    await RedisPresenceService.cleanupRoom(designId);
    revisionStore.evict(designId);
  }

  io.to(`design:${designId}`).emit('user-left', {
    userId: collaboratorBefore?.userId,
    socketId: socket.id,
    activeUsers: remainingUsers,
  });

  if (collaboratorBefore) {
    console.log(`[Collab] ${collaboratorBefore.name} left design:${designId} (${remainingUsers.length} online)`);
  }
}
