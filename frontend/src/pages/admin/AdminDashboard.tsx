import { useEffect, useState } from 'react';
import { fetchAdminMetrics } from '../../api/adminApi';
import {
  Users, DollarSign, HardDrive, LayoutTemplate,
  Images, FileStack, TrendingUp, UserCheck
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#161a23', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, fontSize: 13, fontWeight: 600 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminMetrics()
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="admin-spinner" />
    </div>
  );

  const m = metrics || {};
  const conversionRate = m.users?.total > 0
    ? ((m.users?.proUsers / m.users?.total) * 100).toFixed(1)
    : '0.0';

  const cards = [
    {
      icon: Users, label: 'Total Users', value: m.users?.total?.toLocaleString() ?? '—',
      sub: `+${m.users?.newThisMonth ?? 0} this month`,
      iconBg: 'rgba(124,58,237,0.15)', iconColor: '#8b5cf6',
      accent: 'linear-gradient(90deg,#7c3aed,#8b5cf6)',
    },
    {
      icon: UserCheck, label: 'Active Users', value: m.users?.active?.toLocaleString() ?? '—',
      sub: `${m.users?.proUsers ?? 0} Pro subscribers`,
      iconBg: 'rgba(6,182,212,0.15)', iconColor: '#06b6d4',
      accent: 'linear-gradient(90deg,#0891b2,#06b6d4)',
    },
    {
      icon: DollarSign, label: 'Total Revenue', value: formatVND(m.revenue?.total ?? 0),
      sub: `${m.revenue?.totalPayments ?? 0} payments`,
      iconBg: 'rgba(16,185,129,0.15)', iconColor: '#10b981',
      accent: 'linear-gradient(90deg,#059669,#10b981)',
    },
    {
      icon: TrendingUp, label: 'Conversion Rate', value: `${conversionRate}%`,
      sub: 'Free → Pro',
      iconBg: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b',
      accent: 'linear-gradient(90deg,#d97706,#f59e0b)',
    },
    {
      icon: HardDrive, label: 'Storage Used', value: formatBytes(m.storage?.totalBytes ?? 0),
      sub: 'Across all users',
      iconBg: 'rgba(239,68,68,0.15)', iconColor: '#ef4444',
      accent: 'linear-gradient(90deg,#dc2626,#ef4444)',
    },
    {
      icon: FileStack, label: 'Designs', value: m.content?.designs?.toLocaleString() ?? '—',
      sub: 'Active designs',
      iconBg: 'rgba(124,58,237,0.15)', iconColor: '#a78bfa',
      accent: 'linear-gradient(90deg,#6d28d9,#a78bfa)',
    },
    {
      icon: Images, label: 'Assets', value: m.content?.assets?.toLocaleString() ?? '—',
      sub: 'System stock',
      iconBg: 'rgba(6,182,212,0.12)', iconColor: '#22d3ee',
      accent: 'linear-gradient(90deg,#0891b2,#22d3ee)',
    },
    {
      icon: LayoutTemplate, label: 'Templates', value: m.content?.templates?.toLocaleString() ?? '—',
      sub: 'Public templates',
      iconBg: 'rgba(16,185,129,0.12)', iconColor: '#34d399',
      accent: 'linear-gradient(90deg,#059669,#34d399)',
    },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Dashboard Overview</h1>
          <p className="admin-page-subtitle">Real-time KanvaPro platform metrics</p>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="admin-metrics-grid">
        {cards.map(({ icon: Icon, label, value, sub, iconBg, iconColor, accent }) => (
          <div key={label} className="admin-metric-card" style={{ '--card-accent': accent } as any}>
            <div className="admin-metric-icon" style={{ background: iconBg, color: iconColor }}>
              <Icon size={20} />
            </div>
            <div className="admin-metric-value">{value}</div>
            <div className="admin-metric-label">{label}</div>
            <div className="admin-metric-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="admin-charts-row">
        {/* Revenue chart */}
        <div className="admin-chart-card">
          <p className="admin-chart-title">📈 Monthly Revenue (Last 6 Months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={m.charts?.monthlyRevenue ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Daily new users */}
        <div className="admin-chart-card">
          <p className="admin-chart-title">👥 New Users (Last 7 Days)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={m.charts?.dailyUsers ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Users" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
