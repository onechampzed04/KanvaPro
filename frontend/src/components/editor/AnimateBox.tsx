// src/components/editor/AnimateBox.tsx
import { useState } from 'react';

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

interface AnimateBoxProps {
  selectedElement: any;
  updateElement: (el: any) => void;
  onClose: () => void;
}

export default function AnimateBox({ selectedElement, updateElement, onClose }: AnimateBoxProps) {
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');

  return (
    <div className="absolute left-4 top-6 w-72 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-slate-200 z-50 flex flex-col max-h-[70vh] overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
        <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Animations</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-rose-500 transition">✕</button>
      </div>

      {/* Tab In / Out */}
      <div className="px-4 pt-4 flex gap-2 shrink-0">
        <button
          onClick={() => setAnimTab('in')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${animTab === 'in' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}
        >
          Vào (In)
        </button>
        <button
          onClick={() => setAnimTab('out')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${animTab === 'out' ? 'bg-rose-100 text-rose-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}
        >
          Ra (Out)
        </button>
      </div>

      {/* Sync checkbox */}
      <div className="px-4 py-3 shrink-0 border-b border-slate-100 flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-600 hover:text-indigo-600 transition">
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
          Hiệu ứng Hiện &amp; Ẩn giống nhau
        </label>
        
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-slate-600">Thứ tự xuất hiện:</label>
          <input 
            type="number" 
            min="0"
            className="w-16 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-500"
            value={selectedElement.animationOrder || 0}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              updateElement({ ...selectedElement, animationOrder: Math.max(0, val) });
            }}
          />
        </div>
      </div>

      {/* Animation grid */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-2 gap-2">
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
                className={`py-2.5 px-1.5 text-[11px] leading-tight font-bold rounded-lg border transition-all ${
                  isActive
                    ? (animTab === 'in'
                        ? 'bg-indigo-100 border-indigo-500 text-indigo-700 shadow-sm'
                        : 'bg-rose-100 border-rose-500 text-rose-700 shadow-sm')
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-white hover:shadow-sm'
                }`}
              >
                {anim.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
