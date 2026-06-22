import { useState, useEffect, useCallback } from 'react';
import AdminSelect from './AdminSelect';
import {
  fetchAdminSubscriptions, updateAdminSubscription, terminateSubscription, createManualSubscription,
  fetchAdminPlans, createPlan, updatePlan, deletePlan,
  fetchAdminPayments, adminRevokeSubscription, adminForceSuccessPayment,
} from '../../api/adminApi';
import { Search, Crown, CheckCircle, XCircle, Clock, Plus, Edit, Trash2, DollarSign, Activity, Ban, Package } from 'lucide-react';

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
          <h1 className="admin-page-title">Quản lý Gói cước & Doanh thu</h1>
          <p className="admin-page-subtitle">Quản lý hóa đơn, gói cước và doanh thu người dùng</p>
        </div>
      </div>

      {/* TABS DESIGN AS 3 NICE CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {[
          { id: 'subscriptions', title: 'Thuê bao', desc: 'Quản lý người dùng đang dùng gói', icon: Crown, color: '#8b5cf6', bg: '#f3e8ff' },
          { id: 'plans', title: 'Gói cước', desc: 'Cấu hình và giá các gói', icon: Package, color: '#f59e0b', bg: '#fef3c7' },
          { id: 'payments', title: 'Doanh thu & Hóa đơn', desc: 'Lịch sử giao dịch thanh toán', icon: DollarSign, color: '#10b981', bg: '#d1fae5' },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: isActive ? 'var(--bg-panel)' : 'var(--bg-panel)',
                border: isActive ? `2px solid ${tab.color}` : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isActive ? `0 4px 12px ${tab.color}33` : '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transform: isActive ? 'translateY(-2px)' : 'none'
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '12px', background: tab.bg, color: tab.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={24} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: isActive ? tab.color : 'var(--text-primary)' }}>{tab.title}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{tab.desc}</p>
              </div>
            </div>
          );
        })}
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
    } catch { showToast('Không thể tải danh sách thuê bao', 'error'); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  const handleRevoke = async (id: string) => {
    if (!confirm('⚠️ NGẮT DỊCH VỤ NGAY LẬP TỨC? Hành động này không thể hoàn tác!')) return;
    try {
      await adminRevokeSubscription(id);
      showToast('Đã ngắt dịch vụ ngay lập tức.');
      load();
    } catch { showToast('Lỗi ngắt dịch vụ', 'error'); }
  };

  const getStatusBadge = (s: string) => {
    if (s === 'active') return <span className="badge badge-active"><CheckCircle size={10} /> Hoạt động</span>;
    if (s === 'canceled') return <span className="badge badge-banned"><XCircle size={10} /> Đã hủy</span>;
    if (s === 'expired') return <span className="badge badge-banned"><Clock size={10} /> Hết hạn</span>;
    return <span className="badge">{s}</span>;
  };

  return (
    <>
      <div className="admin-table-toolbar">
        <div className="admin-search">
          <Search size={14} color="var(--text-muted)" />
          <input placeholder="Tìm người dùng..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <AdminSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Tất cả trạng thái' },
            { value: 'active', label: 'Hoạt động' },
            { value: 'canceled', label: 'Đã hủy' },
            { value: 'expired', label: 'Hết hạn' },
          ]}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Gói</th>
              <th>Trạng thái</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
              <th>Mã Stripe</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Đang tải...</td></tr> :
              subs.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Không có đăng ký nào</td></tr> :
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
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.stripe_subscription_id || 'Thủ công'}</td>
                    <td>
                      {s.status === 'active' && (
                        <div style={{ display: 'flex', gap: 6 }}>
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
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span>Hiển thị {subs.length} / {total}</span>
        <div className="admin-pagination-btns">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button>
          <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Sau</button>
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
    } catch { showToast('Không thể tải danh sách gói cước', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingPlan.name?.trim()) return showToast('Vui lòng nhập tên gói', 'error');
    if (!editingPlan.slug?.trim()) return showToast('Vui lòng nhập slug', 'error');
    if (editingPlan.monthly_price === undefined || editingPlan.monthly_price < 0) return showToast('Giá tháng không hợp lệ', 'error');
    if (editingPlan.yearly_price === undefined || editingPlan.yearly_price < 0) return showToast('Giá năm không hợp lệ', 'error');

    const payload = {
      ...editingPlan,
      max_storage_gb: 0,
      max_team_members: 0,
    };

    try {
      if (editingPlan.id) {
        if (!confirm('Thay đổi giá sẽ tạo ra một gói cước mới. Những người dùng cũ đang gia hạn tự động sẽ không bị ảnh hưởng.\nBạn có tiếp tục không?')) return;
        await updatePlan(editingPlan.id, payload);
        showToast('Đã lưu thành phiên bản mới');
      } else {
        await createPlan(payload);
        showToast('Đã tạo gói mới');
      }
      setEditingPlan(null);
      load();
    } catch { showToast('Lỗi khi lưu gói cước', 'error'); }
  };

  const handleToggleActive = async (p: any) => {
    try {
      await updatePlan(p.id, { is_active: !p.is_active });
      showToast(p.is_active ? 'Đã hủy kích hoạt gói' : 'Đã kích hoạt gói');
      load();
    } catch { showToast('Lỗi thay đổi trạng thái', 'error'); }
  };

  if (editingPlan) {
    return (
      <div style={{ padding: 20 }}>
        <h3>Gói Cước Mới</h3>
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: 15, maxWidth: 400, marginTop: 20 }}>
          <input className="admin-input" placeholder="Tên gói (VD: Pro)" required value={editingPlan.name || ''} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} />
          <input className="admin-input" placeholder="Slug (VD: pro)" required value={editingPlan.slug || ''} onChange={e => setEditingPlan({ ...editingPlan, slug: e.target.value })} />
          <input className="admin-input" type="number" placeholder="Giá Tháng" required value={editingPlan.monthly_price ?? ''} onChange={e => setEditingPlan({ ...editingPlan, monthly_price: Number(e.target.value) })} />
          <input className="admin-input" type="number" placeholder="Giá Năm" required value={editingPlan.yearly_price ?? ''} onChange={e => setEditingPlan({ ...editingPlan, yearly_price: Number(e.target.value) })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={editingPlan.is_active !== false} onChange={e => setEditingPlan({ ...editingPlan, is_active: e.target.checked })} /> Đang hoạt động
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="admin-btn admin-btn-primary">
              {editingPlan.id ? 'Lưu thành phiên bản mới' : 'Lưu lại'}
            </button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditingPlan(null)}>Hủy</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="admin-table-toolbar">
        <span className="admin-table-title">Danh sách Gói cước (Mới nhất)</span>
        <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => setEditingPlan({})}>
          <Plus size={14} /> Thêm Gói
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tên (Slug)</th>
              <th>Giá Tháng</th>
              <th>Giá Năm</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Đang tải...</td></tr> :
              plans.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Không có gói cước nào</td></tr> :
                plans.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.slug})</span></td>
                    <td>{formatCurrency(p.monthly_price)}</td>
                    <td>{formatCurrency(p.yearly_price)}</td>
                    <td>{p.is_active ? <span className="badge badge-active">Hoạt động</span> : <span className="badge badge-banned">Ngừng</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          onClick={() => handleToggleActive(p)}
                          style={{ color: p.is_active ? 'var(--accent-red)' : 'var(--accent-green)' }}
                        >
                          {p.is_active ? 'Hủy kích hoạt' : 'Kích hoạt'}
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPayments({ page, limit: LIMIT, status, search });
      setPayments(data.payments || []);
      setTotal(data.total || 0);
      setTotalRev(data.totalRevenue || 0);
    } catch { showToast('Không thể tải danh sách hóa đơn', 'error'); }
    finally { setLoading(false); }
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, search]);

  const getStatusBadge = (s: string) => {
    if (s === 'succeeded') return <span className="badge badge-active"><CheckCircle size={10} /> Thành công</span>;
    if (s === 'failed') return <span className="badge badge-banned"><XCircle size={10} /> Thất bại</span>;
    if (s === 'pending') return <span className="badge badge-pro"><Clock size={10} /> Đang chờ</span>;
    return <span className="badge">{s}</span>;
  };

  return (
    <>
      <div className="admin-table-toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="admin-table-title">Doanh thu & Hóa đơn</span>
          <span className="badge badge-pro" style={{ fontSize: 14 }}><DollarSign size={14} /> Tổng: {formatCurrency(totalRev)}</span>
        </div>
        <div className="admin-search">
          <Search size={14} color="var(--text-muted)" />
          <input placeholder="Tìm kiếm giao dịch..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <AdminSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Tất cả trạng thái' },
            { value: 'succeeded', label: 'Thành công' },
            { value: 'failed', label: 'Thất bại' },
            { value: 'pending', label: 'Đang chờ xử lý' },
          ]}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Người dùng</th>
              <th>Gói</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Cổng TT</th>
              <th>Mã giao dịch</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>Đang tải...</td></tr> :
              payments.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>Không có giao dịch nào</td></tr> :
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
        <span>Hiển thị {payments.length} / {total}</span>
        <div className="admin-pagination-btns">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button>
          <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Sau</button>
        </div>
      </div>
    </>
  );
}
