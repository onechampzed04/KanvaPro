// src/pages/TeamsPage.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { Users, Plus, ChevronLeft, Crown, Shield, Eye, Trash2, Mail, Layout, FileText, X, Check, Video, Lock, AlertTriangle, Copy, ArrowRight, LogOut, RefreshCw, Settings, Upload, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { fetchMyTeams, createTeam, fetchTeamById, inviteTeamMember, removeTeamMember, createDesign, updateTeam, updateTeamAvatar, previewUpgrade } from '../api/api';
import { useAuth, isTeamSubscriptionActive } from '../context/AuthContext';
import TeamOnboarding from '../components/dashboard/TeamOnboarding';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  owner: { label: 'Owner', color: 'text-amber-600', bg: 'bg-amber-50', icon: Crown },
  admin: { label: 'Admin', color: 'text-violet-600', bg: 'bg-violet-50', icon: Shield },
  member: { label: 'Member', color: 'text-sky-600', bg: 'bg-sky-50', icon: Users },
  viewer: { label: 'Viewer', color: 'text-slate-500', bg: 'bg-slate-100', icon: Eye },
};

// ─── Constants for Crop ─────────────────────────────────────────────────────────
const CROP_SIZE = 280;          // px – hiển thị crop circle
const OUTPUT_SIZE = 512;          // px – ảnh output lên server

