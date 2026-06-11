// src/components/editor/EditorTopBar.tsx
import { ChevronLeft, Download, Save, History, PlusCircle, Share2, Eye, Pencil, MessageSquare, Crown, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import CollaboratorAvatars from './CollaboratorAvatars';
import type { CollaboratorInfo } from '../../hooks/useCollaboration';

interface EditorTopBarProps {
  design: any;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  isSaving: boolean;
  isEditingTitle: boolean;
  tempTitle: string;
  setTempTitle: (v: string) => void;
  setIsEditingTitle: (v: boolean) => void;
  setDesign: (v: any) => void;
  showExportPopover: boolean;
  setShowExportPopover: (v: boolean) => void;
  exportConfig: { format: string };
  currentPageType?: string;
  setExportConfig: (v: any) => void;
  exportScale: number;
  setExportScale: (v: number) => void;
  exportQuality: number;
  setExportQuality: (v: number) => void;
  exportSelectedPages: string[];
  setExportSelectedPages: (v: string[]) => void;
  pages: any[];
  stageWidth: number;
  stageHeight: number;
  executeExport: () => void;
  handleSave: (silent?: boolean) => void;
  handleSaveVersion: () => void;
  handleOpenVersionHistory: () => void;
  // RBAC Props
  currentRole: 'owner' | 'editor' | 'commenter' | 'viewer';
  onOpenShare: () => void;
  // Collaboration Props
  activeUsers: CollaboratorInfo[];
  isConnected: boolean;
  currentUserId?: string;
  // Presentation mode
  onPresent?: () => void;
  designType?: string;
  // Whiteboard Resize
  onResizeCanvas?: (w: number, h: number) => void;
  // === FIX #6: Force save khi navigate về Dashboard ===
  onGoBack?: () => void;
}

const ROLE_BADGE: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  owner: { label: 'Owner', icon: <Crown size={11} />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  editor: { label: 'Editor', icon: <Pencil size={11} />, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  commenter: { label: 'Commenter', icon: <MessageSquare size={11} />, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  viewer: { label: 'Viewer', icon: <Eye size={11} />, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' },
};

export default function EditorTopBar({
  design, saveStatus, isSaving,
  isEditingTitle, tempTitle, setTempTitle, setIsEditingTitle, setDesign,
  showExportPopover, setShowExportPopover,
  exportConfig, setExportConfig, exportScale, setExportScale,
  exportQuality, setExportQuality,
  exportSelectedPages, setExportSelectedPages,
  pages, stageWidth, stageHeight,
  executeExport, handleSave, handleSaveVersion, handleOpenVersionHistory,
  currentRole, onOpenShare,
  activeUsers, isConnected, currentUserId,
  currentPageType,
  onPresent, designType,
  onResizeCanvas,
  onGoBack, // === FIX #6 ===
}: EditorTopBarProps) {
  const isOwner = currentRole === 'owner';
  const canEdit = currentRole === 'owner' || currentRole === 'editor';
  const badge = ROLE_BADGE[currentRole];

  const [showResizePopover, setShowResizePopover] = useState(false);
  const [resizeW, setResizeW] = useState(stageWidth);
  const [resizeH, setResizeH] = useState(stageHeight);

  // Sync state when stageWidth/stageHeight changes
  useEffect(() => {
    setResizeW(stageWidth);
    setResizeH(stageHeight);
  }, [stageWidth, stageHeight]);

  return (
    <div className="h-14 bg-white/70 backdrop-blur-xl border-b border-white/60 flex items-center justify-between px-4 z-30 shadow-sm" style={{ position: 'relative' }}>
      {/* LEFT */}
      <div className="flex items-center gap-4">
        {/* === FIX #6: Dùng button gọi onGoBack để force-save trước khi navigate === */}
        <button
          onClick={onGoBack}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white/50 rounded-full transition"
          title="Quay lại (lưu tự động trước khi rời)"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col">
          {isEditingTitle && canEdit ? (
            <input
              type="text" autoFocus value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={() => { setIsEditingTitle(false); setDesign({ ...design, title: tempTitle || 'Untitled Design' }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingTitle(false); setDesign({ ...design, title: tempTitle || 'Untitled Design' }); } }}
              className="font-bold text-sm tracking-tight text-slate-800 bg-white border border-indigo-300 rounded px-1 py-0 outline-none w-48 shadow-inner focus:ring-2 focus:ring-indigo-100"
            />
          ) : (
            <span
              onDoubleClick={() => canEdit && setIsEditingTitle(true)}
              className={`font-bold text-sm tracking-tight text-slate-800 rounded px-1 -ml-1 transition border border-transparent ${canEdit ? 'cursor-text hover:bg-white/50 hover:border-slate-300' : 'cursor-default'}`}
            >
              {design?.title || 'Untitled Design'}
            </span>
          )}
          <div className="flex items-center gap-2 px-1 -ml-1 mt-0.5">
            {/* Save status — chỉ hiển thị khi canEdit */}
            {canEdit && (
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : saveStatus === 'unsaved' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  {saveStatus === 'saving' ? 'Đang lưu...' : saveStatus === 'unsaved' ? 'Có thay đổi chưa lưu' : 'Đã lưu'}
                </span>
              </div>
            )}
            {/* Role badge */}
            <span className={`flex items-center gap-1 text-[10px] font-bold ${badge.color} ${badge.bg} px-2 py-0.5 rounded-full border`}>
              {badge.icon} {badge.label}
            </span>
          </div>
        </div>
      </div>

      {/* CENTER – Collaborator Avatars (absolute centered) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto z-10">
        <CollaboratorAvatars
          users={activeUsers}
          currentUserId={currentUserId}
          isConnected={isConnected}
        />
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 relative">

        {/* Save Version — chỉ owner/editor */}
        {canEdit && (
          <button
            onClick={handleSaveVersion}
            className="px-3 py-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200"
            title="Chụp lại phiên bản hiện tại"
          >
            <PlusCircle size={14} /> Save Version
          </button>
        )}

        {/* Version History — chỉ owner/editor */}
        {canEdit && (
          <button
            onClick={handleOpenVersionHistory}
            className="px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-lg text-sm font-bold transition flex items-center gap-1.5"
          >
            <History size={16} /> History
          </button>
        )}

        {/* Save — chỉ owner/editor */}
        {canEdit && (
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="px-4 py-1.5 bg-gradient-to-r from-sky-400 to-pink-400 text-white hover:from-sky-500 hover:to-pink-500 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm disabled:opacity-50"
          >
            <Save size={16} /> Save
          </button>
        )}

        {/* PRESENT BUTTON — only for presentation type */}
        {designType === 'presentation' && onPresent && (
          <button
            onClick={onPresent}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm shadow-indigo-200"
            title="Xem trình chiếu (Presentation Mode)"
          >
            <Play size={14} className="fill-white" /> Present
          </button>
        )}

        {/* RESIZE BUTTON — available for canvas-based designs */}
        {canEdit && currentPageType !== 'doc' && currentPageType !== 'sheet' && (
          <div className="relative">
            <button
              onClick={() => setShowResizePopover(!showResizePopover)}
              className="px-4 py-1.5 bg-gradient-to-r from-emerald-400 to-teal-400 text-white hover:from-emerald-500 hover:to-teal-500 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm"
              title="Đổi kích thước bảng trắng"
            >
              Resize
            </button>
            <AnimatePresence>
              {showResizePopover && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-12 right-0 w-[240px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 z-[100] p-4 flex flex-col gap-4"
                >
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Canvas Size</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Width</label>
                      <input
                        type="number"
                        value={resizeW}
                        onChange={(e) => setResizeW(Number(e.target.value))}
                        className="w-full mt-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Height</label>
                      <input
                        type="number"
                        value={resizeH}
                        onChange={(e) => setResizeH(Number(e.target.value))}
                        className="w-full mt-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (onResizeCanvas && resizeW > 0 && resizeH > 0) {
                        onResizeCanvas(resizeW, resizeH);
                      }
                      setShowResizePopover(false);
                    }}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition"
                  >
                    Apply Resize
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* SHARE BUTTON */}
        {isOwner ? (
          // Owner: nút đầy đủ
          <button
            onClick={onOpenShare}
            className="px-4 py-1.5 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm shadow-violet-200"
          >
            <Share2 size={16} /> Share
          </button>
        ) : currentRole === 'editor' ? (
          // Editor: thấy nút nhưng disabled với tooltip
          <div className="relative group">
            <button
              onClick={onOpenShare}
              className="px-4 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-sm font-bold flex items-center gap-2 border border-slate-200 cursor-not-allowed"
              disabled
            >
              <Share2 size={16} /> Share
            </button>
            <div className="absolute top-10 right-0 hidden group-hover:block z-50 w-56 bg-slate-800 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
              Chỉ Owner mới có thể quản lý quyền chia sẻ
            </div>
          </div>
        ) : null /* viewer/commenter không thấy nút share */}

        {/* EXPORT POPOVER */}
        <div className="relative">
          <button
            onClick={() => setShowExportPopover(!showExportPopover)}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm ${showExportPopover ? 'bg-pink-100 text-pink-700' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}
          >
            <Download size={16} /> Export
          </button>

          <AnimatePresence>
            {showExportPopover && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-12 right-0 w-[320px] bg-white text-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 z-[100] p-5 flex flex-col gap-5"
              >
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Download</h3>

                {/* File type */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">File type</label>
                  <select
                    value={exportConfig.format}
                    onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {currentPageType !== 'doc' && <option className="text-slate-900 font-bold" value="png">PNG (High Quality Image)</option>}
                    {currentPageType !== 'doc' && <option className="text-slate-900 font-bold" value="jpeg">JPG (Small size)</option>}
                    {currentPageType !== 'doc' && <option className="text-slate-900 font-bold" value="pptx">PPTX (PowerPoint)</option>}
                    {currentPageType === 'doc' && <option className="text-slate-900 font-bold" value="docx">📄 DOCX (Microsoft Word)</option>}
                    {currentPageType === 'doc' && <option className="text-slate-900 font-bold" value="pdf">📋 PDF (In / Xem trực tiếp)</option>}
                  </select>
                </div>

                {/* Scale — locked aspect ratio, preset buttons only */}
                {(exportConfig.format === 'png' || exportConfig.format === 'jpeg') && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Độ phân giải</label>
                      <span className="text-[10px] font-bold text-indigo-600">
                        {stageWidth * exportScale} × {stageHeight * exportScale} px
                      </span>
                    </div>
                    {/* Preset scale buttons — aspect ratio is always locked */}
                    <div style={{ display:'flex', gap:6 }}>
                      {[1, 2, 3].map(scale => (
                        <button
                          key={scale}
                          onClick={() => setExportScale(scale)}
                          style={{
                            flex:1, padding:'7px 0', borderRadius:10, border:'none', cursor:'pointer',
                            fontWeight:800, fontSize:12, transition:'all 0.15s',
                            background: exportScale === scale
                              ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                              : '#f1f5f9',
                            color: exportScale === scale ? 'white' : '#475569',
                            boxShadow: exportScale === scale ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                          }}
                        >
                          {scale}×
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>
                      🔒 Tỉ lệ khóa cố định ({stageWidth}:{stageHeight}). Để thay đổi tỉ lệ, dùng Resize.
                    </p>
                  </div>
                )}

                {/* Quality slider — JPEG only */}
                {exportConfig.format === 'jpeg' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Chất lượng</label>
                      <span className="text-[10px] font-bold text-emerald-600">{Math.round(exportQuality * 100)}%</span>
                    </div>
                    <input
                      type="range" min="10" max="100" step="5"
                      value={Math.round(exportQuality * 100)}
                      onChange={e => setExportQuality(Number(e.target.value) / 100)}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#94a3b8', fontWeight:700 }}>
                      <span>10% (nhỏ)</span><span>100% (tốt nhất)</span>
                    </div>
                  </div>
                )}

                {/* Select pages */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Select Pages</label>
                  <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-2 custom-scrollbar bg-slate-50/50">
                    {pages.map((p, idx) => (
                      <label key={p.id} className="flex items-center gap-3 p-1.5 hover:bg-slate-200/50 rounded-lg cursor-pointer transition">
                        <input
                          type="checkbox"
                          checked={exportSelectedPages.includes(p.id)}
                          onChange={e => {
                            setExportSelectedPages(
                              e.target.checked
                                ? [...exportSelectedPages, p.id]
                                : exportSelectedPages.filter(id => id !== p.id)
                            );
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="w-10 h-7 rounded border border-slate-200 overflow-hidden bg-white shrink-0 shadow-sm">
                          {p.thumbnail
                            ? <img src={p.thumbnail} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-300 font-bold italic">P.{idx + 1}</div>
                          }
                        </div>
                        <span className="text-xs font-bold text-slate-900">Page {idx + 1}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={executeExport}
                  className="w-full py-3 bg-gradient-to-r from-sky-400 to-pink-400 hover:from-sky-500 hover:to-pink-500 text-white rounded-xl text-sm font-black transition shadow-lg shadow-pink-200/50"
                >
                  Download
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
