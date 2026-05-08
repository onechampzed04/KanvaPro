// src/components/ElementToolbar.tsx
import React from 'react';
import { Bold, Italic, Underline, ArrowUp, ArrowDown, Trash2, Layers, Zap, Eraser } from 'lucide-react';

interface ElementToolbarProps {
  element: any;
  onUpdate: (newAttrs: any) => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
  fontList: string[];
  onTogglePosition: () => void;
  onToggleAnimate: () => void;
  onRemoveBackground?: (element: any) => void;
}

export default function ElementToolbar({ element, onUpdate, onDelete, onMove, fontList, onTogglePosition, onToggleAnimate, onRemoveBackground }: ElementToolbarProps) {
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

  return (
    // Đã thay đổi class ở đây thành dạng bong bóng nổi
    <div className="flex items-center gap-3 px-5 py-2.5 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/80 rounded-2xl pointer-events-auto transition-all">
      
      {/* 1. CÔNG CỤ CHO TEXT */}
      {element.type === 'text' && (
        <>
          <div className="flex items-center border-r border-slate-200 pr-4 gap-2 shrink-0">
            <select value={element.fontFamily || 'Arial'} onChange={(e) => handleChange('fontFamily', e.target.value)} className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1.5 px-2 w-32 font-bold text-slate-700 outline-none transition cursor-pointer">
              {fontList.map(f => (<option key={f} value={f} style={{ fontFamily: f }}>{f}</option>))}
            </select>
            <input type="number" value={Math.round(element.fontSize)} onChange={(e) => handleChange('fontSize', parseInt(e.target.value))} className="w-14 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1.5 px-2 outline-none text-center transition" />
          </div>
          <div className="flex items-center border-r border-slate-200 pr-4 gap-1 shrink-0">
            <button onClick={() => toggleStyle('bold')} className={`p-2 rounded-lg transition ${element.fontStyle?.includes('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Bold size={16} strokeWidth={2.5} /></button>
            <button onClick={() => toggleStyle('italic')} className={`p-2 rounded-lg transition ${element.fontStyle?.includes('italic') ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Italic size={16} strokeWidth={2.5} /></button>
            <button onClick={() => handleChange('textDecoration', element.textDecoration === 'underline' ? '' : 'underline')} className={`p-2 rounded-lg transition ${element.textDecoration === 'underline' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Underline size={16} strokeWidth={2.5} /></button>
          </div>
        </>
      )}

      {/* 2. CÔNG CỤ CHO IMAGE / STICKER */}
      {(element.type === 'image' || element.type === 'sticker') && (
        <div className="flex items-center border-r border-slate-200 pr-4 shrink-0">
          <button onClick={() => onRemoveBackground?.(element)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-100 to-indigo-100 text-indigo-700 hover:from-purple-200 hover:to-indigo-200 rounded-xl transition text-xs font-extrabold shadow-sm">
            <Eraser size={14} strokeWidth={2.5} /> BG Remover
          </button>
        </div>
      )}

      {/* 3. CÔNG CỤ CHUNG (Dành cho mọi Element) */}
      <div className="flex items-center border-r border-slate-200 pr-4 gap-2 shrink-0">
         {(element.type === 'text' || element.type === 'rect' || element.type === 'circle') && (
            <div className="flex items-center gap-1 mr-2">
              <input type="color" value={element.fill || '#000000'} onChange={(e) => handleChange('fill', e.target.value)} className="w-8 h-8 p-0 border border-slate-200 rounded cursor-pointer overflow-hidden shadow-sm" />
            </div>
         )}
         <button onClick={onToggleAnimate} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-amber-50 hover:text-amber-700 rounded-xl transition text-xs font-bold text-slate-600 border border-transparent hover:border-amber-200">
            <Zap size={16} className="text-amber-500" strokeWidth={2.5} /> Animate
         </button>
         <button onClick={onTogglePosition} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition text-xs font-bold text-slate-600 border border-transparent hover:border-blue-200">
            <Layers size={16} className="text-blue-500" strokeWidth={2.5} /> Position
         </button>
      </div>

      {/* 4. VỊ TRÍ, LAYER VÀ XÓA */}
      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        <button onClick={() => onMove('up')} title="Bring Forward" className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowUp size={18} strokeWidth={2.5} /></button>
        <button onClick={() => onMove('down')} title="Send Backward" className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition"><ArrowDown size={18} strokeWidth={2.5} /></button>
        <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
        <button onClick={onDelete} title="Delete Element" className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition"><Trash2 size={18} strokeWidth={2.5} /></button>
      </div>
    </div>
  );
}