import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Plus, LogOut, Layout, Image as ImageIcon, Video,
  FileText, Monitor, Table, UploadCloud, Crown, Receipt, Shield,
  MoreVertical, Trash2, Camera, AlertTriangle, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDesigns, createDesign, bulkDeleteDesigns } from '../api/api';
import { useSubscription } from '../hooks/useSubscription';

const DESIGN_TEMPLATES = [
  { id: 'presentation', type: 'presentation', page_type: 'canvas', icon: Layout, label: 'Presentation', color: 'text-orange-500 bg-orange-50', w: 1920, h: 1080 },
  { id: 'social', type: 'social_media', page_type: 'canvas', icon: ImageIcon, label: 'Social media', color: 'text-rose-500 bg-rose-50', w: 1080, h: 1080 },
  { id: 'video', type: 'video', page_type: 'canvas', icon: Video, label: 'Video', color: 'text-purple-500 bg-purple-50', w: 1920, h: 1080 },
  { id: 'doc', type: 'document', page_type: 'doc', icon: FileText, label: 'Doc', color: 'text-sky-500 bg-sky-50', w: 800, h: null },
  { id: 'whiteboard', type: 'whiteboard', page_type: 'canvas', icon: Monitor, label: 'Whiteboard', color: 'text-green-500 bg-green-50', w: 5000, h: 5000 },
  { id: 'sheet', type: 'document', page_type: 'sheet', icon: Table, label: 'Sheet', color: 'text-blue-500 bg-blue-50', w: 1200, h: null },
];

