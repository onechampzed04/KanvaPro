import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Kiểu dữ liệu cho gói subscription của user
export interface UserSubscription {
  id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  current_period_end: string; // ISO date string
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
  login: (user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>; // Hàm refresh để cập nhật subscription sau thanh toán
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hàm tiện ích kiểm tra user có đang VIP active không
export const isSubscriptionActive = (user: User | null): boolean => {
  if (!user?.subscription) return false;
  if (user.subscription.status !== 'active') return false;
  // Kiểm tra chưa hết hạn
  return new Date(user.subscription.current_period_end) > new Date();
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Hàm fetch thông tin user + subscription từ server
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
    // Khởi tạo: kiểm tra phiên đăng nhập hiện tại
    fetchCurrentUser().finally(() => setLoading(false));
  }, [fetchCurrentUser]);

  const login = (userData: User) => setUser(userData);

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      setUser(null);
      localStorage.removeItem('token');
    });
  };

  // refreshUser: gọi lại API /me để cập nhật subscription mới nhất
  // Trang PaymentSuccess sẽ gọi hàm này sau khi PayOS redirect về
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
