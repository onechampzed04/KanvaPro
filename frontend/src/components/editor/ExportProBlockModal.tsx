// src/components/editor/ExportProBlockModal.tsx
// Modal chặn export khi thiết kế chứa thành phần Pro mà user chưa nâng cấp

import React from 'react';
import { Crown, AlertTriangle, ArrowRight, X, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ProElement {
  id: string;
  name: string;       // "Sticker Pro", "AI Image", "Removed BG"
  reason: string;     // "is_premium" | "ai" | "remove_bg"
}

interface ExportProBlockModalProps {
  proElements: ProElement[];
  onClose: () => void;
  onRemoveElements: (ids: string[]) => void; // xóa các element vi phạm
}

const REASON_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  is_premium: { icon: '👑', label: 'Sticker Pro', color: '#f59e0b' },
  ai:         { icon: '✨', label: 'AI Image',    color: '#8b5cf6' },
  remove_bg:  { icon: '🪄', label: 'Xóa nền AI', color: '#06b6d4' },
  pro_font:   { icon: '🔤', label: 'Font Pro',    color: '#ec4899' },
};

export default function ExportProBlockModal({ proElements, onClose, onRemoveElements }: ExportProBlockModalProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(145deg, #0f0f1a 0%, #1a1028 100%)',
        borderRadius: 24, padding: '36px 32px', maxWidth: 480, width: '100%',
        border: '1px solid rgba(239,68,68,0.25)',
        boxShadow: '0 32px 80px rgba(239,68,68,0.15), 0 0 0 1px rgba(255,255,255,0.04)',
        fontFamily: 'Inter, sans-serif', position: 'relative',
        animation: 'blockModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <style>{`
          @keyframes blockModalIn {
            from { opacity:0; transform:scale(0.88) translateY(16px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
          }
        `}</style>

        {/* Close */}
        <button onClick={onClose} style={{
          position:'absolute', top:16, right:16,
          background:'rgba(255,255,255,0.06)', border:'none', borderRadius:10,
          padding:8, cursor:'pointer', color:'#64748b', display:'flex',
        }}>
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div style={{
            width:48, height:48, borderRadius:14,
            background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>
            <AlertTriangle size={24} color="#ef4444" />
          </div>
          <div>
            <div style={{ color:'#ef4444', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
              Không thể xuất file
            </div>
            <h2 style={{ color:'white', fontSize:17, fontWeight:900, margin:0 }}>
              Thiết kế chứa {proElements.length} thành phần cao cấp
            </h2>
          </div>
        </div>

        <p style={{ color:'#94a3b8', fontSize:13, lineHeight:1.6, marginBottom:20 }}>
          Nâng cấp lên <strong style={{ color:'#fbbf24' }}>KanvaPro</strong> để tải xuống thiết kế không dính Watermark, hoặc xóa các thành phần sau ra khỏi thiết kế:
        </p>

        {/* Element list */}
        <div style={{
          background:'rgba(255,255,255,0.04)',
          borderRadius:14, border:'1px solid rgba(255,255,255,0.06)',
          overflow:'hidden', marginBottom:20,
          maxHeight:200, overflowY:'auto',
        }}>
          {proElements.map((el, i) => {
            const meta = REASON_LABEL[el.reason] || { icon:'⭐', label: el.reason, color:'#64748b' };
            const isSel = selected.has(el.id);
            return (
              <div
                key={el.id}
                onClick={() => toggleSelect(el.id)}
                style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'10px 16px',
                  borderBottom: i < proElements.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  cursor:'pointer',
                  background: isSel ? 'rgba(239,68,68,0.1)' : 'transparent',
                  transition:'background 0.15s',
                }}
              >
                <input type="checkbox" checked={isSel} onChange={() => toggleSelect(el.id)}
                  style={{ width:14, height:14, accentColor:'#ef4444', cursor:'pointer' }} />
                <span style={{ fontSize:16 }}>{meta.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:'#e2e8f0', fontSize:13, fontWeight:600 }}>{el.name}</div>
                  <div style={{
                    display:'inline-flex', alignItems:'center', gap:4,
                    fontSize:10, fontWeight:800, color:meta.color,
                    background:`${meta.color}18`, borderRadius:4, padding:'1px 6px',
                    marginTop:2,
                  }}>
                    <Crown size={8} /> {meta.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button
            onClick={() => { onClose(); navigate('/pricing'); }}
            style={{
              width:'100%', padding:'13px', borderRadius:14, border:'none', cursor:'pointer',
              background:'linear-gradient(135deg,#f59e0b,#f97316)', color:'white',
              fontSize:14, fontWeight:900,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow:'0 8px 24px rgba(245,158,11,0.3)',
              transition:'all 0.2s',
            }}
            onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; }}
            onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; }}
          >
            <Crown size={15} /> Nâng cấp lên Pro <ArrowRight size={15} />
          </button>

          {selected.size > 0 && (
            <button
              onClick={() => { onRemoveElements(Array.from(selected)); onClose(); }}
              style={{
                width:'100%', padding:'12px', borderRadius:14,
                border:'1px solid rgba(239,68,68,0.3)', cursor:'pointer',
                background:'rgba(239,68,68,0.08)', color:'#ef4444',
                fontSize:13, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}
            >
              <Trash2 size={13} /> Xóa {selected.size} thành phần đã chọn
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              width:'100%', padding:'11px', borderRadius:14,
              border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer',
              background:'transparent', color:'#64748b', fontSize:13, fontWeight:700,
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
