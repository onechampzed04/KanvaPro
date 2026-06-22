// backend/middleware/checkStorageQuota.ts
// Middleware chặn Upload / Tạo mới khi Workspace đã vượt hạn mức dung lượng.
// ─── [WORKSPACE] v2: Đếm dung lượng theo Workspace, không theo User cá nhân ──
// Áp dụng "Read-Only Mode": GET vẫn chạy bình thường, chỉ chặn POST/PUT tạo mới.
// YÊU CẦU: Phải đặt sau middleware resolveWorkspace để có req.workspace.

import { Request, Response, NextFunction } from 'express';
import db from '../config/db';

const FREE_PLAN_STORAGE_GB = 5; // 5GB mặc định cho Workspace Free

export const checkStorageQuota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const workspace = (req as any).workspace;

    // ── Nếu có workspace (route đã qua resolveWorkspace), dùng quota của workspace
    if (workspace?.id) {
      const usedBytes = Number(workspace.usedStorageBytes ?? 0);
      const maxBytes = (workspace.maxStorageGb ?? FREE_PLAN_STORAGE_GB) * 1024 * 1024 * 1024;

      const contentLength = parseInt(req.headers['content-length'] || '0', 10);

      if (usedBytes + contentLength > maxBytes) {
        const usedGB = (usedBytes / (1024 ** 3)).toFixed(2);
        return res.status(403).json({
          error: 'QuotaExceeded',
          message: `Không gian làm việc đã hết dung lượng (${usedGB}GB / ${workspace.maxStorageGb}GB). Vui lòng nâng cấp gói hoặc xóa bớt tài nguyên.`,
          used_bytes: usedBytes,
          max_bytes: maxBytes,
          max_storage_gb: workspace.maxStorageGb,
          workspace_id: workspace.id,
        });
      }

      (req as any).quotaInfo = { usedBytes, maxBytes, maxStorageGb: workspace.maxStorageGb };
      return next();
    }

    // ── Fallback: Không có workspace context (backward-compat), dùng quota cá nhân
    const userRes = await db.getOne(
      `SELECT storage_used_bytes FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRes) return res.status(404).json({ error: 'User không tồn tại' });

    const usedBytes: number = Number(userRes.storage_used_bytes) || 0;

    const subRes = await db.getOne(
      `SELECT sp.max_storage_gb, sp.max_team_members
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1 AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       ORDER BY us.updated_at DESC
       LIMIT 1`,
      [userId]
    );

    let maxStorageGb: number = FREE_PLAN_STORAGE_GB;
    if (subRes && Number(subRes.max_team_members) === 1) {
      maxStorageGb = Number(subRes.max_storage_gb);
    }
    const maxBytes = maxStorageGb * 1024 * 1024 * 1024;

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (usedBytes + contentLength > maxBytes) {
      const usedGB = (usedBytes / (1024 ** 3)).toFixed(2);
      return res.status(403).json({
        error: 'QuotaExceeded',
        message: `Bạn đã hết dung lượng lưu trữ (${usedGB}GB / ${maxStorageGb}GB). Vui lòng nâng cấp gói hoặc xóa bớt tài nguyên.`,
        used_bytes: usedBytes,
        max_bytes: maxBytes,
        max_storage_gb: maxStorageGb,
      });
    }

    (req as any).quotaInfo = { usedBytes, maxBytes, maxStorageGb };
    next();
  } catch (err) {
    console.error('[checkStorageQuota] Lỗi:', err);
    res.status(500).json({ error: 'Internal server error khi kiểm tra dung lượng' });
  }
};

// ─── Helper: Cộng dung lượng vào Workspace sau khi upload thành công ──────────
// [FIX Vấn đề 21] Wrap cả 2 UPDATE vào 1 transaction để tránh desync.
// TRƯỚC: 2 UPDATE độc lập → nếu UPDATE thứ 2 fail, 2 counter lệch nhau.
// SAU:   Atomic transaction → cả 2 thành công hoặc cả 2 rollback.
export const incrementStorageUsage = async (userId: string, fileSizeBytes: number, workspaceId?: string, workspaceType?: string) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (workspaceId && workspaceType !== 'personal') {
      await client.query(
        `UPDATE teams SET used_storage_bytes = GREATEST(0, COALESCE(used_storage_bytes, 0) + $1) WHERE id = $2`,
        [fileSizeBytes, workspaceId]
      );
    } else {
      await client.query(
        `UPDATE users SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) + $1) WHERE id = $2`,
        [fileSizeBytes, userId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Storage] incrementStorageUsage rollback:', err);
    throw err;
  } finally {
    client.release();
  }
};

// ─── Helper: Trừ dung lượng khi xóa file ─────────────────────────────────────
// [FIX Vấn đề 21] Tương tự — atomic transaction để không lệch counter.
export const decrementStorageUsage = async (userId: string, fileSizeBytes: number, workspaceId?: string, workspaceType?: string) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (workspaceId && workspaceType !== 'personal') {
      await client.query(
        `UPDATE teams SET used_storage_bytes = GREATEST(0, COALESCE(used_storage_bytes, 0) - $1) WHERE id = $2`,
        [fileSizeBytes, workspaceId]
      );
    } else {
      await client.query(
        `UPDATE users SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) - $1) WHERE id = $2`,
        [fileSizeBytes, userId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Storage] decrementStorageUsage rollback:', err);
    throw err;
  } finally {
    client.release();
  }
};
