// src/pages/TrashPage.tsx
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, RotateCcw, ChevronLeft, AlertTriangle, Clock, Layout, FileText } from 'lucide-react';
import { fetchTrashDesigns, restoreDesign, permanentlyDeleteDesign, emptyTrash } from '../api/api';

export default function TrashPage() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState({ visible: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 });
  
  const [bulkRestoreModalOpen, setBulkRestoreModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [emptyTrashModalOpen, setEmptyTrashModalOpen] = useState(false);
  const designCardsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const initialSelectedIdsRef = useRef<string[]>([]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, .group, [role="button"]')) return;
    if (e.button !== 0) return; 

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedIds([]);
      initialSelectedIdsRef.current = [];
    } else {
      initialSelectedIdsRef.current = [...selectedIds];
    }

    setSelectionRect({
      visible: true,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      width: 0,
      height: 0
    });
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectionRect.visible) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();

      const x = Math.min(e.clientX, selectionRect.startX);
      const y = Math.min(e.clientY, selectionRect.startY);
      const width = Math.abs(e.clientX - selectionRect.startX);
      const height = Math.abs(e.clientY - selectionRect.startY);

      setSelectionRect(prev => ({ ...prev, x, y, width, height }));

      if (width > 5 || height > 5) {
        const marqueeBoxViewport = { left: x, right: x + width, top: y, bottom: y + height };
        const baseSet = new Set(e.shiftKey || e.ctrlKey || e.metaKey ? initialSelectedIdsRef.current : []);

        designCardsRef.current.forEach((el, id) => {
          if (!el) return;
          const cardRect = el.getBoundingClientRect();
          const intersects = !(cardRect.right < marqueeBoxViewport.left ||
            cardRect.left > marqueeBoxViewport.right ||
            cardRect.bottom < marqueeBoxViewport.top ||
            cardRect.top > marqueeBoxViewport.bottom);
          if (intersects) baseSet.add(id);
        });
        setSelectedIds(Array.from(baseSet));
      }
    };

    const handleMouseUp = () => {
      if (!selectionRect.visible) return;
      setSelectionRect(prev => ({ ...prev, visible: false }));
      document.body.style.userSelect = '';
    };

    if (selectionRect.visible) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [selectionRect.visible, selectionRect.startX, selectionRect.startY]);

  const handleRestoreClick = (design: any) => setConfirmRestore(design);
  const confirmSingleRestore = async () => {
    if (!confirmRestore) return;
    setActionLoading(confirmRestore.id);
    try {
      await restoreDesign(confirmRestore.id);
      setDesigns(prev => prev.filter(d => d.id !== confirmRestore.id));
      setConfirmRestore(null);
      showToast(`✅ "${confirmRestore.title}" đã được khôi phục`);
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

  const handleEmptyTrashClick = () => setEmptyTrashModalOpen(true);
  const confirmEmptyTrash = async () => {
    setEmptyTrashModalOpen(false);
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

  const handleBulkRestoreClick = () => {
    if (!selectedIds.length) return;
    setBulkRestoreModalOpen(true);
  };
  const confirmBulkRestore = async () => {
    setBulkRestoreModalOpen(false);
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

  const handleBulkPermanentDeleteClick = () => {
    if (!selectedIds.length) return;
    setBulkDeleteModalOpen(true);
  };
  const confirmBulkDelete = async () => {
    setBulkDeleteModalOpen(false);
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-rose-50/30 font-sans">
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
          <button onClick={handleEmptyTrashClick} disabled={designs.length === 0} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-sm font-bold transition disabled:opacity-50">
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

      <div className="flex-1 w-full relative" onMouseDown={handleMouseDown}>
        <AnimatePresence>
          {selectionRect.visible && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
              className="fixed border border-indigo-500 bg-indigo-500/10 pointer-events-none z-[9999]"
              style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height }}
            />
          )}
        </AnimatePresence>
        <main className="max-w-6xl mx-auto px-6 py-10 h-full">
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
                    ref={(el) => {
                      if (el) designCardsRef.current.set(design.id, el as HTMLDivElement);
                      else designCardsRef.current.delete(design.id);
                    }}
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
                          onClick={() => handleRestoreClick(design)}
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
      </div>

      {/* FLOATING TOOLBAR cho Bulk Actions */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50">
            <span className="text-sm font-bold bg-white/10 px-3 py-1 rounded-lg">{selectedIds.length} đã chọn</span>
            <div className="w-px h-6 bg-slate-600"></div>
            <button onClick={handleBulkRestoreClick} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-bold text-sm transition-colors">
              <RotateCcw size={18} /> Khôi phục
            </button>
            <button onClick={handleBulkPermanentDeleteClick} className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold text-sm transition-colors">
              <Trash2 size={18} /> Xóa vĩnh viễn
            </button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-200 text-sm font-bold ml-2 hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
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

      {/* Confirm Single Restore Modal */}
      <AnimatePresence>
        {confirmRestore && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmRestore(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <RotateCcw size={22} className="text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Khôi phục thiết kế?</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Mục này sẽ được đưa về Dashboard.</p>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 mb-6 border border-emerald-100">
                <p className="font-bold text-emerald-700 truncate">"{confirmRestore.title}"</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmRestore(null)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmSingleRestore}
                  disabled={actionLoading === confirmRestore?.id}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold hover:from-emerald-600 hover:to-emerald-700 transition shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={15} />
                  {actionLoading === confirmRestore?.id ? 'Đang khôi phục...' : 'Khôi phục'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty Trash Modal */}
      <AnimatePresence>
        {emptyTrashModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setEmptyTrashModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0"><AlertTriangle size={28} className="text-rose-500" /></div>
                <div><h3 className="font-extrabold text-slate-800 text-xl">Dọn sạch thùng rác?</h3><p className="text-sm text-slate-500 mt-1 font-medium">Hành động này không thể hoàn tác!</p></div>
              </div>
              <p className="text-sm text-slate-600 mb-8 font-medium">Tất cả bản thiết kế hiện có trong thùng rác sẽ bị xóa vĩnh viễn.</p>
              <div className="flex gap-3">
                <button onClick={() => setEmptyTrashModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">Hủy</button>
                <button onClick={confirmEmptyTrash} className="flex-1 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-all shadow-lg shadow-rose-500/20">Dọn sạch</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Restore Modal */}
      <AnimatePresence>
        {bulkRestoreModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setBulkRestoreModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0"><RotateCcw size={28} className="text-emerald-500" /></div>
                <div><h3 className="font-extrabold text-slate-800 text-xl">Khôi phục {selectedIds.length} mục?</h3><p className="text-sm text-slate-500 mt-1 font-medium">Các mục này sẽ được đưa về Dashboard.</p></div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setBulkRestoreModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">Hủy</button>
                <button onClick={confirmBulkRestore} className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all shadow-lg shadow-emerald-500/20">Khôi phục</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Delete Modal */}
      <AnimatePresence>
        {bulkDeleteModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setBulkDeleteModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0"><AlertTriangle size={28} className="text-rose-500" /></div>
                <div><h3 className="font-extrabold text-slate-800 text-xl">Xóa vĩnh viễn {selectedIds.length} mục?</h3><p className="text-sm text-slate-500 mt-1 font-medium">Hành động này không thể hoàn tác!</p></div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setBulkDeleteModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">Hủy</button>
                <button onClick={confirmBulkDelete} className="flex-1 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-all shadow-lg shadow-rose-500/20">Xóa vĩnh viễn</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
