import { useEffect, useState } from 'react';
import { Check, Loader2, Crown, Sparkles, BadgeCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { fetchActiveSubscriptions, createCheckoutSession } from '../api/api';

export default function PricingPage() {
  const { user } = useAuth();
  const { isPro, planSlug } = useSubscription();
  const navigate = useNavigate();
  
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

  // 1. Tải danh sách các gói cước từ DB
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await fetchActiveSubscriptions();
        let plansData = data.subscriptions || data.plans || data || [];
        
        // Loại bỏ gói Free (giá = 0) khỏi danh sách hiển thị
        plansData = plansData.filter((plan: any) => Number(plan.monthly_price) > 0);
        
        setSubscriptions(plansData);
      } catch (error) {
        console.error("Lỗi tải gói cước:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPlans();
  }, []);

  // 2. Xử lý khi User bấm nút thanh toán
  const handleSubscribe = async (sub: any) => {
    // Nếu là gói Free (Giá = 0) -> Cho về Dashboard xài luôn
    if (Number(sub.monthly_price) === 0) {
      navigate('/');
      return;
    }

    // Bắt buộc đăng nhập trước khi mua gói mất tiền
    if (!user) {
      alert("Vui lòng đăng nhập tài khoản trước khi nâng cấp!");
      navigate('/login');
      return;
    }

    // Nếu đang dùng gói này rồi -> Không làm gì
    if (isPro && planSlug === sub.slug) {
      alert("Bạn đang sử dụng gói này! Gói sẽ tự động gia hạn khi hết thời hạn.");
      return;
    }

    // Bắt đầu quá trình gọi PayOS
    try {
      setIsCheckingOut(sub.id);
      
      const response = await createCheckoutSession({
        planId: sub.id,
        amount: Number(sub.monthly_price),
        planName: sub.name
      });

      // Nếu Backend trả về checkoutUrl của PayOS -> Chuyển hướng sang trang thanh toán
      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      }
    } catch (error) {
      alert("Hệ thống thanh toán đang bận. Vui lòng thử lại sau!");
      setIsCheckingOut(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-slate-500 font-medium">Đang tải bảng giá...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto text-center">
        <Link to="/" className="text-indigo-500 font-bold hover:text-indigo-700 hover:underline mb-6 inline-block transition">
          ← Quay lại Bảng điều khiển
        </Link>
        <h2 className="text-3xl font-black text-slate-900 sm:text-5xl tracking-tight">
          Nâng tầm thiết kế của bạn
        </h2>
        <p className="mt-4 text-lg text-slate-600 font-medium max-w-2xl mx-auto">
          Chọn gói cước phù hợp nhất với nhu cầu cá nhân hoặc đội nhóm của bạn. Mở khóa hàng triệu tài nguyên bản quyền.
        </p>

        {/* Badge trạng thái gói hiện tại */}
        {isPro && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold px-5 py-2 rounded-full">
              <Sparkles className="w-4 h-4" />
              Bạn đang dùng gói <strong>{user?.subscription?.plan_name}</strong>
            </div>
            <p className="text-xs text-indigo-500 max-w-md mx-auto">
              * Hệ thống sẽ tự động tính toán và <strong>giảm trừ số tiền còn dư</strong> của gói hiện tại vào hóa đơn thanh toán khi bạn chọn nâng cấp gói cao hơn.
            </p>
          </div>
        )}
      </div>

      <div className="mt-16 grid gap-8 lg:grid-cols-3 max-w-7xl mx-auto items-center">
        {subscriptions.length === 0 && (
          <div className="col-span-3 text-center text-slate-500">
            Chưa có gói cước nào được tạo trong hệ thống.
          </div>
        )}

        {subscriptions.map((sub) => {
          const isFree = Number(sub.monthly_price) === 0;
          const isPro = sub.slug?.toLowerCase().includes('pro'); // Tự động Highlight gói Pro
          const isCurrentPlan = user?.subscription?.plan_id === sub.id && 
                                 user?.subscription?.status === 'active';

          // Parse JSONB features từ DB an toàn
          let featuresList: string[] = [];
          if (typeof sub.features === 'string') {
            try { featuresList = JSON.parse(sub.features); } catch(e) {}
          } else if (Array.isArray(sub.features)) {
            featuresList = sub.features;
          }

          return (
            <div 
              key={sub.id} 
              className={`bg-white rounded-3xl p-8 flex flex-col relative transition-all duration-300 ${
                isCurrentPlan
                  ? 'shadow-2xl shadow-emerald-500/20 border-2 border-emerald-500 transform lg:scale-105 z-10'
                  : isPro 
                    ? 'shadow-2xl shadow-indigo-500/20 border-2 border-indigo-500 transform lg:scale-105 z-10' 
                    : 'shadow-lg shadow-slate-200/50 border border-slate-200 hover:border-indigo-300'
              }`}
            >
              {/* Badge "Gói hiện tại" nếu user đang dùng gói này */}
              {isCurrentPlan && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-md flex items-center gap-1">
                  <BadgeCheck size={12} /> GÓI HIỆN TẠI
                </div>
              )}
              
              {/* Badge "Phổ biến nhất" cho gói Pro */}
              {isPro && !isCurrentPlan && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-md flex items-center gap-1">
                  <Crown size={12} /> PHỔ BIẾN NHẤT
                </div>
              )}
              
              <h3 className="text-2xl font-black text-slate-900 mt-2">{sub.name}</h3>
              <p className="mt-3 text-sm text-slate-500 font-medium min-h-[40px]">
                {isFree ? "Dành cho cá nhân mới bắt đầu khám phá." : "Dành cho nhà thiết kế chuyên nghiệp & doanh nghiệp."}
              </p>
              
              <div className="mt-6 flex items-end gap-1">
                <span className="text-5xl font-black text-slate-900 tracking-tighter">
                  {Number(sub.monthly_price).toLocaleString('vi-VN')}đ
                </span>
                <span className="text-base font-bold text-slate-400 mb-1">/tháng</span>
              </div>
              
              <ul className="mt-8 space-y-4 flex-1">
                {featuresList.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 rounded-full p-1 ${
                      isCurrentPlan 
                        ? 'bg-emerald-100 text-emerald-600'
                        : isPro ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button 
                onClick={() => handleSubscribe(sub)}
                disabled={isCheckingOut === sub.id || isCurrentPlan}
                className={`mt-10 w-full font-bold py-4 px-6 rounded-xl text-center transition-all duration-300 flex items-center justify-center gap-2 ${
                  isCurrentPlan
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : isFree 
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                      : isPro 
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-1' 
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {isCheckingOut === sub.id ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Đang chuyển hướng...</>
                ) : isCurrentPlan ? (
                  <><BadgeCheck className="w-5 h-5" /> Gói hiện tại của bạn</>
                ) : (
                  isFree ? "Bắt đầu miễn phí" : `Nâng cấp ${sub.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}