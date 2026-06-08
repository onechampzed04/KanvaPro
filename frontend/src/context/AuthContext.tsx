import { createContext, useContext, useState, useEffect, useCallback } from 'react';
// ─── [WORKSPACE] Import để đồng bộ Workspace sau khi fetch user ───────────────
// Dùng lazy import để tránh circular dependency giữa 2 Context

export interface UserSubscription {
  id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  current_period_end: string;
  plan_name: string;
  plan_slug: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_verified?: boolean;
  subscription: UserSubscription | null;
  avatar_url?: string | null;
  storage_used_bytes?: number;
  max_storage_gb?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const isSubscriptionActive = (user: User | null): boolean => {
  if (!user?.subscription) return false;
  if (user.subscription.status !== 'active') return false;

  return new Date(user.subscription.current_period_end) > new Date();
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // gọi api lấy ttin user hiện tại -> app.tsx
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // ─── [WORKSPACE] Lưu worksptaces vào localStorage để WorkspaceContext đọc
        // Tránh circular dependency bằng cách dùng localStorage làm "event bus"
        if (data.workspaces) {
          localStorage.setItem('kanva_workspaces', JSON.stringify(data.workspaces));
          // Phát sự kiện để WorkspaceProvider nhận và cập nhật state
          window.dispatchEvent(new CustomEvent('workspaces:updated', { detail: data.workspaces }));
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);


  useEffect(() => {
    fetchCurrentUser().finally(() => setLoading(false));
  }, [fetchCurrentUser]);

  // Global Real-time Listener (Force Logout)
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    import('socket.io-client').then(({ io }) => {
      // FIX TS2339: dùng window.location.hostname thay vì import.meta.env.DEV
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const socketUrl = isDev ? 'http://localhost:3000' : '';
      const socket = io(socketUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      socket.on('connect', () => {
        socket.emit('join-global', { token });
      });

      socket.on('auth:force_logout', (data: { reason: string }) => {
        import('sweetalert2').then((Swal) => {
          Swal.default.fire({
            icon: 'error',
            title: 'Tài khoản bị khóa!',
            text: data.reason || 'Tài khoản của bạn đã bị vô hiệu hóa bởi ban quản trị.',
            confirmButtonText: 'Đóng',
            allowOutsideClick: false
          }).then(() => {
            fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
              setUser(null);
              localStorage.removeItem('token');
              window.location.href = '/login';
            });
          });
        });
      });

      // ─── [REALTIME] Global Team Notifications ──────────────────────────────
      const showGlobalToast = (icon: 'success' | 'warning' | 'info', title: string) => {
        import('sweetalert2').then((Swal) => {
          Swal.default.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: title,
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true,
          });
        });
      };

      socket.on('team:you_are_now_owner', (data: { message: string }) => {
        showGlobalToast('success', data.message);
      });

      socket.on('team:you_were_removed', (data: { message: string }) => {
        showGlobalToast('warning', data.message);
      });

      socket.on('team:you_were_invited', (data: { message: string }) => {
        showGlobalToast('info', data.message);
      });

      return () => {
        socket.disconnect();
      };
    });
  }, [user?.id]);

  const login = async (userData: User) => {
    setUser(userData);
    await fetchCurrentUser();
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      setUser(null);
      localStorage.removeItem('token');
    });
  };

  const refreshUser = useCallback(async () => {
    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  // Cập nhật avatar_url trong state ngay lập tức (không cần gọi lại API)
  const updateAvatar = useCallback((avatarUrl: string) => {
    setUser(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
