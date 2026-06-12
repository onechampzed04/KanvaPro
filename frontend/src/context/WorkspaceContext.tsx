// frontend/src/context/WorkspaceContext.tsx
// ─── [WORKSPACE] Context toàn cục để quản lý Workspace hiện tại ───────────────
//
// Cách dùng:
//   const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace();
//
// Header X-Workspace-Id được tự động đưa vào mọi fetch call thông qua
// hàm helper getWorkspaceHeaders() từ file api.ts.

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface Workspace {
  id: string;
  name: string;
  avatar_url?: string | null;
  owner_id: string;
  workspace_type: 'personal' | 'team';
  my_role: 'owner' | 'admin' | 'member' | 'viewer';
  member_count: number;
  max_members: number;
  used_storage_bytes: number;
  max_storage_gb: number;
  is_pro: boolean;
  plan_name?: string | null;
  plan_slug?: string | null;
  current_period_end?: string | null;
  plan_storage_gb?: number;
  plan_max_members?: number;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  switchWorkspace: (workspaceId: string | null) => void;
  setWorkspaces: (ws: Workspace[]) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'kanva_current_workspace_id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);

  const applyWorkspaces = useCallback((list: Workspace[]) => {
    setWorkspaces(list);
    if (list.length === 0) {
      setCurrentWorkspace(null);
      return;
    }
    const savedId = localStorage.getItem(STORAGE_KEY);

    // Nếu người dùng đang ở Personal mode (được set bởi EditorPage cho bản vẽ cá nhân)
    if (savedId === 'personal') {
      setCurrentWorkspace(null);
      return;
    }

    const saved = list.find(w => w.id === savedId);
    const personal = list.find(w => w.workspace_type === 'personal');
    const selected = saved ?? personal ?? list[0];
    setCurrentWorkspace(selected);
    localStorage.setItem(STORAGE_KEY, selected.id);
  }, []);

  // ─── Bootstrap: đọc từ localStorage ngay khi mount ──────────────────────────
  useEffect(() => {
    const cached = localStorage.getItem('kanva_workspaces');
    if (cached) {
      try { applyWorkspaces(JSON.parse(cached)); } catch { }
    }
  }, [applyWorkspaces]);

  // ─── Lắng nghe event workspaces:updated từ AuthContext ──────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const list = (e as CustomEvent).detail as Workspace[];
      if (Array.isArray(list)) applyWorkspaces(list);
    };
    window.addEventListener('workspaces:updated', handler);
    return () => window.removeEventListener('workspaces:updated', handler);
  }, [applyWorkspaces]);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        applyWorkspaces(data.workspaces ?? []);
      }
    } catch { }
  }, [applyWorkspaces]);

  const switchWorkspace = useCallback((workspaceId: string | null) => {
    if (workspaceId === null) {
      setCurrentWorkspace(null);
      localStorage.setItem(STORAGE_KEY, 'personal');
      return;
    }
    const target = workspaces.find(w => w.id === workspaceId);
    if (!target) return;
    setCurrentWorkspace(target);
    localStorage.setItem(STORAGE_KEY, workspaceId);
  }, [workspaces]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces, currentWorkspace, switchWorkspace,
      setWorkspaces: applyWorkspaces, refreshWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
};
