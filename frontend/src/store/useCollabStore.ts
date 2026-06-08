// src/store/useCollabStore.ts
// ─── Centralized Zustand Store ──────────────────────────────────────────────
// [FIX Vấn đề 2] Thay thế cơ chế song hành useState/useRef phân tán.
// Zustand lưu state NGOÀI vòng đời React → không bao giờ bị Stale Closure.
// Socket callbacks gọi useCollabStore.getState() để lấy dữ liệu MỚI NHẤT
// mà không cần mirror sang useRef song song.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { CollaboratorInfo, ElementLockInfo } from '../hooks/useCollaboration';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RemoteCursorInfo {
  name: string;
  color: string;
  x: number;
  y: number;
}

interface CollabStore {
  // ── Presence ────────────────────────────────────────────────────────────────
  activeUsers: CollaboratorInfo[];
  isConnected: boolean;
  socketId: string | null;

  // ── Element Locks ────────────────────────────────────────────────────────────
  elementLocks: Map<string, ElementLockInfo>;

  // ── Remote Cursors ───────────────────────────────────────────────────────────
  remoteCursors: Map<string, RemoteCursorInfo>;

  // ── Collaboration Notifications ───────────────────────────────────────────────
  collabNotification: string;

  // ── Actions (được gọi TỪ socket callbacks — tất cả atomic, không race condition) ──
  setActiveUsers: (users: CollaboratorInfo[]) => void;
  setIsConnected: (connected: boolean) => void;
  setSocketId: (id: string | null) => void;

  setElementLock: (elementId: string, info: ElementLockInfo) => void;
  removeElementLock: (elementId: string) => void;
  removeElementLocksBatch: (elementIds: string[]) => void;
  syncElementLocks: (locks: Record<string, ElementLockInfo>) => void;
  resetElementLocks: () => void;

  setRemoteCursor: (userId: string, info: RemoteCursorInfo) => void;

  setCollabNotification: (msg: string) => void;

  /** Reset toàn bộ state khi người dùng rời phiên cộng tác */
  resetCollabState: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useCollabStore = create<CollabStore>((set) => ({
  activeUsers: [],
  isConnected: false,
  socketId: null,
  elementLocks: new Map(),
  remoteCursors: new Map(),
  collabNotification: '',

  setActiveUsers: (users) => set({ activeUsers: users }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setSocketId: (id) => set({ socketId: id }),

  setElementLock: (elementId, info) =>
    set((state) => {
      const next = new Map(state.elementLocks);
      next.set(elementId, info);
      return { elementLocks: next };
    }),

  removeElementLock: (elementId) =>
    set((state) => {
      const next = new Map(state.elementLocks);
      next.delete(elementId);
      return { elementLocks: next };
    }),

  removeElementLocksBatch: (elementIds) =>
    set((state) => {
      const next = new Map(state.elementLocks);
      elementIds.forEach((id) => next.delete(id));
      return { elementLocks: next };
    }),

  syncElementLocks: (locks) =>
    set({ elementLocks: new Map(Object.entries(locks) as [string, ElementLockInfo][]) }),

  resetElementLocks: () => set({ elementLocks: new Map() }),

  setRemoteCursor: (userId, info) =>
    set((state) => {
      const next = new Map(state.remoteCursors);
      next.set(userId, info);
      return { remoteCursors: next };
    }),

  setCollabNotification: (msg) => set({ collabNotification: msg }),

  resetCollabState: () =>
    set({
      activeUsers: [],
      isConnected: false,
      socketId: null,
      elementLocks: new Map(),
      remoteCursors: new Map(),
      collabNotification: '',
    }),
}));
