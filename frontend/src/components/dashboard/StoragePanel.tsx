// src/components/dashboard/StoragePanel.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Image as ImageIcon, Calendar, Eye } from 'lucide-react';
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

  const { currentWorkspace } = useWorkspace();
  
  let maxGb = currentWorkspace?.is_pro 
    ? Number(currentWorkspace?.plan_storage_gb || 5) 
    : 5;
    
  if (!maxGb || isNaN(maxGb) || maxGb === 0) {
    maxGb = 5;
  }
  
  const maxBytes = maxGb * 1024 ** 3;
  const usedBytes = Number(currentWorkspace?.used_storage_bytes ?? 0);
  const pct = Math.min((usedBytes / maxBytes) * 100, 100);

  useEffect(() => {
    setLoading(true);
    fetch('/api/assets/user-images', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'X-Workspace-Id': localStorage.getItem('kanva_current_workspace_id') || '',
      },
    })
      .then(r => r.json())
      .then(d => setImages(d.images || []))
      .catch(() => showToast('❌ Lỗi kết nối server.'))
      .finally(() => setLoading(false));
  }, []);

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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-slate-100 border-dashed py-24 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mb-4">
              <ImageIcon size={30} />
            </div>
            <h3 className="font-extrabold text-slate-600 mb-1">Chưa có hình ảnh nào</h3>
            <p className="text-sm text-slate-400 max-w-xs">Các hình ảnh bạn tải lên Canvas sẽ xuất hiện tại đây.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((img, idx) => (
              <motion.div key={img.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
                <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden border-b border-slate-100/50">
                  <img src={img.url.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                    alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <a href={img.url.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                      target="_blank" rel="noreferrer"
                      className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl transition shadow-md" title="Xem ảnh gốc">
                      <Eye size={16} />
                    </a>
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
    </div>
  );
}
