// src/components/editor/AnimationPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Square, GripVertical, Zap, Users, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';

const ANIMS = [
  { id: 'none', label: 'None' }, { id: 'appear', label: 'Appear' },
  { id: 'fade', label: 'Fade' }, { id: 'flyIn', label: 'Fly In' },
  { id: 'floatIn', label: 'Float In' }, { id: 'split', label: 'Split' },
  { id: 'wipe', label: 'Wipe' }, { id: 'zoom', label: 'Zoom' },
  { id: 'bounce', label: 'Bounce' }, { id: 'swivel', label: 'Swivel' },
];

// ── Visual thumbnail for easy element identification ──────────────────────
function ElementThumbnail({ el }: { el: any }) {
  if (el.type === 'image' && el.src) {
    return (
      <div className="w-8 h-[22px] rounded overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
        <img src={el.src} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }
  if (el.type === 'text') {
    return (
      <div
        className="w-8 h-[22px] rounded border border-slate-200 shrink-0 flex items-center justify-center overflow-hidden px-0.5"
        style={{ backgroundColor: el.backgroundColor || '#f8fafc' }}
      >
        <span className="text-[6px] font-bold leading-tight truncate w-full text-center"
          style={{ color: el.fill || '#334155', fontFamily: el.fontFamily || 'Inter' }}>
          {(el.text || 'Abc').slice(0, 5)}
        </span>
      </div>
    );
  }
  if (el.type === 'rect' || el.type === 'shape') {
    return (
      <div className="w-8 h-[22px] rounded shrink-0 border"
        style={{
          backgroundColor: el.fill || '#6366f1',
          borderColor: el.stroke || 'transparent',
          borderWidth: el.strokeWidth ? Math.min(el.strokeWidth, 2) : 1,
          borderRadius: el.cornerRadius ? `${Math.min(el.cornerRadius, 4)}px` : '3px',
        }} />
    );
  }
  if (el.type === 'circle') {
    return (
      <div className="w-8 h-[22px] rounded border border-slate-200 shrink-0 flex items-center justify-center bg-slate-50">
        <div className="w-[13px] h-[13px] rounded-full"
          style={{ backgroundColor: el.fill || '#6366f1' }} />
      </div>
    );
  }
  if (el.type === 'line') {
    return (
      <div className="w-8 h-[22px] rounded border border-slate-200 shrink-0 flex items-center justify-center bg-slate-50">
        <svg width="22" height="12"><line x1="2" y1="10" x2="20" y2="2"
          stroke={el.stroke || '#6366f1'} strokeWidth={Math.min(el.strokeWidth || 2, 3)} strokeLinecap="round" /></svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-[22px] rounded border border-slate-200 shrink-0 flex items-center justify-center bg-slate-50">
      <span className="text-[9px]">🎨</span>
    </div>
  );
}

function getLabel(el: any) {
  if (el.type === 'text') return (el.text || 'Text').slice(0, 18);
  if (el.type === 'image') return 'Image';
  if (el.type === 'sticker') return 'Sticker';
  return el.type || 'Element';
}

interface Props {
  elements: any[];
  selectedIds: string[];
  onUpdateElement: (el: any) => void;
  onUpdateElements: (updater: (prev: any[]) => any[]) => void;
  onClose: () => void;
  onSelectElement: (ids: string[]) => void;
  highlightedId?: string | null;
  onPreviewStepChange?: (step: number) => void;
}

export default function AnimationPanel({
  elements, selectedIds, onUpdateElement, onUpdateElements,
  onClose, onSelectElement, highlightedId, onPreviewStepChange,
}: Props) {
  // Animated elements sorted by step
  const animEls = [...elements]
    .filter(el => el.animation?.in && el.animation.in !== 'none')
    .sort((a, b) => (a.animationOrder ?? 999) - (b.animationOrder ?? 999));
  const unAnimEls = elements.filter(el => !el.animation?.in || el.animation.in === 'none');

  // Local ordered list for drag-drop
  const [orderedIds, setOrderedIds] = useState<string[]>(() => animEls.map(e => e.id));
  const prevCount = useRef(animEls.length);
  useEffect(() => {
    if (animEls.length !== prevCount.current) {
      prevCount.current = animEls.length;
      setOrderedIds(animEls.map(e => e.id));
    }
  });

  // Compute ordered list and unique steps
  const ordered = orderedIds.map(id => elements.find(e => e.id === id)).filter(Boolean);

  // Group by animationOrder value — same number = same step (appear together)
  const stepGroups: { stepNum: number; ids: string[] }[] = [];
  ordered.forEach(el => {
    const s = el.animationOrder ?? 999;
    const grp = stepGroups.find(g => g.stepNum === s);
    if (grp) grp.ids.push(el.id);
    else stepGroups.push({ stepNum: s, ids: [el.id] });
  });

  // Preview state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPreviewing(false); setPreviewIdx(-1); onPreviewStepChange?.(-1);
  }, [onPreviewStepChange]);

  const startPreview = useCallback(() => {
    if (stepGroups.length === 0) return;
    setIsPreviewing(true); setPreviewIdx(0);
    onPreviewStepChange?.(stepGroups[0]?.stepNum ?? 1);
  }, [stepGroups, onPreviewStepChange]);

  useEffect(() => {
    if (!isPreviewing || previewIdx < 0) return;
    if (previewIdx >= stepGroups.length) { timerRef.current = setTimeout(stopPreview, 800); return; }
    onPreviewStepChange?.(stepGroups[previewIdx]?.stepNum ?? previewIdx + 1);
    timerRef.current = setTimeout(() => setPreviewIdx(p => p + 1), 900);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPreviewing, previewIdx, stepGroups.length]);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');

  // Multi-select bulk
  const multiSel = selectedIds.filter(id => elements.find(e => e.id === id));
  const isBulk = multiSel.length > 1;
  const [bulkAnim, setBulkAnim] = useState('fade');
  const [bulkTab, setBulkTab] = useState<'in' | 'out'>('in');

  const updateEl = (id: string, changes: any) => {
    const el = elements.find(e => e.id === id);
    if (el) onUpdateElement({ ...el, ...changes });
  };

  // Drag-drop: reassign steps sequentially, preserving grouping
  const commitReorder = (newIds: string[]) => {
    setOrderedIds(newIds);
    // Assign new stepNum: start at 1, increment when not grouping with prev
    // We preserve the relative grouping: if two items had the same stepNum before, keep them together
    const newOrdered = newIds.map(id => elements.find(e => e.id === id)).filter(Boolean);
    let step = 1;
    const stepMap: Record<string, number> = {};
    newOrdered.forEach((el, i) => {
      if (i === 0) { stepMap[el.id] = step; return; }
      const prevEl = newOrdered[i - 1];
      // If this el and prev el shared the same step BEFORE reorder, keep them together
      if ((el.animationOrder ?? 999) === (prevEl.animationOrder ?? 999)
        && el.animationOrder !== undefined && prevEl.animationOrder !== undefined) {
        stepMap[el.id] = stepMap[prevEl.id];
      } else {
        step++;
        stepMap[el.id] = step;
      }
    });
    onUpdateElements(prev => prev.map(el => {
      if (stepMap[el.id] !== undefined) return { ...el, animationOrder: stepMap[el.id] };
      return el;
    }));
  };

  // ── Merge this element into the SAME step as the element above it ──
  const mergeWithPrev = (elId: string) => {
    const idx = orderedIds.indexOf(elId);
    if (idx <= 0) return;
    const prevId = orderedIds[idx - 1];
    const prevEl = elements.find(e => e.id === prevId);
    if (!prevEl) return;
    updateEl(elId, { animationOrder: prevEl.animationOrder ?? 1 });
  };

  // ── Split this element into its own step (next step after prev) ──
  const splitToOwnStep = (elId: string) => {
    const idx = orderedIds.indexOf(elId);
    const prevId = orderedIds[idx - 1];
    const prevEl = elements.find(e => e.id === prevId);
    const nextStep = (prevEl?.animationOrder ?? 0) + 1;
    // Shift all elements at or after nextStep up by 1
    onUpdateElements(prev => prev.map(el => {
      if (!orderedIds.includes(el.id)) return el;
      if (el.id === elId) return { ...el, animationOrder: nextStep };
      if ((el.animationOrder ?? 999) >= nextStep && el.id !== elId) {
        return { ...el, animationOrder: (el.animationOrder ?? nextStep) + 1 };
      }
      return el;
    }));
  };

  const applyBulk = () => {
    const nextStep = (stepGroups[stepGroups.length - 1]?.stepNum ?? 0) + 1;
    onUpdateElements(prev => prev.map(el => {
      if (!multiSel.includes(el.id)) return el;
      const newA = { ...(el.animation || { in: 'none', out: 'none' }) };
      if (bulkTab === 'in') { newA.in = bulkAnim; if (newA.sync !== false) newA.out = bulkAnim; }
      else { newA.out = bulkAnim; (newA as any).sync = false; }
      const order = el.animationOrder || (nextStep + multiSel.indexOf(el.id));
      return { ...el, animation: newA, animationOrder: order };
    }));
  };

  return (
    <motion.div
      initial={{ x: -350, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: -350, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 left-[72px] h-full w-[350px] bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-2xl z-[65] flex flex-col"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Animation Panel</h2>
            <p className="text-[10px] text-slate-400">{stepGroups.length} bước · {ordered.length} hiệu ứng</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={isPreviewing ? stopPreview : startPreview} disabled={stepGroups.length === 0}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${isPreviewing ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 disabled:opacity-40'}`}>
            {isPreviewing ? <><Square size={11} />Stop</> : <><Play size={11} />Preview</>}
          </button>
          <button onClick={() => { onClose(); onPreviewStepChange?.(-1); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
            <X size={15} />
          </button>
        </div>
      </div>

      {isPreviewing && (
        <div className="h-1 bg-slate-100 shrink-0">
          <motion.div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
            animate={{ width: `${stepGroups.length > 0 ? (previewIdx / stepGroups.length) * 100 : 0}%` }}
            transition={{ duration: 0.5 }} />
        </div>
      )}

      {/* Bulk Mode */}
      {isBulk && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-violet-50 border border-violet-200 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Users size={13} className="text-violet-600" />
            <span className="text-xs font-bold text-violet-700">{multiSel.length} vật thể được chọn</span>
          </div>

          <div className="grid grid-cols-4 gap-1 mb-2">
            {ANIMS.filter(a => a.id !== 'none').map(a => (
              <button key={a.id} onClick={() => setBulkAnim(a.id)}
                className={`py-1 text-[10px] font-semibold rounded-lg border transition ${bulkAnim === a.id ? 'bg-violet-200 border-violet-400 text-violet-800' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300'}`}>
                {a.label}
              </button>
            ))}
          </div>
          <button onClick={applyBulk}
            className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition">
            Áp dụng cho {multiSel.length} vật thể
          </button>
        </div>
      )}

      {/* ── STEP GROUPS ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {stepGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center px-4">
            <Zap size={28} className="text-slate-200 mb-2" />
            <p className="text-sm font-semibold text-slate-400">Chưa có hiệu ứng</p>
            <p className="text-[11px] text-slate-400 mt-1">Thêm từ danh sách bên dưới</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={orderedIds} onReorder={commitReorder} className="space-y-0">
            {stepGroups.map((grp, gIdx) => (
              <div key={grp.stepNum + '_g'} className="mb-3">
                {/* Step label */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${isPreviewing && previewIdx > gIdx ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                    <span>Bước {gIdx + 1}</span>
                    {grp.ids.length > 1 && (
                      <span className="bg-violet-100 text-violet-600 px-1 rounded-full ml-0.5">{grp.ids.length} cùng lúc</span>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {/* Elements in this step */}
                <div className="space-y-1 pl-2 border-l-2 border-slate-100">
                  {grp.ids.map((eid, eidx) => {
                    const el = elements.find(e => e.id === eid);
                    if (!el) return null;
                    const isSel = selectedIds.includes(el.id);
                    const isExp = expandedId === el.id;
                    const globalIdx = orderedIds.indexOf(eid);

                    return (
                      <Reorder.Item key={el.id} value={el.id} className="list-none">
                        <motion.div layout
                          className={`rounded-xl border transition-all overflow-hidden ${isSel ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          onClick={() => { onSelectElement([el.id]); setExpandedId(isExp ? null : el.id); }}
                        >
                          <div className="flex items-center gap-2 px-3 py-2">
                            <div className="text-slate-300 hover:text-slate-500 cursor-grab shrink-0" onPointerDown={e => e.stopPropagation()}>
                              <GripVertical size={13} />
                            </div>
                            {/* Visual thumbnail */}
                            <ElementThumbnail el={el} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-slate-700 truncate">{getLabel(el)}</p>
                              <p className="text-[10px] text-slate-400">↑ {el.animation?.in || 'none'}</p>
                            </div>
                            {/* Merge with prev button */}
                            {globalIdx > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); mergeWithPrev(eid); }}
                                title="Gộp vào bước trên (xuất hiện cùng lúc)"
                                className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition"
                              >
                                <ChevronUp size={13} />
                              </button>
                            )}
                          </div>

                          <AnimatePresence initial={false}>
                            {isExp && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                                className="overflow-hidden border-t border-slate-100" onClick={e => e.stopPropagation()}>
                                <div className="p-3 space-y-2.5">

                                  {/* Anim picker */}
                                  <div className="grid grid-cols-3 gap-1">
                                    {ANIMS.map(a => {
                                      const cur = animTab === 'in' ? el.animation?.in : el.animation?.out;
                                      return (
                                        <button key={a.id} onClick={() => {
                                          const na = { ...(el.animation || { in: 'none', out: 'none' }) };
                                          if (animTab === 'in') { na.in = a.id; if (na.sync !== false) na.out = a.id; }
                                          else { na.out = a.id; (na as any).sync = false; }
                                          updateEl(el.id, { animation: na });
                                        }}
                                          className={`py-1.5 text-[10px] font-semibold rounded-lg border transition ${cur === a.id ? (animTab === 'in' ? 'bg-violet-100 border-violet-400 text-violet-700' : 'bg-rose-100 border-rose-400 text-rose-700') : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-violet-300'}`}>
                                          {a.label}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Step grouping controls */}
                                  <div className="pt-1 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Thứ tự bước</p>
                                    <div className="flex gap-1.5">
                                      {globalIdx > 0 && (
                                        <button onClick={() => mergeWithPrev(eid)}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold rounded-lg border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition">
                                          <ChevronUp size={12} /> Cùng bước trên
                                        </button>
                                      )}
                                      {grp.ids.length > 1 && (
                                        <button onClick={() => splitToOwnStep(eid)}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100 transition">
                                          ↕ Bước riêng
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
                                      💡 Nhấn <b>Cùng bước trên</b> để element này xuất hiện đồng thời với element phía trên
                                    </p>
                                  </div>

                                  <button onClick={() => { updateEl(el.id, { animation: { in: 'none', out: 'none', sync: true }, animationOrder: 0 }); setExpandedId(null); }}
                                    className="w-full text-[11px] font-semibold text-rose-500 hover:bg-rose-50 py-1.5 rounded-lg transition border border-rose-100">
                                    ✕ Xóa hiệu ứng
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </Reorder.Item>
                    );
                  })}
                </div>
              </div>
            ))}
          </Reorder.Group>
        )}

        {/* Add animation */}
        {unAnimEls.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">+ Thêm hiệu ứng</p>
            {unAnimEls.map(el => (
              <button key={el.id} onClick={() => {
                const nextStep = (stepGroups[stepGroups.length - 1]?.stepNum ?? 0) + 1;
                updateEl(el.id, { animation: { in: 'fade', out: 'fade', sync: true }, animationOrder: nextStep });
              }}
                className="w-full flex items-center gap-2 px-3 py-2 mb-1 rounded-xl border border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 transition group text-left">
                {/* Thumbnail */}
                <ElementThumbnail el={el} />
                <span className="text-[11px] font-semibold text-slate-500 group-hover:text-violet-600 truncate flex-1">{getLabel(el)}</span>
                <span className="text-[10px] text-violet-400 font-bold opacity-0 group-hover:opacity-100 shrink-0">+ Add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 shrink-0 text-center">
        <p className="text-[10px] text-slate-400">💡 Click <b>↑</b> để gộp vào cùng bước phía trên</p>
      </div>
    </motion.div>
  );
}

