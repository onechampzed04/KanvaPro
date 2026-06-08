// src/components/editor/LayerPanel.tsx
// [FIX Vấn đề 5 - NÂNG CẤP]: Thay thế windowing thủ công bằng @tanstack/react-virtual v3.
//
// TRƯỚC: Cài đặt thủ công (manual scrollTop + translateY) — dễ sai, khó maintain.
// SAU:   useVirtualizer từ @tanstack/react-virtual v3 — headless, zero-CSS-footprint,
//        tự động tính toán overscan, stable item keys, smooth cuộn.
//
// Kết quả: Chỉ render ~15 DOM nodes bất kể có bao nhiêu layer.
//          Giảm 95%+ chi phí DOM/Reflow khi cuộn danh sách layer có 200+ phần tử.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Eye, EyeOff, Lock, Unlock, Type, ImageIcon, Shapes, Minus, Layers, GripVertical } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
// Chiều cao cố định mỗi row — PHẢI là giá trị tĩnh để useVirtualizer tính đúng offset.
const ITEM_HEIGHT = 44; // px

// ─── Props ────────────────────────────────────────────────────────────────────
interface LayerPanelProps {
  elements: any[];
  selectedIds: string[];
  onSelectElement: (id: string, multi?: boolean) => void;
  onReorder: (newElements: any[], movedId?: string, afterId?: string | null) => void;
  onUpdateElement: (el: any) => void;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
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
    text: '#8b5cf6', image: '#0ea5e9', sticker: '#f59e0b',
    rect: '#10b981', circle: '#ec4899', line: '#64748b',
  };
  return map[type] || '#94a3b8';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LayerPanel({ elements, selectedIds, onSelectElement, onReorder, onUpdateElement }: LayerPanelProps) {
  // Layers hiển thị theo thứ tự z-index đảo ngược (top layer trước)
  const layersDesc = [...elements].reverse();

  // ── [FIX 5] Scroll container ref — useVirtualizer cần biết phần tử chứa cuộn ──
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // ── [FIX 5] useVirtualizer — thư viện tự tính toán range items cần render ──
  // count       : tổng số items trong danh sách
  // getScrollElement: getter trả về DOM element chứa thanh cuộn
  // estimateSize: hàm ước tính chiều cao 1 item (fixed => hằng số, biến động => hàm đo thực)
  // overscan    : số item đệm trên/dưới viewport để tránh nhấp nháy khi cuộn nhanh
  const rowVirtualizer = useVirtualizer({
    count: layersDesc.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // ── Drag-to-Reorder State ────────────────────────────────────────────────────
  const dragSrcIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, actualIndex: number) => {
    dragSrcIndexRef.current = actualIndex;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, actualIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndexRef.current = actualIndex;
    // Thêm visual feedback bằng classList thủ công để tránh re-render khi cuộn
    document.querySelectorAll('[data-layer-row]').forEach(el => {
      (el as HTMLElement).style.borderTop = '';
    });
    const hovered = document.querySelector(`[data-layer-row="${actualIndex}"]`) as HTMLElement;
    if (hovered) hovered.style.borderTop = '2px solid #6366f1';
  }, []);

  const handleDragLeave = useCallback(() => {
    document.querySelectorAll('[data-layer-row]').forEach(el => {
      (el as HTMLElement).style.borderTop = '';
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    handleDragLeave();
    const srcIndex = dragSrcIndexRef.current;
    if (srcIndex === null || srcIndex === dropIndex) return;

    const newLayersDesc = [...layersDesc];
    const [moved] = newLayersDesc.splice(srcIndex, 1);
    newLayersDesc.splice(dropIndex, 0, moved);

    // afterId dùng cho OT MoveElement op
    const afterId = dropIndex === newLayersDesc.length - 1 ? null : newLayersDesc[dropIndex + 1].id;

    const reorderedEls = [...newLayersDesc].reverse().map((el, idx) => ({ ...el, z_index: idx }));
    onReorder(reorderedEls, moved.id, afterId);
    dragSrcIndexRef.current = null;
    dragOverIndexRef.current = null;
  }, [layersDesc, onReorder, handleDragLeave]);

  const handleDragEnd = useCallback(() => {
    handleDragLeave();
    dragSrcIndexRef.current = null;
    dragOverIndexRef.current = null;
  }, [handleDragLeave]);

  // ── Toggle handlers ──────────────────────────────────────────────────────────
  const toggleVisible = useCallback((el: any) => {
    onUpdateElement({ ...el, visible: el.visible === false ? true : false });
  }, [onUpdateElement]);

  const toggleLocked = useCallback((el: any) => {
    onUpdateElement({ ...el, locked: !el.locked });
  }, [onUpdateElement]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <Layers size={15} className="text-indigo-500" />
        <span className="text-xs font-bold text-slate-700">Layers</span>
        <span className="ml-auto text-[10px] text-slate-400 font-medium">
          {elements.length} objects
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50/80 border-b border-slate-100 shrink-0">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex-1">Layer</span>
        <Eye size={10} className="text-slate-300" />
        <Lock size={10} className="text-slate-300 ml-1" />
      </div>

      {/* [FIX Vấn đề 5] @tanstack/react-virtual — Virtualized Layer List ────── */}
      {elements.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center px-4">
          <Layers size={24} className="text-slate-200 mb-2" />
          <p className="text-[11px] text-slate-400">Chưa có element nào</p>
        </div>
      ) : (
        // Scroll container: cung cấp cho useVirtualizer qua getScrollElement()
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/*
            Wrapper nội tuyến: chiều cao = tổng TẤT CẢ items (dù chỉ render một phần).
            Đây là kỹ thuật "phantom height" — giữ thanh cuộn đúng tỉ lệ.
          */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {/*
              getVirtualItems() trả về CHÍNH XÁC các items trong viewport + overscan.
              Mỗi item có .index (index gốc trong mảng) và .start (offset px từ top).
            */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const el = layersDesc[virtualRow.index];
              if (!el) return null;

              const actualIndex = virtualRow.index;
              const isSelected = selectedIds.includes(el.id);
              const isHidden = el.visible === false;
              const isLocked = el.locked === true;
              const color = getLayerColor(el.type);

              return (
                <div
                  key={el.id}
                  // data-layer-row: dùng bởi drag handler để thêm border-top visual
                  data-layer-row={actualIndex}
                  draggable
                  onDragStart={(e) => handleDragStart(e, actualIndex)}
                  onDragOver={(e) => handleDragOver(e, actualIndex)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, actualIndex)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => onSelectElement(el.id, e.ctrlKey || e.metaKey)}
                  style={{
                    // position: absolute + transform: translateY là chuẩn của @tanstack/react-virtual
                    // Mỗi item được đặt chính xác tại offset .start từ đỉnh container
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    boxSizing: 'border-box',
                    padding: '2px 8px',
                  }}
                >
                  <div
                    className={[
                      'flex items-center gap-2 px-3 rounded-lg cursor-pointer select-none transition-all h-full',
                      isSelected
                        ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                        : 'hover:bg-slate-50 border border-transparent',
                      isHidden ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    {/* Drag handle */}
                    <GripVertical size={12} className="shrink-0 text-slate-300 cursor-grab active:cursor-grabbing" />

                    {/* Color dot + icon */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className={isSelected ? 'text-indigo-500' : 'text-slate-400'}>
                        {getLayerIcon(el.type)}
                      </span>
                    </div>

                    {/* Label */}
                    <span className={[
                      'flex-1 text-[11px] font-medium truncate',
                      isSelected ? 'text-indigo-700 font-semibold' : 'text-slate-600',
                      isHidden ? 'line-through' : '',
                    ].join(' ')}>
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-slate-100 shrink-0">
        <p className="text-[10px] text-slate-400 text-center">
          Kéo thả để đổi thứ tự lớp
          {elements.length > 20 && (
            <span className="ml-1 text-indigo-400 font-semibold">
              · Ảo hóa ({elements.length} layers)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
