// backend/middleware/roleHierarchy.ts
// [FIX Vấn đề 10] Hierarchical Role Weighting System
//
// Định nghĩa trọng số quyền lực và hàm kiểm tra thứ bậc tập trung.
// Tất cả các endpoint admin thao tác trên tài khoản khác đều phải đi qua
// assertCanActOn() để đảm bảo Actor có quyền cao hơn Target.

export const ROLE_WEIGHTS: Record<string, number> = {
  admin:      50,
  moderator:  30, // [FIX Vấn đề 11] isAdmin cho phép moderator vào panel nhưng ROLE_WEIGHTS thiếu entry này
  user:       10,
};

/**
 * Trả về trọng số của một role.
 * Role không xác định sẽ có trọng số 0 (thấp nhất).
 */
export function getRoleWeight(role: string | undefined | null): number {
  return ROLE_WEIGHTS[role ?? ''] ?? 0;
}

/**
 * Kiểm tra xem Actor có quyền thực hiện hành động lên Target không.
 *
 * Quy tắc:
 *   1. Actor.roleWeight > Target.roleWeight → được phép (Admin tác động lên User).
 *   2. Actor không được tự thao tác lên chính mình (self-action guard).
 *   3. Admin không được tác động lên Admin khác để tránh xung đột ngang hàng.
 */
export function assertCanActOn(
  actorId: string,
  actorRole: string,
  targetId: string,
  targetRole: string,
): { allowed: boolean; reason?: string } {

  // Guard: Không thể tự thao tác lên chính mình
  if (String(actorId) === String(targetId)) {
    return { allowed: false, reason: 'Không thể thực hiện thao tác này lên chính tài khoản của bạn!' };
  }

  const actorWeight = getRoleWeight(actorRole);
  const targetWeight = getRoleWeight(targetRole);

  // Admin tác động lên Admin khác -> chặn
  if (actorRole === 'admin' && targetRole === 'admin') {
    return { allowed: false, reason: 'Tài khoản quản trị viên (Admin) khác là bất biến. Bạn không thể cấm hoặc thay đổi quyền của Admin ngang hàng!' };
  }

  if (actorWeight <= targetWeight) {
    return {
      allowed: false,
      reason: `Quyền hạn của bạn (${actorRole}) không đủ để thực hiện thao tác này.`,
    };
  }

  return { allowed: true };
}