// ─── Crop Modal ─────────────────────────────────────────────────────────────────
interface CropModalProps {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

function CropModal({ src, onConfirm, onCancel }: CropModalProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const isDragging = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });

  const [zoom, setZoom] = useState(1);          // 1 = fit
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });
  const [minZoom, setMinZoom] = useState(1);

  // ── Load image & compute initial fit zoom ──────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const fz = Math.min(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setMinZoom(fz);
      setZoom(fz);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // ── Clamp offset so image always covers crop circle ────────────────────────
  const clamp = React.useCallback(
    (ox: number, oy: number, z: number) => {
      const scaledW = imgNaturalSize.w * z;
      const scaledH = imgNaturalSize.h * z;
      const halfCrop = CROP_SIZE / 2;
      const maxX = Math.max(0, (scaledW - CROP_SIZE) / 2);
      const maxY = Math.max(0, (scaledH - CROP_SIZE) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    [imgNaturalSize],
  );

  // ── Draw canvas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d')!;
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

    const scaledW = imgNaturalSize.w * zoom;
    const scaledH = imgNaturalSize.h * zoom;
    const cx = CROP_SIZE / 2 + offset.x - scaledW / 2;
    const cy = CROP_SIZE / 2 + offset.y - scaledH / 2;

    // 1. Vẽ ảnh
    ctx.drawImage(img, cx, cy, scaledW, scaledH);

    // 2. Lớp tối bên NGOÀI vòng tròn (evenodd = đục lỗ ở giữa)
    ctx.save();
    ctx.beginPath();
    // Hình chữ nhật bao toàn bộ canvas
    ctx.rect(0, 0, CROP_SIZE, CROP_SIZE);
    // Vòng tròn cắt ra (counterclockwise = tạo lỗ)
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 1, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill('evenodd');
    ctx.restore();

    // 3. Viền tròn trắng
    ctx.save();
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }, [zoom, offset, imgNaturalSize]);

  // ── Pointer events ─────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset(prev => clamp(prev.x + dx, prev.y + dy, zoom));
  };
  const onPointerUp = () => { isDragging.current = false; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom(prev => {
      const next = Math.max(minZoom, Math.min(prev + delta * prev, minZoom * 8));
      setOffset(o => clamp(o.x, o.y, next));
      return next;
    });
  };

  const changeZoom = (dir: 1 | -1) => {
    setZoom(prev => {
      const next = Math.max(minZoom, Math.min(prev + dir * 0.15 * prev, minZoom * 8));
      setOffset(o => clamp(o.x, o.y, next));
      return next;
    });
  };

  const reset = () => {
    setZoom(minZoom);
    setOffset({ x: 0, y: 0 });
  };

  // ── Export circular crop → blob ────────────────────────────────────────────
  const handleConfirm = () => {
    const img = imageRef.current;
    if (!img) return;

    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext('2d')!;

    // Scale factor from CROP_SIZE → OUTPUT_SIZE
    const scale = OUTPUT_SIZE / CROP_SIZE;
    const scaledW = imgNaturalSize.w * zoom * scale;
    const scaledH = imgNaturalSize.h * zoom * scale;
    const cx = OUTPUT_SIZE / 2 + offset.x * scale - scaledW / 2;
    const cy = OUTPUT_SIZE / 2 + offset.y * scale - scaledH / 2;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    
    // Fill background with white to avoid black letterboxes in jpeg
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.drawImage(img, cx, cy, scaledW, scaledH);

    out.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[28px] shadow-2xl p-7 flex flex-col items-center gap-5 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-extrabold text-slate-800 self-start">Căn chỉnh ảnh đại diện</h3>
        <p className="text-xs text-slate-400 font-medium self-start -mt-3">Kéo để di chuyển · Cuộn / nút để zoom</p>

        {/* Canvas crop area — container VUÔNG để vùng tối bên ngoài vòng tròn hiển thị */}
        <div
          className="cursor-grab active:cursor-grabbing select-none rounded-2xl overflow-hidden shadow-xl"
          style={{ width: CROP_SIZE, height: CROP_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} style={{ display: 'block', width: CROP_SIZE, height: CROP_SIZE }} />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 w-full">
          <button onClick={() => changeZoom(-1)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition">
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={minZoom * 100}
            max={minZoom * 800}
            value={zoom * 100}
            onChange={e => {
              const z = Number(e.target.value) / 100;
              setZoom(z);
              setOffset(o => clamp(o.x, o.y, z));
            }}
            className="flex-1 accent-sky-500 h-1.5 rounded-full cursor-pointer"
          />
          <button onClick={() => changeZoom(1)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition">
            <ZoomIn size={18} />
          </button>
          <button onClick={reset} title="Đặt lại" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition">
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full mt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition"
          >
            Xác nhận
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateDesignMenu, setShowCreateDesignMenu] = useState(false);

  // ─── Renew Team ────────────────────────────────────────────────────────────
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewSeats, setRenewSeats] = useState(2);
  const [renewPlan, setRenewPlan] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ─── [HARD CAP] Modal nâng cấp gói khi vượt giới hạn thành viên ──────────
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showUpgradeSeatsModal, setShowUpgradeSeatsModal] = useState(false);
  const [showBuyTeamModal, setShowBuyTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState('');

  // ─── Team Settings (Tên & Avatar) ──────────────────────────────────────────
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsAvatarFile, setSettingsAvatarFile] = useState<File | null>(null);
  const [settingsAvatarPreview, setSettingsAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    if (showRenewModal && renewPlan && renewSeats >= 2) {
      setPreviewLoading(true);
      previewUpgrade(renewPlan.id, renewSeats)
        .then(setPreviewData)
        .catch(console.error)
        .finally(() => setPreviewLoading(false));
    }
  }, [showRenewModal, renewPlan, renewSeats]);

  const loadTeams = async () => {
    try {
      const data = await fetchMyTeams();
      // [NEW] Lọc bỏ Personal Team (max_members=1) — mô hình mới không dùng personal team
      const realTeams = (data.teams || []).filter((t: any) => !t.is_personal && t.max_members !== 1);
      setTeams(realTeams);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadTeam = async (teamId: string) => {
    setTeamLoading(true);
    try {
      const data = await fetchTeamById(teamId);
      setActiveTeam(data);
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setTeamLoading(false); }
  };

  useEffect(() => { loadTeams(); }, []);

  // ─── [REALTIME] Socket.IO Listeners ────────────────────────────────────────
  useEffect(() => {
    if (!activeTeam?.id || !user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const socketUrl = isDev ? 'http://localhost:3000' : '';
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join-team', { teamId: activeTeam.id, token });
    });

    socket.on('team:members_changed', (data: { teamId: string }) => {
      if (data.teamId === activeTeam.id) {
        loadTeam(activeTeam.id);
        loadTeams();
      }
    });

    socket.on('team:you_were_removed', (data: { teamId: string, message: string }) => {
      if (data.teamId === activeTeam.id) {
        setActiveTeam(null);
        loadTeams();
      }
    });

    socket.on('team:you_are_now_owner', (data: { teamId: string, message: string }) => {
      if (data.teamId === activeTeam.id) {
        // Data sẽ tự động được reload nhờ team:members_changed
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeTeam?.id, user?.id]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setActionLoading(true);
    try {
      // ─── [HARD CAP] Không truyền max_members — Backend tự quyết theo gói ──
      await createTeam({ name: newTeamName.trim() });
      await loadTeams();
      setShowCreateModal(false);
      setNewTeamName('');
      showToast('✅ Tạo nhóm thành công!');
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setActionLoading(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeTeam) return;
    setActionLoading(true);
    try {
      await inviteTeamMember(activeTeam.id, inviteEmail.trim(), inviteRole);
      await loadTeam(activeTeam.id);
      setShowInviteModal(false);
      setInviteEmail('');
      showToast('✅ Đã mời thành viên!');
    } catch (e: any) {
      // ─── [HARD CAP] Backend trả MemberQuotaExceeded → Hiện modal nâng cấp ─
      if (e.message?.includes('đạt số lượng thành viên tối đa')) {
        showToast(`❌ ${e.message}`);
        setShowInviteModal(false);
        setShowUpgradeModal(true);
      } else {
        showToast(`❌ ${e.message}`);
      }
    }
    finally { setActionLoading(false); }
  };

  // ─── [DESIGN RBAC] Clone bản vẽ Team về Personal Workspace ────────────────
  const handleCloneToPersonal = async (designId: string, title: string) => {
    if (!confirm(`Nhân bản "${title}" về không gian cá nhân của bạn?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/teams/designs/${designId}/clone-to-personal`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('✅ Đã nhân bản về không gian cá nhân!');
      if (data.designId) navigate(`/design/${data.designId}`);
    } catch (e: any) { showToast(`❌ ${e.message}`); }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!activeTeam || !confirm(`Xóa "${memberName}" khỏi nhóm?`)) return;
    try {
      await removeTeamMember(activeTeam.id, memberId);
      // Socket sẽ tự trigger reload data qua team:members_changed
      showToast('✅ Đã xóa thành viên');
    } catch (e: any) { showToast(`❌ ${e.message}`); }
  };

  const handleLeaveTeam = async () => {
    if (!activeTeam || !confirm(activeTeam.members?.length === 1 ? 'Bạn là thành viên duy nhất. Rời nhóm sẽ giải tán nhóm. Tiếp tục?' : 'Bạn có chắc chắn muốn rời nhóm này?')) return;
    try {
      await removeTeamMember(activeTeam.id, user!.id);
      showToast('✅ Đã rời nhóm');
      setActiveTeam(null);
      await loadTeams();
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    }
  };

  const openSettingsModal = () => {

    if (!activeTeam) return;
    setSettingsName(activeTeam.name);
    setSettingsAvatarFile(null);
    setSettingsAvatarPreview(activeTeam.avatar_url || null);
    setShowSettingsModal(true);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('❌ Vui lòng chọn file hình ảnh!');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Ảnh không được vượt quá 5MB');
        return;
      }
      setCropSrc(URL.createObjectURL(file));
    }
  };

  const handleCropConfirm = (blob: Blob) => {
    setCropSrc(null);
    const file = new File([blob], 'team_avatar.jpg', { type: 'image/jpeg' });
    setSettingsAvatarFile(file);
    setSettingsAvatarPreview(URL.createObjectURL(blob));
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleSaveSettings = async () => {
    if (!activeTeam || !settingsName.trim()) return;
    setActionLoading(true);
    try {
      if (settingsName.trim() !== activeTeam.name) {
        await updateTeam(activeTeam.id, settingsName.trim());
      }
      if (settingsAvatarFile) {
        await updateTeamAvatar(activeTeam.id, settingsAvatarFile);
      }
      await loadTeam(activeTeam.id);
      await loadTeams();
      setShowSettingsModal(false);
      showToast('✅ Đã cập nhật thông tin nhóm');
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTeamDesign = async (type: string, pageType: string, w: number, h: number) => {
    if (!activeTeam) return;
    setActionLoading(true);
    try {
      const payload = {
        title: `Untitled Team Design`,
        design_type: type,
        page_type: pageType,
        width: w,
        height: h,
        team_id: activeTeam.id
      };
      const data = await createDesign(payload);
      if (data.id) navigate(`/design/${data.id}`);
    } catch (e: any) {
      alert('Không thể tạo thiết kế nhóm: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };
  // ── [NEW] Loading state để tránh giật khung hình ───────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ── [NEW] Nếu user chưa có team nào → Hiện màn hình Onboarding ──────────────
  if (!loading && teams.length === 0) {
    return <TeamOnboarding onTeamCreated={loadTeams} />;
  }

  // ── [NEW] Nếu user muốn mua thêm chỗ → Bật Onboarding chế độ Nâng cấp ──
  if (showUpgradeSeatsModal && activeTeam) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowUpgradeSeatsModal(false)}
          className="absolute top-4 left-4 z-50 bg-white p-2 rounded-full shadow-md text-slate-500 hover:text-indigo-600 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <TeamOnboarding
          isUpgrade={true}
          currentMaxMembers={activeTeam.max_members}
        />
      </div>
    );
  }

  if (showBuyTeamModal) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowBuyTeamModal(false)}
          className="absolute top-4 left-4 z-50 bg-white p-2 rounded-full shadow-md text-slate-500 hover:text-indigo-600 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <TeamOnboarding onTeamCreated={() => {
          setShowBuyTeamModal(false);
          loadTeams();
        }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Users size={16} className="text-indigo-500" />
            </div>
            <h1 className="text-lg font-extrabold text-slate-800">Teams</h1>
          </div>
        </div>
        {!teams.some(t => t.my_role === 'owner') && (
          <button
            onClick={() => {
              if (!isTeamSubscriptionActive(user)) {
                setShowBuyTeamModal(true);
              } else {
                setShowCreateModal(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:-translate-y-0.5"
          >
            <Plus size={15} /> Tạo nhóm mới
          </button>
        )}
      </header>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-20 right-6 z-[9999] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        {/* Teams List Sidebar */}
        <div className="w-72 border-r border-slate-100 bg-white/60 backdrop-blur-md flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nhóm của bạn ({teams.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {loading ? (
              <div className="flex justify-center pt-8">
                <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                <Users size={28} className="mx-auto mb-2 text-slate-200" />
                Bạn chưa thuộc nhóm nào
              </div>
            ) : teams.map((team) => {
              const RoleIcon = ROLE_CONFIG[team.my_role]?.icon || Users;
              // ─── Plan Badge cho Sidebar ─────────────────────────────────────
              const planBadge = team.is_personal
                ? { label: 'Personal', cls: 'bg-violet-100 text-violet-600' }
                : team.is_pro
                  ? { label: team.plan_name || 'Pro', cls: 'bg-amber-100 text-amber-600' }
                  : { label: 'Free', cls: 'bg-slate-100 text-slate-500' };
              return (
                <button
                  key={team.id}
                  onClick={() => loadTeam(team.id)}
                  className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all ${activeTeam?.id === team.id
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-slate-50 border border-transparent'
                    }`}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-400 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow overflow-hidden">
                    {team.avatar_url ? (
                      <img src={team.avatar_url} alt="Team" className="w-full h-full object-cover" />
                    ) : (
                      team.name[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm text-slate-800 truncate">{team.name}</p>
                      <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide ${planBadge.cls}`}>
                        {planBadge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <RoleIcon size={10} className={ROLE_CONFIG[team.my_role]?.color} />
                      <span className={`text-[10px] font-bold ${ROLE_CONFIG[team.my_role]?.color}`}>
                        {ROLE_CONFIG[team.my_role]?.label}
                      </span>
                      <span className="text-[10px] text-slate-300 mx-1">•</span>
                      <span className="text-[10px] text-slate-400">{team.member_count} thành viên</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team Detail */}
        <div className="flex-1 overflow-y-auto p-8">
          {!activeTeam ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <Users size={48} className="text-slate-200 mb-4" />
              <p className="font-bold text-lg text-slate-500 mb-1">Chọn một nhóm để xem chi tiết</p>
              <p className="text-sm">hoặc tạo nhóm mới</p>
            </div>
          ) : teamLoading ? (
            <div className="flex justify-center pt-20">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              {/* ─── [DOWNGRADE] Banner Read-Only khi Over Quota ─────────── */}
              {activeTeam.is_read_only && (
                <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3">
                  <AlertTriangle size={18} className="shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold text-sm">Nhóm đang ở chế độ Chỉ xem (Read-Only)</p>
                    <p className="text-xs mt-0.5">Gói cước đã hết hạn và nhóm đang vượt giới hạn thành viên. Hãy nâng cấp hoặc kick bớt thành viên để mở khóa.</p>
                  </div>
                  <Link to="/billing" className="flex items-center gap-1 text-xs font-bold bg-red-600 text-white px-3 py-1.5 rounded-xl hover:bg-red-700 transition">
                    Nâng cấp <ArrowRight size={12} />
                  </Link>
                </div>
              )}
              {/* Team header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-lg overflow-hidden shrink-0">
                    {activeTeam.avatar_url ? (
                      <img src={activeTeam.avatar_url} alt="Team Avatar" className="w-full h-full object-cover" />
                    ) : (
                      activeTeam.name[0]?.toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-extrabold text-slate-800">{activeTeam.name}</h2>
                      {activeTeam.my_role === 'owner' && (
                        <button
                          onClick={openSettingsModal}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Cài đặt nhóm"
                        >
                          <Settings size={16} />
                        </button>
                      )}
                      {/* ─── Plan Badge ──────────────────────────────────────── */}
                      {activeTeam.is_personal ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-black uppercase tracking-wide border border-violet-200">
                          <span>✦</span> Personal
                        </span>
                      ) : activeTeam.is_pro ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-black uppercase tracking-wide shadow-sm">
                          <Crown size={10} /> {activeTeam.plan_name || 'Pro'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-black uppercase tracking-wide border border-slate-200">
                          Free
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {activeTeam.members?.length} / {activeTeam.max_members} thành viên
                      {activeTeam.my_role && (
                        <span className={`ml-2 font-bold ${ROLE_CONFIG[activeTeam.my_role]?.color}`}>
                          ({ROLE_CONFIG[activeTeam.my_role]?.label})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {['owner', 'admin'].includes(activeTeam.my_role) && !activeTeam.is_personal && (() => {
                  // ─── [HARD CAP] Tính giới hạn hiệu lực ────────────────────
                  const effectiveMax = activeTeam.is_pro && activeTeam.plan_max_members
                    ? activeTeam.plan_max_members
                    : activeTeam.max_members;
                  const isFull = (activeTeam.members?.length ?? 0) >= effectiveMax;
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* [FIX] Nút Gia hạn nhóm: chỉ hiện khi Owner và team đã hết hạn */}
                      {activeTeam.my_role === 'owner' && !activeTeam.is_pro && (
                        <button
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              const res = await fetch('/api/subscriptions');
                              const data = await res.json();
                              const plans: any[] = data.plans || data.subscriptions || [];
                              const teamPlan = plans.find((p: any) => p.slug === 'pro_team');
                              if (!teamPlan) { alert('Không tìm thấy gói Team. Vui lòng liên hệ hỗ trợ.'); return; }

                              setRenewPlan(teamPlan);
                              const currentMembers = activeTeam.members?.length || 1;
                              setRenewSeats(Math.max(2, currentMembers, activeTeam.max_members || 2));
                              setShowRenewModal(true);
                            } catch (e: any) {
                              alert('Lỗi: ' + e.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-bold rounded-xl text-sm transition shadow-md hover:-translate-y-0.5"
                          title={`Gia hạn gói cho nhóm "${activeTeam.name}"`}
                        >
                          <RefreshCw size={14} /> Gia hạn nhóm
                        </button>
                      )}

                      {/* Nút Thêm chỗ cho chủ nhóm Pro */}
                      {activeTeam.is_pro && activeTeam.my_role === 'owner' && (
                        <button
                          onClick={() => setShowUpgradeSeatsModal(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-bold rounded-xl text-sm transition shadow-sm"
                          title="Mua thêm số lượng thành viên cho nhóm"
                        >
                          <Crown size={14} /> Thêm chỗ
                        </button>
                      )}

                      {/* Nút Mời thành viên */}
                      <button
                        onClick={() => isFull ? setShowUpgradeModal(true) : setShowInviteModal(true)}
                        disabled={activeTeam.is_read_only}
                        title={isFull ? `Đã đạt giới hạn ${effectiveMax} thành viên. Nâng cấp gói để mời thêm.` : 'Mời thành viên'}
                        className={`flex items-center gap-2 px-4 py-2 border font-bold rounded-xl text-sm transition ${isFull
                          ? 'bg-amber-50 text-amber-600 border-amber-200 cursor-not-allowed'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200'
                          } disabled:opacity-50`}
                      >
                        {isFull ? <Lock size={14} /> : <Mail size={14} />}
                        {isFull ? `Đã đầy (${activeTeam.members?.length}/${effectiveMax})` : 'Mời thành viên'}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Members */}
              <section className="mb-8">
                <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                  Thành viên ({activeTeam.members?.length || 0})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeTeam.members?.map((m: any) => {
                    const rc = ROLE_CONFIG[m.role] || ROLE_CONFIG.member;
                    const RoleIcon = rc.icon;
                    const isMe = m.id === user?.id;
                    const canRemove = ['owner', 'admin'].includes(activeTeam.my_role) && m.role !== 'owner' && !isMe && (activeTeam.my_role === 'owner' || m.role !== 'admin');

                    return (
                      <div key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition ${isMe ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url.startsWith('http') ? m.avatar_url : `http://localhost:3000${m.avatar_url}`} className="w-9 h-9 rounded-full object-cover border-2 border-white shadow" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white font-bold text-sm shadow shrink-0">
                            {m.name?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">
                            {m.name} {isMe && <span className="text-indigo-400 font-medium text-xs">(bạn)</span>}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{m.email}</p>
                        </div>

                        {/* Role badge — chỉ hiển thị, không cho chỉnh */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${rc.bg}`}>
                          <RoleIcon size={10} className={rc.color} />
                          <span className={`text-[10px] font-bold ${rc.color}`}>{rc.label}</span>
                        </div>
                        {isMe && activeTeam.my_role !== 'owner' && !activeTeam.is_personal && (
                          <button
                            onClick={handleLeaveTeam}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Rời nhóm"
                          >
                            <LogOut size={13} />
                          </button>
                        )}
                        {isMe && activeTeam.my_role === 'owner' && activeTeam.members?.length === 1 && !activeTeam.is_personal && (
                          <button
                            onClick={handleLeaveTeam}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Giải tán nhóm"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}

                        {canRemove && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Xóa thành viên"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Designs (Personal only, not shared) */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">
                    Thiết kế của bạn ({activeTeam.designs?.filter((d: any) => d.user_id === user?.id).length || 0})
                  </h3>
                  {['owner', 'admin', 'member'].includes(activeTeam.my_role) && (
                    <div className="relative">
                      <button
                        onClick={() => setShowCreateDesignMenu(!showCreateDesignMenu)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition"
                      >
                        <Plus size={14} /> Tạo thiết kế mới
                      </button>

                      <AnimatePresence>
                        {showCreateDesignMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowCreateDesignMenu(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 flex flex-col gap-1"
                            >
                              <button onClick={() => handleCreateTeamDesign('presentation', 'canvas', 1920, 1080)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 rounded-lg text-left font-bold transition">
                                <Layout size={16} /> Presentation
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                {activeTeam.designs?.filter((d: any) => d.user_id === user?.id).length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Layout size={28} className="mx-auto mb-2 text-slate-300" />
                    Chưa có thiết kế nào của bạn trong nhóm
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {activeTeam.designs?.filter((d: any) => d.user_id === user?.id).map((d: any) => (
                      <div key={d.id} className="bg-white rounded-2xl border border-slate-100 hover:shadow-lg hover:border-indigo-200 transition-all group overflow-hidden relative">
                        <Link to={`/design/${d.id}`} className="block">
                          <div className="aspect-video bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden">
                            {d.thumbnail_url ? (
                              <img src={d.thumbnail_url} alt={d.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                              <div className="text-slate-200">
                                {d.design_type === 'document' ? <FileText size={30} strokeWidth={1.5} /> : <Layout size={30} strokeWidth={1.5} />}
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="font-bold text-sm text-slate-800 truncate group-hover:text-indigo-600 transition">{d.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(d.updated_at).toLocaleDateString('vi-VN')}</p>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </motion.div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-lg text-slate-800">Tạo nhóm mới</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tên nhóm *</label>
                  <input
                    autoFocus
                    type="text"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                    placeholder="VD: Nhóm Marketing..."
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition"
                  />
                </div>
                {/* ─── [HARD CAP] Bỏ input max_members — Backend tự quyết ─── */}
                <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                  📋 Số thành viên tối đa được xác định bởi gói cước của nhóm. Nhóm mới mặc định là <strong>Free (5 người)</strong>.
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold hover:from-indigo-600 hover:to-violet-600 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  <Check size={14} />
                  {actionLoading ? 'Đang tạo...' : 'Tạo nhóm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-lg text-slate-800">Mời thành viên</h3>
                <button onClick={() => setShowInviteModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email *</label>
                  <input
                    autoFocus type="email" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button onClick={handleInvite} disabled={!inviteEmail.trim() || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold hover:from-emerald-600 hover:to-teal-600 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  <Mail size={14} />
                  {actionLoading ? 'Đang mời...' : 'Gửi lời mời'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Crop Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cropSrc && (
          <CropModal
            src={cropSrc}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-lg text-slate-800">Cài đặt nhóm</h3>
                <button onClick={() => setShowSettingsModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-24 h-24 bg-slate-100 rounded-full border-4 border-white shadow-lg overflow-hidden flex items-center justify-center group">
                    {settingsAvatarPreview ? (
                      <img src={settingsAvatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Users size={32} className="text-slate-400" />
                    )}
                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                      <Upload size={20} className="text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarSelect} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">Click vào ảnh để tải lên</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tên nhóm *</label>
                  <input
                    autoFocus type="text" value={settingsName}
                    onChange={e => setSettingsName(e.target.value)}
                    placeholder="Nhập tên nhóm..."
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button onClick={handleSaveSettings} disabled={!settingsName.trim() || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold hover:from-indigo-600 hover:to-violet-600 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  <Check size={14} />
                  {actionLoading ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── [HARD CAP] Upgrade Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock size={28} className="text-amber-500" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-800 mb-2">Nhóm đã đầy thành viên</h3>
              <p className="text-sm text-slate-500 mb-6">
                Nhóm của bạn đã đạt giới hạn thành viên của gói hiện tại. Nâng cấp lên gói cao hơn để mời thêm người.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm"
                >
                  Đóng
                </button>
                {activeTeam?.is_pro ? (
                  <button
                    onClick={() => { setShowUpgradeModal(false); setShowUpgradeSeatsModal(true); }}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold hover:from-amber-500 hover:to-orange-600 transition shadow-md text-sm flex items-center justify-center gap-2"
                  >
                    <Crown size={14} /> Mua thêm chỗ
                  </button>
                ) : (
                  <Link
                    to="/pricing"
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold hover:from-amber-500 hover:to-orange-600 transition shadow-md text-sm flex items-center justify-center gap-2"
                  >
                    <Crown size={14} /> Xem gói cước
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Renew Modal */}
      <AnimatePresence>
        {showRenewModal && renewPlan && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowRenewModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-xl text-slate-800 flex items-center gap-2">
                  <RefreshCw size={20} className="text-violet-500" /> Gia hạn nhóm
                </h3>
                <button onClick={() => setShowRenewModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Số lượng thành viên (Bao gồm cả bạn)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setRenewSeats(Math.max(2, renewSeats - 1))}
                      className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center text-slate-500 font-black text-lg transition"
                    >
                      -
                    </button>
                    <div className="flex-1 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center font-black text-lg text-slate-700">
                      {renewSeats}
                    </div>
                    <button
                      onClick={() => setRenewSeats(renewSeats + 1)}
                      className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center text-slate-500 font-black text-lg transition"
                    >
                      +
                    </button>
                  </div>
                  {renewSeats < (activeTeam?.members?.length || 0) && (
                    <p className="mt-2 text-xs text-red-500 font-medium">
                      ⚠️ Số lượng chỗ mới ({renewSeats}) không thể nhỏ hơn số thành viên hiện tại trong nhóm ({activeTeam?.members?.length} người). Vui lòng xóa bớt thành viên trước khi hạ số lượng.
                    </p>
                  )}
                </div>

                {/* Proration Detail */}
                <div className="bg-violet-50/50 rounded-2xl p-4 border border-violet-100 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Chi tiết thanh toán</p>
                  {previewLoading ? (
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-full"></div>
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3"></div>
                    </div>
                  ) : previewData ? (
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>Giá gói ({renewSeats} chỗ):</span>
                        <span className="font-semibold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(previewData.originalAmount)}</span>
                      </div>
                      {previewData.deductionValue > 0 && (
                        <div className="flex justify-between text-emerald-600 font-medium">
                          <span>Được cấn trừ từ gói cũ:</span>
                          <span>-{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(previewData.deductionValue)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900 text-lg">
                        <span>Thực tế phải trả:</span>
                        <span className="text-violet-700">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(previewData.finalAmount)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Đang tính toán...</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setShowRenewModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      const result = await fetch('/api/payments/create-checkout', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        },
                        body: JSON.stringify({
                          planId: renewPlan.id,
                          planName: renewPlan.name,
                          membersCount: renewSeats,
                          teamId: activeTeam.id,
                        }),
                      });
                      const checkoutData = await result.json();
                      if (!result.ok) throw new Error(checkoutData.error || 'Lỗi tạo link thanh toán');
                      window.location.href = checkoutData.checkoutUrl;
                    } catch (e: any) { alert(e.message || 'Lỗi thanh toán'); }
                    finally { setActionLoading(false); }
                  }}
                  disabled={renewSeats < (activeTeam?.members?.length || 0) || renewSeats < 2 || previewLoading || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                >
                  <Crown size={16} />
                  {actionLoading ? 'Đang tạo link...' : 'Thanh toán ngay'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
