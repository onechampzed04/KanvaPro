import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useEffect } from 'react';
import {
  LayoutDashboard, Users, Images, LayoutTemplate,
  LogOut, Shield, ChevronRight, Zap, CreditCard, ArrowLeft, Users2
} from 'lucide-react';
import './admin.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/assets', label: 'Asset Library', icon: Images },
  { to: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/teams', label: 'Teams', icon: Users2 },
];

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'admin' && user.role !== 'moderator'))) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return (
    <div className="admin-loading">
      <div className="admin-spinner" />
    </div>
  );

  if (!user || (user.role !== 'admin' && user.role !== 'moderator')) return null;

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <Zap size={18} />
          </div>
          <div>
            <span className="admin-brand-name">KanvaPro</span>
            <span className="admin-brand-badge">Admin</span>
          </div>
        </div>

        <nav className="admin-nav">
          <p className="admin-nav-section">NAVIGATION</p>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `admin-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={14} className="admin-nav-arrow" />
            </NavLink>
          ))}
          <div style={{ marginTop: 'auto' }}></div>
          <p className="admin-nav-section">APP</p>
          <button className="admin-nav-item" onClick={() => navigate('/')} style={{ width: '100%' }}>
            <ArrowLeft size={18} />
            <span>Về Kanva Web</span>
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-info">
            <div className="admin-user-avatar">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-meta">
              <span className="admin-user-name">{user.name}</span>
              <span className="admin-user-role">
                <Shield size={10} /> {user.role}
              </span>
            </div>
          </div>
          <button className="admin-logout-btn" onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
