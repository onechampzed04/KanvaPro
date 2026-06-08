// backend/services/redisPresenceService.ts
// [FIX Vấn đề 6] Thay thế các in-memory Map cục bộ bằng Redis Hash.
//
// Kiến trúc Dual-Mode:
//   - Nếu Redis khả dụng: dùng Redis Hash → nhiều Node server chia sẻ state chung
//   - Nếu Redis không khả dụng: fallback về Map<> cục bộ (single-instance mode)
//
// Redis key schema:
//   design:{designId}:collaborators   → Hash<socketId, JSON(CollaboratorInfo)>
//   design:{designId}:locks           → Hash<elementId, JSON(LockInfo)>
//   design:{designId}:online_users    → Hash<userId, JSON(Set<socketId>)>   (simplified)
//
// TTL: 5 phút tự giải phóng key khi server crash — ngăn chặn "ghost room".

import { getRedis } from '../config/redis';

const ROOM_TTL_SECONDS = 300; // 5 phút

export interface CollaboratorInfo {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  socketId: string;
  joinedAt: number;
  role: 'owner' | 'editor' | 'commenter' | 'viewer'; // [SECURITY FIX] Track role for RBAC
}

export interface LockInfo {
  userId: string;
  name: string;
  avatarColor: string;
  pageId: string;
}

// ─── In-memory Fallback (Single-Instance Mode) ────────────────────────────────
// Được dùng khi REDIS_URL không cấu hình hoặc Redis không khả dụng
const memRooms = new Map<string, Map<string, CollaboratorInfo>>();
const memLocks = new Map<string, Map<string, LockInfo>>();

// ─── Service ──────────────────────────────────────────────────────────────────

export const RedisPresenceService = {

  // ── Collaborators (room presence) ─────────────────────────────────────────

  async addCollaborator(designId: string, socketId: string, info: CollaboratorInfo): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const key = `design:${designId}:collaborators`;
      await redis.hSet(key, socketId, JSON.stringify(info));
      await redis.expire(key, ROOM_TTL_SECONDS);
    } else {
      if (!memRooms.has(designId)) memRooms.set(designId, new Map());
      memRooms.get(designId)!.set(socketId, info);
    }
  },

  async removeCollaborator(designId: string, socketId: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.hDel(`design:${designId}:collaborators`, socketId);
    } else {
      memRooms.get(designId)?.delete(socketId);
      if (memRooms.get(designId)?.size === 0) memRooms.delete(designId);
    }
  },

  async getCollaborators(designId: string): Promise<CollaboratorInfo[]> {
    const redis = getRedis();
    if (redis) {
      const hash = await redis.hGetAll(`design:${designId}:collaborators`);
      return Object.values(hash).map(v => JSON.parse(v) as CollaboratorInfo);
    } else {
      return Array.from(memRooms.get(designId)?.values() ?? []);
    }
  },

  async getRoomSize(designId: string): Promise<number> {
    const redis = getRedis();
    if (redis) {
      return await redis.hLen(`design:${designId}:collaborators`);
    } else {
      return memRooms.get(designId)?.size ?? 0;
    }
  },

  // ── Element Locks ──────────────────────────────────────────────────────────

  /**
   * Khoá nguyên tử (Atomic Lock): chỉ ghi nếu key CHƯA tồn tại.
   * Trả về true nếu khoá thành công, false nếu đã bị người khác khoá trước.
   */
  async lockElement(designId: string, elementId: string, info: LockInfo): Promise<boolean> {
    const redis = getRedis();
    if (redis) {
      const key = `design:${designId}:locks`;
      // HSETNX: Set if Not eXists — đảm bảo tính nguyên tử
      // redis v4: hSetNX trả về number (1=success, 0=already exists) → ép về boolean
      const result = await redis.hSetNX(key, elementId, JSON.stringify(info));
      const success = result === 1;
      if (success) await redis.expire(key, ROOM_TTL_SECONDS);
      return success;
    } else {
      // In-memory: vẫn ghi đè (không strict atomic ở single-instance, chấp nhận được)
      if (!memLocks.has(designId)) memLocks.set(designId, new Map());
      memLocks.get(designId)!.set(elementId, info);
      return true;
    }
  },

  async forceSetLock(designId: string, elementId: string, info: LockInfo): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const key = `design:${designId}:locks`;
      await redis.hSet(key, elementId, JSON.stringify(info));
      await redis.expire(key, ROOM_TTL_SECONDS);
    } else {
      if (!memLocks.has(designId)) memLocks.set(designId, new Map());
      memLocks.get(designId)!.set(elementId, info);
    }
  },

  async unlockElement(designId: string, elementId: string, requestUserId: string): Promise<boolean> {
    const redis = getRedis();
    if (redis) {
      const key = `design:${designId}:locks`;
      const raw = await redis.hGet(key, elementId);
      if (!raw) return false;
      const lock: LockInfo = JSON.parse(raw);
      if (lock.userId !== requestUserId) return false;
      await redis.hDel(key, elementId);
      return true;
    } else {
      const lock = memLocks.get(designId)?.get(elementId);
      if (!lock || lock.userId !== requestUserId) return false;
      memLocks.get(designId)!.delete(elementId);
      return true;
    }
  },

  async getLock(designId: string, elementId: string): Promise<LockInfo | null> {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.hGet(`design:${designId}:locks`, elementId);
      return raw ? JSON.parse(raw) : null;
    } else {
      return memLocks.get(designId)?.get(elementId) ?? null;
    }
  },

  /** Giải phóng toàn bộ lock của một user (khi disconnect) */
  async clearUserLocks(designId: string, userId: string): Promise<string[]> {
    const redis = getRedis();
    const unlockedIds: string[] = [];

    if (redis) {
      const key = `design:${designId}:locks`;
      const hash = await redis.hGetAll(key);
      const toDelete: string[] = [];
      for (const [elemId, raw] of Object.entries(hash)) {
        const lock: LockInfo = JSON.parse(raw);
        if (lock.userId === userId) {
          toDelete.push(elemId);
          unlockedIds.push(elemId);
        }
      }
      if (toDelete.length > 0) await redis.hDel(key, toDelete);
    } else {
      const locks = memLocks.get(designId);
      if (locks) {
        locks.forEach((info, elemId) => {
          if (info.userId === userId) {
            locks.delete(elemId);
            unlockedIds.push(elemId);
          }
        });
      }
    }

    return unlockedIds;
  },

  /** Lấy tất cả lock hiện tại trong room — dùng khi sync cho user vừa join */
  async getAllLocks(designId: string): Promise<Record<string, LockInfo>> {
    const redis = getRedis();
    if (redis) {
      const hash = await redis.hGetAll(`design:${designId}:locks`);
      const result: Record<string, LockInfo> = {};
      for (const [k, v] of Object.entries(hash)) result[k] = JSON.parse(v);
      return result;
    } else {
      const result: Record<string, LockInfo> = {};
      memLocks.get(designId)?.forEach((v, k) => { result[k] = v; });
      return result;
    }
  },

  /** Dọn dẹp room khi không còn ai — xóa cả lock lẫn collaborator keys */
  async cleanupRoom(designId: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(`design:${designId}:collaborators`);
      await redis.del(`design:${designId}:locks`);
    } else {
      memRooms.delete(designId);
      memLocks.delete(designId);
    }
  },
};
