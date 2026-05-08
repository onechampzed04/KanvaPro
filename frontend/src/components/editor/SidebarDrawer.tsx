// src/components/editor/SidebarDrawer.tsx
import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PPTX_ANIMATIONS = [
  { id: 'none', label: 'None' },
  { id: 'appear', label: 'Appear' },
  { id: 'fade', label: 'Fade' },
  { id: 'flyIn', label: 'Fly In' },
  { id: 'floatIn', label: 'Float In' },
  { id: 'split', label: 'Split' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'shape', label: 'Shape' },
  { id: 'wheel', label: 'Wheel' },
  { id: 'randomBars', label: 'Random Bars' },
  { id: 'growAndTurn', label: 'Grow & Turn' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'swivel', label: 'Swivel' },
  { id: 'bounce', label: 'Bounce' },
];

interface SidebarDrawerProps {
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
  showPositionBox: boolean;
  setShowPositionBox: (v: boolean) => void;
  showAnimateBox: boolean;
  setShowAnimateBox: (v: boolean) => void;
  // Search
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  searchResults: any[];
  // Elements / Stickers
  addRectangle: () => void;
  addImage: (src: string) => void;
  recentStickers: any[];
  // Uploads
  uploadedImages: any[];
  uploadProgress: { visible: boolean; percent: number };
  handleImageUpload: (file: File) => void;
  addImageOriginal: (src: string, w: number, h: number) => void;
  // Text
  addText: () => void;
  customFonts: string[];
  handleFontUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Layers
  elements: any[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  draggedLayerIdx: number | null;
  dragOverIdx: number | null;
  handleLayerDragStart: (e: React.DragEvent, index: number) => void;
  handleLayerDragOver: (e: React.DragEvent, index: number) => void;
  handleLayerDragLeave: (e: React.DragEvent, index: number) => void;
  handleLayerDrop: (e: React.DragEvent, index: number) => void;
  handleLayerDragEnd: () => void;
  selectedElement?: any;
  updateElement?: (el: any) => void;
}

export default function SidebarDrawer({
  activeTab, setActiveTab, showPositionBox, setShowPositionBox, showAnimateBox, setShowAnimateBox,
  searchQuery, setSearchQuery, handleSearch, searchResults,
  addRectangle, addImage, recentStickers,
  uploadedImages, uploadProgress, handleImageUpload, addImageOriginal,
  addText, customFonts, handleFontUpload,
  elements, selectedIds, setSelectedIds,
  draggedLayerIdx, dragOverIdx,
  handleLayerDragStart, handleLayerDragOver, handleLayerDragLeave, handleLayerDrop, handleLayerDragEnd,
  selectedElement, updateElement
}: SidebarDrawerProps) {
  const isOpen = !!(activeTab || showPositionBox || showAnimateBox);
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');

  // AI Image State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    try {
      const response = await fetch('http://localhost:5000/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }
      const data = await response.json();
      if (data.url) {
        addImageOriginal(data.url, 1024, 1024);
        setAiPrompt('');
      }
    } catch (error: any) {
      console.error("AI Image Generation Error:", error);
      alert(`Đã xảy ra lỗi: ${error.message}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -350, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -350, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 left-[72px] h-full w-[350px] bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-2xl z-[65] flex flex-col"
          onMouseLeave={() => { if (!showPositionBox && !showAnimateBox) setActiveTab(null); }}
        >
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50 shrink-0">
            <h2 className="font-extrabold text-slate-800 uppercase text-xs tracking-widest">
              {showPositionBox ? 'Layer Position' : showAnimateBox ? 'Animations' : activeTab?.replace('_', ' ')}
            </h2>
            <button
              onClick={() => { setActiveTab(null); setShowPositionBox(false); setShowAnimateBox(false); }}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">

            {/* TAB: ELEMENTS */}
            {activeTab === 'elements' && (
              <div className="space-y-5">
                <form onSubmit={handleSearch} className="relative">
                  <input
                    type="text" placeholder="Search icons, stickers..."
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-medium text-slate-700"
                  />
                  <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                </form>

                <button
                  onClick={addRectangle}
                  className="w-full py-3.5 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs border border-indigo-100 hover:bg-indigo-100 hover:shadow-sm transition-all"
                >
                  Add a Shape
                </button>

                {/* Recent Stickers */}
                {recentStickers.length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Recently Used</h4>
                      <button onClick={() => setActiveTab('recent_all')} className="text-[10px] text-indigo-600 font-bold hover:text-indigo-800 transition">See all</button>
                    </div>
                    <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
                      {recentStickers.slice(0, 10).map((sticker, idx) => {
                        const url = typeof sticker === 'string' ? sticker : sticker.url;
                        return (
                          <button key={idx} onClick={() => addImage(url)} className="shrink-0 w-16 h-16 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition flex items-center justify-center group shadow-sm hover:shadow-md">
                            <img src={url} className="w-12 h-12 object-contain group-hover:scale-110 transition-transform duration-300" alt="recent" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Featured Graphics */}
                <div>
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Featured Graphics</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <button key={i} onClick={() => addImage(`https://picsum.photos/seed/${i + 100}/200`)} className="aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition group shadow-sm hover:shadow-md">
                        <img src={`https://picsum.photos/seed/${i + 100}/200`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt="sample" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: UPLOADS */}
            {activeTab === 'uploads' && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Thư viện của bạn</h4>

                <label className="flex flex-col items-center justify-center w-full h-28 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition cursor-pointer group">
                  <span className="text-xs font-bold text-indigo-600 group-hover:scale-105 transition-transform">Click để tải ảnh lên</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleImageUpload(e.target.files[0]);
                  }} />
                </label>

                <AnimatePresence>
                  {uploadProgress.visible && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                        <div className="bg-indigo-500 h-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress.percent}%` }} />
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 text-right mt-1">Đang xử lý... {uploadProgress.percent}%</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {uploadedImages.map(img => (
                    <button key={img.id} onClick={() => addImageOriginal(img.url, img.width, img.height)} className="relative aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition group shadow-sm hover:shadow-md">
                      <img src={img.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt="uploaded" />
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {img.width}x{img.height}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: SEARCH RESULTS */}
            {activeTab === 'search_results' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-3">
                  <button onClick={() => setActiveTab('elements')} className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition">← Back</button>
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Results</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map((asset: any) => (
                    <button key={asset.id} onClick={() => addImage(asset.url)} className="aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 transition overflow-hidden group shadow-sm hover:shadow-md">
                      <img src={asset.thumbnail_url || asset.url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" alt="result" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: RECENT ALL */}
            {activeTab === 'recent_all' && (
              <div className="space-y-4">
                <div className="flex items-center mb-2 border-b border-slate-100 pb-3">
                  <button onClick={() => setActiveTab('elements')} className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition">← Back</button>
                </div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">All Recent Stickers</h4>
                <div className="grid grid-cols-3 gap-2">
                  {recentStickers.map((sticker, idx) => {
                    const url = typeof sticker === 'string' ? sticker : sticker.url;
                    return (
                      <button key={idx} onClick={() => addImage(url)} className="aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition flex items-center justify-center p-1.5 group shadow-sm hover:shadow-md">
                        <img src={url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" alt="recent" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: TEXT */}
            {activeTab === 'text' && (
              <div className="space-y-4">
                <button onClick={addText} className="w-full py-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl font-black text-xl text-slate-700 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm">Add a heading</button>
                <button onClick={addText} className="w-full py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm">Add a subheading</button>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Custom Fonts</h4>
                  <div className="flex flex-wrap gap-2">
                    {customFonts.map(f => (
                      <span
                        key={f}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200"
                        style={{ fontFamily: f }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {/* Upload font mới */}
                  <label className="mt-3 flex items-center gap-2 w-full py-2.5 px-4 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-xl cursor-pointer hover:bg-indigo-100 hover:border-indigo-400 transition group">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 group-hover:scale-110 transition-transform shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span className="text-xs font-bold text-indigo-600">Upload Font (.ttf / .otf / .woff)</span>
                    <input
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      className="hidden"
                      onChange={handleFontUpload}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB: AI IMAGE */}
            {activeTab === 'ai_image' && (
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm">
                  <h3 className="font-extrabold text-indigo-900 mb-2 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500" /> AI Image Generator
                  </h3>
                  <p className="text-[10px] text-indigo-700/80 mb-4 font-bold">Mô tả bức ảnh bạn muốn vẽ, AI sẽ tạo ra nó trong vài giây!</p>
                  
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ví dụ: Một chú chó Corgi mặc đồ phi hành gia đang trên sao Hỏa, 3D render..."
                    className="w-full p-3 rounded-xl border-none ring-1 ring-indigo-200 focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm text-xs font-bold text-slate-700 resize-none h-28 mb-3 outline-none"
                  />
                  
                  <button
                    onClick={handleGenerateAiImage}
                    disabled={isGeneratingAi || !aiPrompt.trim()}
                    className={`w-full py-3 rounded-xl font-extrabold text-white text-xs shadow-md flex items-center justify-center gap-2 transition-all ${
                      isGeneratingAi || !aiPrompt.trim()
                        ? 'bg-slate-300 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 hover:shadow-lg'
                    }`}
                  >
                    {isGeneratingAi ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Đang vẽ ảnh...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} strokeWidth={2.5} />
                        Tạo ảnh (Generate)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* POSITION / LAYERS BOX */}

            {showPositionBox && (
              <div className="space-y-2 pb-2" onDragLeave={() => {}}>
                {elements.slice().reverse().map((el: any, index: number) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={el.id}
                    draggable
                    onDragStart={(e: any) => handleLayerDragStart(e, index)}
                    onDragOver={(e: any) => handleLayerDragOver(e, index)}
                    onDragLeave={(e: any) => handleLayerDragLeave(e, index)}
                    onDrop={(e: any) => handleLayerDrop(e, index)}
                    onDragEnd={handleLayerDragEnd}
                    onClick={() => setSelectedIds([el.id])}
                    className={`relative w-full text-left p-2 rounded-xl text-xs font-bold border flex items-center gap-3 cursor-grab active:cursor-grabbing transition-colors ${
                      selectedIds.includes(el.id)
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                        : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
                    } ${draggedLayerIdx === index ? 'shadow-xl border-indigo-500 ring-2 ring-indigo-200 z-50 bg-white scale-[1.02]' : 'z-0'}`}
                  >
                    {/* Drop indicator */}
                    {dragOverIdx === index && draggedLayerIdx !== index && (
                      <div className="absolute -top-[5px] left-0 right-0 h-[3px] bg-indigo-500 rounded-full z-[100] pointer-events-none">
                        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-indigo-500 rounded-full" />
                        <div className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-indigo-500 rounded-full" />
                      </div>
                    )}

                    {/* Thumbnail */}
                    <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-200 overflow-hidden p-0.5 pointer-events-none">
                      {el.type === 'image' || el.type === 'sticker' ? (
                        <img src={el.src} className="w-full h-full object-contain" alt="thumb" />
                      ) : el.type === 'rect' || el.type === 'shape' ? (
                        <div className="w-full h-full rounded-[4px]" style={{ backgroundColor: el.fill || '#cbd5e1' }} />
                      ) : el.type === 'circle' ? (
                        <div className="w-full h-full rounded-full" style={{ backgroundColor: el.fill || '#cbd5e1' }} />
                      ) : el.type === 'text' ? (
                        <span className="font-serif font-black text-base leading-none" style={{ color: el.fill || '#334155' }}>T</span>
                      ) : (
                        <div className="w-full h-full bg-slate-100 rounded-sm" />
                      )}
                    </div>

                    <div className="flex-1 truncate pointer-events-none">
                      <span className="block truncate">
                        {el.type.toUpperCase()} {el.text ? `- ${el.text}` : ''}
                      </span>
                    </div>

                    <div className="shrink-0 text-slate-300 hover:text-slate-500 pr-1 pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                        <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
                      </svg>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ANIMATIONS BOX */}
            {showAnimateBox && selectedElement && updateElement && (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setAnimTab('in')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition shadow-sm ${animTab === 'in' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
                  >
                    Vào (In)
                  </button>
                  <button
                    onClick={() => setAnimTab('out')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition shadow-sm ${animTab === 'out' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
                  >
                    Ra (Out)
                  </button>
                </div>

                <div className="shrink-0 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 hover:text-indigo-600 transition">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                      checked={selectedElement.animation?.sync !== false}
                      onChange={(e) => {
                        const isSync = e.target.checked;
                        const currentIn = selectedElement.animation?.in || 'none';
                        updateElement({
                          ...selectedElement,
                          animation: {
                            ...selectedElement.animation,
                            sync: isSync,
                            out: isSync ? currentIn : (selectedElement.animation?.out || 'none'),
                          },
                        });
                      }}
                    />
                    Đồng bộ hiệu ứng Hiện & Ẩn
                  </label>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-2 gap-2 pb-10">
                    {PPTX_ANIMATIONS.map(anim => {
                      const currentAnim = animTab === 'in'
                        ? (selectedElement.animation?.in || 'none')
                        : (selectedElement.animation?.out || 'none');
                      const isActive = currentAnim === anim.id;

                      return (
                        <button
                          key={anim.id}
                          onClick={() => {
                            const newAnimation = { ...(selectedElement.animation || { in: 'none', out: 'none', sync: true }) };
                            if (animTab === 'in') {
                              newAnimation.in = anim.id;
                              if (newAnimation.sync !== false) newAnimation.out = anim.id;
                            } else {
                              newAnimation.out = anim.id;
                              newAnimation.sync = false;
                            }
                            updateElement({ ...selectedElement, animation: newAnimation });
                          }}
                          className={`py-3 px-2 text-xs font-bold rounded-xl border transition-all ${
                            isActive
                              ? (animTab === 'in'
                                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-sm ring-2 ring-indigo-100'
                                  : 'bg-rose-50 border-rose-400 text-rose-700 shadow-sm ring-2 ring-rose-100')
                              : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:shadow-sm'
                          }`}
                        >
                          {anim.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
