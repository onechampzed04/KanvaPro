// src/components/ElementToolbar.tsx
import React, { useState } from 'react';
import { 
  Bold, Italic, Underline, ArrowUp, ArrowDown, Trash2, Layers, Zap, Eraser, Brush, Scissors,
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
  onToggleAnimate: () => void;
  onAlign?: (alignment: 'left'|'center'|'right'|'top'|'middle'|'bottom') => void;
  onRemoveBackground?: (element: any) => void;
  onBrushErase?: (element: any) => void;
  onCrop?: (element: any) => void;
}

export default function ElementToolbar({
  element, onUpdate, onDelete, onMove, fontList,
  onTogglePosition, onToggleAnimate, onAlign, onRemoveBackground, onBrushErase, onCrop,
}: ElementToolbarProps) {
  const [activePopover, setActivePopover] = useState<'spacing' | 'border' | 'opacity' | 'align' | null>(null);

  const togglePopover = (popover: 'spacing' | 'border' | 'opacity' | 'align') => {
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
          <div className="flex items-center border-r border-slate-200 pr-3 gap-1.5 shrink-0">
            <select value={element.fontFamily || 'Arial'} onChange={(e) => handleChange('fontFamily', e.target.value)} className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1.5 px-2 w-28 font-bold text-slate-700 outline-none transition cursor-pointer">
              {fontList.map(f => (<option key={f} value={f} style={{ fontFamily: f }}>{f}</option>))}
            </select>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => handleChange('fontSize', Math.max(1, (element.fontSize || 24) - 1))} className="px-2 hover:bg-slate-200 font-bold">-</button>
              <input type="number" value={Math.round(element.fontSize || 24)} onChange={(e) => handleChange('fontSize', parseInt(e.target.value))} className="w-10 text-xs font-bold text-slate-700 bg-transparent py-1 outline-none text-center" />
              <button onClick={() => handleChange('fontSize', (element.fontSize || 24) + 1)} className="px-2 hover:bg-slate-200 font-bold">+</button>
            </div>
            {/* Text Color */}
            <input type="color" value={element.fill || '#000000'} onChange={(e) => handleChange('fill', e.target.value)} className="w-7 h-7 p-0 border border-slate-200 rounded cursor-pointer overflow-hidden shadow-sm shrink-0 ml-1" title="Text Color" />
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
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Style</label>
                    <select value={element.dash ? element.dash.join(',') : ''} onChange={(e) => handleChange('dash', e.target.value ? e.target.value.split(',').map(Number) : null)} className="w-full p-1 border border-slate-200 rounded text-xs">
                      <option value="">Solid</option>
                      <option value="10,10">Dashed</option>
                      <option value="2,6">Dotted</option>
                    </select>
                  </div>
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

        <button onClick={() => { onToggleAnimate(); setActivePopover(null); }} className="p-1.5 hover:bg-slate-100 hover:text-amber-600 rounded-lg transition text-slate-500" title="Animate">
          <Zap size={16} strokeWidth={2.5} />
        </button>
        <button onClick={() => { onTogglePosition(); setActivePopover(null); }} className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition text-slate-500" title="Layers & Position">
          <Layers size={16} strokeWidth={2.5} />
        </button>

        {/* Align to Page Popover */}
        {onAlign && (
          <div className="relative">
            <button onClick={() => togglePopover('align')} className={`p-1.5 rounded-lg transition ${activePopover === 'align' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 hover:text-slate-800 text-slate-500'}`} title="Align to Page">
              <Maximize size={16} strokeWidth={2.5} />
            </button>
            <AnimatePresence>
              {activePopover === 'align' && (
                <motion.div {...popoverMotionUp} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 grid grid-cols-3 gap-1">
                  <button onClick={() => { onAlign('left'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center" title="Align Left"><AlignLeft size={14} /></button>
                  <button onClick={() => { onAlign('center'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center" title="Align Center"><AlignCenter size={14} /></button>
                  <button onClick={() => { onAlign('right'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center" title="Align Right"><AlignRight size={14} /></button>
                  <button onClick={() => { onAlign('top'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center" title="Align Top"><ArrowUp size={14} /></button>
                  <button onClick={() => { onAlign('middle'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center text-[10px] font-bold">MID</button>
                  <button onClick={() => { onAlign('bottom'); setActivePopover(null); }} className="p-2 hover:bg-slate-100 rounded flex justify-center" title="Align Bottom"><ArrowDown size={14} /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        <button onClick={() => onMove('up')} title="Bring Forward" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowUp size={16} strokeWidth={2.5} /></button>
        <button onClick={() => onMove('down')} title="Send Backward" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowDown size={16} strokeWidth={2.5} /></button>
        
        <button onClick={onDelete} title="Delete" className="p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition ml-1"><Trash2 size={16} strokeWidth={2.5} /></button>
      </div>
      )}
    </div>
  );
}