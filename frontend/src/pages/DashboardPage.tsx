import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Plus, LogOut, Layout, Image as ImageIcon, Video,
  Printer, FileText, Monitor, Table, Globe, Mail,
  Camera, UploadCloud, Sparkles, Crown, Receipt // Thêm icon Crown (Vương miện)
} from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchDesigns, createDesign } from '../api/api';
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
  const { user, logout } = useAuth();
  const { isPro, planName } = useSubscription();
  const [designs, setDesigns] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'my_designs' | 'shared'>('my_designs');
  const [isCustomSizeOpen, setIsCustomSizeOpen] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchDesigns(activeTab);
        setDesigns(data.designs);
      } catch (err) {
        console.error("Lỗi khi load trang Dashboard:", err);
      }
    };
    loadData();
  }, [activeTab]);

  const handleCreateDesign = async (template: any, customWidth?: number, customHeight?: number) => {
    try {
      const payload = {
        title: `Untitled ${template.label}`,
        design_type: template.type,
        page_type: template.page_type,
        width: customWidth || template.w,
        height: customHeight || template.h
      };

      const data = await createDesign(payload);
      if (data.id) navigate(`/design/${data.id}`);
    } catch (err) {
      alert("Không thể tạo thiết kế mới, vui lòng thử lại.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Vui lòng chọn file hình ảnh!");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      const img = new window.Image();
      img.src = base64Url;
      img.onload = async () => {
        try {
          // Tạo một design mới dựa trên kích thước ảnh
          const design = await createDesign({
            title: 'Photo Design',
            design_type: 'photo',
            page_type: 'canvas',
            width: img.width,
            height: img.height
          });
          
          // Lưu tạm ảnh vào sessionStorage để EditorPage lấy ra và nhúng vào ngay
          try {
            sessionStorage.setItem(`pending_import_image_${design.id}`, base64Url);
          } catch (e) {
            console.error("Ảnh quá lớn để lưu tạm vào bộ nhớ trình duyệt.", e);
          }

          navigate(`/design/${design.id}`);
        } catch (err) {
          console.error("Lỗi tạo thiết kế từ ảnh:", err);
          alert("Không thể tạo thiết kế mới.");
        }
      };
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50/50 via-white to-pink-50/50 flex flex-col font-sans">

      {/* HEADER KÍNH MỜ */}
      <header className="bg-white/60 backdrop-blur-xl border-b border-pink-100/60 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-[0_2px_20px_rgb(0,0,0,0.02)]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-md">K</div>
          <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 tracking-tight">Kanva Pro</h1>
        </div>

        <div className="flex items-center gap-5">
          {/* NÚT UPGRADE VIP MỚI THÊM */}
          {!isPro ? (
            <Link
              to="/pricing"
              className="group relative flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-[0_4px_14px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_20px_rgba(168,85,247,0.5)] hover:-translate-y-0.5 transition-all duration-300"
            >
              <Crown size={16} className="text-yellow-300 group-hover:rotate-12 transition-transform duration-300" strokeWidth={2.5} />
              <span>Nâng cấp Pro</span>
              <div className="absolute inset-0 rounded-full border-2 border-white/20"></div>
            </Link>
          ) : (
            <div className="relative group">
              <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-[0_4px_14px_rgba(16,185,129,0.3)] cursor-pointer hover:shadow-[0_6px_20px_rgba(16,185,129,0.5)] transition-all duration-300">
                <Crown size={16} className="text-yellow-300" strokeWidth={2.5} />
                <span>{planName}</span>
                <div className="absolute inset-0 rounded-full border-2 border-white/20"></div>
              </div>

              {/* Dropdown hover */}
              <div className="absolute right-0 top-full pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-4 min-w-[220px]">
                  <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Nâng cấp gói của bạn?</p>
                  <Link to="/pricing" className="block w-full text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold py-2.5 rounded-lg transition-colors text-sm">
                    Xem các gói khác
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 bg-white/80 px-4 py-2 rounded-full shadow-sm border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-pink-300 to-sky-300" />
            <span className="text-sm font-bold text-slate-600">{user?.name}</span>
          </div>

          <Link to="/billing" className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 rounded-full text-slate-400 transition-all duration-300">
            <Receipt size={18} strokeWidth={2.5} />
          </Link>

          <button onClick={logout} className="p-2.5 bg-white border border-slate-100 shadow-sm hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 rounded-full text-slate-400 transition-all duration-300">
            <LogOut size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        <section className="mb-16 text-center">
          <motion.h2
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-purple-500 to-pink-500 mb-12 tracking-tight py-2"
          >
            What will you design today?
          </motion.h2>

          <div className="flex overflow-x-auto pb-8 pt-4 px-4 gap-5 snap-x justify-start custom-scrollbar">
            {DESIGN_TEMPLATES.map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.4, ease: "easeOut" }}
                onClick={() => handleCreateDesign(item)}
                className="relative shrink-0 flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group"
              >
                {/* {item.isNew && (
                  <span className="absolute -top-3 bg-gradient-to-r from-pink-400 to-sky-400 text-white text-[10px] font-extrabold px-3 py-1 rounded-full shadow-md tracking-wider">
                    NEW
                  </span>
                )} */}
                <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-inner`}>
                  <item.icon size={26} strokeWidth={2} />
                </div>
                <span className="text-xs font-bold text-slate-600 text-center leading-tight group-hover:text-sky-600 transition-colors">{item.label}</span>
              </motion.button>
            ))}

            <div className="w-px h-24 bg-slate-200/50 self-center mx-2 shrink-0 rounded-full" />

            {/* Custom Size Button */}
            <motion.div className="shrink-0 flex flex-col relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              <button
                onClick={() => setIsCustomSizeOpen(!isCustomSizeOpen)}
                className="flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group"
              >
                <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-slate-200 group-hover:scale-110 transition-all duration-300">
                  <Plus size={26} strokeWidth={2} />
                </div>
                <span className="text-xs font-bold text-slate-600 text-center leading-tight">Custom size</span>
              </button>


            </motion.div>

            {/* Upload Button */}
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 flex flex-col items-center justify-center w-[130px] h-[130px] bg-white/80 backdrop-blur-md rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-2 hover:border-sky-200 transition-all duration-300 border border-white p-4 snap-center group"
            >
              <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-slate-200 group-hover:scale-110 transition-all duration-300">
                <UploadCloud size={26} strokeWidth={2} />
              </div>
              <span className="text-xs font-bold text-slate-600 text-center leading-tight">Upload</span>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,.pdf" onChange={handleFileUpload} />
            </motion.button>
          </div>

          {/* Custom Size Form placed below the list so it doesn't get clipped */}
          {isCustomSizeOpen && (
            <div className="w-full max-w-sm mx-auto mt-4 bg-white/90 backdrop-blur-2xl shadow-xl rounded-2xl p-5 border border-slate-100 animate-in fade-in slide-in-from-top-4 duration-200">
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
              <button
                onClick={() => handleCreateDesign({ label: 'Custom', type: 'other', page_type: 'canvas' }, customW, customH)}
                className="w-full bg-gradient-to-r from-sky-400 to-pink-400 text-white text-sm font-bold py-3 rounded-xl hover:from-sky-500 hover:to-pink-500 transition-all shadow-md hover:shadow-lg"
              >
                Create new design
              </button>
            </div>
          )}
        </section>

        {/* THIẾT KẾ GẦN ĐÂY */}
        <section className="px-2">
          <div className="flex items-center gap-6 mb-8 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveTab('my_designs')}
              className={`text-2xl font-extrabold pb-2 transition-colors relative ${activeTab === 'my_designs' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              My Designs
              {activeTab === 'my_designs' && (
                <span className="absolute bottom-0 left-0 w-full h-1 bg-sky-500 rounded-t-md"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`text-2xl font-extrabold pb-2 transition-colors relative ${activeTab === 'shared' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Shared with Me
              {activeTab === 'shared' && (
                <span className="absolute bottom-0 left-0 w-full h-1 bg-sky-500 rounded-t-md"></span>
              )}
            </button>
            <span className="ml-auto px-3 py-1 bg-pink-100 text-pink-600 rounded-full text-xs font-bold">{designs.length} designs</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {designs.map((design, index) => (
              <motion.div key={design.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.5, ease: "easeOut" }}>
                <Link to={`/design/${design.id}`} className="group block bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-300 ease-out border border-white h-full flex flex-col transform hover:-translate-y-1.5">
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
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}