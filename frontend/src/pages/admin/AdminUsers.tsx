import { useState, useEffect, useCallback } from 'react';
import { fetchAdminUsersV2, banUserV2 } from '../../api/adminApi';
import { Search, Shield, Ban, Crown, MoreVertical, RefreshCw, HardDrive, UserCheck, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { io as socketIO } from 'socket.io-client';
import AdminSelect from './AdminSelect';

function formatBytes(b: number) {
  if (!b) return '0 B';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

type UserRowV2 = {
  id: string; email: string; name: string; role: string;
  is_verified: boolean; status: string;
  max_storage_gb: string; used_storage_bytes: string;
  ban_reason: string; created_at: string;
  isOnline: boolean;
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRowV2[]>([]);
  const [total, setTotal] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [selectedUser, setSelectedUser] = useState<UserRowV2 | null>(null);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminUsersV2({ page, limit, search, role: roleFilter, status: statusFilter });
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setOnlineCount(data.onlineCount || 0);
    } catch (err) {
      console.error(err);
      Swal.fire('Lỗi', 'Không thể tải danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, roleFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // [FIX 2] Thay thế polling 15s bằng Socket.io events
  // Chỉ update đúng dòng bị ảnh hưởng, không reload toàn bộ list
  useEffect(() => {
    const token = localStorage.getItem('token') || document.cookie.split('token=')[1]?.split(';')[0];
    const socket = socketIO('http://localhost:3000', { withCredentials: true });

    socket.emit('join-admin-dashboard', { token });

    socket.on('admin:user-online', ({ userId }: { userId: string }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isOnline: true } : u));
    });

    socket.on('admin:user-offline', ({ userId }: { userId: string }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isOnline: false } : u));
    });

    socket.on('admin:user-banned', ({ userId, status }: { userId: string; status: string }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    });

    return () => { socket.disconnect(); };
  }, []);

  const handleBanSubmit = async () => {
    if (!selectedUser) return;
    try {
      const targetStatus = selectedUser.status === 'active' ? 'banned' : 'active';
      await banUserV2(selectedUser.id, targetStatus, banReason);
      Swal.fire('Thành công', `Đã ${targetStatus === 'banned' ? 'khóa' : 'mở khóa'} tài khoản!`, 'success');
      setShowBanModal(false);
      setBanReason('');
      loadUsers();
    } catch (err: any) {
      Swal.fire('Lỗi', err.message || 'Có lỗi xảy ra', 'error');
    }
  };

  const openBanModal = (u: UserRowV2) => {
    if (u.id === currentUser?.id) {
      Swal.fire('Từ chối', 'Bạn không thể tự khóa tài khoản của chính mình!', 'warning');
      return;
    }
    setSelectedUser(u);
    setBanReason(u.ban_reason || '');
    setShowBanModal(true);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Quản trị Người dùng
          </h1>
          <p className="text-gray-400 mt-1">Kiểm soát truy cập, phân quyền và hạn mức lưu trữ Real-time</p>
        </div>
        <button onClick={loadUsers} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* ── Top Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Tổng Người Dùng</p>
              <h3 className="text-3xl font-bold text-white mt-2">{total}</h3>
            </div>
            <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
              <Shield size={24} />
            </div>
          </div>
        </div>

        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Đang Online</p>
              <div className="flex items-center gap-3 mt-2">
                <h3 className="text-3xl font-bold text-white">{onlineCount}</h3>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              </div>
            </div>
            <div className="p-3 bg-green-500/20 text-green-400 rounded-xl">
              <UserCheck size={24} />
            </div>
          </div>
        </div>

        <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Cảnh báo Quota</p>
              <h3 className="text-3xl font-bold text-white mt-2">
                {users.filter(u => {
                  const max = parseFloat(u.max_storage_gb) * 1024 ** 3;
                  if (max <= 0) return parseInt(u.used_storage_bytes) > 0;
                  return (parseInt(u.used_storage_bytes) / max) > 0.8;
                }).length}
              </h3>
              <p className="text-xs text-orange-400 mt-1">Users dùng &gt; 80%</p>
            </div>
            <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl">
              <HardDrive size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="relative z-20 p-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên, email..."
            className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <AdminSelect
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: '', label: 'Tất cả Role' },
            { value: 'admin', label: 'Admin' },
            { value: 'user', label: 'User' },
          ]}
        />
        <AdminSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'Tất cả Trạng thái' },
            { value: 'active', label: 'Hoạt động' },
            { value: 'banned', label: 'Bị Khóa' },
          ]}
        />
      </div>

      {/* ── Table ── */}
      <div className="relative z-10 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-black/20 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Người dùng</th>
                <th className="px-6 py-4 font-medium">Quyền Hạn</th>
                <th className="px-6 py-4 font-medium">Trạng thái</th>
                <th className="px-6 py-4 font-medium min-w-[200px]">Lưu trữ (Quota)</th>
                <th className="px-6 py-4 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => {
                const used = Number(u.used_storage_bytes) || 0;
                const maxGb = parseFloat(u.max_storage_gb) || 5;
                const max = maxGb * 1024 ** 3;
                const percent = max > 0 ? Math.min((used / max) * 100, 100) : (used > 0 ? 100 : 0);
                const isWarning = percent > 80;

                return (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold uppercase">
                            {u.name.charAt(0)}
                          </div>
                          {u.isOnline && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1a1a2e] rounded-full"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            {u.name}
                            {u.role.includes('admin') && <Crown size={14} className="text-yellow-400" />}
                          </div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${u.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                        {u.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 ${u.status === 'active' ? 'text-green-400' : 'text-red-400'
                        }`}>
                        {u.status === 'active' ? <UserCheck size={16} /> : <Ban size={16} />}
                        {u.status === 'active' ? 'Active' : 'Banned'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{formatBytes(used)}</span>
                        <span className="text-gray-500">{maxGb} GB</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${isWarning ? 'bg-red-500' : 'bg-indigo-500'}`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openBanModal(u)}
                          className={`p-2 rounded-lg transition-colors ${u.status === 'active' ? 'hover:bg-red-500/20 text-gray-400 hover:text-red-400' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                          title={u.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
                        >
                          <Ban size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Không tìm thấy người dùng nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-white/5 flex justify-between items-center bg-black/10">
          <span className="text-sm text-gray-400">
            Hiển thị trang {page} / {Math.ceil(total / limit) || 1}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors text-sm"
            >
              Trước
            </button>
            <button
              disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors text-sm"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* ── Ban Modal ── */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="text-red-500" />
              {selectedUser.status === 'active' ? 'Khóa Tài Khoản' : 'Mở Khóa Tài Khoản'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Bạn đang thao tác với người dùng <strong className="text-white">{selectedUser.name}</strong> ({selectedUser.email}).
              {selectedUser.status === 'active' && ' Hành động này sẽ lập tức Force Logout người dùng khỏi mọi thiết bị.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Lý do (Bắt buộc khi khóa)</label>
                <textarea
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-500"
                  rows={3}
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  placeholder="Nhập lý do vi phạm..."
                ></textarea>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowBanModal(false)}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors font-medium"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleBanSubmit}
                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors ${selectedUser.status === 'active' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
