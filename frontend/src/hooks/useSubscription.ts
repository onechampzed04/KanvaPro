import { useNavigate } from 'react-router-dom';
import { useAuth, isSubscriptionActive } from '../context/AuthContext';

/**
 * Hook useSubscription - Dùng ở bất kỳ component nào để:
 * 1. Biết user có đang là VIP active không (isPro)
 * 2. Tên gói hiện tại (planName)
 * 3. Hàm requirePro() - Nếu user không có quyền, popup alert và redirect sang /pricing
 *
 * Ví dụ dùng:
 *   const { isPro, requirePro } = useSubscription();
 *   const handleExport4K = () => { if (!requirePro()) return; doExport4K(); }
 */
export function useSubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isPro = isSubscriptionActive(user);
  const planName = user?.subscription?.plan_name ?? null;
  const planSlug = user?.subscription?.plan_slug ?? null;
  const periodEnd = user?.subscription?.current_period_end ?? null;

  /**
   * Gọi trước khi thực hiện tính năng premium.
   * Trả về true nếu user có quyền, false nếu không.
   * Khi không có quyền, tự động navigate sang trang pricing.
   */
  const requirePro = (featureName = 'tính năng này'): boolean => {
    if (isPro) return true;
    const confirmed = window.confirm(
      `✨ "${featureName}" là tính năng dành riêng cho thành viên Premium.\n\nNâng cấp ngay để mở khóa toàn bộ tính năng?`
    );
    if (confirmed) navigate('/pricing');
    return false;
  };

  return { isPro, planName, planSlug, periodEnd, requirePro };
}
