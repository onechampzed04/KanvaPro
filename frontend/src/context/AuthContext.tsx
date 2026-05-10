import { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