export default function DashboardPage() {
  const { user, logout, updateAvatar } = useAuth();
  const { isPro, planName } = useSubscription();
  const [designs, setDesigns] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'my_designs' | 'shared'>('my_designs');
  const [isCustomSizeOpen, setIsCustomSizeOpen] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Delete modal state
  const [deleteModalDesign, setDeleteModalDesign] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarToast, setAvatarToast] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchDesigns(activeTab);
        setDesigns(data.designs);
      } catch (err) {
        console.error('Lỗi khi load trang Dashboard:', err);
      }
    };
    loadData();
  }, [activeTab]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleCreateDesign = async (template: any, customWidth?: number, customHeight?: number) => {
    try {
      const payload = {
        title: `Untitled ${template.label}`,
        design_type: template.type,
        page_type: template.page_type,
        width: customWidth || template.w,
        height: customHeight || template.h,
      };
      const data = await createDesign(payload);
      if (data.id) navigate(`/design/${data.id}`);
    } catch {
      alert('Không thể tạo thiết kế mới, vui lòng thử lại.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file hình ảnh!'); return; }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      const img = new window.Image();
      img.src = base64Url;
      img.onload = async () => {
        try {
          const design = await createDesign({ title: 'Photo Design', design_type: 'photo', page_type: 'canvas', width: img.width, height: img.height });
          try { sessionStorage.setItem(`pending_import_image_${design.id}`, base64Url); } catch { }
          navigate(`/design/${design.id}`);
        } catch { alert('Không thể tạo thiết kế mới.'); }
      };
    };
    reader.readAsDataURL(file);
  };

  // ─── Avatar Upload ─────────────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file hình ảnh!'); return; }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/auth/update-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateAvatar(data.avatar_url);
      setAvatarToast('Cập nhật ảnh đại diện thành công!');
      setTimeout(() => setAvatarToast(''), 3000);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  // ─── Delete Design ─────────────────────────────────────────────────────────
  const handleDeleteDesign = async () => {
    if (!deleteModalDesign) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/designs/${deleteModalDesign.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Xóa thất bại');
      }
      setDesigns(prev => prev.filter(d => d.id !== deleteModalDesign.id));
      setDeleteModalDesign(null);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm('Chuyển các thiết kế đã chọn vào thùng rác?')) return;
    try {
      await bulkDeleteDesigns(selectedIds);
      setDesigns(prev => prev.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:3000${user.avatar_url}`)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50/50 via-white to-pink-50/50 flex flex-col font-sans">

      {/* HEADER */}
      <header className="bg-white/60 backdrop-blur-xl border-b border-pink-100/60 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-[0_2px_20px_rgb(0,0,0,0.02)]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-md">K</div>
          <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 tracking-tight">Kanva Pro</h1>
        </div>

        <div className="flex items-center gap-5">
          {!isPro ? (
            <Link to="/pricing" className="group relative flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-[0_4px_14px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_20px_rgba(168,85,247,0.5)] hover:-translate-y-0.5 transition-all duration-300">
              <Crown size={16} className="text-yellow-300 group-hover:rotate-12 transition-transform duration-300" strokeWidth={2.5} />
              <span>Nâng cấp Pro</span>
            </Link>
          ) : (
            <div className="relative group">
              <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-[0_4px_14px_rgba(16,185,129,0.3)] cursor-pointer">
                <Crown size={16} className="text-yellow-300" strokeWidth={2.5} />
                <span>{planName}</span>
              </div>
              <div className="absolute right-0 top-full pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-4 min-w-[220px]">
                  <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Nâng cấp gói của bạn?</p>
                  <Link to="/pricing" className="block w-full text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold py-2.5 rounded-lg transition-colors text-sm">Xem các gói khác</Link>
                </div>
              </div>
            </div>
          )}

          {/* [MỚI] Hiển thị Storage Quota */}
          {user && (
            <div className="hidden sm:flex flex-col items-end justify-center mr-2 bg-white/80 px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm" title={`Đã dùng ${((user.storage_used_bytes || 0) / (1024**3)).toFixed(2)}GB / ${user.max_storage_gb || 5}GB`}>
              <div className="flex justify-between w-full text-[10px] font-bold text-slate-500 mb-1 gap-2">
                <span>Lưu trữ</span>
                <span>{((user.storage_used_bytes || 0) / (1024**3)).toFixed(1)} / {user.max_storage_gb || 5}GB</span>
              </div>
              <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${(((user.storage_used_bytes || 0) / (1024**3)) / (user.max_storage_gb || 5)) * 100 > 90 ? 'bg-rose-500' : 'bg-sky-500'}`} 
                  style={{ width: `${Math.min((((user.storage_used_bytes || 0) / (1024**3)) / (user.max_storage_gb || 5)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Avatar với nút upload */}
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()} title="Đổi ảnh đại diện">
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-md" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-pink-300 to-sky-300 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {isUploadingAvatar ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={12} className="text-white" />
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          <div className="flex items-center gap-2 bg-white/80 px-4 py-2 rounded-full shadow-sm border border-slate-100">
            <span className="text-sm font-bold text-slate-600">{user?.name}</span>
          </div>

          {(user?.role === 'admin' || user?.role === 'moderator') && (
            <Link to="/admin" className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-full font-bold text-sm shadow-md transition-all duration-200" title="Admin Panel">
              <Shield size={15} strokeWidth={2.5} />Admin
            </Link>
          )}

          {/* Teams & Trash navigation */}
          <Link
            to="/teams"
            className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-full text-slate-400 transition-all duration-300"
            title="Teams"
          >
            <Users size={18} strokeWidth={2.5} />
          </Link>
          <Link
            to="/trash"
            className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 rounded-full text-slate-400 transition-all duration-300"
            title="Thùng rác"
          >
            <Trash2 size={18} strokeWidth={2.5} />
          </Link>

          <Link to="/billing" className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 rounded-full text-slate-400 transition-all duration-300">
            <Receipt size={18} strokeWidth={2.5} />
          </Link>
          <button onClick={logout} className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 rounded-full text-slate-400 transition-all duration-300">
            <LogOut size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Avatar toast */}
      <AnimatePresence>
        {avatarToast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-8 z-50 bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm">
            ✓ {avatarToast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        <section className="mb-16 text-center">
          <motion.h2 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-purple-500 to-pink-500 mb-12 tracking-tight py-2">
            What will you design today?
          </motion.h2>

          <div className="flex overflow-x-auto pb-8 pt-4 px-4 gap-5 snap-x justify-start custom-scrollbar">
            {DESIGN_TEMPLATES.map((item, index) => (
              <motion.button key={item.id} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.4, ease: 'easeOut' }}
                onClick={() => handleCreateDesign(item)}
                className="relative shrink-0 flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group">
                <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-inner`}>
                  <item.icon size={26} strokeWidth={2} />
                </div>
                <span className="text-xs font-bold text-slate-600 text-center leading-tight group-hover:text-sky-600 transition-colors">{item.label}</span>
              </motion.button>
            ))}

            <div className="w-px h-24 bg-slate-200/50 self-center mx-2 shrink-0 rounded-full" />

            <motion.div className="shrink-0 flex flex-col relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              <button onClick={() => setIsCustomSizeOpen(!isCustomSizeOpen)}
                className="flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group">
                <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-slate-200 group-hover:scale-110 transition-all duration-300">
                  <Plus size={26} strokeWidth={2} />
                </div>
                <span className="text-xs font-bold text-slate-600 text-center leading-tight">Custom size</span>
              </button>
            </motion.div>

            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group">
              <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-slate-200 group-hover:scale-110 transition-all duration-300">
                <UploadCloud size={26} strokeWidth={2} />
              </div>
              <span className="text-xs font-bold text-slate-600 text-center leading-tight">Upload</span>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,.pdf" onChange={handleFileUpload} />
            </motion.button>
          </div>

          {isCustomSizeOpen && (
            <div className="w-full max-w-sm mx-auto mt-4 bg-white/90 backdrop-blur-2xl shadow-xl rounded-2xl p-5 border border-slate-100">
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Width (px)</label>
                  <input type="number" value={customW} onChange={e => setCustomW(Number(e.target.value))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Height (px)</label>
                  <input type="number" value={customH} onChange={e => setCustomH(Number(e.target.value))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all" />
                </div>
              </div>
              <button onClick={() => handleCreateDesign({ label: 'Custom', type: 'other', page_type: 'canvas' }, customW, customH)}
                className="w-full bg-gradient-to-r from-sky-400 to-pink-400 text-white text-sm font-bold py-3 rounded-xl hover:from-sky-500 hover:to-pink-500 transition-all shadow-md hover:shadow-lg">
                Create new design
              </button>
            </div>
          )}
        </section>

        {/* THIẾT KẾ */}
        <section className="px-2">
          <div className="flex items-center gap-6 mb-8 border-b border-slate-200 pb-2">
            <button onClick={() => setActiveTab('my_designs')} className={`text-2xl font-extrabold pb-2 transition-colors relative ${activeTab === 'my_designs' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
              My Designs
              {activeTab === 'my_designs' && <span className="absolute bottom-0 left-0 w-full h-1 bg-sky-500 rounded-t-md" />}
            </button>
            <button onClick={() => setActiveTab('shared')} className={`text-2xl font-extrabold pb-2 transition-colors relative ${activeTab === 'shared' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
              Shared with Me
              {activeTab === 'shared' && <span className="absolute bottom-0 left-0 w-full h-1 bg-sky-500 rounded-t-md" />}
            </button>
            <span className="ml-auto px-3 py-1 bg-pink-100 text-pink-600 rounded-full text-xs font-bold">{designs.length} designs</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {designs.map((design, index) => (
              <motion.div key={design.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.5, ease: 'easeOut' }}
                className="relative group">
                {activeTab === 'my_designs' && (
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
                )}
                <Link to={`/design/${design.id}`}
                  className="block bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-300 ease-out border border-white h-full flex flex-col transform hover:-translate-y-1.5">
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 relative flex items-center justify-center overflow-hidden border-b border-slate-100/50">
                    {design.thumbnail_url ? (
                      <img src={design.thumbnail_url} alt={design.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                    ) : (
                      <div className="text-slate-300 group-hover:scale-110 group-hover:text-sky-300 transition-all duration-500">
                        {design.design_type === 'document' ? <FileText size={48} strokeWidth={1.5} /> : <Layout size={48} strokeWidth={1.5} />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="p-5 bg-white/40 flex-1 flex flex-col justify-between">
                    <h4 className="font-extrabold text-[15px] text-slate-800 truncate group-hover:text-sky-600 transition-colors">{design.title}</h4>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs font-bold text-slate-400 capitalize tracking-wide">{design.design_type.replace('_', ' ')} • <span className="font-medium opacity-80">{new Date(design.updated_at).toLocaleDateString()}</span></p>
                      {activeTab === 'shared' && design.my_permission && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${design.my_permission === 'editor' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {design.my_permission}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                {/* 3-dot menu (chỉ hiện với My Designs) */}
                {activeTab === 'my_designs' && (
                  <div className="absolute top-3 right-3 z-10">
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(openMenuId === design.id ? null : design.id); }}
                      className="w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white">
                      <MoreVertical size={16} className="text-slate-500" />
                    </button>

                    <AnimatePresence>
                      {openMenuId === design.id && (
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                          className="absolute right-0 top-10 bg-white rounded-2xl shadow-xl border border-slate-100 py-1 min-w-[160px] z-20"
                          onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setDeleteModalDesign(design); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 transition-colors rounded-xl">
                            <Trash2 size={15} />
                            Chuyển vào thùng rác
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* FLOATING TOOLBAR */}
      <AnimatePresence>
        {selectedIds.length > 0 && activeTab === 'my_designs' && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50">
            <span className="text-sm font-bold">{selectedIds.length} đã chọn</span>
            <div className="w-px h-5 bg-slate-600"></div>
            <button onClick={handleBulkDelete} className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold text-sm transition-colors">
              <Trash2 size={16} /> Chuyển vào thùng rác
            </button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-200 text-sm font-bold ml-4">
              Hủy
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteModalDesign && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteModalDesign(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={24} className="text-rose-500" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800">Chuyển vào thùng rác?</h3>
                  <p className="text-sm text-slate-500 mt-1">Bạn có chắc chắn muốn xóa bản thiết kế này?</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                <p className="font-bold text-slate-700 truncate">"{deleteModalDesign.title}"</p>
                <p className="text-xs text-slate-400 mt-1">Bạn vẫn có thể khôi phục từ thùng rác.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteModalDesign(null)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">
                  Hủy
                </button>
                <button onClick={handleDeleteDesign} disabled={isDeleting}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold hover:from-rose-600 hover:to-pink-600 transition-all shadow-md disabled:opacity-60">
                  {isDeleting ? 'Đang xóa...' : 'Xóa thiết kế'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}