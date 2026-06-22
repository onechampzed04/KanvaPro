// src/components/editor/CropOverlay.tsx
// Modal panel bên phải — KHÔNG phải full-screen overlay (tránh chặn click canvas)
// Giao diện tương tự VersionHistoryModal

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Check, X, RotateCcw, Crop } from 'lucide-react';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayProps {
  element: any;
  onApply: (cropRect: CropRect) => void;
  onCancel: () => void;
  onReset: () => void;
}

type Handle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'move';

const PREVIEW_W = 380; // chiều rộng vùng preview trong panel

export default function CropOverlay({ element, onApply, onCancel, onReset }: CropOverlayProps) {
  const imgW = element.width || 200;
  const imgH = element.height || 200;
  const MAX_PREVIEW_W = 380;
  const MAX_PREVIEW_H = 340;

  // Tính scale để toàn bộ ảnh nằm gọn trong MAX_PREVIEW_W x MAX_PREVIEW_H (như object-fit: contain)
  const scale = Math.min(MAX_PREVIEW_W / imgW, MAX_PREVIEW_H / imgH);
  
  const previewW = imgW * scale;
  const previewH = imgH * scale;

  const initial: CropRect = element.cropRect
    ? { ...element.cropRect }
    : { x: 0, y: 0, width: imgW, height: imgH };

  const [crop, setCrop] = useState<CropRect>(initial);
  const dragRef = useRef<{ type: Handle; sx: number; sy: number; sc: CropRect } | null>(null);
  const MIN = 20 / scale;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onApply(crop);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [crop, onApply, onCancel]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const r = dragRef.current.sc;
    // convert screen px → canvas px
    const cdx = dx / scale;
    const cdy = dy / scale;

    let { x, y, width, height } = { ...r };
    const type = dragRef.current.type;

    switch (type) {
      case 'move':
        x = Math.max(0, Math.min(imgW - width, r.x + cdx));
        y = Math.max(0, Math.min(imgH - height, r.y + cdy));
        break;
      case 'tl':
        x = Math.max(0, Math.min(r.x + r.width - MIN, r.x + cdx));
        y = Math.max(0, Math.min(r.y + r.height - MIN, r.y + cdy));
        width = r.width - (x - r.x); height = r.height - (y - r.y);
        break;
      case 'tc':
        y = Math.max(0, Math.min(r.y + r.height - MIN, r.y + cdy));
        height = r.height - (y - r.y);
        break;
      case 'tr':
        y = Math.max(0, Math.min(r.y + r.height - MIN, r.y + cdy));
        width = Math.max(MIN, Math.min(imgW - r.x, r.width + cdx));
        height = r.height - (y - r.y);
        break;
      case 'ml':
        x = Math.max(0, Math.min(r.x + r.width - MIN, r.x + cdx));
        width = r.width - (x - r.x);
        break;
      case 'mr':
        width = Math.max(MIN, Math.min(imgW - r.x, r.width + cdx));
        break;
      case 'bl':
        x = Math.max(0, Math.min(r.x + r.width - MIN, r.x + cdx));
        width = r.width - (x - r.x);
        height = Math.max(MIN, Math.min(imgH - r.y, r.height + cdy));
        break;
      case 'bc':
        height = Math.max(MIN, Math.min(imgH - r.y, r.height + cdy));
        break;
      case 'br':
        width = Math.max(MIN, Math.min(imgW - r.x, r.width + cdx));
        height = Math.max(MIN, Math.min(imgH - r.y, r.height + cdy));
        break;
    }
    setCrop({ x, y, width, height });
  }, [scale, imgW, imgH, MIN]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    // Note: We'll remove these by named reference if needed, 
    // but the easiest way to avoid closure issues is to define them directly or use standard removal.
  }, []);

  const startDrag = (type: Handle, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    dragRef.current = { type, sx: e.clientX, sy: e.clientY, sc: { ...crop } };
    
    // Define stable handlers for the drag session
    const handleMove = (ev: MouseEvent) => {
      onMouseMove(ev);
    };
    
    const handleUp = (ev: MouseEvent) => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  // tọa độ preview (px trong preview box)
  const px = crop.x * scale;
  const py = crop.y * scale;
  const pw = crop.width * scale;
  const ph = crop.height * scale;

  const HS = 10; // handle size

  const handles: { id: Handle; top: number; left: number; cursor: string }[] = [
    { id: 'tl', top: py - HS / 2, left: px - HS / 2, cursor: 'nwse-resize' },
    { id: 'tc', top: py - HS / 2, left: px + pw / 2 - HS / 2, cursor: 'ns-resize' },
    { id: 'tr', top: py - HS / 2, left: px + pw - HS / 2, cursor: 'nesw-resize' },
    { id: 'ml', top: py + ph / 2 - HS / 2, left: px - HS / 2, cursor: 'ew-resize' },
    { id: 'mr', top: py + ph / 2 - HS / 2, left: px + pw - HS / 2, cursor: 'ew-resize' },
    { id: 'bl', top: py + ph - HS / 2, left: px - HS / 2, cursor: 'nesw-resize' },
    { id: 'bc', top: py + ph - HS / 2, left: px + pw / 2 - HS / 2, cursor: 'ns-resize' },
    { id: 'br', top: py + ph - HS / 2, left: px + pw - HS / 2, cursor: 'nwse-resize' },
  ];

  const thirds = [1 / 3, 2 / 3];

  return (
    <>
      {/* Backdrop mờ nhẹ ở bên trái, KHÔNG chặn click hoàn toàn */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 490,
          background: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel bên phải */}
      <div style={{
        position: 'fixed', top: 56, right: 0, bottom: 0,
        width: 440, zIndex: 500,
        background: 'rgba(15,15,25,0.97)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Crop size={16} color="white" />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>Crop Image</div>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>
                Kéo khung để chọn vùng giữ lại
              </div>
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none',
            borderRadius: 8, padding: 8, cursor: 'pointer', color: '#64748b',
            display: 'flex', alignItems: 'center',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {/* Image preview container */}
            <div style={{
              position: 'relative',
              width: previewW, height: previewH,
              margin: '0 auto',
              userSelect: 'none',
            }}>
              {/* Ảnh gốc */}
              <img
                src={element.src}
                alt=""
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'fill',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              />

              {/* Phần tối ngoài vùng crop */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {/* top */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: py, background: 'rgba(0,0,0,0.55)' }} />
                {/* bottom */}
                <div style={{ position: 'absolute', top: py + ph, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)' }} />
                {/* left */}
                <div style={{ position: 'absolute', top: py, left: 0, width: px, height: ph, background: 'rgba(0,0,0,0.55)' }} />
                {/* right */}
                <div style={{ position: 'absolute', top: py, left: px + pw, right: 0, height: ph, background: 'rgba(0,0,0,0.55)' }} />
              </div>

              {/* Khung crop + drag-to-move */}
              <div
                onMouseDown={(e) => startDrag('move', e)}
                style={{
                  position: 'absolute',
                  left: px, top: py, width: pw, height: ph,
                  border: '2px solid rgba(255,255,255,0.9)',
                  boxSizing: 'border-box',
                  cursor: 'move',
                }}
              >
                {/* Rule of thirds */}
                {thirds.map(t => (
                  <React.Fragment key={t}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${t * 100}%`, width: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: `${t * 100}%`, height: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                  </React.Fragment>
                ))}
                {/* Corner brackets */}
                {[
                  { s: { top: 0, left: 0 }, bt: '3px solid white', bl: '3px solid white', br: '4px 0 0 0' },
                  { s: { top: 0, right: 0 }, bt: '3px solid white', br_r: '3px solid white', br: '0 4px 0 0' },
                  { s: { bottom: 0, left: 0 }, bb: '3px solid white', bl: '3px solid white', br: '0 0 0 4px' },
                  { s: { bottom: 0, right: 0 }, bb: '3px solid white', br_r: '3px solid white', br: '0 0 4px 0' },
                ].map((c, i) => (
                  <div key={i} style={{
                    position: 'absolute', width: 16, height: 16, ...c.s,
                    borderTop: (c as any).bt, borderBottom: (c as any).bb,
                    borderLeft: (c as any).bl, borderRight: (c as any).br_r,
                    borderRadius: c.br, pointerEvents: 'none',
                  }} />
                ))}
              </div>

              {/* 8 handles */}
              {handles.map(h => (
                <div
                  key={h.id}
                  onMouseDown={(e) => startDrag(h.id, e)}
                  style={{
                    position: 'absolute',
                    top: h.top, left: h.left,
                    width: HS, height: HS,
                    background: 'white',
                    border: '2px solid #6366f1',
                    borderRadius: 2,
                    cursor: h.cursor,
                    zIndex: 10,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Crop info */}
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Vùng crop
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'X', val: Math.round(crop.x) },
                { label: 'Y', val: Math.round(crop.y) },
                { label: 'Rộng', val: Math.round(crop.width) },
                { label: 'Cao', val: Math.round(crop.height) },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px',
                }}>
                  <div style={{ color: '#475569', fontSize: 10, fontWeight: 700 }}>{item.label}</div>
                  <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, marginTop: 2 }}>{item.val}px</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, color: '#475569', fontSize: 11, textAlign: 'center' }}>
            Nhấn <kbd style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 6px', color: '#94a3b8' }}>Enter</kbd> để áp dụng &nbsp;·&nbsp;
            <kbd style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 6px', color: '#94a3b8' }}>Esc</kbd> để hủy
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onReset}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#f1f5f9'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={() => onApply(crop)}
            style={{
              flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: 'white', fontSize: 13, fontWeight: 800,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <Check size={15} /> Áp dụng Crop
          </button>
        </div>
      </div>
    </>
  );
}
