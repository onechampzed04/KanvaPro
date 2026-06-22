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
  
  let isPersonalPro = false;
  if (isUserPro && (user?.subscription?.plan_max_members === 1)) {
    isPersonalPro = true;
  }

  const isPro = currentWorkspace ? currentWorkspace.is_pro : isPersonalPro;
  const planName = currentWorkspace ? currentWorkspace.plan_name : (isPersonalPro ? user?.subscription?.plan_name : null);
  const planSlug = currentWorkspace ? currentWorkspace.plan_slug : (isPersonalPro ? user?.subscription?.plan_slug : null);
  const periodEnd = currentWorkspace ? currentWorkspace.current_period_end : (isPersonalPro ? user?.subscription?.current_period_end : null);

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
