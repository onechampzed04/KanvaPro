// frontend/src/components/dashboard/TeamOnboarding.tsx
// Hiển thị khi user chưa có Team nào.
// Giao diện 2 cột giống Canva: Cột trái (Invite) + Cột phải (Plan Details Card).
import { useState, useEffect, useRef } from 'react';
import { Users, X, Plus, ChevronRight, Crown, Check } from 'lucide-react';
import { fetchTeamPlan, createTeamCheckout, previewUpgrade } from '../../api/api';

interface TeamOnboardingProps {
  onTeamCreated?: () => void;
  isUpgrade?: boolean;
  currentMaxMembers?: number;
}

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function TeamOnboarding({ onTeamCreated, isUpgrade, currentMaxMembers = 0 }: TeamOnboardingProps) {
  const [teamPlan, setTeamPlan] = useState<any>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState('');
  const [seats, setSeats] = useState(isUpgrade ? currentMaxMembers + 1 : 2); // Mặc định mua cho 2 người, nếu upgrade thì +1
  const inputRef = useRef<HTMLInputElement>(null);

  const [previewData, setPreviewData] = useState<any>(null);

  // Số thành viên = số lượng mua
  const membersCount = seats;

  // Tự động tăng số chỗ nếu mời nhiều hơn số chỗ hiện tại
  useEffect(() => {
    const requiredSeats = 1 + emails.length;
    if (requiredSeats > seats) {
      setSeats(requiredSeats);
    }
  }, [emails.length]);

  useEffect(() => {
    fetchTeamPlan()
      .then(setTeamPlan)
      .catch(() => setTeamPlan(null))
      .finally(() => setPlanLoading(false));
  }, []);

  // [MỚI] Fetch preview cấn trừ khi membersCount thay đổi
  useEffect(() => {
    if (teamPlan && isUpgrade) {
      previewUpgrade(teamPlan.id, membersCount)
        .then(setPreviewData)
        .catch(console.error);
    }
  }, [teamPlan, membersCount, isUpgrade]);

  const totalPrice = previewData ? previewData.finalAmount : (teamPlan ? teamPlan.monthly_price * membersCount : 0);
  const totalYearly = teamPlan ? teamPlan.yearly_price * membersCount : 0;

  // Thêm email tag khi nhấn Enter hoặc dấu phẩy
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    } else if (e.key === 'Backspace' && !inputVal && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  };

  const addEmail = () => {
    const val = inputVal.trim().replace(/,$/, '');
    if (!val) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      setError('Email không hợp lệ');
      return;
    }
    if (emails.includes(val)) {
      setError('Email này đã được thêm');
      return;
    }
    setEmails(prev => [...prev, val]);
    setInputVal('');
    setError('');
  };

  const removeEmail = (idx: number) => {
    setEmails(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCheckout = async () => {
    if (!teamPlan) return;
    setLoading(true);
    try {
      // [FIX Vấn đề 3] Không gửi amount — backend tự tính từ DB
      const result = await createTeamCheckout({
        planId: teamPlan.id,
        planName: teamPlan.name,
        inviteEmails: emails,
        membersCount,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khởi tạo thanh toán');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-wider uppercase">
            <Crown size={12} />
            Gói Kanva Team
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
          {/* ── Cột Trái: Invite Area ─────────────────────────────── */}
          <div className="md:col-span-3 space-y-6">
            <div>
              <h1 className="text-4xl font-extrabold text-slate-900 leading-tight mb-3">
                {isUpgrade ? 'Nâng cấp giới hạn' : 'Team up with'}<br />
                <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                  Kanva Team
                </span>
              </h1>
              <p className="text-slate-500 text-base">
                {isUpgrade
                  ? 'Mở rộng đội ngũ của bạn để cùng nhau tạo ra những thiết kế tuyệt vời.'
                  : 'Tạo nhóm làm việc, chia sẻ thiết kế và cộng tác cùng nhau ngay hôm nay.'}
              </p>
            </div>

            {/* Chon so luong cho */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Số lượng thành viên (Bao gồm cả bạn)
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSeats(Math.max(1 + emails.length, Math.max(isUpgrade ? currentMaxMembers + 1 : 1, seats - 1)))}
                  className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-200 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center text-slate-500 font-black text-xl transition"
                >
                  -
                </button>
                <div className="w-20 h-12 bg-slate-50 border-2 border-slate-200 rounded-2xl flex items-center justify-center font-black text-xl text-slate-700">
                  {seats}
                </div>
                <button
                  onClick={() => setSeats(seats + 1)}
                  className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-200 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center text-slate-500 font-black text-xl transition"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-medium">Bạn có thể thanh toán trước và mời thành viên sau.</p>
            </div>

            {/* Tags Input */}
            {!isUpgrade && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Mời người tham gia
                </label>
                <div
                  className="flex flex-wrap gap-2 items-center p-3 bg-white border-2 border-slate-200 rounded-2xl focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 transition min-h-[52px] cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  {emails.map((email, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1.5 bg-violet-100 text-violet-700 text-sm font-semibold px-3 py-1 rounded-full"
                    >
                      <span className="w-5 h-5 rounded-full bg-violet-400 text-white text-[10px] font-black flex items-center justify-center">
                        {email[0].toUpperCase()}
                      </span>
                      {email}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeEmail(idx); }}
                        className="text-violet-400 hover:text-violet-700 transition"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={inputRef}
                    type="email"
                    value={inputVal}
                    onChange={e => { setInputVal(e.target.value); setError(''); }}
                    onKeyDown={handleKeyDown}
                    onBlur={addEmail}
                    placeholder={emails.length === 0 ? 'Nhập địa chỉ email, nhấn Enter...' : 'Thêm email...'}
                    className="flex-1 min-w-[180px] bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400"
                  />
                  {inputVal && (
                    <button
                      onClick={addEmail}
                      className="p-1 text-violet-500 hover:text-violet-700 hover:bg-violet-100 rounded-lg transition"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
                {error && (
                  <p className="mt-1.5 text-xs text-red-500 font-medium">{error}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Nhấn <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono text-[10px]">Enter</kbd> sau mỗi email để thêm vào danh sách
                </p>
              </div>
            )}

            {/* FAQ */}
            {!isUpgrade && (
              <details className="group bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer hover:border-slate-200 transition">
                <summary className="flex items-center justify-between font-semibold text-slate-700 text-sm list-none">
                  Các thành viên có xem được thiết kế của tôi không?
                  <ChevronRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                  Chỉ các thiết kế bạn chia sẻ cho thành viên mới hiển thị với họ. Thiết kế của bạn trong team này vẫn hoàn toàn riêng tư.
                </p>
              </details>
            )}
          </div>

          {/* ── Cột Phải: Plan Details Card ───────────────────────── */}
          <div className="md:col-span-2 sticky top-8">
            <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-xl p-6 space-y-5">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Chi tiết gói</p>

                {planLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />
                    ))}
                  </div>
                ) : teamPlan ? (
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-sm text-slate-700">
                      <Check size={14} className="text-violet-500 shrink-0" />
                      <span className="font-semibold">{teamPlan.name}</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-slate-600">
                      <Check size={14} className="text-violet-500 shrink-0" />
                      Thanh toán hàng tháng,{' '}
                      <span className="font-bold text-slate-800">
                        {formatVND(totalPrice)}
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-slate-600">
                      <Check size={14} className="text-violet-500 shrink-0" />
                      {membersCount === 1
                        ? '1 thành viên, chỉ mình bạn'
                        : `${membersCount} thành viên`}
                    </li>
                    {emails.length > 0 && !isUpgrade && (
                      <li className="text-xs text-slate-400 mt-1 pl-6">
                        ({formatVND(teamPlan.monthly_price)} × {membersCount} người = {formatVND(teamPlan.monthly_price * membersCount)}/tháng)
                      </li>
                    )}
                    {isUpgrade && previewData && (
                      <li className="text-xs text-slate-500 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between mb-1">
                          <span>Giá gốc ({membersCount} chỗ):</span>
                          <span>{formatVND(previewData.originalAmount)}</span>
                        </div>
                        {previewData.deductionValue > 0 && (
                          <div className="flex justify-between text-emerald-600 font-medium">
                            <span>Được cấn trừ từ gói cũ:</span>
                            <span>-{formatVND(previewData.deductionValue)}</span>
                          </div>
                        )}
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-red-400">Không tải được thông tin gói</p>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Total */}
              {teamPlan && (
                <div className="flex items-end justify-between">
                  <div>
                    {isUpgrade && (
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Thực tế phải thanh toán</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-slate-900">{formatVND(totalPrice)}</p>
                    {!isUpgrade && <p className="text-xs text-slate-400">/tháng</p>}
                  </div>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleCheckout}
                disabled={loading || !teamPlan}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <Crown size={16} />
                    Thanh Toán Ngay
                  </>
                )}
              </button>

              {isUpgrade ? (
                <p className="mt-4 text-[11px] text-slate-500 text-center leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <strong className="text-amber-700 block mb-1"><Crown size={12} className="inline mr-1" /> Chính sách Cấn trừ (Proration)</strong>
                  Hệ thống sẽ tự động trừ đi số tiền tương ứng với <strong>số ngày chưa sử dụng của các ghế bạn đang có</strong>. Tổng tiền thanh toán thực tế khi quét mã QR sẽ <strong>ít hơn</strong> số tiền hiển thị ở trên!
                </p>
              ) : (
                <p className="text-center text-xs text-slate-400">
                  Dùng thử 30 ngày miễn phí · Hủy bất cứ lúc nào
                </p>
              )}
            </div>

            {/* Features */}
            {teamPlan?.features && (
              <div className="mt-4 p-4 bg-violet-50/60 rounded-2xl border border-violet-100">
                <p className="text-xs font-bold text-violet-500 uppercase tracking-widest mb-2">Bao gồm</p>
                <ul className="space-y-1.5">
                  {(teamPlan.features as string[]).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <Check size={12} className="text-violet-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
