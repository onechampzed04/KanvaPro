import { useNavigate } from 'react-router-dom';
import { useAuth, isSubscriptionActive } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

export function useSubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  let currentWorkspace = null;
  try {
    const workspaceCtx = useWorkspace();
    currentWorkspace = workspaceCtx.currentWorkspace;
  } catch (e) {
    // If used outside of WorkspaceProvider
  }

  const isUserPro = isSubscriptionActive(user);
  const isPro = currentWorkspace ? currentWorkspace.is_pro : isUserPro;
  const planName = currentWorkspace ? currentWorkspace.plan_name : (user?.subscription?.plan_name || null);
  const planSlug = currentWorkspace ? currentWorkspace.plan_slug : (user?.subscription?.plan_slug || null);
  const periodEnd = currentWorkspace ? currentWorkspace.current_period_end : (user?.subscription?.current_period_end || null);

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
