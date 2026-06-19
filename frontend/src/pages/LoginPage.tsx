import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';

type AuthStep =
  | 'login'
  | 'otp'              // OTP đăng nhập chưa verify
  | 'admin_2fa'        // Admin 2FA - bước 2 sau khi login đúng password
  | 'forgot_email'    // Nhập email forgot password
  | 'forgot_otp'      // Nhập OTP reset
  | 'reset_password'; // Nhập mật khẩu mới

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>('login');

  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');

  // Forgot password states
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotUserId, setForgotUserId] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const clearMessages = () => { setError(''); setSuccess(''); };

  // ─── Login ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // [FIX 5] Admin 2FA: backend trả về require2FA thay vì token
      if (data.require2FA) {
        setUserId(data.userId);
        setStep('admin_2fa');
        setSuccess(data.message || 'Mã 2FA đã gửi về email của bạn.');
        return;
      }

      if (data.user?.is_verified === false) {
        setUserId(data.userId);
        setStep('otp');
      } else {
        if (data.token) localStorage.setItem('token', data.token);
        await login(data.user);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Verify Login OTP (user chưa verify email) ─────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp, type: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.token) localStorage.setItem('token', data.token);
      await login(data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── [FIX 5] Verify Admin 2FA OTP ─────────────────────────────────────────────────
  const handleVerifyAdmin2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/admin-verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.token) localStorage.setItem('token', data.token);
      await login(data.user);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password: Step 1 – Gửi email ─────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setForgotUserId(data.userId || '');
      setSuccess('Mã OTP đã được gửi tới email của bạn!');
      setStep('forgot_otp');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password: Step 2 – Xác thực OTP ──────────────────────────────
  const handleVerifyForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/verify-forgot-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: forgotUserId, otp: forgotOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResetToken(data.reset_token);
      setSuccess('OTP hợp lệ! Hãy nhập mật khẩu mới.');
      setStep('reset_password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password: Step 3 – Đặt lại mật khẩu ─────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (newPassword !== confirmPassword) {
      return setError('Mật khẩu xác nhận không khớp!');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess('Đặt lại mật khẩu thành công! Đang chuyển sang trang đăng nhập...');
      setTimeout(() => {
        setStep('login');
        setForgotEmail(''); setForgotOtp(''); setResetToken('');
        setNewPassword(''); setConfirmPassword('');
        clearMessages();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all outline-none text-slate-700 font-medium';
  const labelClass = 'block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2';
  const btnPrimary =
    'mt-4 w-full bg-gradient-to-r from-sky-400 to-pink-400 text-white py-3.5 px-4 rounded-2xl hover:from-sky-500 hover:to-pink-500 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 font-bold disabled:opacity-50';

  const stepConfig: Record<AuthStep, string> = {
    login: 'Welcome Back',
    otp: 'Enter OTP',
    admin_2fa: 'Admin Verification', // [FIX 5]
    forgot_email: 'Forgot Password',
    forgot_otp: 'Enter Reset OTP',
    reset_password: 'New Password',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-white to-pink-100 font-sans relative overflow-hidden">

      {/* Ambient Blobs */}
      <div className="absolute top-0 left-[-10%] w-[500px] h-[500px] bg-pink-300/30 rounded-full mix-blend-multiply blur-3xl opacity-70" />
      <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-sky-300/30 rounded-full mix-blend-multiply blur-3xl opacity-70" />
      <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] bg-purple-200/40 rounded-full mix-blend-multiply blur-3xl opacity-70" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="bg-white/70 backdrop-blur-2xl p-10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 w-full max-w-md relative z-10"
      >
        <h1 className="text-3xl font-extrabold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-pink-500 tracking-tight">
          {stepConfig[step]}
        </h1>

        {/* Thông báo lỗi & thành công */}
        <AnimatePresence>
          {error && (
            <motion.div key="err" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-medium text-center border border-red-100">
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div key="ok" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl mb-6 text-sm font-medium text-center border border-emerald-100">
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bước Login ── */}
        {step === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} maxLength={20} className={inputClass + " pr-14"} required />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot Password link */}
            <div className="text-right">
              <button type="button" onClick={() => { clearMessages(); setStep('forgot_email'); }}
                className="text-xs font-bold text-sky-500 hover:text-pink-500 transition-colors">
                Forgot Password?
              </button>
            </div>

            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? 'Processing...' : 'Log in to Kanva'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-sm"><span className="px-4 bg-transparent text-slate-400 font-medium">Or</span></div>
            </div>
          </form>
        )}

        {/* ── Bước OTP (đăng nhập chưa verify) ── */}
        {step === 'otp' && (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerifyOtp} className="space-y-6">
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              We've sent a 6-digit code to <strong className="text-slate-700">{email}</strong>.<br />Please enter it below.
            </p>
            <input type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456"
              className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-slate-200 bg-white/50 px-4 py-4 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all outline-none font-mono font-bold text-slate-700 shadow-inner" required />
            <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Verifying...' : 'Verify & Login'}</button>
            <button type="button" onClick={() => setStep('login')} className="w-full text-sm font-bold text-slate-400 hover:text-sky-500 transition-colors">
              ← Back to Login
            </button>
          </motion.form>
        )}

        {/* ── [FIX 5] Bước Admin 2FA ── */}
        {step === 'admin_2fa' && (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerifyAdmin2FA} className="space-y-6">
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 text-center leading-relaxed">
                Xác thực 2 bước bắt buộc cho tài khoản Admin.<br />
                Mã 6 số đã được gửi đến <strong className="text-slate-700">{email}</strong>.
              </p>
            </div>
            <input
              id="admin-2fa-otp"
              type="text" maxLength={6} value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-violet-200 bg-white/50 px-4 py-4 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-all outline-none font-mono font-bold text-slate-700 shadow-inner"
              required autoFocus
            />
            <button type="submit" disabled={loading}
              className="mt-4 w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white py-3.5 px-4 rounded-2xl hover:from-violet-600 hover:to-purple-700 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 font-bold disabled:opacity-50">
              {loading ? 'Verifying...' : 'Đăng nhập vào Admin Panel'}
            </button>
            <button type="button" onClick={() => { setStep('login'); setOtp(''); clearMessages(); }}
              className="w-full text-sm font-bold text-slate-400 hover:text-violet-500 transition-colors">
              ← Quấy lại trang đăng nhập
            </button>
          </motion.form>
        )}

        {/* ── Bước nhập Email để Forgot Password ── */}
        {step === 'forgot_email' && (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleForgotPassword} className="space-y-5">
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Nhập địa chỉ email của bạn và chúng tôi sẽ gửi mã OTP để đặt lại mật khẩu.
            </p>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={inputClass} required placeholder="your@email.com" />
            </div>
            <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Sending...' : 'Send OTP'}</button>
            <button type="button" onClick={() => { clearMessages(); setStep('login'); }} className="w-full text-sm font-bold text-slate-400 hover:text-sky-500 transition-colors">
              ← Back to Login
            </button>
          </motion.form>
        )}

        {/* ── Bước nhập OTP reset password ── */}
        {step === 'forgot_otp' && (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerifyForgotOtp} className="space-y-6">
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Nhập mã 6 số đã được gửi tới <strong className="text-slate-700">{forgotEmail}</strong>.
            </p>
            <input type="text" maxLength={6} value={forgotOtp} onChange={e => setForgotOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456"
              className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-slate-200 bg-white/50 px-4 py-4 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all outline-none font-mono font-bold text-slate-700 shadow-inner" required />
            <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
            <button type="button" onClick={() => setStep('forgot_email')} className="w-full text-sm font-bold text-slate-400 hover:text-sky-500 transition-colors">
              ← Gửi lại OTP
            </button>
          </motion.form>
        )}

        {/* ── Bước nhập mật khẩu mới ── */}
        {step === 'reset_password' && (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className={labelClass}>Mật khẩu mới</label>
              <div className="relative">
                <input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} maxLength={20} className={inputClass + " pr-14"} required minLength={6} placeholder="Tối thiểu 6 ký tự" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Xác nhận mật khẩu</label>
              <div className="relative">
                <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} maxLength={20} className={inputClass + " pr-14"} required placeholder="Nhập lại mật khẩu mới" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Updating...' : 'Đặt lại mật khẩu'}</button>
          </motion.form>
        )}

        <p className="mt-8 text-center text-sm font-medium text-slate-500">
          Don't have an account? <Link to="/register" className="text-pink-500 hover:text-pink-600 transition-colors font-bold">Register</Link>
        </p>
      </motion.div>
    </div>
  );
}