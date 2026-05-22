// src/pages/TrashPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, RotateCcw, ChevronLeft, AlertTriangle, Clock, Layout, FileText } from 'lucide-react';
import { fetchTrashDesigns, restoreDesign, permanentlyDeleteDesign, emptyTrash } from '../api/api';

export default function TrashPage() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchTrashDesigns();
      setDesigns(data.designs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (design: any) => {
    setActionLoading(design.id);
    try {
      await restoreDesign(design.id);
      setDesigns(prev => prev.filter(d => d.id !== design.id));
      showToast(`✅ "${design.title}" đã được khôi phục`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    setActionLoading(confirmDelete.id);
    try {
      await permanentlyDeleteDesign(confirmDelete.id);
      setDesigns(prev => prev.filter(d => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      showToast('🗑️ Đã xóa vĩnh viễn');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn dọn sạch toàn bộ thùng rác? Hành động này không thể hoàn tác!')) return;
    try {
      setLoading(true);
      await emptyTrash();
      setDesigns([]);
      setSelectedIds([]);
      showToast('🗑️ Đã dọn sạch thùng rác');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      await Promise.all(selectedIds.map(id => restoreDesign(id)));
      setDesigns(prev => prev.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
      showToast('✅ Đã khôi phục các mục đã chọn');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm('Xóa vĩnh viễn các mục đã chọn?')) return;
    try {
      setLoading(true);
      await Promise.all(selectedIds.map(id => permanentlyDeleteDesign(id)));
      setDesigns(prev => prev.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
      showToast('🗑️ Đã xóa vĩnh viễn các mục đã chọn');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getDaysLabel = (design: any) => {
    const remaining = Math.max(0, Math.round(Number(design.days_remaining ?? 30)));
    if (remaining <= 0) return { text: 'Hết hạn hôm nay', color: 'text-red-500', bg: 'bg-red-50' };
    if (remaining <= 3) return { text: `${remaining} ngày`, color: 'text-red-500', bg: 'bg-red-50' };
    if (remaining <= 7) return { text: `${remaining} ngày`, color: 'text-amber-600', bg: 'bg-amber-50' };
    return { text: `${remaining} ngày`, color: 'text-slate-500', bg: 'bg-slate-100' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50/30 font-sans">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
            <ChevronLeft size={18} />
            <span className="text-sm font-bold">Dashboard</span>
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center">
              <Trash2 size={16} className="text-rose-500" />
            </div>
            <h1 className="text-lg font-extrabold text-slate-800">Thùng Rác</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-slate-400 font-medium">
            Các thiết kế sẽ bị xóa vĩnh viễn sau <strong className="text-rose-500">30 ngày</strong>
          </p>
          <button onClick={handleEmptyTrash} disabled={designs.length === 0} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-sm font-bold transition disabled:opacity-50">
            Dọn sạch thùng rác
          </button>
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
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
          </div>
        ) : designs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-28 text-center"
          >
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-5">
              <Trash2 size={36} className="text-slate-300" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-600 mb-2">Thùng rác trống</h2>
            <p className="text-sm text-slate-400">Các thiết kế đã xóa sẽ xuất hiện ở đây.</p>
            <Link to="/" className="mt-6 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl text-sm transition">
              ← Quay lại Dashboard
            </Link>
          </motion.div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-bold">
                {designs.length} thiết kế
              </span>
              <p className="text-sm text-slate-400">Kéo thả hoặc nhấn để khôi phục / xóa vĩnh viễn</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {designs.map((design, idx) => {
                const daysLabel = getDaysLabel(design);
                const isActing = actionLoading === design.id;
                return (
                  <motion.div
                    key={design.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: idx * 0.04 }}
                    className="group relative bg-white rounded-3xl shadow-sm hover:shadow-lg border border-slate-100 overflow-hidden flex flex-col transition-all duration-300"
                  >
                    <div className={`absolute top-3 left-3 z-20 transition-opacity duration-200 ${selectedIds.includes(design.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(design.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(prev => [...prev, design.id]);
                          else setSelectedIds(prev => prev.filter(id => id !== design.id));
                        }}
                        className="w-5 h-5 rounded text-sky-500 focus:ring-sky-500 cursor-pointer"
                      />
                    </div>
                    {/* Thumbnail */}
                    <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 relative flex items-center justify-center overflow-hidden border-b border-slate-100">
                      {design.thumbnail_url ? (
                        <img src={design.thumbnail_url} alt={design.title} className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-500" />
                      ) : (
                        <div className="text-slate-300">
                          {design.design_type === 'document' ? <FileText size={40} strokeWidth={1.5} /> : <Layout size={40} strokeWidth={1.5} />}
                        </div>
                      )}
                      {/* Overlay with actions */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3 gap-3">
                        <button
                          onClick={() => handleRestore(design)}
                          disabled={isActing}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
                          title="Khôi phục"
                        >
                          <RotateCcw size={13} />
                          Khôi phục
                        </button>
                        <button
                          onClick={() => setConfirmDelete(design)}
                          disabled={isActing}
                          className="flex items-center gap-1.5 px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
                          title="Xóa vĩnh viễn"
                        >
                          <Trash2 size={13} />
                          Xóa hẳn
                        </button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4 flex-1 flex flex-col gap-2">
                      <h4 className="font-extrabold text-[14px] text-slate-700 truncate">{design.title}</h4>
                      <div className="flex items-center gap-2">
                        <Clock size={12} className={daysLabel.color} />
                        <span className={`text-[11px] font-bold ${daysLabel.color} ${daysLabel.bg} px-2 py-0.5 rounded-full`}>
                          Còn {daysLabel.text}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Xóa: {design.deleted_at ? new Date(design.deleted_at).toLocaleDateString('vi-VN') : '—'}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* FLOATING TOOLBAR cho Bulk Actions */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50">
            <span className="text-sm font-bold">{selectedIds.length} đã chọn</span>
            <div className="w-px h-5 bg-slate-600"></div>
            <button onClick={handleBulkRestore} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-bold text-sm transition-colors">
              <RotateCcw size={16} /> Khôi phục
            </button>
            <button onClick={handleBulkPermanentDelete} className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold text-sm transition-colors">
              <Trash2 size={16} /> Xóa vĩnh viễn
            </button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-200 text-sm font-bold ml-4">
              Hủy
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Permanent Delete Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={22} className="text-rose-500" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Xóa vĩnh viễn?</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Hành động này không thể hoàn tác!</p>
                </div>
              </div>
              <div className="bg-rose-50 rounded-2xl p-4 mb-6 border border-rose-100">
                <p className="font-bold text-rose-700 truncate">"{confirmDelete.title}"</p>
                <p className="text-xs text-rose-400 mt-1">Tất cả dữ liệu sẽ mất hoàn toàn.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  onClick={handlePermanentDelete}
                  disabled={actionLoading === confirmDelete?.id}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold hover:from-rose-600 hover:to-red-700 transition shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Trash2 size={15} />
                  {actionLoading === confirmDelete?.id ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
