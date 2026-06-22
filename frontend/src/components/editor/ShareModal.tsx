// src/components/editor/ShareModal.tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Copy, Check, Globe, Lock, UserPlus, ChevronDown,
  Trash2, Crown, Pencil, MessageSquare, Eye, Loader2
} from 'lucide-react';
import {
  fetchDesignShares, shareDesign, updateShareRole,
  removeShare, togglePublicLink, fetchShareLink
} from '../../api/api';

// =============================================
// TYPES
// =============================================
type ShareRole = 'editor' | 'viewer';

interface SharePerson {
  user_id: string;
  role: ShareRole;
  name: string;
  email: string;
  avatar_url?: string;
}

interface ShareOwner {
  user_id: string;
  role: 'owner';
  name: string;
  email: string;
  avatar_url?: string;
}

interface ShareModalProps {
  designId: string;
  currentRole: 'owner' | 'editor' | 'viewer';
  onClose: () => void;
}

// =============================================
// ROLE CONFIG
// =============================================
const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  owner:     { label: 'Owner',     icon: <Crown size={13} />,         color: 'text-amber-500',  desc: 'Toàn quyền' },
  editor:    { label: 'Editor',    icon: <Pencil size={13} />,        color: 'text-indigo-500', desc: 'Chỉnh sửa bản vẽ' },
  viewer:    { label: 'Viewer',    icon: <Eye size={13} />,           color: 'text-slate-500',  desc: 'Chỉ xem' },
};

// =============================================
// SUB-COMPONENTS
// =============================================

