// backend/utils/securityUtils.ts
// ─── [FIX Vấn đề 18] Shared PII Anonymization Utility ─────────────────────────
//
// Vấn đề cũ: Hàm hashIp() được định nghĩa riêng trong teamService.ts (dùng cho
// team_audit_logs) nhưng adminController.ts lại lưu raw req.ip thẳng vào
// admin_audit_logs → vi phạm GDPR/CCPA (IP tĩnh = PII).
//
// Giải pháp:
//   1. Tách hashIp thành module dùng chung (single source of truth).
//   2. Import vào MỌI nơi ghi audit log: teamService, adminController, và tương lai.
//   3. teamService.ts giữ nguyên lời gọi hashIp — chỉ cần import từ đây thay vì định nghĩa lại.
//
// Thuật toán: SHA-256 + Static Salt (từ biến môi trường).
//   - Cùng IP → cùng hash → vẫn dùng được để gom nhóm điều tra bảo mật.
//   - Không thể reverse (one-way) → bảo vệ danh tính nếu DB bị lộ.
//   - Salt khác nhau giữa môi trường → rainbow table attack vô hiệu.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

// Đọc Salt từ biến môi trường — BẮT BUỘC đặt trong .env production
// Fallback chỉ dùng trong development để tránh crash khi chưa có .env
const AUDIT_IP_SALT = process.env.AUDIT_IP_SALT || 'kanvapro-ip-salt-fallback-please-set-env';

/**
 * Ẩn danh hóa địa chỉ IP theo chuẩn GDPR/PII bằng SHA-256 + Salt.
 *
 * @param ip - Địa chỉ IP gốc (IPv4 hoặc IPv6), có thể là null/undefined
 * @returns Chuỗi hex SHA-256 (64 ký tự) hoặc null nếu ip trống
 *
 * @example
 * hashIp('192.168.1.100')
 * // → 'a1b2c3d4....' (64 hex chars, không thể reverse)
 *
 * hashIp(null) → null
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto
    .createHash('sha256')
    .update(ip + AUDIT_IP_SALT)
    .digest('hex');
}
