// src/components/dashboard/StoragePanel.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Image as ImageIcon, Calendar, Eye, Trash2, AlertTriangle, X, Presentation } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';

const fmt = (b: number | undefined | null) => {
  if (!b) return '0 KB';
  const kb = b / 1024;
  if (kb < 1) return kb.toFixed(3) + ' KB';
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
};

export default function StoragePanel() {
  const { user } = useAuth();
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; image: any; usages: any[]; checking: boolean; deleting: boolean }>({
    isOpen: false, image: null, usages: [], checking: false, deleting: false
  });
  const [storageBreakdown, setStorageBreakdown] = useState<any[]>([]);

  const { currentWorkspace } = useWorkspace();

  let maxGb = Number(currentWorkspace?.max_storage_gb || 5);

  if (isNaN(maxGb) || maxGb === 0) {
    maxGb = 5;
  }

  const maxBytes = maxGb * 1024 ** 3;

  // [Storage Quota Display]
  // Personal Workspace lưu dung lượng ở users.storage_used_bytes. Team lưu ở teams.used_storage_bytes.
  // Các field này đã được gộp thống nhất thành currentWorkspace.used_storage_bytes thông qua middleware và service.
  const usedBytes = currentWorkspace
    ? Number(currentWorkspace.used_storage_bytes ?? 0)
    : Number((user as any)?.storage_used_bytes ?? 0);
  const pct = Math.min((usedBytes / maxBytes) * 100, 100);

  useEffect(() => {
    const fetchImages = () => {
      setLoading(true);
      fetch(`/api/assets/user-images?personalOnly=true`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'X-Workspace-Id': localStorage.getItem('kanva_current_workspace_id') || '',
        },
      })
        .then(r => r.json())
        .then(d => setImages(d.images || []))
        .catch(() => showToast('❌ Lỗi kết nối server.'))
        .finally(() => setLoading(false));
    };

    fetchImages();

    window.addEventListener('storage:updated', fetchImages);
    return () => window.removeEventListener('storage:updated', fetchImages);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (currentWorkspace?.workspace_type === 'team' && currentWorkspace.owner_id === user?.id) {
      fetch(`/api/teams/${currentWorkspace.id}/storage-breakdown`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
        .then(r => r.json())
        .then(d => setStorageBreakdown(d.breakdown || []))
        .catch(() => { });
    } else {
      setStorageBreakdown([]);
    }
  }, [currentWorkspace?.id, user?.id]);

  const handleCheckUsages = async (img: any) => {
    setDeleteModal({ isOpen: true, image: img, usages: [], checking: true, deleting: false });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/assets/${img.id}/usages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDeleteModal(p => ({ ...p, checking: false, usages: data.usages || [] }));
    } catch (err) {
      setDeleteModal(p => ({ ...p, checking: false }));
      showToast('❌ Lỗi khi kiểm tra thiết kế liên quan');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.image) return;
    setDeleteModal(p => ({ ...p, deleting: true }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/assets/${deleteModal.image.id}/force`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('✅ Đã xóa ảnh và loại bỏ khỏi các dự án liên quan');
        setImages(images.filter(img => img.id !== deleteModal.image.id));
        setDeleteModal({ isOpen: false, image: null, usages: [], checking: false, deleting: false });
        window.dispatchEvent(new Event('storage:updated'));
      } else {
        const data = await res.json();
        showToast(`❌ ${data.error || 'Lỗi khi xóa'}`);
      }
    } catch (err) {
      showToast('❌ Lỗi kết nối');
    } finally {
      setDeleteModal(p => ({ ...p, deleting: false }));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-6 right-8 z-50 bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
          <HardDrive size={20} className="text-sky-500" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">Quản lý Tài nguyên</h2>
          <p className="text-sm text-slate-400">Hình ảnh và tệp đã tải lên của bạn</p>
        </div>
      </div>

      {/* Storage Widget */}
      <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 mb-10 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-sky-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><HardDrive size={20} /></span>
            <h3 className="text-lg font-extrabold text-slate-800">Dung lượng lưu trữ</h3>
          </div>
          <p className="text-sm text-slate-400 max-w-md">Dung lượng chia sẻ cho toàn bộ thành viên trong Workspace hiện tại.</p>
          <div className="mt-6">
            <div className="flex justify-between text-xs font-extrabold text-slate-600 mb-2">
              <span>Đã dùng: {fmt(usedBytes)}</span>
              <span>Hạn mức: {maxGb} GB</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full bg-gradient-to-r ${pct > 90 ? 'from-rose-500 to-red-600' : 'from-indigo-500 to-sky-500'}`} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] font-bold text-slate-400">Còn trống: {fmt(Math.max(maxBytes - usedBytes, 0))}</span>
              <span className={`text-xs font-extrabold ${pct > 90 ? 'text-rose-500' : 'text-indigo-600'}`}>{pct.toFixed(1)}%</span>
            </div>
          </div>

          {storageBreakdown.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-extrabold text-slate-500 uppercase mb-3">Chi tiết thành viên</h4>
              <div className="space-y-3">
                {storageBreakdown.map(member => (
                  <div key={member.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden shrink-0">
                        {member.avatar_url ? <img src={member.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">{member.name.charAt(0)}</div>}
                      </div>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{member.name}</span>
                    </div>
                    <span className="text-xs font-extrabold text-indigo-600">{fmt(Number(member.total_bytes))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 text-center shrink-0">
          <div className="text-3xl font-black text-slate-700 mb-1">{images.length}</div>
          <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Tệp ảnh tải lên</div>
        </div>
      </section>

      {/* Assets Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <ImageIcon size={20} className="text-indigo-500" /> Hình ảnh của tôi
          </h2>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-extrabold">{images.length} mục</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-white rounded-2xl border border-slate-100 border-dashed shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300"
            >
              <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden border-b border-slate-100/50 flex flex-col items-center justify-center text-slate-300">
                <ImageIcon size={36} className="mb-2" />
                <span className="text-sm font-bold text-slate-400">Chưa có ảnh nào</span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-extrabold text-sm text-slate-400 truncate">Trống</h4>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">
                    Dung lượng: 0 KB
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((img, idx) => (
              <motion.div key={img.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
                <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden border-b border-slate-100/50">
                  <img src={img.url?.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                    alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />

                  {img.type === 'pptx' && (
                    <div className="absolute top-2 right-2 bg-indigo-500/90 backdrop-blur text-white px-2 py-1 rounded-md shadow-sm flex items-center gap-1 z-10">
                      <Presentation size={12} />
                      <span className="text-[9px] font-bold uppercase tracking-wider">PPTX</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-20">
                    {img.type === 'image' && (
                      <a href={img.url?.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                        target="_blank" rel="noreferrer"
                        className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl transition shadow-md" title="Xem ảnh gốc">
                        <Eye size={16} />
                      </a>
                    )}
                    <button onClick={() => handleCheckUsages(img)}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition shadow-md" title="Xóa ảnh">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-700 truncate">{img.name}</h4>
                    <p className="text-[11px] font-bold text-slate-400 mt-1">Dung lượng: <span className="text-indigo-600">{fmt(img.file_size)}</span></p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-3">
                    <Calendar size={12} />
                    <span>{new Date(img.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Delete Modal */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
              <button onClick={() => setDeleteModal(p => ({ ...p, isOpen: false }))} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>

              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Xác nhận xóa tài nguyên</h3>
                  <p className="text-sm text-slate-500">Hành động này không thể hoàn tác.</p>
                </div>
              </div>

              {deleteModal.checking ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-slate-500">Đang kiểm tra các dự án liên quan...</p>
                </div>
              ) : (
                <>
                  {deleteModal.usages.length > 0 ? (
                    <div className="mb-6">
                      <p className="text-sm font-bold text-slate-600 mb-3">
                        Cảnh báo: Ảnh này đang được sử dụng trong <span className="text-rose-500">{deleteModal.usages.length}</span> thiết kế. Nếu xóa, ảnh sẽ bị gỡ bỏ khỏi các thiết kế này:
                      </p>
                      <div className="max-h-64 overflow-y-auto bg-slate-50 rounded-xl border border-slate-100 p-2 space-y-2">
                        {deleteModal.usages.map(u => (
                          <a key={u.id} href={`/design/${u.id}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 p-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:border-indigo-200 border border-transparent transition">
                            <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
                              {u.thumbnail_url ? <img src={u.thumbnail_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Trống</div>}
                            </div>
                            <span className="text-sm font-bold text-slate-700 truncate">{u.title || 'Untitled'}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-600 mb-6">Ảnh này chưa được sử dụng trong thiết kế nào. Bạn có thể an tâm xóa.</p>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setDeleteModal(p => ({ ...p, isOpen: false }))}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">Hủy</button>
                    <button onClick={handleConfirmDelete} disabled={deleteModal.deleting}
                      className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition shadow-lg shadow-rose-500/30 flex items-center justify-center disabled:opacity-70">
                      {deleteModal.deleting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Xóa tất cả'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
