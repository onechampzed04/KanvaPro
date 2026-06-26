import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import PricingPage from './pages/PricingPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentCancelPage from './pages/PaymentCancelPage';
import BillingPage from './pages/BillingPage';
import TrashPage from './pages/TrashPage';
import TeamsPage from './pages/TeamsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAssets from './pages/admin/AdminAssets';
import AdminTemplates from './pages/admin/AdminTemplates';
import AdminSubscriptions from './pages/admin/AdminSubscriptions';
import AdminTeams from './pages/admin/AdminTeams';
import StoragePage from './pages/StoragePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return <>{children}</>;
}

// Ngăn người đã đăng nhập vào lại trang login/register
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (user) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// Gác cổng cho toàn bộ khu vực Admin — chặn TRƯỚC khi render bất kỳ UI Admin nào.
// Dùng ở App.tsx thay vì dùng useEffect bên trong AdminLayout (chạy sau khi đã render).
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin' && user.role !== 'moderator') return <Navigate to="/" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <ToastProvider>
            <Routes>
              {/* ── Public (chỉ dành cho chưa đăng nhập) ── */}
              <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/payment/cancel" element={<PaymentCancelPage />} />

              {/* ── User ── */}
              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
              <Route path="/design/:id" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
              <Route path="/trash" element={<ProtectedRoute><TrashPage /></ProtectedRoute>} />
              <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
              <Route path="/storage" element={<ProtectedRoute><StoragePage /></ProtectedRoute>} />

              {/* ── Admin Panel ── */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="assets" element={<AdminAssets />} />
                <Route path="templates" element={<AdminTemplates />} />
                <Route path="subscriptions" element={<AdminSubscriptions />} />
                <Route path="teams" element={<AdminTeams />} />
              </Route>
            </Routes>
          </ToastProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
