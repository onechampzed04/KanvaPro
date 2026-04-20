// components/TextToolbar.tsx
import React from 'react';
import { Bold, Italic, Underline, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface TextToolbarProps {
  element: any;
  onUpdate: (newAttrs: any) => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
  fontList: string[];
}

export default function TextToolbar({ element, onUpdate, onDelete, onMove, fontList }: TextToolbarProps) {
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
    <div className="flex items-center gap-4 w-full bg-white h-full overflow-x-auto no-scrollbar">
      {/* CHỈ HIỂN THỊ FONT & STYLING NẾU LÀ TEXT */}
      {element.type === 'text' && (
        <>
          <div className="flex items-center border-r pr-3 gap-2 shrink-0">
            <select value={element.fontFamily || 'Arial'} onChange={(e) => handleChange('fontFamily', e.target.value)} className="text-xs border border-gray-200 rounded p-1 w-32 font-medium">
              {fontList.map(f => (<option key={f} value={f} style={{ fontFamily: f }}>{f}</option>))}
            </select>
            <input type="number" value={Math.round(element.fontSize)} onChange={(e) => handleChange('fontSize', parseInt(e.target.value))} className="w-12 text-xs border border-gray-200 rounded p-1" />
          </div>

          <div className="flex items-center border-r pr-3 gap-1 shrink-0">
            <button onClick={() => toggleStyle('bold')} className={`p-1.5 rounded transition ${element.fontStyle?.includes('bold') ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100'}`}><Bold size={16} /></button>
            <button onClick={() => toggleStyle('italic')} className={`p-1.5 rounded transition ${element.fontStyle?.includes('italic') ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100'}`}><Italic size={16} /></button>
            <button onClick={() => handleChange('textDecoration', element.textDecoration === 'underline' ? '' : 'underline')} className={`p-1.5 rounded transition ${element.textDecoration === 'underline' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100'}`}><Underline size={16} /></button>
          </div>
        </>
      )}

      {/* MÀU SẮC DÀNH CHO CẢ TEXT VÀ SHAPE */}
      <div className="flex items-center border-r pr-3 gap-4 shrink-0">
        <div className="flex items-center gap-1">
           <input type="color" value={element.fill || '#000000'} onChange={(e) => handleChange('fill', e.target.value)} className="w-6 h-6 p-0 border-none cursor-pointer bg-transparent" />
           <span className="text-[10px] font-bold">Fill</span>
        </div>
      </div>

      {/* VỊ TRÍ, LAYER VÀ XÓA: CHO MỌI ELEMENT */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <button onClick={() => onMove('up')} title="Bring Forward" className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"><ArrowUp size={16} /></button>
        <button onClick={() => onMove('down')} title="Send Backward" className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"><ArrowDown size={16} /></button>
        <div className="w-[1px] h-6 bg-gray-200 mx-1"></div>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-50 text-red-500 rounded transition"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}