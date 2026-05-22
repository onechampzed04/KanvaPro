// src/components/editor/LayerPanel.tsx
// Professional Layer Panel — drag/drop z-index, eye toggle, lock toggle
import { useState, useRef } from 'react';
import { Eye, EyeOff, Lock, Unlock, Type, ImageIcon, Shapes, Minus, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, Reorder } from 'framer-motion';

interface LayerPanelProps {
  elements: any[];
  selectedIds: string[];
  onSelectElement: (id: string, multi?: boolean) => void;
  onReorder: (newElements: any[]) => void;
  onUpdateElement: (el: any) => void;
}

function getLayerIcon(type: string) {
  if (type === 'text') return <Type size={11} className="shrink-0" />;
  if (type === 'image' || type === 'sticker') return <ImageIcon size={11} className="shrink-0" />;
  if (type === 'line') return <Minus size={11} className="shrink-0 rotate-45" />;
  return <Shapes size={11} className="shrink-0" />;
}

function getLayerLabel(el: any): string {
  if (el.type === 'text') return (el.text || 'Text').slice(0, 26);
  if (el.type === 'image') return 'Image';
  if (el.type === 'sticker') return 'Sticker';
  if (el.type === 'rect') return 'Rectangle';
  if (el.type === 'circle') return 'Circle';
  if (el.type === 'line') return 'Line';
  return el.type || 'Element';
}

function getLayerColor(type: string): string {
  const map: Record<string, string> = {
    text: '#8b5cf6',
    image: '#0ea5e9',
    sticker: '#f59e0b',
    rect: '#10b981',
    circle: '#ec4899',
    line: '#64748b',
  };
  return map[type] || '#94a3b8';
}

export default function LayerPanel({ elements, selectedIds, onSelectElement, onReorder, onUpdateElement }: LayerPanelProps) {
  // Layers hiển thị theo thứ tự z-index đảo ngược (top layer trước)
  const layersDesc = [...elements].reverse();
  const [orderedIds, setOrderedIds] = useState<string[]>(() => layersDesc.map(e => e.id));

  // Sync when elements change externally
  const prevLen = useRef(elements.length);
  if (elements.length !== prevLen.current) {
    prevLen.current = elements.length;
    setOrderedIds([...elements].reverse().map(e => e.id));
  }

  const orderedLayers = orderedIds.map(id => elements.find(e => e.id === id)).filter(Boolean);

  const handleReorderCommit = (newIds: string[]) => {
    setOrderedIds(newIds);
    // Rebuild elements array với z_index mới (đảo ngược vì orderedIds là top→bottom)
    const reorderedEls = [...newIds].reverse().map((id, idx) => {
      const el = elements.find(e => e.id === id);
      return { ...el, z_index: idx };
    });
    onReorder(reorderedEls);
  };

  const toggleVisible = (el: any) => onUpdateElement({ ...el, visible: el.visible === false ? true : false });
  const toggleLocked = (el: any) => onUpdateElement({ ...el, locked: !el.locked });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <Layers size={15} className="text-indigo-500" />
        <span className="text-xs font-bold text-slate-700">Layers</span>
        <span className="ml-auto text-[10px] text-slate-400 font-medium">{elements.length} objects</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50/80 border-b border-slate-100 shrink-0">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex-1">Layer</span>
        <Eye size={10} className="text-slate-300" />
        <Lock size={10} className="text-slate-300 ml-1" />
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {elements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Layers size={24} className="text-slate-200 mb-2" />
            <p className="text-[11px] text-slate-400">Chưa có element nào</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={orderedIds} onReorder={handleReorderCommit} className="py-1">
            {orderedLayers.map((el, visualIdx) => {
              const isSelected = selectedIds.includes(el.id);
              const isHidden = el.visible === false;
              const isLocked = el.locked === true;
              const color = getLayerColor(el.type);

              return (
                <Reorder.Item key={el.id} value={el.id} className="list-none">
                  <motion.div
                    layout
                    onClick={(e) => onSelectElement(el.id, e.ctrlKey || e.metaKey)}
                    className={`flex items-center gap-2 px-3 py-2 mx-2 my-0.5 rounded-lg cursor-pointer transition-all select-none ${isSelected
                        ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                        : 'hover:bg-slate-50 border border-transparent'
                      } ${isHidden ? 'opacity-40' : ''}`}
                  >
                    {/* Color dot + icon */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className={isSelected ? 'text-indigo-500' : 'text-slate-400'}>
                        {getLayerIcon(el.type)}
                      </span>
                    </div>

                    {/* Label */}
                    <span className={`flex-1 text-[11px] font-medium truncate ${isSelected ? 'text-indigo-700 font-semibold' : 'text-slate-600'} ${isHidden ? 'line-through' : ''}`}>
                      {getLayerLabel(el)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <button
                        onClick={e => { e.stopPropagation(); toggleVisible(el); }}
                        className={`p-1 rounded transition ${isHidden ? 'text-slate-300 hover:text-slate-500' : 'text-slate-400 hover:text-indigo-500'}`}
                        title={isHidden ? 'Hiện element' : 'Ẩn element'}
                      >
                        {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); toggleLocked(el); }}
                        className={`p-1 rounded transition ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'}`}
                        title={isLocked ? 'Mở khóa' : 'Khóa element'}
                      >
                        {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  </motion.div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-2 border-t border-slate-100 shrink-0">
        <p className="text-[10px] text-slate-400 text-center">
          Kéo thả để đổi thứ tự lớp
        </p>
      </div>
    </div>
  );
}
