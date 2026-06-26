// src/components/ElementToolbar.tsx
import React, { useState } from 'react';
import { 
  Bold, Italic, Underline, ArrowUp, ArrowDown, Trash2, Layers, Zap, Eraser, Brush, Scissors, Copy,
  Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, Settings, SlidersHorizontal, List, Droplet, Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ElementToolbarProps {
  element: any;
  onUpdate: (newAttrs: any) => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
  fontList: string[];
  onTogglePosition: () => void;
  onToggleAnimate?: () => void;
  onAlign?: (alignment: 'left'|'center'|'right'|'top'|'middle'|'bottom') => void;
  onRemoveBackground?: (element: any) => void;
  onBrushErase?: (element: any) => void;
  onCrop?: (element: any) => void;
  onDuplicate?: () => void;
}

export default function ElementToolbar({
  element, onUpdate, onDelete, onMove, fontList,
  onTogglePosition, onToggleAnimate, onAlign, onRemoveBackground, onBrushErase, onCrop, onDuplicate
}: ElementToolbarProps) {
  const [activePopover, setActivePopover] = useState<'spacing' | 'border' | 'opacity' | 'align' | 'font' | null>(null);

  const togglePopover = (popover: 'spacing' | 'border' | 'opacity' | 'align' | 'font') => {
    setActivePopover(prev => prev === popover ? null : popover);
  };

  const handleChange = (key: string, value: any) => {
    onUpdate({ ...element, [key]: value });
  };

  const toggleStyle = (style: 'bold' | 'italic') => {
    let currentStyle = element.fontStyle || 'normal';
    if (currentStyle.includes(style)) {
      currentStyle = currentStyle.replace(style, '').trim() || 'normal';
    } else {
      currentStyle = currentStyle === 'normal' ? style : `${currentStyle} ${style}`;
    }
    handleChange('fontStyle', currentStyle);
  };

  const cycleAlignment = () => {
    const aligns = ['left', 'center', 'right', 'justify'];
    const current = element.align || 'left';
    const next = aligns[(aligns.indexOf(current) + 1) % aligns.length];
    handleChange('align', next);
  };

  const renderAlignIcon = () => {
    switch (element.align) {
      case 'center': return <AlignCenter size={16} strokeWidth={2.5} />;
      case 'right': return <AlignRight size={16} strokeWidth={2.5} />;
      case 'justify': return <AlignJustify size={16} strokeWidth={2.5} />;
      default: return <AlignLeft size={16} strokeWidth={2.5} />;
    }
  };

  const popoverMotion = {
    initial: { opacity: 0, y: 10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 10, scale: 0.95 },
    transition: { duration: 0.15, ease: "easeOut" as const }
  };

  const popoverMotionUp = {
    initial: { opacity: 0, y: -10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.95 },
    transition: { duration: 0.15, ease: "easeOut" as const }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/80 rounded-2xl pointer-events-auto transition-all text-slate-600 relative">
      
      {/* 1. TEXT CONTROLS */}
      {element.type === 'text' && (
        <>
          <div className="flex items-center border-r border-slate-200 pr-3 gap-2 shrink-0">
            <div className="relative group">
              <button 
                onClick={() => togglePopover('font')}
                className="flex items-center justify-between text-[13px] h-[34px] bg-slate-100/80 hover:bg-slate-200/60 border border-transparent hover:border-slate-300 rounded-lg pl-3 pr-2 w-36 sm:w-40 font-semibold text-slate-700 outline-none focus:bg-white focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 shadow-sm transition-all cursor-pointer"
                style={{ fontFamily: element.fontFamily || 'Arial' }}
              >
                <span className="truncate">{element.fontFamily || 'Arial'}</span>
                <div className={`text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${activePopover === 'font' ? 'rotate-180' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </button>
              
              <AnimatePresence>
                {activePopover === 'font' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1.5 w-48 max-h-[300px] overflow-y-auto bg-white/95 backdrop-blur-xl border border-slate-200 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] rounded-xl z-[100] p-1.5 scrollbar-thin scrollbar-thumb-slate-200"
                  >
                    {fontList.map(f => (
                      <button
                        key={f}
                        onClick={() => { handleChange('fontFamily', f); setActivePopover(null); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors flex items-center justify-between ${
                          (element.fontFamily || 'Arial') === f 
                            ? 'bg-violet-50 text-violet-700 font-bold' 
                            : 'text-slate-700 hover:bg-slate-100 font-medium hover:text-slate-900'
                        }`}
                        style={{ fontFamily: f }}
                      >
                        <span className="truncate">{f}</span>
                        {(element.fontFamily || 'Arial') === f && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden h-[34px]">
              <button onClick={() => handleChange('fontSize', Math.max(1, (element.fontSize || 24) - 1))} className="px-2.5 h-full flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors border-r border-slate-200 font-bold text-slate-600">-</button>
              <input type="number" value={Math.round(element.fontSize || 24)} onChange={(e) => handleChange('fontSize', parseInt(e.target.value) || 1)} className="w-12 text-[13px] font-bold text-slate-800 bg-transparent py-1 outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              <button onClick={() => handleChange('fontSize', (element.fontSize || 24) + 1)} className="px-2.5 h-full flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors border-l border-slate-200 font-bold text-slate-600">+</button>
            </div>
            
            {/* Text Color */}
            <input type="color" value={element.fill || '#000000'} onChange={(e) => handleChange('fill', e.target.value)} className="w-8 h-8 p-0 border border-slate-200 rounded-lg cursor-pointer overflow-hidden shadow-sm shrink-0 ml-1 hover:border-slate-300 transition-colors" title="Text Color" />
          </div>
          
          <div className="flex items-center border-r border-slate-200 pr-3 gap-0.5 shrink-0">
            <button onClick={() => toggleStyle('bold')} className={`p-1.5 rounded-lg transition ${element.fontStyle?.includes('bold') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Bold"><Bold size={16} strokeWidth={2.5} /></button>
            <button onClick={() => toggleStyle('italic')} className={`p-1.5 rounded-lg transition ${element.fontStyle?.includes('italic') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Italic"><Italic size={16} strokeWidth={2.5} /></button>
            <button onClick={() => handleChange('textDecoration', element.textDecoration === 'underline' ? '' : 'underline')} className={`p-1.5 rounded-lg transition ${element.textDecoration === 'underline' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Underline"><Underline size={16} strokeWidth={2.5} /></button>
            <button onClick={() => handleChange('textDecoration', element.textDecoration === 'line-through' ? '' : 'line-through')} className={`p-1.5 rounded-lg transition ${element.textDecoration === 'line-through' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Strikethrough"><Strikethrough size={16} strokeWidth={2.5} /></button>
            
            {/* Alignment */}
            <div className="w-[1px] h-4 bg-slate-200 mx-1" />
            <button onClick={cycleAlignment} className="p-1.5 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition" title="Alignment">
              {renderAlignIcon()}
            </button>

            {/* Spacing Popover */}
            <div className="relative">
              <button onClick={() => togglePopover('spacing')} className={`p-1.5 rounded-lg transition ${activePopover === 'spacing' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Spacing">
                <List size={16} strokeWidth={2.5} />
              </button>
              <AnimatePresence>
                {activePopover === 'spacing' && (
                  <motion.div {...popoverMotion} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Letter Spacing</label>
                      <input type="range" min="-5" max="50" value={element.letterSpacing || 0} onChange={(e) => handleChange('letterSpacing', Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Line Height</label>
                      <input type="range" min="0.5" max="2.5" step="0.1" value={element.lineHeight || 1.2} onChange={(e) => handleChange('lineHeight', Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}

      {/* 2. IMAGE & STICKER CONTROLS */}
      {(element.type === 'image' || element.type === 'sticker') && (
        <div className="flex items-center border-r border-slate-200 pr-3 gap-1 shrink-0">
          <button onClick={() => onCrop?.(element)} className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded-lg transition text-xs font-bold border border-transparent hover:border-teal-200" title="Crop Image">
            <Scissors size={14} strokeWidth={2.5} /> Crop
          </button>
          <button onClick={() => onRemoveBackground?.(element)} className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 hover:bg-purple-50 text-slate-600 hover:text-purple-700 rounded-lg transition text-xs font-bold border border-transparent hover:border-purple-200" title="Remove Background (AI)">
            <Eraser size={14} strokeWidth={2.5} /> BG Remover
          </button>
          <button onClick={() => onBrushErase?.(element)} className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-700 rounded-lg transition text-xs font-bold border border-transparent hover:border-amber-200" title="Brush Erase">
            <Brush size={14} strokeWidth={2.5} /> Brush
          </button>
        </div>
      )}

      {/* 3. SHAPE, LINE & BACKGROUND CONTROLS */}
      {(element.type === 'rect' || element.type === 'circle' || element.type === 'line' || element.type === 'shape' || element.type === 'bg') && (
        <div className="flex items-center border-r border-slate-200 pr-3 gap-2 shrink-0">
          {element.type !== 'line' && (
            <input type="color" value={element.fill || '#ffffff'} onChange={(e) => handleChange('fill', e.target.value)} className="w-7 h-7 p-0 border border-slate-200 rounded cursor-pointer overflow-hidden shadow-sm" title={element.type === 'bg' ? 'Background Color' : 'Fill Color'} />
          )}
          
          {/* Border / Line Popover */}
          {element.type !== 'bg' && (
          <div className="relative">
            <button onClick={() => togglePopover('border')} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition text-xs font-bold border ${activePopover === 'border' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'}`} title="Border Style">
              <SlidersHorizontal size={14} strokeWidth={2.5} /> {element.type === 'line' ? 'Line Style' : 'Border'}
            </button>
            <AnimatePresence>
              {activePopover === 'border' && (
                <motion.div {...popoverMotion} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Color</label>
                    <input type="color" value={element.stroke || '#000000'} onChange={(e) => handleChange('stroke', e.target.value)} className="w-full h-8 p-0 border border-slate-200 rounded cursor-pointer" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Weight</label>
                    <input type="range" min="0" max="50" value={element.strokeWidth || 0} onChange={(e) => handleChange('strokeWidth', Number(e.target.value))} className="w-full accent-indigo-500" />
                  </div>
                  {element.type === 'rect' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Corner Rounding</label>
                      <input type="range" min="0" max="100" value={element.cornerRadius || 0} onChange={(e) => handleChange('cornerRadius', Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}
        </div>
      )}

      {/* 4. GENERAL CONTROLS (Opacity, Animate, Position, Delete) */}
      {element.type !== 'bg' && (
      <div className="flex items-center gap-1.5 shrink-0 pl-1">
        
        {/* Opacity Popover */}
        <div className="relative">
          <button onClick={() => togglePopover('opacity')} className={`p-1.5 rounded-lg transition ${activePopover === 'opacity' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800'}`} title="Transparency">
            <Droplet size={16} strokeWidth={2.5} />
          </button>
          <AnimatePresence>
            {activePopover === 'opacity' && (
              <motion.div {...popoverMotion} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-36 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                  <span>Transparency</span>
                  <span>{Math.round((element.opacity ?? 1) * 100)}%</span>
                </label>
                <input type="range" min="0" max="1" step="0.01" value={element.opacity ?? 1} onChange={(e) => handleChange('opacity', Number(e.target.value))} className="w-full accent-indigo-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {onToggleAnimate && (
          <button onClick={() => { onToggleAnimate(); setActivePopover(null); }} className="p-1.5 hover:bg-slate-100 hover:text-amber-600 rounded-lg transition text-slate-500" title="Animate">
            <Zap size={16} strokeWidth={2.5} />
          </button>
        )}
        <button onClick={() => { onTogglePosition(); setActivePopover(null); }} className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition text-slate-500" title="Layers & Position">
          <Layers size={16} strokeWidth={2.5} />
        </button>



        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        <button onClick={() => onMove('up')} title="Bring Forward" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowUp size={16} strokeWidth={2.5} /></button>
        <button onClick={() => onMove('down')} title="Send Backward" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowDown size={16} strokeWidth={2.5} /></button>
        
        {onDuplicate && <button onClick={onDuplicate} title="Duplicate" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition ml-1"><Copy size={16} strokeWidth={2.5} /></button>}
        <button onClick={onDelete} title="Delete" className="p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition"><Trash2 size={16} strokeWidth={2.5} /></button>
      </div>
      )}
    </div>
  );
}