/** Avatar với chữ cái đầu nếu không có ảnh */
function Avatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl?: string; size?: number }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500'];
  const color = colors[initials.charCodeAt(0) % colors.length];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl} alt={name}
        className={`w-${size} h-${size} rounded-full object-cover ring-2 ring-white/20 shrink-0`}
      />
    );
  }
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white/20`}>
      {initials}
    </div>
  );
}

/** Dropdown chọn role */
function RoleDropdown({
  currentRole, userId, isOwner, onUpdate, onRemove, disabled = false
}: {
  currentRole: ShareRole;
  userId: string;
  isOwner: boolean;
  onUpdate: (userId: string, role: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const config = ROLE_CONFIG[currentRole];

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!isOwner || disabled) {
    return (
      <span className={`flex items-center gap-1 text-xs font-semibold ${config.color} px-2 py-1 bg-white/10 rounded-lg`}>
        {config.icon}{config.label}
      </span>
    );
  }

  const handleSelect = async (role: string) => {
    setOpen(false);
    setLoading(true);
    try { await onUpdate(userId, role); } finally { setLoading(false); }
  };

  const handleRemove = async () => {
    setOpen(false);
    setLoading(true);
    try { await onRemove(userId); } finally { setLoading(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className={`flex items-center gap-1.5 text-xs font-semibold ${config.color} px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all border border-white/10 hover:border-white/20`}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : config.icon}
        {config.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {(['editor', 'viewer'] as ShareRole[]).map(r => {
              const rc = ROLE_CONFIG[r];
              return (
                <button
                  key={r}
                  onClick={() => handleSelect(r)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/10 transition text-left ${r === currentRole ? 'bg-white/5' : ''}`}
                >
                  <span className={`mt-0.5 ${rc.color}`}>{rc.icon}</span>
                  <div>
                    <div className={`text-xs font-bold ${rc.color}`}>{rc.label}</div>
                    <div className="text-[10px] text-slate-400">{rc.desc}</div>
                  </div>
                  {r === currentRole && <Check size={12} className="ml-auto mt-0.5 text-white/60 shrink-0" />}
                </button>
              );
            })}
            <div className="border-t border-white/10 mx-2" />
            <button
              onClick={handleRemove}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-rose-400 hover:bg-rose-500/10 transition text-xs font-semibold"
            >
              <Trash2 size={12} /> Gỡ quyền truy cập
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Dropdown chọn role khi invite (giống hệt css của RoleDropdown) */
function InviteRoleDropdown({
  currentRole, onChange
}: {
  currentRole: ShareRole;
  onChange: (role: ShareRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const config = ROLE_CONFIG[currentRole];

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleSelect = (role: ShareRole) => {
    setOpen(false);
    onChange(role);
  };

  return (
    <div className="relative h-full flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-full flex items-center justify-between min-w-[120px] gap-2 text-sm font-semibold ${config.color} px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 hover:border-white/20 whitespace-nowrap`}
      >
        <span className="flex items-center gap-1.5">
          {config.icon}
          {config.label}
        </span>
        <ChevronDown size={14} className={`transition-transform text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-[calc(100%+8px)] w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {(['editor', 'viewer'] as ShareRole[]).map(r => {
              const rc = ROLE_CONFIG[r];
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => handleSelect(r)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/10 transition text-left ${r === currentRole ? 'bg-white/5' : ''}`}
                >
                  <span className={`mt-0.5 ${rc.color}`}>{rc.icon}</span>
                  <div>
                    <div className={`text-xs font-bold ${rc.color}`}>{rc.label}</div>
                    <div className="text-[10px] text-slate-400">{rc.desc}</div>
                  </div>
                  {r === currentRole && <Check size={12} className="ml-auto mt-0.5 text-white/60 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function ShareModal({ designId, currentRole, onClose }: ShareModalProps) {
  const isOwner = currentRole === 'owner';

  const [shares, setShares] = useState<SharePerson[]>([]);
  const [owner, setOwner] = useState<ShareOwner | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareRole>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [copied, setCopied] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sharesData, linkData] = await Promise.all([
          fetchDesignShares(designId),
          fetchShareLink(designId).catch(() => ({ link: window.location.href }))
        ]);
        setShares(sharesData.shares || []);
        setOwner(sharesData.owner || null);
        setIsPublic(sharesData.is_public || false);
        setShareLink(linkData.link || window.location.href);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [designId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);
    try {
      await shareDesign(designId, inviteEmail.trim(), inviteRole);
      setInviteSuccess(`Đã chia sẻ với ${inviteEmail}`);
      setInviteEmail('');
      // Reload shares
      const data = await fetchDesignShares(designId);
      setShares(data.shares || []);
    } catch (err: any) {
      setInviteError(err.message || 'Lỗi khi chia sẻ');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    await updateShareRole(designId, userId, role);
    setShares(prev => prev.map(s => s.user_id === userId ? { ...s, role: role as ShareRole } : s));
  };

  const handleRemoveShare = async (userId: string) => {
    await removeShare(designId, userId);
    setShares(prev => prev.filter(s => s.user_id !== userId));
  };

  const handleTogglePublic = async () => {
    setToggleLoading(true);
    try {
      const newVal = !isPublic;
      await togglePublicLink(designId, newVal);
      setIsPublic(newVal);
    } finally {
      setToggleLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none"
      >
        <div className="pointer-events-auto w-[520px] max-h-[85vh] bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">

          {/* HEADER */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <h2 className="text-base font-bold text-white">Chia sẻ bản vẽ</h2>
              <p className="text-xs text-slate-400 mt-0.5">Mời người cộng tác hoặc chia sẻ link</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar">

            {/* INVITE SECTION (chỉ Owner) */}
            {isOwner && (
              <div className="px-6 pt-5 pb-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Mời người dùng</p>
                <form onSubmit={handleInvite} className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                      placeholder="Nhập địa chỉ email..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:bg-white/8 transition"
                    />
                    {/* Role picker styled exactly like the bottom one */}
                    <InviteRoleDropdown 
                      currentRole={inviteRole}
                      onChange={(role) => setInviteRole(role)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviteLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Gửi lời mời
                  </button>

                  {inviteError && (
                    <p className="text-xs text-rose-400 font-medium">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <Check size={12} /> {inviteSuccess}
                    </p>
                  )}
                </form>
              </div>
            )}

            {/* DIVIDER */}
            <div className="mx-6 border-t border-white/10" />

            {/* PEOPLE WITH ACCESS */}
            <div className="px-6 py-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                Người có quyền truy cập
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="text-slate-400 animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Owner luôn ở đầu */}
                  {owner && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-amber-500/20">
                      <Avatar name={owner.name} avatarUrl={owner.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{owner.name}</p>
                        <p className="text-xs text-slate-400 truncate">{owner.email}</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                        <Crown size={11} /> Owner
                      </span>
                    </div>
                  )}

                  {/* Người được share */}
                  {shares.map(person => (
                    <div
                      key={person.user_id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition"
                    >
                      <Avatar name={person.name} avatarUrl={person.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                        <p className="text-xs text-slate-400 truncate">{person.email}</p>
                      </div>
                      <RoleDropdown
                        currentRole={person.role}
                        userId={person.user_id}
                        isOwner={isOwner}
                        onUpdate={handleUpdateRole}
                        onRemove={handleRemoveShare}
                      />
                    </div>
                  ))}

                  {shares.length === 0 && !loading && (
                    <p className="text-sm text-slate-500 text-center py-4 italic">
                      Chưa có ai được mời. Mời ngay!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* DIVIDER */}
            <div className="mx-6 border-t border-white/10" />

            {/* PUBLIC LINK SECTION */}
            <div className="px-6 py-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                Truy cập công khai
              </p>

              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPublic ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}`}>
                  {isPublic ? <Globe size={18} /> : <Lock size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {isPublic ? 'Bất kỳ ai có link đều có thể xem' : 'Chỉ người được mời mới xem được'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isPublic ? 'Người xem sẽ có quyền Viewer (chỉ xem)' : 'Bật để chia sẻ public link'}
                  </p>
                </div>
                {/* Toggle (chỉ Owner) */}
                {isOwner && (
                  <button
                    onClick={handleTogglePublic}
                    disabled={toggleLoading}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isPublic ? 'bg-emerald-500' : 'bg-slate-600'} ${toggleLoading ? 'opacity-50' : ''}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${isPublic ? 'left-7' : 'left-1'}`} />
                  </button>
                )}
              </div>

              {/* Copy Link */}
              {isPublic && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 flex gap-2"
                >
                  <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-slate-400 truncate font-mono">
                    {shareLink}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-white hover:bg-white/15 border border-white/10'}`}
                  >
                    {copied ? <><Check size={13} /> Đã sao chép</> : <><Copy size={13} /> Sao chép</>}
                  </button>
                </motion.div>
              )}
            </div>

          </div>

          {/* FOOTER — Role badge hiện tại */}
          <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Quyền của bạn trong file này:
            </p>
            <span className={`flex items-center gap-1.5 text-xs font-bold ${ROLE_CONFIG[currentRole]?.color} bg-white/5 px-2.5 py-1 rounded-lg border border-white/10`}>
              {ROLE_CONFIG[currentRole]?.icon}
              {ROLE_CONFIG[currentRole]?.label}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
