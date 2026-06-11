// src/pages/StoragePage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, HardDrive, Image as ImageIcon, Calendar, Eye, Presentation, Trash2 } from 'lucide-react';
import { deleteUserAsset } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

export default function StoragePage() {
  const { user, refreshUser } = useAuth();
  const { currentWorkspace, refreshWorkspaces } = useWorkspace();
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Quy đổi dung lượng theo yêu cầu: bé hơn 1KB lấy số thập phân, hiển thị từ KB trở lên
  const formatResourceSize = (bytes: number | undefined | null) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    
    // Nếu bé hơn 1 KB: lấy số thập phân
    if (kb < 1) {
      return kb.toFixed(3) + ' KB';
    }
    // Nếu dưới 1 MB: hiển thị KB
    if (kb < 1024) {
      return kb.toFixed(1) + ' KB';
    }
    // Nếu dưới 1 GB: hiển thị MB
    const mb = kb / 1024;
    if (mb < 1024) {
      return mb.toFixed(3) + ' MB';
    }
    // Còn lại: hiển thị GB
    const gb = mb / 1024;
    return gb.toFixed(2) + ' GB';
  };

  const loadUploadedImages = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/assets/user-images', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'X-Workspace-Id': localStorage.getItem('kanva_current_workspace_id') || '',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setImages(data.images || []);
      } else {
        showToast('❌ Không thể tải danh sách tài nguyên.');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ Lỗi kết nối server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài nguyên này? Các ảnh gốc sẽ bị xóa vĩnh viễn và hoàn trả dung lượng.')) return;
    try {
      await deleteUserAsset(assetId);
      showToast('✅ Xóa tài nguyên thành công');
      loadUploadedImages();
      window.dispatchEvent(new Event('storage:updated'));
    } catch (e: any) {
      showToast('❌ Lỗi xóa: ' + e.message);
    }
  };

  useEffect(() => {
    loadUploadedImages();
  }, [currentWorkspace?.id]);

  useEffect(() => {
    const handleStorageUpdate = () => {
      refreshUser();
      refreshWorkspaces();
      loadUploadedImages();
    };
    window.addEventListener('storage:updated', handleStorageUpdate);
    return () => window.removeEventListener('storage:updated', handleStorageUpdate);
  }, [refreshUser, refreshWorkspaces]);

  // Tính toán hạn mức lưu trữ dựa trên Workspace hiện tại
  let maxGb = currentWorkspace?.is_pro 
    ? Number(currentWorkspace?.plan_storage_gb || 5) 
    : 5;
  
  if (!maxGb || isNaN(maxGb) || maxGb === 0) {
    maxGb = 5; // Fallback an toàn
  }

  const maxStorageBytes = maxGb * 1024 * 1024 * 1024;
  const storageUsedBytes = currentWorkspace && currentWorkspace.workspace_type !== 'personal'
    ? Number(currentWorkspace.used_storage_bytes ?? 0) 
    : Number(user?.storage_used_bytes ?? 0);
  const percentage = Math.min((storageUsedBytes / maxStorageBytes) * 100, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/20 font-sans">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
            <ChevronLeft size={18} />
            <span className="text-sm font-bold">Dashboard</span>
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-xl flex items-center justify-center">
              <HardDrive size={16} className="text-sky-500" />
            </div>
            <h1 className="text-lg font-extrabold text-slate-800">Quản lý Tài nguyên</h1>
          </div>
        </div>
      </header>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-20 right-6 z-50 bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-6xl mx-auto px-6 py-10">
        
        {/* Storage Widget Card */}
        <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 mb-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-sky-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <HardDrive size={20} />
              </span>
              <h3 className="text-xl font-extrabold text-slate-800">Dung lượng Không gian làm việc</h3>
            </div>
            <p className="text-sm text-slate-400 max-w-md">
              Dung lượng lưu trữ được chia sẻ cho toàn bộ thành viên trong Workspace hiện tại của bạn.
            </p>
            
            <div className="mt-6">
              <div className="flex justify-between text-xs font-extrabold text-slate-600 mb-2">
                <span>Đã dùng: {formatResourceSize(storageUsedBytes)} (DB: {user?.storage_used_bytes || '0'}, Team: {currentWorkspace?.used_storage_bytes || '0'}, CW: {currentWorkspace ? 'yes' : 'no'})</span>
                <span>Hạn mức: {maxStorageBytes / (1024 ** 3)} GB</span>
              </div>
              
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full bg-gradient-to-r ${percentage > 90 ? 'from-rose-500 to-red-600' : 'from-indigo-500 to-sky-500'}`}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] font-bold text-slate-400">
                  Còn trống: {formatResourceSize(Math.max(maxStorageBytes - storageUsedBytes, 0))}
                </span>
                <span className={`text-xs font-extrabold ${percentage > 90 ? 'text-rose-500' : 'text-indigo-600'}`}>
                  {percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center w-full md:w-auto bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex-shrink-0">
            <div className="text-center px-6 py-2">
              <div className="text-3xl font-black text-slate-700 mb-1">{images.length}</div>
              <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Tệp ảnh tải lên</div>
            </div>
          </div>
        </section>

        {/* Assets Grid */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
              <ImageIcon size={22} className="text-indigo-500" />
              <span>Hình ảnh của tôi</span>
            </h2>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-extrabold">
              {images.length} mục
            </span>
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
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300"
                >
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden border-b border-slate-100/50 flex items-center justify-center">
                    <img
                      src={img.url?.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    
                    {img.type === 'pptx' && (
                      <div className="absolute top-2 right-2 bg-indigo-500/90 backdrop-blur text-white px-2 py-1 rounded-md shadow-sm flex items-center gap-1 z-10">
                        <Presentation size={12} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">PPTX</span>
                      </div>
                    )}

                    {/* Hover actions overlay */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 z-20">
                      {img.type === 'image' && (
                        <a
                          href={img.url?.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl transition shadow-md"
                          title="Xem ảnh gốc"
                        >
                          <Eye size={16} />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteAsset(img.id)}
                        className="p-2.5 bg-white hover:bg-rose-50 text-rose-500 rounded-xl transition shadow-md"
                        title="Xóa tài nguyên"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Image Detail */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-sm text-slate-700 truncate" title={img.name}>
                        {img.name}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">
                        Dung lượng: <span className="text-indigo-600">{formatResourceSize(img.file_size)}</span>
                      </p>
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
      </main>
    </div>
  );
}
