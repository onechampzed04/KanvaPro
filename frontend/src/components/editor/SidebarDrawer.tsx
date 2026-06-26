// src/components/editor/SidebarDrawer.tsx
// [FIX Vấn đề 5] Asset Grid Virtualization:
// - uploadedImages grid: dùng useVirtualizer để chỉ render ảnh trong viewport.
// - searchResults grid:  tương tự, tránh render hàng trăm sticker cùng lúc.
// Layout lưới 2 cột → "row" = 1 cặp item → estimateSize = chiều cao 1 row.
import React, { useState, useRef } from 'react';
import { Search, Sparkles, Crown, Zap, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import ProUpgradeModal from './ProUpgradeModal';
import { type User, useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import TokenPurchaseModal from '../dashboard/TokenPurchaseModal.tsx';

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
  addImage: (src: string, flags?: { isPro?: boolean; createdByAi?: boolean }) => void;
  recentStickers: any[];
  defaultStickers?: any[];
  // Uploads
  uploadedImages: any[];
  uploadProgress: { visible: boolean; percent: number };
  handleImageUpload: (file: File) => void;
  addImageOriginal: (src: string, w: number, h: number, flags?: { createdByAi?: boolean; isPro?: boolean }) => void;
  addUploadedImageToCanvas: (imgItem: { id: string; url: string; width?: number; height?: number }) => void;
  // Text
  addText: (type?: 'heading' | 'subheading' | 'body') => void;
  customFonts: { id: string; name: string; url: string; is_premium: boolean }[];
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
  updateElements?: (els: any[]) => void;
  // Pro
  user?: User | null;
}

export default function SidebarDrawer({
  activeTab, setActiveTab, showPositionBox, setShowPositionBox, showAnimateBox, setShowAnimateBox,
  searchQuery, setSearchQuery, handleSearch, searchResults,
  addRectangle, addImage, recentStickers, defaultStickers = [],
  uploadedImages, uploadProgress, handleImageUpload, addImageOriginal, addUploadedImageToCanvas,
  addText, customFonts,
  elements, selectedIds, setSelectedIds,
  draggedLayerIdx, dragOverIdx,
  handleLayerDragStart, handleLayerDragOver, handleLayerDragLeave, handleLayerDrop, handleLayerDragEnd,
  selectedElement, updateElement, updateElements,
  user,
}: SidebarDrawerProps) {
  const isOpen = !!((activeTab && activeTab !== 'tools') || showPositionBox || showAnimateBox);
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');
  const { isPro } = useSubscription();
  const { user: authUser, updateAiTokens } = useAuth();
  const aiTokens = authUser?.ai_tokens ?? 0;

  // Pro gate modal
  const [proModal, setProModal] = useState<{ feature: string; desc?: string } | null>(null);
  const requirePro = (feature: string, desc?: string, onAllow?: () => void) => {
    if (isPro) { onAllow?.(); return true; }
    setProModal({ feature, desc });
    return false;
  };

  // ── [FIX Vấn đề 5] Virtualized 2-column grid cho uploadedImages ──────────
  const GRID_COLS = 2;
  const GRID_ROW_HEIGHT = 165; // px — chiều cao 1 hàng (kể cả gap)
  const uploadScrollRef = useRef<HTMLDivElement | null>(null);
  const uploadRows: any[][] = [];
  const validUploads = uploadedImages.filter(img => img.type !== 'pptx');
  for (let i = 0; i < validUploads.length; i += GRID_COLS) {
    uploadRows.push(validUploads.slice(i, i + GRID_COLS));
  }
  const uploadVirtualizer = useVirtualizer({
    count: uploadRows.length,
    getScrollElement: () => uploadScrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 2,
  });

  // ── [FIX Vấn đề 5] Virtualized 2-column grid cho searchResults ───────────
  const searchScrollRef = useRef<HTMLDivElement | null>(null);
  const searchRows: any[][] = [];
  for (let i = 0; i < searchResults.length; i += GRID_COLS) {
    searchRows.push(searchResults.slice(i, i + GRID_COLS));
  }
  const searchVirtualizer = useVirtualizer({
    count: searchRows.length,
    getScrollElement: () => searchScrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 2,
  });

  // ── [MỚI] Virtualized 2-column grid cho Elements Tab (Recent & Default) ───────────
  const elementsScrollRef = useRef<HTMLDivElement | null>(null);

  // Tạo mảng dẹt chứa cả Header và Grid Rows
  const elementsItems: { type: 'header' | 'row', title?: string, data?: any[] }[] = [];

  if (recentStickers.length > 0) {
    elementsItems.push({ type: 'header', title: 'Recently Used' });
    for (let i = 0; i < recentStickers.length; i += GRID_COLS) {
      elementsItems.push({ type: 'row', data: recentStickers.slice(i, i + GRID_COLS) });
    }
  }

  if (defaultStickers.length > 0) {
    elementsItems.push({ type: 'header', title: 'Stickers & Icons' });
    for (let i = 0; i < defaultStickers.length; i += GRID_COLS) {
      elementsItems.push({ type: 'row', data: defaultStickers.slice(i, i + GRID_COLS) });
    }
  }

  const elementsVirtualizer = useVirtualizer({
    count: elementsItems.length,
    getScrollElement: () => elementsScrollRef.current,
    estimateSize: (index) => elementsItems[index].type === 'header' ? 40 : GRID_ROW_HEIGHT,
    overscan: 2,
  });


  // AI Image State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);

  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) return;
    setAiError(null);
    setIsGeneratingAi(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: aiPrompt }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'INSUFFICIENT_TOKENS') {
          setAiError('INSUFFICIENT_TOKENS');
        } else {
          setAiError(data.error || 'Đã xảy ra lỗi khi tạo ảnh.');
        }
        return;
      }

      if (data.url) {
        addImageOriginal(data.url, 1024, 1024, { createdByAi: true });
        setAiPrompt('');
        // Cập nhật số dư token trong context ngay lập tức (không cần refetch)
        if (typeof data.ai_tokens_remaining === 'number') {
          updateAiTokens(data.ai_tokens_remaining);
        }
      }
    } catch (error: any) {
      console.error('AI Image Generation Error:', error);
      setAiError('Không thể kết nối đến server. Vui lòng thử lại.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const selectedElements = elements.filter((el: any) => selectedIds.includes(el.id));
  const activeElement = selectedElements[0] || {};

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -350, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -350, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-0 left-[72px] h-full w-[350px] bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-2xl z-[65] flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50 shrink-0">
              <h2 className="font-extrabold text-slate-800 uppercase text-xs tracking-widest">
                {showPositionBox ? 'Layers' : showAnimateBox ? 'Animations' : activeTab?.replace('_', ' ')}
              </h2>
              <button
                onClick={() => { setActiveTab(null); setShowPositionBox(false); setShowAnimateBox(false); }}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col">

              {/* TAB: ELEMENTS */}
              {activeTab === 'elements' && (
                <div className="flex flex-col h-full space-y-4">
                  <form onSubmit={handleSearch} className="relative shrink-0">
                    <input
                      type="text" placeholder="Tìm kiếm hình ảnh, sticker,..."
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-medium text-slate-700"
                    />
                    <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                  </form>

                  <div
                    ref={elementsScrollRef}
                    className="flex-1 overflow-y-auto custom-scrollbar pr-1"
                  >
                    <div style={{ height: `${elementsVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                      {elementsVirtualizer.getVirtualItems().map((virtualRow) => {
                        const item = elementsItems[virtualRow.index];

                        if (item.type === 'header') {
                          return (
                            <div
                              key={virtualRow.index}
                              style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`,
                                display: 'flex', alignItems: 'center'
                              }}
                            >
                              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{item.title}</h4>
                            </div>
                          );
                        }

                        // Row of stickers
                        return (
                          <div
                            key={virtualRow.index}
                            style={{
                              position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`,
                              display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gap: '12px', padding: '0 0 12px 0', boxSizing: 'border-box'
                            }}
                          >
                            {item.data?.map((sticker: any, idx: number) => {
                              const url = typeof sticker === 'string' ? sticker : (sticker.thumbnail_url || sticker.url);
                              const isProAsset = typeof sticker === 'string' ? false : !!sticker.is_premium;
                              return (
                                <button
                                  key={sticker.id || idx}
                                  onClick={() => addImage(typeof sticker === 'string' ? sticker : sticker.url, { isPro: isProAsset })}
                                  title={isProAsset && !isPro ? 'Sticker Pro — sẽ có watermark khi xuất file. Nâng cấp Pro để xuất sạch!' : undefined}
                                  className="relative aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition flex items-center justify-center p-2 group shadow-sm hover:shadow-md"
                                >
                                  <img src={url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" alt="sticker" />
                                  {isProAsset && (
                                    <div style={{
                                      position: 'absolute', top: 4, right: 4,
                                      background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                                      borderRadius: 6, padding: '2px 5px',
                                      display: 'flex', alignItems: 'center', gap: 3,
                                      boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
                                    }}>
                                      <Crown size={9} color="white" strokeWidth={2.5} />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
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

                  {/* [FIX Vấn đề 5] Virtual grid — chỉ render rows trong viewport */}
                  {validUploads.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-4">Chưa có ảnh nào được tải lên</p>
                  ) : (
                    <div
                      ref={uploadScrollRef}
                      className="mt-2 overflow-y-auto"
                      style={{ height: Math.min(uploadRows.length * GRID_ROW_HEIGHT, 420), scrollbarWidth: 'thin' }}
                    >
                      <div style={{ height: `${uploadVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                        {uploadVirtualizer.getVirtualItems().map((virtualRow) => {
                          const rowItems = uploadRows[virtualRow.index];
                          return (
                            <div
                              key={virtualRow.index}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                                gap: '12px',
                                padding: '0 0 12px 0',
                                boxSizing: 'border-box',
                              }}
                            >
                              {rowItems.map((img: any) => (
                                <button
                                  key={img.id}
                                  onClick={() => addUploadedImageToCanvas(img)}
                                  className="relative aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition group shadow-sm hover:shadow-md"
                                >
                                  <img src={img.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt="uploaded" />
                                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {img.width}x{img.height}
                                  </span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: SEARCH RESULTS */}
              {activeTab === 'search_results' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-3">
                    <button onClick={() => setActiveTab('elements')} className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition">← Back</button>
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Results</h4>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-3">
                      <span className="text-3xl">📭</span>
                      <p className="text-xs font-bold text-slate-500">Không tìm thấy sticker phù hợp với từ khóa của bạn.</p>
                    </div>
                  ) : (
                    // [FIX Vấn đề 5] Virtual grid cho search results
                    <div
                      ref={searchScrollRef}
                      className="overflow-y-auto"
                      style={{ height: Math.min(searchRows.length * GRID_ROW_HEIGHT, 400), scrollbarWidth: 'thin' }}
                    >
                      <div style={{ height: `${searchVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                        {searchVirtualizer.getVirtualItems().map((virtualRow) => {
                          const rowItems = searchRows[virtualRow.index];
                          return (
                            <div
                              key={virtualRow.index}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                                gap: '12px',
                                padding: '0 0 12px 0',
                                boxSizing: 'border-box',
                              }}
                            >
                              {rowItems.map((asset: any) => {
                                const isProAsset = !!(asset.is_premium);
                                return (
                                  <button
                                    key={asset.id}
                                    onClick={() => {
                                      // Allow all users to add Pro stickers — watermark will appear
                                      // on canvas for Free users; export gate handles the rest.
                                      addImage(asset.url, { isPro: isProAsset });
                                    }}
                                    title={isProAsset && !isPro ? 'Sticker Pro — sẽ có watermark khi xuất file. Nâng cấp Pro để xuất sạch!' : undefined}
                                    className="relative aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 transition overflow-hidden group shadow-sm hover:shadow-md"
                                  >
                                    <img src={asset.thumbnail_url || asset.url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" alt="result" />
                                    {/* Crown badge cho Pro sticker */}
                                    {isProAsset && (
                                      <div style={{
                                        position: 'absolute', top: 4, right: 4,
                                        background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                                        borderRadius: 6, padding: '2px 5px',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
                                      }}>
                                        <Crown size={9} color="white" strokeWidth={2.5} />
                                        <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>PRO</span>
                                      </div>
                                    )}
                                    {/* "Try" hint for Free users — replaced hard block with preview mode */}
                                    {isProAsset && !isPro && (
                                      <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'linear-gradient(0deg,rgba(0,0,0,0.55),transparent)',
                                        padding: '10px 4px 3px',
                                        display: 'flex', justifyContent: 'center',
                                        opacity: 0,
                                        transition: 'opacity 0.2s',
                                        pointerEvents: 'none',
                                      }}
                                        className="group-hover:!opacity-100"
                                      >
                                        <span style={{ color: 'white', fontSize: 8, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>Xem trước</span>
                                      </div>
                                    )}

                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                      const isProAsset = typeof sticker === 'string' ? false : !!sticker.is_premium;
                      return (
                        <button
                          key={idx}
                          onClick={() => addImage(url, { isPro: isProAsset })}
                          title={isProAsset && !isPro ? 'Sticker Pro — sẽ có watermark khi xuất file. Nâng cấp Pro để xuất sạch!' : undefined}
                          className="relative aspect-square bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-400 overflow-hidden transition flex items-center justify-center p-1.5 group shadow-sm hover:shadow-md"
                        >
                          <img src={url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" alt="recent" />
                          {isProAsset && (
                            <div style={{
                              position: 'absolute', top: 4, right: 4,
                              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                              borderRadius: 6, padding: '2px 5px',
                              display: 'flex', alignItems: 'center', gap: 3,
                              boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
                            }}>
                              <Crown size={9} color="white" strokeWidth={2.5} />
                              <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>PRO</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB: TEXT */}
              {activeTab === 'text' && (
                <div className="space-y-4">
                  <button onClick={() => addText('heading')} className="w-full py-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl font-black text-xl text-slate-700 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm">Add a heading</button>
                  <button onClick={() => addText('subheading')} className="w-full py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm">Add a subheading</button>
                  <button onClick={() => addText('body')} className="w-full py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-500 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm">Add a little bit of body text</button>

                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">System Fonts</h4>
                    {customFonts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-2">Chưa có font nào. Admin chưa upload font.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {customFonts.map(font => (
                          <button
                            key={font.id}
                            onClick={() => {
                              if (font.is_premium && !isPro) {
                                setProModal({ feature: `Font "${font.name}"`, desc: 'Font chữ Premium chỉ dành cho gói Pro. Nâng cấp để sử dụng font đẹp này!' });
                                return;
                              }
                              // Áp dụng font vào text element đang được chọn (nếu có)
                              if (updateElement && selectedElement?.type === 'text') {
                                updateElement({ ...selectedElement, fontFamily: font.name });
                              }
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg transition-all group"
                          >
                            <span style={{ fontFamily: font.name }} className="text-sm text-slate-700 truncate">
                              {font.name}
                            </span>
                            {font.is_premium ? (
                              <div className="shrink-0 ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
                                <Crown size={9} color="white" strokeWidth={2.5} />
                                <span style={{ color: 'white', fontSize: 9, fontWeight: 800 }}>PRO</span>
                              </div>
                            ) : (
                              <span className="shrink-0 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to use</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: AI IMAGE */}
              {activeTab === 'ai_image' && (
                <div className="space-y-4">

                  {/* Token Balance Badge */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold shadow-sm ${
                        aiTokens > 10
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                          : aiTokens > 0
                            ? 'bg-amber-100 text-amber-700 border border-amber-300'
                            : 'bg-red-100 text-red-700 border border-red-300'
                      }`}>
                        <Zap size={11} strokeWidth={2.5} />
                        {aiTokens} token còn lại
                      </div>
                    </div>
                    <button
                      onClick={() => setShowTokenModal(true)}
                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition"
                    >
                      <ShoppingCart size={11} />
                      Mua thêm
                    </button>
                  </div>

                  {/* INSUFFICIENT_TOKENS Error Banner */}
                  <AnimatePresence>
                    {aiError === 'INSUFFICIENT_TOKENS' && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col gap-2"
                      >
                        <p className="text-[11px] font-bold text-red-700">⚠️ Bạn đã hết token AI!</p>
                        <p className="text-[10px] text-red-600">Mua thêm gói token để tiếp tục tạo ảnh bằng AI.</p>
                        <button
                          onClick={() => { setShowTokenModal(true); setAiError(null); }}
                          className="w-full py-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white text-[11px] font-extrabold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all"
                        >
                          <ShoppingCart size={12} />
                          Mua gói token ngay
                        </button>
                      </motion.div>
                    )}
                    {aiError && aiError !== 'INSUFFICIENT_TOKENS' && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="p-3 bg-red-50 border border-red-200 rounded-xl"
                      >
                        <p className="text-[11px] font-bold text-red-700">⚠️ {aiError}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Main Generator Card */}
                  <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm">
                    <h3 className="font-extrabold text-indigo-900 mb-1 flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-500" /> AI Image Generator
                    </h3>
                    <p className="text-[10px] text-indigo-700/80 mb-4 font-bold">Mô tả bức ảnh bạn muốn vẽ, AI sẽ tạo ra nó trong vài giây! (Tốn 1 token/ảnh)</p>

                    <textarea
                      value={aiPrompt}
                      onChange={(e) => { setAiPrompt(e.target.value); if (aiError) setAiError(null); }}
                      placeholder="Ví dụ: Một chú chó Corgi mặc đồ phi hành gia đang trên sao Hỏa, 3D render..."
                      className="w-full p-3 rounded-xl border-none ring-1 ring-indigo-200 focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm text-xs font-bold text-slate-700 resize-none h-28 mb-3 outline-none"
                    />

                    <button
                      onClick={handleGenerateAiImage}
                      disabled={isGeneratingAi || !aiPrompt.trim() || aiTokens <= 0}
                      className={`w-full py-3 rounded-xl font-extrabold text-white text-xs shadow-md flex items-center justify-center gap-2 transition-all ${
                        isGeneratingAi || !aiPrompt.trim() || aiTokens <= 0
                          ? 'bg-slate-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 hover:shadow-lg'
                      }`}
                    >
                      {isGeneratingAi ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Đang vẽ ảnh...
                        </>
                      ) : aiTokens <= 0 ? (
                        <>
                          <ShoppingCart size={14} strokeWidth={2.5} />
                          Hết token — Mua thêm
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} strokeWidth={2.5} />
                          Tạo ảnh ({aiTokens} token)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* POSITION / LAYERS BOX */}

              {showPositionBox && (
                <div className="space-y-2 pb-2" onDragLeave={() => { }}>
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
                      className={`relative w-full text-left p-2 rounded-xl text-xs font-bold border flex items-center gap-3 cursor-grab active:cursor-grabbing transition-colors ${selectedIds.includes(el.id)
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
              {showAnimateBox && selectedElements.length > 0 && updateElement && (
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
                        checked={activeElement.animation?.sync !== false}
                        onChange={(e) => {
                          const isSync = e.target.checked;
                          const currentIn = activeElement.animation?.in || 'none';
                          if (updateElements) {
                            const newEls = selectedElements.map(el => ({
                              ...el,
                              animation: {
                                ...el.animation,
                                sync: isSync,
                                out: isSync ? currentIn : (el.animation?.out || 'none'),
                              },
                            }));
                            updateElements(newEls);
                          } else if (updateElement) {
                            selectedElements.forEach(el => {
                              updateElement({
                                ...el,
                                animation: {
                                  ...el.animation,
                                  sync: isSync,
                                  out: isSync ? currentIn : (el.animation?.out || 'none'),
                                },
                              });
                            });
                          }
                        }}
                      />
                      Đồng bộ hiệu ứng Hiện & Ẩn
                    </label>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <label className="text-xs font-bold text-slate-600">Thứ tự xuất hiện:</label>
                      <input
                        type="number"
                        min="0"
                        className="w-16 px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
                        value={activeElement.animationOrder || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          if (updateElements) {
                            const newEls = selectedElements.map(el => ({ ...el, animationOrder: Math.max(0, val) }));
                            updateElements(newEls);
                          } else if (updateElement) {
                            selectedElements.forEach(el => {
                              updateElement({ ...el, animationOrder: Math.max(0, val) });
                            });
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-2 pb-10">
                      {PPTX_ANIMATIONS.map(anim => {
                        const currentAnim = animTab === 'in'
                          ? (activeElement.animation?.in || 'none')
                          : (activeElement.animation?.out || 'none');
                        const isActive = currentAnim === anim.id;

                        return (
                          <button
                            key={anim.id}
                            onClick={() => {
                              if (updateElements) {
                                const newEls = selectedElements.map(el => {
                                  const newAnimation = { ...(el.animation || { in: 'none', out: 'none', sync: true }) };
                                  if (animTab === 'in') {
                                    newAnimation.in = anim.id;
                                    if (newAnimation.sync !== false) newAnimation.out = anim.id;
                                  } else {
                                    newAnimation.out = anim.id;
                                    newAnimation.sync = false;
                                  }
                                  return { ...el, animation: newAnimation };
                                });
                                updateElements(newEls);
                              } else if (updateElement) {
                                selectedElements.forEach(el => {
                                  const newAnimation = { ...(el.animation || { in: 'none', out: 'none', sync: true }) };
                                  if (animTab === 'in') {
                                    newAnimation.in = anim.id;
                                    if (newAnimation.sync !== false) newAnimation.out = anim.id;
                                  } else {
                                    newAnimation.out = anim.id;
                                    newAnimation.sync = false;
                                  }
                                  updateElement({ ...el, animation: newAnimation });
                                });
                              }
                            }}
                            className={`py-3 px-2 text-xs font-bold rounded-xl border transition-all ${isActive
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

      {/* Pro Upgrade Modal */}
      {proModal && (
        <ProUpgradeModal
          featureName={proModal.feature}
          featureDescription={proModal.desc}
          onClose={() => setProModal(null)}
        />
      )}

      {/* Token Purchase Modal */}
      {showTokenModal && (
        <TokenPurchaseModal onClose={() => setShowTokenModal(false)} />
      )}
    </>);
}

