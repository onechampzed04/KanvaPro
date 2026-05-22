// backend/middleware/checkStorageQuota.ts
// Middleware chặn Upload / Tạo mới khi user đã vượt hạn mức dung lượng
// Áp dụng "Read-Only Mode": GET vẫn chạy bình thường, chỉ chặn POST/PUT tạo mới

import { Request, Response, NextFunction } from 'express';
import db from '../config/db';

const FREE_PLAN_STORAGE_GB = 1; // GB mặc định khi không có gói active

export const checkStorageQuota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // 1. Lấy dung lượng đang dùng của user
    const userRes = await db.getOne(
      `SELECT storage_used_bytes FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRes) return res.status(404).json({ error: 'User không tồn tại' });

    const usedBytes: number = Number(userRes.storage_used_bytes) || 0;

    // 2. Lấy quota từ gói subscription đang active
    //    Nếu không có gói active → fallback về gói Free mặc định
    const subRes = await db.getOne(
      `SELECT sp.max_storage_gb
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1 AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       ORDER BY us.updated_at DESC
       LIMIT 1`,
      [userId]
    );

    const maxStorageGb: number = subRes
      ? Number(subRes.max_storage_gb)
      : FREE_PLAN_STORAGE_GB;

    const maxBytes = maxStorageGb * 1024 * 1024 * 1024; // Chuyển GB sang Bytes

    // 3. So sánh — nếu đã vượt hạn mức thì chặn
    if (usedBytes >= maxBytes) {
      const usedGB = (usedBytes / (1024 ** 3)).toFixed(2);
      return res.status(403).json({
        error: 'QuotaExceeded',
        message: `Bạn đã hết dung lượng lưu trữ (${usedGB}GB / ${maxStorageGb}GB). Vui lòng nâng cấp gói hoặc xóa bớt tài nguyên.`,
        used_bytes: usedBytes,
        max_bytes: maxBytes,
        max_storage_gb: maxStorageGb,
      });
    }

    // 4. Đính kèm thông tin quota vào request để controller dùng nếu cần
    (req as any).quotaInfo = { usedBytes, maxBytes, maxStorageGb };
    next();
  } catch (err) {
    console.error('[checkStorageQuota] Lỗi:', err);
    res.status(500).json({ error: 'Internal server error khi kiểm tra dung lượng' });
  }
};

// ─── Helper: Cộng dung lượng sau khi upload thành công ────────────────────
export const incrementStorageUsage = async (userId: string, fileSizeBytes: number) => {
  await db.execute(
    `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes + $1) WHERE id = $2`,
    [fileSizeBytes, userId]
  );
};

// ─── Helper: Trừ dung lượng khi xóa file vĩnh viễn ───────────────────────
export const decrementStorageUsage = async (userId: string, fileSizeBytes: number) => {
  await db.execute(
    `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2`,
    [fileSizeBytes, userId]
  );
};
