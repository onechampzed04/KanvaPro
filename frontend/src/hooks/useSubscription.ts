import { useNavigate } from 'react-router-dom';
import { useAuth, isSubscriptionActive } from '../context/AuthContext';


export function useSubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isPro = isSubscriptionActive(user);
  const planName = user?.subscription?.plan_name ?? null;
  const planSlug = user?.subscription?.plan_slug ?? null;
  const periodEnd = user?.subscription?.current_period_end ?? null;

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
