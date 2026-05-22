import { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminSubscriptions, updateAdminSubscription, terminateSubscription, createManualSubscription,
  fetchAdminPlans, createPlan, updatePlan, deletePlan,
  fetchAdminPayments, adminCancelRenewal, adminRevokeSubscription, adminForceSuccessPayment,
} from '../../api/adminApi';
import { Search, Crown, CheckCircle, XCircle, Clock, Plus, Edit, Trash2, DollarSign, Activity, Ban, RotateCcw } from 'lucide-react';

function formatCurrency(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function AdminSubscriptions() {
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'plans' | 'payments'>('subscriptions');
  const [toast, setToast] = useState<Toast>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Subscription Management</h1>
          <p className="admin-page-subtitle">Manage users' billing, plans, and revenue</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['subscriptions', 'plans', 'payments'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="admin-table-card">
        {activeTab === 'subscriptions' && <SubscriptionsTab showToast={showToast} />}
        {activeTab === 'plans' && <PlansTab showToast={showToast} />}
        {activeTab === 'payments' && <PaymentsTab showToast={showToast} />}
      </div>

      {toast && <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ─── SUBSCRIPTIONS TAB ────────────────────────────────────────────────────────
function SubscriptionsTab({ showToast }: { showToast: Function }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSubscriptions({ page, limit: LIMIT, search, status });
      setSubs(data.subscriptions || []);
      setTotal(data.total || 0);
    } catch { showToast('Failed to load subscriptions', 'error'); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  const handleCancelRenewal = async (id: string) => {
    if (!confirm('Hủy gia hạn tự động? User vẫn được dùng đến cuối kỳ.')) return;
    try {
      await adminCancelRenewal(id);
      showToast('Đã hủy gia hạn tự động. User vẫn dùng đến hết kỳ.');
      load();
    } catch { showToast('Lỗi hủy gia hạn', 'error'); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('⚠️ NGẮT DỊCH VỤ NGAY LẬP TỨC? Hành động này không thể hoàn tác!')) return;
    try {
      await adminRevokeSubscription(id);
      showToast('Đã ngắt dịch vụ ngay lập tức.');
      load();
    } catch { showToast('Lỗi ngắt dịch vụ', 'error'); }
  };

  const getStatusBadge = (s: string) => {
    if (s === 'active') return <span className="badge badge-active"><CheckCircle size={10} /> Active</span>;
    if (s === 'canceled') return <span className="badge badge-banned"><XCircle size={10} /> Canceled</span>;
    if (s === 'expired') return <span className="badge badge-banned"><Clock size={10} /> Expired</span>;
    return <span className="badge">{s}</span>;
  };

  return (
    <>
      <div className="admin-table-toolbar">
        <div className="admin-search">
          <Search size={14} color="var(--text-muted)" />
          <input placeholder="Search user..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="canceled">Canceled</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Period Start</th>
              <th>Period End</th>
              <th>Stripe ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr> :
              subs.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>No subscriptions found</td></tr> :
                subs.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{s.user_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.user_email}</div>
                    </td>
                    <td><span className="badge badge-pro"><Crown size={10} /> {s.plan_name}</span></td>
                    <td>{getStatusBadge(s.status)}</td>
                    <td>{formatDate(s.current_period_start)}</td>
                    <td>{formatDate(s.current_period_end)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.stripe_subscription_id || 'Manual'}</td>
                    <td>
                      {s.status === 'active' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* [MỚI] Nút Hủy gia hạn — dùng nốt đến cuối kỳ */}
                          {!s.cancel_at && (
                            <button
                              className="admin-btn admin-btn-ghost admin-btn-sm"
                              style={{ color: '#f59e0b', fontSize: 11 }}
                              onClick={() => handleCancelRenewal(s.id)}
                              title="Hủy gia hạn tự động (user dùng nốt đến cuối kỳ)"
                            >
                              <RotateCcw size={11} /> Hủy gia hạn
                            </button>
                          )}
                          {/* [MỚI] Nút Ngắt ngay — thay thế nút Terminate cũ */}
                          <button
                            className="admin-btn admin-btn-ghost admin-btn-sm"
                            style={{ color: 'var(--accent-red)', fontSize: 11 }}
                            onClick={() => handleRevoke(s.id)}
                            title="Ngắt dịch vụ ngay lập tức"
                          >
                            <Ban size={11} /> Ngắt ngay
                          </button>
                        </div>
                      )}
                      {/* Hiển thị badge nếu đã lên lịch hủy gia hạn */}
                      {s.status === 'active' && s.cancel_at && (
                        <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                          Hủy vào {formatDate(s.cancel_at)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span>Showing {subs.length} of {total}</span>
        <div className="admin-pagination-btns">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}

// ─── PLANS TAB ─────────────────────────────────────────────────────────────
function PlansTab({ showToast }: { showToast: Function }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPlans();
      setPlans(data.plans || []);
    } catch { showToast('Failed to load plans', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlan.id) {
        if (!confirm('Thay đổi giá sẽ tạo ra một gói cước mới. Những người dùng cũ đang gia hạn tự động sẽ không bị ảnh hưởng.\nBạn có tiếp tục không?')) return;
        await updatePlan(editingPlan.id, editingPlan);
        showToast('Đã lưu thành phiên bản mới');
      } else {
        await createPlan(editingPlan);
        showToast('Plan created');
      }
      setEditingPlan(null);
      load();
    } catch { showToast('Failed to save plan', 'error'); }
  };

  const handleToggleActive = async (p: any) => {
    try {
      await updatePlan(p.id, { is_active: !p.is_active });
      showToast(p.is_active ? 'Plan deactivated' : 'Plan activated');
      load();
    } catch { showToast('Failed to change status', 'error'); }
  };

  if (editingPlan) {
    return (
      <div style={{ padding: 20 }}>
        <h3>New Plan</h3>
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: 15, maxWidth: 400, marginTop: 20 }}>
          <input className="admin-input" placeholder="Name (e.g. Pro)" required value={editingPlan.name || ''} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} />
          <input className="admin-input" placeholder="Slug (e.g. pro)" required value={editingPlan.slug || ''} onChange={e => setEditingPlan({ ...editingPlan, slug: e.target.value })} />
          <input className="admin-input" type="number" placeholder="Monthly Price" required value={editingPlan.monthly_price || ''} onChange={e => setEditingPlan({ ...editingPlan, monthly_price: Number(e.target.value) })} />
          <input className="admin-input" type="number" placeholder="Yearly Price" required value={editingPlan.yearly_price || ''} onChange={e => setEditingPlan({ ...editingPlan, yearly_price: Number(e.target.value) })} />
          <input className="admin-input" type="number" placeholder="Max Storage GB" value={editingPlan.max_storage_gb || ''} onChange={e => setEditingPlan({ ...editingPlan, max_storage_gb: Number(e.target.value) })} />
          <input className="admin-input" type="number" placeholder="Max Team Members" value={editingPlan.max_team_members || ''} onChange={e => setEditingPlan({ ...editingPlan, max_team_members: Number(e.target.value) })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={editingPlan.is_active !== false} onChange={e => setEditingPlan({ ...editingPlan, is_active: e.target.checked })} /> Active
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="admin-btn admin-btn-primary">
              {editingPlan.id ? 'Lưu thành phiên bản mới' : 'Save'}
            </button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditingPlan(null)}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="admin-table-toolbar">
        <span className="admin-table-title">Pricing Plans</span>
        <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => setEditingPlan({})}>
          <Plus size={14} /> Add Plan
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Monthly</th>
              <th>Yearly</th>
              <th>Storage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr> :
              plans.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>No plans found</td></tr> :
                plans.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.slug})</span></td>
                    <td>{formatCurrency(p.monthly_price)}</td>
                    <td>{formatCurrency(p.yearly_price)}</td>
                    <td>{p.max_storage_gb} GB</td>
                    <td>{p.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-banned">Inactive</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          onClick={() => handleToggleActive(p)}
                          style={{ color: p.is_active ? 'var(--accent-red)' : 'var(--accent-green)' }}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── PAYMENTS TAB ──────────────────────────────────────────────────────────
function PaymentsTab({ showToast }: { showToast: Function }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalRev, setTotalRev] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPayments({ page, limit: LIMIT, status });
      setPayments(data.payments || []);
      setTotal(data.total || 0);
      setTotalRev(data.totalRevenue || 0);
    } catch { showToast('Failed to load payments', 'error'); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  const getStatusBadge = (s: string) => {
    if (s === 'succeeded') return <span className="badge badge-active"><CheckCircle size={10} /> Succeeded</span>;
    if (s === 'failed') return <span className="badge badge-banned"><XCircle size={10} /> Failed</span>;
    if (s === 'pending') return <span className="badge badge-pro"><Clock size={10} /> Pending</span>;
    return <span className="badge">{s}</span>;
  };

  return (
    <>
      <div className="admin-table-toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="admin-table-title">Revenue & Invoices</span>
          <span className="badge badge-pro" style={{ fontSize: 14 }}><DollarSign size={14} /> Total: {formatCurrency(totalRev)}</span>
        </div>
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Gateway</th>
              <th>Transaction ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr> :
              payments.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>No payments found</td></tr> :
                payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatDate(p.created_at)}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{p.user_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.user_email}</div>
                    </td>
                    <td><span className="badge badge-free">{p.plan_name || '—'}</span></td>
                    <td style={{ fontWeight: 'bold' }}>{formatCurrency(p.amount)}</td>
                    <td>{getStatusBadge(p.status)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.gateway}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.transaction_id || p.id.split('-')[0]}</td>
                    {/* [MỚI] Cột Actions: Nút Duyệt thủ công cho đơn Pending */}
                    <td>
                      {p.status === 'pending' && (
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          style={{ fontSize: 11, background: '#059669', border: 'none' }}
                          onClick={async () => {
                            if (!confirm(`Duyệt tay giao dịch ${p.transaction_id}? Admin xác nhận tiền ĐÃ về tài khoản.`)) return;
                            try {
                              await adminForceSuccessPayment(p.id);
                              showToast('✅ Đã kích hoạt gói thành công cho user!');
                              load();
                            } catch {
                              showToast('Lỗi duyệt thủ công', 'error');
                            }
                          }}
                        >
                          ✅ Duyệt thủ công
                        </button>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span>Showing {payments.length} of {total}</span>
        <div className="admin-pagination-btns">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}
