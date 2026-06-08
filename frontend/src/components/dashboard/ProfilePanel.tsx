import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Check, X, User, Mail, Pencil,
  ShieldCheck, Loader2, ZoomIn, ZoomOut, RotateCcw,
  KeyRound, Eye, EyeOff, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_MB   = 5;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const CROP_SIZE     = 280;          // px – hiển thị crop circle
const OUTPUT_SIZE   = 512;          // px – ảnh output lên server

// ─── Change Password Modal (3 bước) ────────────────────────────────────────────
type CPStep = 'send_otp' | 'verify_otp' | 'new_password' | 'done';

// 6-box OTP input component
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Fix: Create exactly 6 elements regardless of value length
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const focus = (i: number) => boxRefs.current[i]?.focus();

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) {
        // xóa ô hiện tại
        const arr = [...digits]; arr[i] = '';
        onChange(arr.join('').trimEnd());
      } else if (i > 0) {
        // ô trống → lùi về ô trước và xóa
        const arr = [...digits]; arr[i - 1] = '';
        onChange(arr.join('').trimEnd());
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft' && i > 0) { focus(i - 1); }
    else if (e.key === 'ArrowRight' && i < 5) { focus(i + 1); }
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return;
    const ch = raw[raw.length - 1];
    const arr = [...digits]; arr[i] = ch;
    onChange(arr.join(''));
    if (i < 5) focus(i + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    focus(Math.min(pasted.length, 5));
  };

  return (
    <div className="flex gap-2.5 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { boxRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={`w-11 h-14 text-center text-xl font-black rounded-2xl border-2 outline-none transition-all duration-200 disabled:opacity-50 cursor-text ${
            d
              ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md shadow-purple-200'
              : 'border-slate-200 bg-white text-slate-800 focus:border-purple-400 focus:bg-purple-50/50 focus:shadow-md focus:shadow-purple-100'
          }`}
        />
      ))}
    </div>
  );
}

function ChangePasswordModal({ onClose, userEmail }: { onClose: () => void; userEmail: string }) {
  const [step,         setStep]         = useState<CPStep>('send_otp');
  const [otp,          setOtp]          = useState('');
  const [changeToken,  setChangeToken]  = useState('');
  const [newPwd,       setNewPwd]       = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

  // Bước 1: gửi OTP
  const handleSendOtp = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res  = await fetch('/api/auth/change-password/send-otp', { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Mã OTP đã được gửi tới email của bạn!');
      setStep('verify_otp');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Bước 2: xác thực OTP
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Vui lòng nhập đủ 6 chữ số'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res  = await fetch('/api/auth/change-password/verify-otp', { method: 'POST', headers: authHeader(), body: JSON.stringify({ otp }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChangeToken(data.change_token);
      setSuccess('OTP hợp lệ! Hãy nhập mật khẩu mới.');
      setStep('new_password');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Bước 3: đổi mật khẩu
  const handleChangePassword = async () => {
    if (newPwd.length < 6) { setError('Mật khẩu tối thiểu 6 ký tự'); return; }
    if (newPwd !== confirmPwd) { setError('Mật khẩu xác nhận không khớp'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res  = await fetch('/api/auth/change-password', { method: 'PATCH', headers: authHeader(), body: JSON.stringify({ change_token: changeToken, newPassword: newPwd }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep('done');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // password strength
  const pwdStrength = (p: string) => {
    if (p.length === 0) return 0;
    let s = 0;
    if (p.length >= 6)  s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s; // 0-5
  };
  const strength = pwdStrength(newPwd);
  const strengthLabel = ['', 'Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][strength];
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500'][strength];

  const inputCls = 'w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-slate-300';

  const STEPS: CPStep[] = ['send_otp', 'verify_otp', 'new_password'];
  const currentIdx = STEPS.indexOf(step);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.88, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* ── Gradient header banner ── */}
        <div className="relative bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 px-8 pt-8 pb-10 overflow-hidden">
          {/* decorative circles */}
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full" />

          {/* Back + Close */}
          <div className="relative flex items-center justify-between mb-5">
            {currentIdx > 0 && step !== 'done' ? (
              <button onClick={() => { setError(''); setSuccess(''); setStep(STEPS[currentIdx - 1]); }}
                className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition">
                <ArrowLeft size={16} />
              </button>
            ) : <div />}
            <button onClick={onClose} className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition">
              <X size={16} />
            </button>
          </div>

          {/* Icon + Title */}
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <KeyRound size={22} className="text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Bảo mật tài khoản</p>
              <h3 className="text-white font-black text-xl leading-tight">
                {step === 'send_otp'     && 'Đổi mật khẩu'}
                {step === 'verify_otp'   && 'Xác thực OTP'}
                {step === 'new_password' && 'Tạo mật khẩu mới'}
                {step === 'done'         && 'Thành công!'}
              </h3>
            </div>
          </div>

          {/* Step progress pills */}
          {step !== 'done' && (
            <div className="relative flex gap-2 mt-5">
              {STEPS.map((s, i) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  currentIdx >= i ? 'bg-white' : 'bg-white/25'
                }`} />
              ))}
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="px-8 py-7 space-y-5">

          {/* Error / Success */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-start gap-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-2xl px-4 py-3 text-sm font-semibold">
                <span className="mt-0.5">⚠️</span> {error}
              </motion.div>
            )}
            {success && !error && (
              <motion.div key="ok" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl px-4 py-3 text-sm font-semibold">
                <span>✅</span> {success}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bước 1 ── */}
          {step === 'send_otp' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
                <p className="text-sm text-purple-800 font-medium leading-relaxed">
                  Mã OTP sẽ được gửi tới<br />
                  <span className="font-black text-purple-900">{userEmail}</span>
                </p>
              </div>
              <button onClick={handleSendOtp} disabled={loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm shadow-xl shadow-purple-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:translate-y-0 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                {loading ? 'Đang gửi OTP…' : 'Gửi mã OTP →'}
              </button>
            </motion.div>
          )}

          {/* ── Bước 2: 6-box OTP ── */}
          {step === 'verify_otp' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-slate-500 font-medium">Kiểm tra hộp thư của bạn</p>
                <p className="text-xs text-slate-400 mt-0.5">Mã hết hạn sau <span className="font-bold text-purple-600">10 phút</span></p>
              </div>

              <OtpBoxes value={otp} onChange={v => { setOtp(v); setError(''); }} disabled={loading} />

              <button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm shadow-xl shadow-purple-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Đang xác thực…' : 'Xác thực OTP'}
              </button>

              <button onClick={handleSendOtp} disabled={loading}
                className="w-full text-sm font-bold text-slate-400 hover:text-purple-600 transition py-1">
                Chưa nhận được? Gửi lại →
              </button>
            </motion.div>
          )}

          {/* ── Bước 3: Mật khẩu mới ── */}
          {step === 'new_password' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="relative">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Mật khẩu mới</label>
                <input type={showPwd ? 'text' : 'password'} value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setError(''); }}
                  placeholder="Tối thiểu 6 ký tự" className={inputCls + ' pr-12'} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-4 bottom-3.5 text-slate-400 hover:text-purple-600 transition">
                  {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              {/* Strength bar */}
              {newPwd.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${strength >= i ? strengthColor : 'bg-slate-100'}`} />
                    ))}
                  </div>
                  <p className={`text-[11px] font-bold ${strengthColor.replace('bg-','text-')}`}>{strengthLabel}</p>
                </div>
              )}

              <div className="relative">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Xác nhận mật khẩu</label>
                <input type={showConfirm ? 'text' : 'password'} value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setError(''); }}
                  placeholder="Nhập lại mật khẩu mới" className={inputCls + ' pr-12'} />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-4 bottom-3.5 text-slate-400 hover:text-purple-600 transition">
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              <button onClick={handleChangePassword} disabled={loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm shadow-xl shadow-purple-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:translate-y-0 flex items-center justify-center gap-2 mt-1">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Đang lưu…' : 'Xác nhận đổi mật khẩu'}
              </button>
            </motion.div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4 py-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-300/50">
                <Check size={36} className="text-white" strokeWidth={3} />
              </div>
              <div>
                <p className="font-black text-slate-800 text-lg">Đổi mật khẩu thành công!</p>
                <p className="text-sm text-slate-500 mt-1">Mật khẩu của bạn đã được cập nhật.</p>
              </div>
              <button onClick={onClose}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold shadow-lg shadow-purple-400/30 transition hover:opacity-90">
                Hoàn tất
              </button>
            </motion.div>
          )}

        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Crop Modal ─────────────────────────────────────────────────────────────────
interface CropModalProps {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

function CropModal({ src, onConfirm, onCancel }: CropModalProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imageRef    = useRef<HTMLImageElement | null>(null);
  const isDragging  = useRef(false);
  const lastPos     = useRef({ x: 0, y: 0 });

  const [zoom,   setZoom]   = useState(1);          // 1 = fit
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });
  const [minZoom, setMinZoom] = useState(1);

  // ── Load image & compute initial fit zoom ──────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const fz = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setMinZoom(fz);
      setZoom(fz);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // ── Clamp offset so image always covers crop circle ────────────────────────
  const clamp = useCallback(
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
    const img    = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d')!;
    canvas.width  = CROP_SIZE;
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
    lastPos.current    = { x: e.clientX, y: e.clientY };
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

    const out  = document.createElement('canvas');
    out.width  = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx  = out.getContext('2d')!;

    // Scale factor from CROP_SIZE → OUTPUT_SIZE
    const scale     = OUTPUT_SIZE / CROP_SIZE;
    const scaledW   = imgNaturalSize.w * zoom * scale;
    const scaledH   = imgNaturalSize.h * zoom * scale;
    const cx        = OUTPUT_SIZE / 2 + offset.x * scale - scaledW / 2;
    const cy        = OUTPUT_SIZE / 2 + offset.y * scale - scaledH / 2;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
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

// ─── ProfilePanel ───────────────────────────────────────────────────────────────
export default function ProfilePanel() {
  const { user, updateAvatar, refreshUser } = useAuth();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc,          setCropSrc]          = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview,    setAvatarPreview]    = useState<string | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue,     setNameValue]     = useState(user?.name || '');
  const [isSavingName,  setIsSavingName]  = useState(false);

  const [showChangePwd, setShowChangePwd] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const avatarSrc = avatarPreview
    ?? (user?.avatar_url
      ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:3000${user.avatar_url}`)
      : null);

  // ── File selected → validate → open crop modal ───────────────────────────
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn file hình ảnh!', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast(`Ảnh quá lớn! Tối đa ${MAX_FILE_MB}MB (hiện tại: ${(file.size / 1024 / 1024).toFixed(1)}MB)`, 'error');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
  };

  // ── After crop confirmed → upload blob ────────────────────────────────────
  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null);

    // Optimistic preview
    const preview = URL.createObjectURL(blob);
    setAvatarPreview(preview);
    setIsUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append('avatar', blob, 'avatar.jpg');

      const res  = await fetch('/api/auth/update-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error);

      updateAvatar(data.avatar_url);
      setAvatarPreview(null);
      showToast('Cập nhật ảnh đại diện thành công!');
    } catch (err: any) {
      setAvatarPreview(null);
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  // ── Name save ────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed)           { showToast('Tên không được để trống', 'error'); return; }
    if (trimmed === user?.name) { setIsEditingName(false); return; }

    setIsSavingName(true);
    try {
      const res  = await fetch('/api/auth/update-profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshUser();
      setIsEditingName(false);
      showToast('Cập nhật tên thành công!');
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setIsSavingName(false);
    }
  };

  const cancelEditName = () => { setNameValue(user?.name || ''); setIsEditingName(false); };

  const roleLabel: Record<string, string> = {
    admin:     'Quản trị viên',
    moderator: 'Điều phối viên',
    user:      'Người dùng',
  };

  return (
    <>
      {/* ── Crop Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cropSrc && (
          <CropModal
            src={cropSrc}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>

      {/* ── Change Password Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showChangePwd && (
          <ChangePasswordModal
            userEmail={user?.email ?? ''}
            onClose={() => setShowChangePwd(false)}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* ── Toast ───────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`fixed top-6 right-8 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl font-bold text-sm text-white ${
                toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            >
              {toast.type === 'success' ? <Check size={18} /> : <X size={18} />}
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-2xl w-full mx-auto px-6 md:px-10 py-10">

          {/* ── Heading ───────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Hồ sơ cá nhân</h2>
            <p className="text-slate-500 mt-1 font-medium">Quản lý thông tin và ảnh đại diện của bạn.</p>
          </motion.div>

          {/* ── Avatar Card ───────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 mb-6 flex flex-col sm:flex-row items-center gap-8"
          >
            {/* Avatar circle */}
            <div className="relative group shrink-0">
              <div
                className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-white shadow-xl cursor-pointer relative"
                onClick={() => avatarInputRef.current?.click()}
                title="Đổi ảnh đại diện"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-sky-400 to-pink-400 flex items-center justify-center text-white font-black text-4xl select-none">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {isUploadingAvatar
                    ? <Loader2 size={22} className="text-white animate-spin" />
                    : <><Camera size={22} className="text-white" /><span className="text-white text-[10px] font-bold mt-1">Thay đổi</span></>
                  }
                </div>
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-xl font-extrabold text-slate-800 truncate">{user?.name}</h3>
              <p className="text-slate-500 text-sm font-medium mt-0.5 truncate">{user?.email}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-xs font-bold border border-sky-100">
                <ShieldCheck size={13} />
                {roleLabel[user?.role ?? 'user'] ?? user?.role}
              </div>

              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 px-4 py-2 rounded-xl border border-slate-200 hover:border-sky-200 transition-all mx-auto sm:mx-0 disabled:opacity-60"
              >
                {isUploadingAvatar ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                {isUploadingAvatar ? 'Đang tải lên…' : 'Đổi ảnh đại diện'}
              </button>

              {/* File size hint */}
              <p className="text-[11px] text-slate-400 font-medium mt-2 mx-auto sm:mx-0">
                PNG · JPEG · WebP — tối đa {MAX_FILE_MB}MB
              </p>
            </div>
          </motion.div>

          {/* ── Info Fields Card ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6"
          >
            <div className="px-8 py-5 border-b border-slate-100">
              <h4 className="font-extrabold text-slate-700 text-base">Thông tin cá nhân</h4>
            </div>

            {/* Display Name */}
            <div className="px-8 py-6 border-b border-slate-50">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                <User size={12} /> Tên hiển thị
              </label>

              {isEditingName ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') cancelEditName(); }}
                    autoFocus
                    maxLength={60}
                    className="flex-1 bg-slate-50 border border-sky-300 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-200 transition-all"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm px-4 py-3 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {isSavingName ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {isSavingName ? 'Đang lưu' : 'Lưu'}
                  </button>
                  <button
                    onClick={cancelEditName}
                    className="flex items-center justify-center w-11 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <span className="text-base font-bold text-slate-800">{user?.name}</span>
                  <button
                    onClick={() => { setNameValue(user?.name || ''); setIsEditingName(true); }}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Pencil size={13} /> Chỉnh sửa
                  </button>
                </div>
              )}
            </div>

            {/* Email */}
            <div className="px-8 py-6">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                <Mail size={12} /> Địa chỉ Email
              </label>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-slate-800">{user?.email}</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">Không thể thay đổi</span>
              </div>
            </div>
          </motion.div>

          {/* ── Bảo mật Card ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6"
          >
            <div className="px-8 py-5 border-b border-slate-100">
              <h4 className="font-extrabold text-slate-700 text-base">Bảo mật</h4>
            </div>
            <div className="px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Mật khẩu</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Đổi mật khẩu qua xác thực OTP email</p>
              </div>
              <button
                onClick={() => setShowChangePwd(true)}
                className="flex items-center gap-2 text-sm font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-4 py-2 rounded-xl border border-sky-100 hover:border-sky-200 transition-all"
              >
                <KeyRound size={15} /> Đổi mật khẩu
              </button>
            </div>
          </motion.div>

          {/* ── Tip ──────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-4 flex items-start gap-3"
          >
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm text-amber-700 font-medium leading-relaxed">
              Ảnh đại diện và tên hiển thị của bạn sẽ được hiển thị cho các thành viên trong nhóm khi cộng tác.
            </p>
          </motion.div>

        </div>
      </div>
    </>
  );
}
