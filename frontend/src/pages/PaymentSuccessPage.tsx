import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { verifyPayment } from '../api/api';
import { CheckCircle, Crown, Sparkles, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

// Tạo hiệu ứng confetti đơn giản bằng canvas
function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      color: string; size: number; angle: number; spin: number;
    }> = [];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }

    let animFrameId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allDone = true;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.vy += 0.05;
        if (p.y < canvas.height + 20) {
          allDone = false;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      if (!allDone) animFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}

type Status = 'verifying' | 'success' | 'error';

export default function PaymentSuccessPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(8);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const orderCode = searchParams.get('orderCode');

    const run = async () => {
      try {
        if (!orderCode) {
          // Không có orderCode → có thể user vào thẳng URL này
          // Vẫn thử refresh user để lấy subscription mới nhất
          await refreshUser();
          setStatus('success');
          return;
        }

        // Bước 1: Gọi backend xác minh với PayOS + kích hoạt DB
        console.log(`[PaymentSuccess] Đang verify orderCode=${orderCode}...`);
        await verifyPayment(orderCode);

        // Bước 2: Refresh user state để app nhận diện VIP ngay lập tức
        await refreshUser();

        setStatus('success');
      } catch (err: any) {
        console.error('[PaymentSuccess] Lỗi verify:', err);
        setErrorMsg(err?.message || 'Không thể xác minh giao dịch');
        setStatus('error');
        // Dù lỗi vẫn refresh để đảm bảo state mới nhất
        await refreshUser().catch(() => {});
      }
    };

    run();
  }, [searchParams, refreshUser]);

  // Đếm ngược tự động về Dashboard khi thành công
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, navigate]);

  const planName = user?.subscription?.plan_name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      {status === 'success' && <ConfettiCanvas />}

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full text-center">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl shadow-indigo-500/10">

          {/* ĐANG XÁC MINH */}
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-5">
              <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
              <div>
                <p className="text-white text-xl font-bold">Đang xác minh giao dịch...</p>
                <p className="text-white/50 text-sm mt-2">Vui lòng không đóng trang này</p>
              </div>
            </div>
          )}

          {/* THÀNH CÔNG */}
          {status === 'success' && (
            <>
              <div className="relative inline-flex mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/40 animate-bounce-slow">
                  <CheckCircle className="w-12 h-12 text-white" strokeWidth={1.5} />
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                  <Crown className="w-4 h-4 text-white" />
                </div>
              </div>

              <h1 className="text-3xl font-black text-white tracking-tight">
                Thanh toán thành công! 🎉
              </h1>

              {planName && (
                <div className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/30 text-indigo-300 text-sm font-semibold px-5 py-2.5 rounded-full">
                  <Sparkles className="w-4 h-4" />
                  Gói <span className="text-white font-black">{planName}</span> đã được kích hoạt
                </div>
              )}

              <p className="mt-6 text-white/60 text-base leading-relaxed">
                Tài khoản của bạn đã được nâng cấp. Tất cả tính năng premium đang chờ bạn khám phá!
              </p>

              <p className="mt-4 text-white/40 text-sm">
                Tự động về trang chủ sau <span className="text-indigo-400 font-bold">{countdown}s</span>
              </p>

              <button
                onClick={() => navigate('/')}
                className="mt-8 w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 group"
              >
                Bắt đầu thiết kế ngay
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </>
          )}

          {/* LỖI */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <p className="text-white text-xl font-bold">Không thể xác minh giao dịch</p>
                <p className="text-white/50 text-sm mt-2">{errorMsg}</p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => { hasRun.current = false; setStatus('verifying'); }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all"
                >
                  Thử lại
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 font-semibold py-3 px-4 rounded-xl transition-all"
                >
                  Về trang chủ
                </button>
              </div>
              <p className="text-white/30 text-xs">
                Nếu đã bị trừ tiền, liên hệ support@kanvapro.com
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
