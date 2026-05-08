import { useNavigate } from 'react-router-dom';
import { XCircle, RefreshCw, ArrowLeft, MessageCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full text-center">
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl">
          
          {/* Icon */}
          <div className="inline-flex mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center shadow-lg border border-white/10">
              <XCircle className="w-12 h-12 text-slate-400" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-black text-white tracking-tight">
            Thanh toán bị hủy
          </h1>

          <p className="mt-4 text-white/50 text-base leading-relaxed max-w-sm mx-auto">
            Bạn đã hủy giao dịch. Đừng lo — không có khoản phí nào bị tính cả. Bạn có thể thử lại bất cứ lúc nào.
          </p>

          {/* Divider */}
          <div className="mt-8 border-t border-white/10 pt-8">
            <p className="text-white/40 text-sm mb-6">Bạn muốn làm gì tiếp theo?</p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Thử lại */}
              <button
                onClick={() => navigate('/pricing')}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 group"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Thử lại
              </button>

              {/* Về trang chủ */}
              <button
                onClick={() => navigate('/')}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 font-semibold py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4" />
                Về trang chủ
              </button>
            </div>
          </div>

          {/* Support link */}
          <div className="mt-8 flex items-center justify-center gap-2 text-white/30 text-sm">
            <MessageCircle className="w-4 h-4" />
            <span>Cần hỗ trợ? </span>
            <a
              href="mailto:support@kanvapro.com"
              className="text-indigo-400 hover:text-indigo-300 transition-colors underline underline-offset-2"
            >
              Liên hệ chúng tôi
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
