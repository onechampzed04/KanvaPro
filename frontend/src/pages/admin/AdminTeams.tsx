// frontend/src/pages/admin/AdminTeams.tsx
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Users, HardDrive, Ban, Eye, X, Crown, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';
import AdminSelect from './AdminSelect';

const API = (path: string) =>
  fetch(`/api/admin${path}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    },
  });

const APIJ = (path: string, body: object) =>
  fetch(`/api/admin${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

function formatBytes(b: number) {
  if (!b) return '0 B';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN');
}

type Team = {
  id: string; name: string; avatar_url?: string;
  max_members: number; member_count: number; design_count: number;
  is_deleted: boolean; deleted_at?: string;
  used_storage_bytes: number; max_storage_gb: number;
  owner_id: string; owner_name: string; owner_email: string;
  sub_status?: string; current_period_end?: string;
  plan_name?: string; plan_slug?: string;
  created_at: string;
};

type Member = {
  id: string; name: string; email: string; avatar_url?: string;
  role: string; joined_at: string;
};

export default function AdminTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail modal
  const [detailTeam, setDetailTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Ban modal
  const [banTarget, setBanTarget] = useState<Team | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(limit),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const r = await API(`/teams?${params}`);
      const d = await r.json();
      setTeams(d.teams || []);
      setTotal(d.total || 0);
    } catch {
      Swal.fire('Lỗi', 'Không thể tải danh sách team', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (team: Team) => {
    setDetailTeam(team);
    setLoadingDetail(true);
    try {
      const r = await API(`/teams/${team.id}`);
      const d = await r.json();
      setDetailTeam(d.team);
      setMembers(d.members || []);
    } catch {
      Swal.fire('Lỗi', 'Không thể tải chi tiết team', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openBanModal = (team: Team) => {
    setBanTarget(team);
    setBanReason(''); // Không còn lưu ban_reason rời nữa, ta có thể nhập lý do để ghi log hoặc lưu vào description
  };

  const handleBanSubmit = async () => {
    if (!banTarget) return;
    setBanning(true);
    const shouldBan = !banTarget.is_deleted;
    try {
      const r = await APIJ(`/teams/${banTarget.id}/ban`, { banned: shouldBan, reason: banReason });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Lỗi');
      Swal.fire('Thành công', d.message, 'success');
      setBanTarget(null);
      load();
    } catch (err: any) {
      Swal.fire('Lỗi', err.message, 'error');
    } finally {
      setBanning(false);
    }
  };

  const totalBanned = teams.filter(t => t.is_deleted).length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Quản lý Teams
          </h1>
          <p className="text-gray-400 mt-1">Giám sát, kiểm duyệt và ban các team vi phạm</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <p className="text-gray-400 text-sm">Tổng Teams</p>
          <h3 className="text-3xl font-bold text-white mt-2">{total}</h3>
        </div>
        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <p className="text-gray-400 text-sm">Đang bị khóa</p>
          <h3 className="text-3xl font-bold text-red-400 mt-2">{totalBanned}</h3>
        </div>
        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <p className="text-gray-400 text-sm">Hoạt động</p>
          <h3 className="text-3xl font-bold text-green-400 mt-2">{total - totalBanned}</h3>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="relative z-20 p-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên team, email owner..."
            className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <AdminSelect
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tất cả trạng thái' },
            { value: 'active', label: 'Hoạt động' },
            { value: 'deleted', label: 'Bị khóa/Xóa' },
          ]}
        />
      </div>

      {/* ── Table ── */}
      <div className="relative z-10 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-black/20 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Team</th>
                <th className="px-6 py-4 font-medium">Owner</th>
                <th className="px-6 py-4 font-medium">Thành viên</th>
                <th className="px-6 py-4 font-medium">Lưu trữ</th>
                <th className="px-6 py-4 font-medium">Gói</th>
                <th className="px-6 py-4 font-medium">Trạng thái</th>
                <th className="px-6 py-4 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <div className="w-8 h-8 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : teams.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Không tìm thấy team nào.</td></tr>
              ) : teams.map(t => {
                const usedPct = t.max_storage_gb > 0
                  ? Math.min((t.used_storage_bytes / (t.max_storage_gb * 1024 ** 3)) * 100, 100)
                  : 0;
                return (
                  <tr key={t.id} className={`hover:bg-white/[0.02] transition-colors ${t.is_deleted ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
                          {t.avatar_url ? <img src={t.avatar_url} className="w-full h-full object-cover" alt={t.name} /> : t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{t.name}</div>
                          <div className="text-xs text-gray-500">{formatDate(t.created_at)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white flex items-center gap-1">
                        <Crown size={13} className="text-yellow-400 shrink-0" />
                        {t.owner_name}
                      </div>
                      <div className="text-xs text-gray-500">{t.owner_email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <Users size={14} className="text-indigo-400" />
                        <span className="font-semibold">{t.member_count}</span>
                        <span className="text-gray-500">/ {t.max_members}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.design_count} designs</div>
                    </td>
                    <td className="px-6 py-4 min-w-[160px]">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{formatBytes(t.used_storage_bytes)}</span>
                        <span className="text-gray-500">{t.max_storage_gb} GB</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${usedPct > 80 ? 'bg-red-500' : 'bg-indigo-500'}`}
                          style={{ width: `${usedPct}%` }} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {t.plan_name ? (
                        <span className="px-2 py-1 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-300">{t.plan_name}</span>
                      ) : (
                        <span className="px-2 py-1 rounded-md text-xs font-semibold bg-gray-500/20 text-gray-400">Free</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {t.is_deleted ? (
                        <span className="flex items-center gap-1.5 text-red-400 text-xs font-semibold">
                          <Ban size={14} /> Bị khóa (Xóa)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                          <CheckCircle2 size={14} /> Hoạt động
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openDetail(t)}
                          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                          title="Xem chi tiết"
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          onClick={() => openBanModal(t)}
                          className={`p-2 rounded-lg transition-colors ${t.is_deleted
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'hover:bg-red-500/20 text-gray-400 hover:text-red-400'
                          }`}
                          title={t.is_deleted ? 'Mở khóa (Khôi phục)' : 'Khóa team'}
                        >
                          <Ban size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-white/5 flex justify-between items-center bg-black/10">
          <span className="text-sm text-gray-400">
            Trang {page} / {Math.ceil(total / limit) || 1} &nbsp;·&nbsp; {total} teams
          </span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors text-sm">
              Trước
            </button>
            <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors text-sm">
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {detailTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                  {detailTeam.avatar_url ? <img src={detailTeam.avatar_url} className="w-full h-full object-cover" alt="" /> : detailTeam.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{detailTeam.name}</h3>
                  <p className="text-gray-400 text-sm">ID: {detailTeam.id.substring(0, 16)}...</p>
                </div>
              </div>
              <button onClick={() => { setDetailTeam(null); setMembers([]); }}
                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Owner', value: `${detailTeam.owner_name} (${detailTeam.owner_email})` },
                  { label: 'Thành viên', value: `${detailTeam.member_count} / ${detailTeam.max_members}` },
                  { label: 'Designs', value: String(detailTeam.design_count) },
                  { label: 'Lưu trữ', value: `${formatBytes(detailTeam.used_storage_bytes)} / ${detailTeam.max_storage_gb} GB` },
                  { label: 'Gói cước', value: detailTeam.plan_name || 'Free' },
                  { label: 'Ngày tạo', value: formatDate(detailTeam.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-sm font-semibold text-white break-all">{value}</p>
                  </div>
                ))}
              </div>

              {detailTeam.is_deleted && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-semibold text-sm">Team đang bị khóa (is_deleted)</p>
                    <p className="text-gray-400 text-xs mt-1">Đã khóa vào: {detailTeam.deleted_at ? formatDate(detailTeam.deleted_at) : 'Không rõ'}</p>
                  </div>
                </div>
              )}

              {/* Members list */}
              <div>
                <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-indigo-400" /> Danh sách thành viên
                </h4>
                {loadingDetail ? (
                  <div className="flex justify-center py-8">
                    <div className="w-7 h-7 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-600 to-slate-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                            {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white flex items-center gap-1.5">
                              {m.name}
                              {m.role === 'owner' && <Crown size={12} className="text-yellow-400" />}
                              {m.role === 'admin' && <Shield size={12} className="text-blue-400" />}
                            </div>
                            <div className="text-xs text-gray-500">{m.email}</div>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          m.role === 'owner' ? 'bg-yellow-500/20 text-yellow-300' :
                          m.role === 'admin' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {m.role}
                        </span>
                      </div>
                    ))}
                    {members.length === 0 && <p className="text-gray-500 text-sm text-center py-4">Không có thành viên</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Ban Modal ── */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className={banTarget.is_deleted ? 'text-green-400' : 'text-red-500'} size={22} />
              {banTarget.is_deleted ? 'Mở khóa (Khôi phục) Team' : 'Khóa Team'}
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              Bạn đang thao tác với team <strong className="text-white">"{banTarget.name}"</strong> (Owner: {banTarget.owner_email}).
              {!banTarget.is_deleted && ' Khi khóa, team sẽ không thể sử dụng các tính năng cộng tác.'}
            </p>

            {!banTarget.is_deleted && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Lý do khóa (để lưu log)</label>
                <textarea
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-500"
                  rows={3}
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  placeholder="Nhập lý do vi phạm..."
                />
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setBanTarget(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors font-medium">
                Hủy bỏ
              </button>
              <button
                onClick={handleBanSubmit}
                disabled={banning}
                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                  banTarget.is_deleted ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {banning ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                Xác nhận {banTarget.is_deleted ? 'Khôi phục' : 'Khóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
