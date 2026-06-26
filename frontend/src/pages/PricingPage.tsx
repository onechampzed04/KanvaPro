import { useEffect, useState } from 'react';
import { Check, Loader2, Crown, Sparkles, BadgeCheck, X, ArrowRight, Tag, RefreshCw, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useSubscription } from '../hooks/useSubscription';
import { fetchActiveSubscriptions, createCheckoutSession, previewUpgrade } from '../api/api';
import TeamOnboarding from '../components/dashboard/TeamOnboarding';

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

export default function PricingPage() {
  const { user } = useAuth();
  const { isPro: isUserPro, planSlug } = useSubscription();
  const { currentWorkspace, workspaces } = useWorkspace();
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [tokenPackages, setTokenPackages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);
  const [showTeamOnboarding, setShowTeamOnboarding] = useState(false);
  const [isTokenCheckout, setIsTokenCheckout] = useState<string | null>(null);

  const [previewModal, setPreviewModal] = useState<{
    show: boolean;
    sub: any;
    preview: any;
    isLoadingPreview: boolean;
    teamId?: string;
    membersCount?: number;
  }>({ show: false, sub: null, preview: null, isLoadingPreview: false });

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await fetchActiveSubscriptions();
        let plansData = data.subscriptions || data.plans || data || [];
        setSubscriptions(plansData);
      } catch (error) {
        console.error('Lỗi tải gói cước:', error);
      }
    };
    const loadTokens = async () => {
      try {
        const res = await fetch('/api/ai/packages');
        if (res.ok) {
          const data = await res.json();
          setTokenPackages(data.packages || []);
        }
      } catch (e) {
        console.error('Lỗi tải gói token:', e);
      }
    };
    
    Promise.all([loadPlans(), loadTokens()]).finally(() => {
      setIsLoading(false);
    });
  }, []);

  // [MỚI] Bước 1: Bấm nút → Gọi Preview API → Hiện Modal xác nhận
  const handleSubscribe = async (sub: any) => {
    if (Number(sub.monthly_price) === 0) { navigate('/'); return; }

    if (!user) {
      alert('Vui lòng đăng nhập tài khoản trước khi nâng cấp!');
      navigate('/login');
      return;
    }

    if (isUserPro && planSlug === sub.slug) {
      alert('Bạn đang sử dụng gói này! Gói sẽ tự động gia hạn khi hết thời hạn.');
      return;
    }

    const isTeamPlan = sub.slug === 'pro_team';
    let targetTeamId = undefined;
    let targetMembersCount = undefined;

    if (isTeamPlan) {
      if (currentWorkspace && currentWorkspace.workspace_type !== 'personal') {
        // User is currently INSIDE a team workspace
        if (currentWorkspace.my_role !== 'owner') {
          alert('Chỉ chủ nhóm (Owner) mới có quyền gia hạn nhóm này!');
          return;
        }
        targetTeamId = currentWorkspace.id;
        targetMembersCount = currentWorkspace.max_members || 1;
      } else {
        // User is in a personal workspace.
        const userOwnedTeam = workspaces.find(w => w.workspace_type !== 'personal' && w.my_role === 'owner');
        if (userOwnedTeam) {
          alert('Bạn đã sở hữu một nhóm. Mỗi tài khoản chỉ được tạo tối đa 1 nhóm để dễ quản lý.');
          return;
        }
        // User does not own any team, show onboarding
        setShowTeamOnboarding(true);
        return;
      }
    }

    // Mở modal với trạng thái loading
    setPreviewModal({ show: true, sub, preview: null, isLoadingPreview: true, teamId: targetTeamId, membersCount: targetMembersCount });

    try {
      const preview = await previewUpgrade(sub.id, targetMembersCount);
      setPreviewModal(prev => ({ ...prev, preview, isLoadingPreview: false }));
    } catch (error) {
      // Nếu lỗi preview, vẫn cho phép checkout với giá gốc
      setPreviewModal(prev => ({
        ...prev,
        preview: { newPlanName: sub.name, originalAmount: sub.monthly_price, deductionValue: 0, finalAmount: sub.monthly_price, currentPlanName: null },
        isLoadingPreview: false,
      }));
    }
  };

  const handleConfirmCheckout = async () => {
    const sub = previewModal.sub;
    if (!sub) return;
    setIsCheckingOut(sub.id);
    try {
      const response = await createCheckoutSession({
        planId: sub.id,
        planName: sub.name,
        teamId: previewModal.teamId,
        membersCount: previewModal.membersCount
      } as any);
      if (response.checkoutUrl) window.location.href = response.checkoutUrl;
    } catch (error) {
      alert('Hệ thống thanh toán đang bận. Vui lòng thử lại sau!');
      setIsCheckingOut(null);
    }
  };

  const handleTokenCheckout = async (pkg: any) => {
    if (!user) {
      alert('Vui lòng đăng nhập để mua token!');
      navigate('/login');
      return;
    }
    setIsTokenCheckout(pkg.id);
    try {
      const res = await fetch('/api/payments/create-token-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo thanh toán');
      window.location.href = data.checkoutUrl;
    } catch (error) {
      alert('Không thể tạo link thanh toán gói token. Vui lòng thử lại sau!');
      setIsTokenCheckout(null);
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

  if (showTeamOnboarding) {
    return (
      <div className="relative w-full h-full min-h-screen bg-slate-50">
        <button
          onClick={() => setShowTeamOnboarding(false)}
          className="absolute top-4 left-4 z-50 bg-white p-2 rounded-full shadow-md text-slate-500 hover:text-indigo-600 transition"
        >
          <X size={24} />
        </button>
        <TeamOnboarding />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent py-12 px-4 sm:px-6 lg:px-8 font-sans">

      {/* ─── [MỚI] Modal Checkout Preview (Tạm tính trước khi thanh toán) ─── */}
      {previewModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
            <button
              onClick={() => setPreviewModal(prev => ({ ...prev, show: false }))}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-black text-slate-800 mb-1">Xác nhận nâng cấp gói</h3>
            <p className="text-sm text-slate-500 mb-6">Kiểm tra thông tin hóa đơn tạm tính trước khi thanh toán</p>

            {previewModal.isLoadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-indigo-500 w-8 h-8" />
                <span className="ml-3 text-slate-500">Đang tính toán...</span>
              </div>
            ) : previewModal.preview && (
              <>
                {/* Chi tiết tạm tính */}
                <div className="bg-slate-50 rounded-xl p-5 space-y-3 mb-6">
                  {previewModal.teamId && (
                    <div className="flex justify-between text-sm mb-2 pb-2 border-b border-slate-200">
                      <span className="text-slate-600">Gia hạn nhóm:</span>
                      <span className="font-bold text-slate-800">{currentWorkspace?.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Gói đăng ký:</span>
                    <span className="font-bold text-slate-800">
                      {previewModal.preview.newPlanName}
                      {previewModal.membersCount ? ` (${previewModal.membersCount} thành viên)` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Giá gốc:</span>
                    <span className="font-semibold text-slate-700">{formatVND(previewModal.preview.originalAmount)}</span>
                  </div>
                  {previewModal.preview.deductionValue > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 flex items-center gap-1">
                        <Tag size={13} className="text-rose-500" />
                        Cấn trừ gói {previewModal.preview.currentPlanName} ({previewModal.preview.remainingDays} ngày còn lại):
                      </span>
                      <span className="font-semibold text-rose-500">- {formatVND(previewModal.preview.deductionValue)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-3 flex justify-between">
                    <span className="font-black text-slate-800">Tổng thanh toán ngay:</span>
                    <span className="font-black text-xl text-indigo-600">{formatVND(previewModal.preview.finalAmount)}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-6 text-center">
                  Bạn sẽ được chuyển đến trang thanh toán an toàn của PayOS
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setPreviewModal(prev => ({ ...prev, show: false }))}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleConfirmCheckout}
                    disabled={!!isCheckingOut}
                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isCheckingOut ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...</>
                    ) : (
                      <>Xác nhận & Thanh toán <ArrowRight size={16} /></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto text-center">
        <h2 className="text-3xl font-black text-slate-900 sm:text-5xl tracking-tight">
          Nâng tầm thiết kế của bạn
        </h2>
        <p className="mt-4 text-lg text-slate-600 font-medium max-w-2xl mx-auto">
          Chọn gói cước phù hợp nhất với nhu cầu cá nhân hoặc đội nhóm của bạn. Mở khóa hàng triệu tài nguyên bản quyền.
        </p>

        {/* Badge trạng thái gói hiện tại — [ĐÃ SỬA] Bỏ mô tả mơ hồ, thêm link Billing */}
        {isUserPro && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold px-5 py-2 rounded-full">
              <Sparkles className="w-4 h-4" />
              Bạn đang dùng gói <strong>{user?.subscription?.plan_name}</strong>
            </div>
            <p className="text-xs text-indigo-500 max-w-md mx-auto">
              * Khi nâng cấp, hệ thống sẽ tự động <strong>tính toán và trừ số tiền còn dư</strong> của gói hiện tại.
              Bạn sẽ thấy số tiền chính xác cần thanh toán trước khi xác nhận.
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
          const isCurrentPlan = isUserPro ? user?.subscription?.plan_id === sub.id : isFree;

          // Parse JSONB features từ DB an toàn
          let featuresList: string[] = [];
          if (typeof sub.features === 'string') {
            try { featuresList = JSON.parse(sub.features); } catch (e) { }
          } else if (Array.isArray(sub.features)) {
            featuresList = sub.features;
          }

          const isTeamPlan = sub.slug === 'pro_team';
          const isCurrentWorkspaceTeam = currentWorkspace != null && currentWorkspace.workspace_type !== 'personal';
          const isTeamRenewal = isTeamPlan && isCurrentWorkspaceTeam && currentWorkspace?.my_role === 'owner';
          
          const userOwnedTeam = workspaces.find(w => w.workspace_type !== 'personal' && w.my_role === 'owner');
          const isAlreadyOwnedTeam = isTeamPlan && !isCurrentWorkspaceTeam && !!userOwnedTeam;

          return (
            <div
              key={sub.id}
              className={`bg-white rounded-3xl p-8 flex flex-col relative transition-all duration-300 ${isCurrentPlan
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
                    <div className={`mt-0.5 shrink-0 rounded-full p-1 ${isCurrentPlan
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
                disabled={isCheckingOut === sub.id || isCurrentPlan || isAlreadyOwnedTeam}
                className={`mt-10 w-full font-bold py-4 px-6 rounded-xl text-center transition-all duration-300 flex items-center justify-center gap-2 ${(isCurrentPlan || isAlreadyOwnedTeam)
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : isFree
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : isTeamRenewal
                        ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-1'
                        : isPro
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-1'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
              >
                {isCheckingOut === sub.id ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Đang chuyển hướng...</>
                ) : isCurrentPlan ? (
                  <><BadgeCheck className="w-5 h-5" /> Gói hiện tại của bạn</>
                ) : isTeamRenewal ? (
                  <><RefreshCw className="w-5 h-5" /> Gia hạn nhóm</>
                ) : isAlreadyOwnedTeam ? (
                  <><BadgeCheck className="w-5 h-5" /> Đã sở hữu nhóm</>
                ) : (
                  isFree ? "Bắt đầu miễn phí" : `Nâng cấp ${sub.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ─── [MỚI] Phần gói Token AI ─── */}
      {tokenPackages.length > 0 && (
        <div className="mt-24 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 flex items-center justify-center gap-3">
              <Sparkles className="text-indigo-500 w-8 h-8" />
              Gói nạp AI Token
            </h2>
            <p className="mt-3 text-slate-500 font-medium max-w-lg mx-auto">
              Hết token tạo ảnh? Mua lẻ các gói token để tiếp tục sử dụng Vertex AI Imagen 3 mà không cần nâng cấp tài khoản.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {tokenPackages.map(pkg => (
              <div key={pkg.id} className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col items-center text-center hover:border-indigo-300 hover:shadow-indigo-500/10 transition-all">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 text-indigo-500">
                  <Zap size={24} fill="currentColor" />
                </div>
                <h4 className="text-xl font-black text-slate-800">{pkg.name}</h4>
                <p className="text-sm text-slate-500 mt-1 mb-4">{pkg.description}</p>
                <div className="flex items-baseline gap-1 mt-auto">
                  <span className="text-3xl font-black text-indigo-600">{formatVND(pkg.price)}</span>
                </div>
                <div className="w-full h-px bg-slate-100 my-5"></div>
                <p className="text-sm font-bold text-slate-700 flex items-center justify-center gap-2 mb-6">
                  <Check size={16} className="text-emerald-500" strokeWidth={3} />
                  Nhận ngay {pkg.token_amount} Token AI
                </p>
                <button
                  onClick={() => handleTokenCheckout(pkg)}
                  disabled={!!isTokenCheckout}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isTokenCheckout === pkg.id ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Đang chuyển hướng...</>
                  ) : (
                    "Mua ngay"
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}