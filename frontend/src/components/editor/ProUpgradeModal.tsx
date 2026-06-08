// src/components/editor/ProUpgradeModal.tsx
// Modal upsell tính năng Pro — hiển thị khi user Free cố dùng tính năng Pro

import React from 'react';
import { Crown, Sparkles, Zap, ImageOff, Star, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProUpgradeModalProps {
  featureName: string;        // "AI Image Generator" | "Remove Background" | "Pro Sticker"
  featureDescription?: string;
  onClose: () => void;
}

const FEATURE_PERKS = [
  { icon: Sparkles, text: 'Tạo ảnh bằng AI không giới hạn' },
  { icon: ImageOff, text: 'Xóa nền tự động 1 click' },
  { icon: Star, text: 'Hàng nghìn Sticker Pro độc quyền' },
  { icon: Zap, text: 'Export chất lượng cao (4K)' },
];

export default function ProUpgradeModal({ featureName, featureDescription, onClose }: ProUpgradeModalProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(145deg, #0f0f1a 0%, #1a1028 100%)',
        borderRadius: 24,
        padding: '40px 36px',
        maxWidth: 440,
        width: '100%',
        border: '1px solid rgba(139,92,246,0.3)',
        boxShadow: '0 32px 80px rgba(99,102,241,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
        animation: 'proModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <style>{`
          @keyframes proModalIn {
            from { opacity: 0; transform: scale(0.85) translateY(20px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes crownFloat {
            0%, 100% { transform: translateY(0) rotate(-5deg); }
            50%       { transform: translateY(-8px) rotate(5deg); }
          }
        `}</style>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.06)', border: 'none',
            borderRadius: 10, padding: 8, cursor: 'pointer', color: '#64748b',
            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#f1f5f9'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#64748b'; }}
        >
          <X size={16} />
        </button>

        {/* Crown icon */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f97316)',
            boxShadow: '0 8px 32px rgba(245,158,11,0.4)',
            animation: 'crownFloat 3s ease-in-out infinite',
          }}>
            <Crown size={36} color="white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.15))',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 100, padding: '4px 12px',
            fontSize: 11, fontWeight: 800, color: '#fbbf24',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            <Crown size={10} /> Tính năng Pro
          </div>
          <h2 style={{
            color: 'white', fontSize: 22, fontWeight: 900, margin: 0,
            background: 'linear-gradient(135deg, #fff 0%, #c4b5fd 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {featureName}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            {featureDescription || `Tính năng này chỉ dành cho tài khoản Pro. Nâng cấp để mở khóa ngay!`}
          </p>
        </div>

        {/* Perks */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 14, padding: '16px 20px',
          border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 24, marginTop: 20,
        }}>
          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Pro bao gồm
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURE_PERKS.map(({ icon: Icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={13} color="#a78bfa" />
                </div>
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { onClose(); navigate('/pricing'); }}
            style={{
              width: '100%', padding: '14px 24px',
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              border: 'none', borderRadius: 14, cursor: 'pointer',
              color: 'white', fontSize: 14, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(245,158,11,0.5)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,158,11,0.35)'; }}
          >
            <Crown size={16} /> Nâng cấp lên Pro <ArrowRight size={16} />
          </button>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px 24px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, cursor: 'pointer',
              color: '#64748b', fontSize: 13, fontWeight: 700,
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.color = '#f1f5f9'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseOut={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            Có thể dùng sau
          </button>
        </div>
      </div>
    </div>
  );
}
