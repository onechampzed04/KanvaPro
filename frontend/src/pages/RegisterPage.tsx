import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setUserId(data.userId);
      setShowOtp(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp, type: 'registration' }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      login(data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-white to-pink-100 font-sans relative overflow-hidden">
      
      {/* Các khối màu mờ trang trí phía sau (Ambient Blobs) */}
      <div className="absolute top-0 left-[-10%] w-[500px] h-[500px] bg-pink-300/30 rounded-full mix-blend-multiply blur-3xl opacity-70"></div>
      <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-sky-300/30 rounded-full mix-blend-multiply blur-3xl opacity-70"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] bg-purple-200/40 rounded-full mix-blend-multiply blur-3xl opacity-70"></div>

      {/* Form đăng ký với hiệu ứng trượt lên nhẹ nhàng */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="bg-white/70 backdrop-blur-2xl p-10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 w-full max-w-md relative z-10"
      >
        <h1 className="text-3xl font-extrabold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-pink-500 tracking-tight">
          Create Account
        </h1>
        {error && <div className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-medium text-center border border-red-100">{error}</div>}
        
        {!showOtp ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all outline-none text-slate-700 font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all outline-none text-slate-700 font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all outline-none text-slate-700 font-medium"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-gradient-to-r from-sky-400 to-pink-400 text-white py-3.5 px-4 rounded-2xl hover:from-sky-500 hover:to-pink-500 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 font-bold disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        ) : (
          <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerifyOtp} className="space-y-6">
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              We've sent a 6-digit code to <strong className="text-slate-700">{email}</strong>.<br/>Please enter it below to verify.
            </p>
            <div>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-slate-200 bg-white/50 px-4 py-4 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all outline-none font-mono font-bold text-slate-700 shadow-inner"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-400 to-pink-400 text-white py-3.5 px-4 rounded-2xl hover:from-sky-500 hover:to-pink-500 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 font-bold disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Complete'}
            </button>
            <button
              type="button"
              onClick={() => setShowOtp(false)}
              className="w-full text-sm font-bold text-slate-400 hover:text-sky-500 transition-colors"
            >
              Back to Registration
            </button>
          </motion.form>
        )}

        <p className="mt-8 text-center text-sm font-medium text-slate-500">
          Already have an account? <Link to="/login" className="text-pink-500 hover:text-pink-600 transition-colors font-bold">Login</Link>
        </p>
      </motion.div>
    </div>
  );
}
