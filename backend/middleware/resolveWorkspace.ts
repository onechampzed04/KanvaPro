// backend/middleware/resolveWorkspace.ts
// ─── [WORKSPACE] Middleware Bước 2: Context Switching ─────────────────────────
//
// Chức năng:
//   1. Đọc header X-Workspace-Id từ Request của Frontend.
//   2. [FIX Vấn đề 9] Kiểm tra quyền thành viên qua Junction Table (team_members).
//      Kết quả được cache vào Redis 60s để tránh truy vấn DB mỗi request.
//   3. Lấy trạng thái Subscription (Is Pro? Max Storage?) của Workspace đó.
//   4. Gán req.workspace để các Controller phía sau dùng — KHÔNG CẦN query DB lại.
//
// Cách dùng: Đặt sau middleware `authenticate` trên các route cần kiểm tra ngữ cảnh.
//   router.post('/designs', authenticate, resolveWorkspace, createDesign);

import { Request, Response, NextFunction } from 'express';
import db from '../config/db';
import { getRedis } from '../config/redis';

// TTL cache quyền thành viên: 60 giây
// Đủ ngắn để phản ánh thay đổi quyền thành viên gần thực tế, đủ dài để giảm tải DB.
const MEMBERSHIP_CACHE_TTL = 60;



export const resolveWorkspace = async (req: Request, res: Response, next: NextFunction) => {
  const workspaceId = req.headers['x-workspace-id'] as string | undefined;
  const userId = (req as any).user?.id;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Nếu không có X-Workspace-Id hoặc là 'personal', cố tìm Personal Workspace của user
  // để không break các client cũ chưa gửi header này
  const effectiveWorkspaceId = (workspaceId && workspaceId !== 'personal') ? workspaceId : null;

  try {
    let workspace: any = null;

    if (effectiveWorkspaceId) {
      // [FIX Vấn đề 9] Kiểm tra quyền thành viên qua Redis Cache trước
      // Cache key: user:{userId}:workspace:{workspaceId}:access
      // Lợi ích: Tránh DB roundtrip trên mỗi API request trong session làm việc
      const redis = getRedis();
      const cacheKey = `user:${userId}:workspace:${effectiveWorkspaceId}:access`;

      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached === 'denied') {
          // Cache xác nhận user không thuộc workspace này
          // Trả về 404 (không phải 403) để ngăn kẻ tấn công dò quét ID Workspace hợp lệ
          return res.status(404).json({ error: 'Workspace not found' });
        }
        if (cached === 'granted') {
          // Cache hit: đã biết user có quyền, vẫn cần lấy workspace data đầy đủ từ DB
          // nhưng bỏ qua bước check membership (đã được verify bởi cache)
        }
      }

      // Trường hợp Frontend truyền workspace cụ thể
      // JOIN team_members tại WHERE clause chính là Cross-authorization Check:
      // Câu query CHỈ trả về kết quả nếu (userId, workspaceId) tồn tại trong team_members.
      workspace = await db.getOne(
        `SELECT
           t.id,
           t.name,
           t.owner_id,
           t.max_members,
           CASE WHEN t.max_members = 1 THEN u.storage_used_bytes ELSE t.used_storage_bytes END AS used_storage_bytes,
           COALESCE(sp.max_storage_gb, 5) AS max_storage_gb,
           CASE WHEN t.max_members = 1 AND t.owner_id = $2 THEN 'personal' ELSE 'team' END AS workspace_type,
           tm.role AS my_role,
           us.id   AS sub_id,
           us.status AS sub_status,
           us.current_period_end,
           sp.max_storage_gb AS plan_storage_gb,
           sp.max_team_members AS plan_max_members,
           sp.features AS plan_features,
           CASE 
             WHEN us.status = 'active' AND us.current_period_end > NOW() THEN true
             ELSE false
           END AS is_pro
         FROM teams t
         JOIN users u ON u.id = t.owner_id
         JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
         LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
           AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE t.id = $1`,
        [effectiveWorkspaceId, userId]
      );

      if (!workspace) {
        // [FIX Vấn đề 9] Cache kết quả "denied" để tránh DB hit cho các request tiếp theo
        if (redis) await redis.set(cacheKey, 'denied', { EX: MEMBERSHIP_CACHE_TTL });

        // Trả về 404 thay vì 403: ngăn tấn công kiểu ID Enumeration
        // (kẻ tấn công không thể phân biệt workspace "không tồn tại" vs "bị cấm")
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Cache kết quả "granted" (TTL 60s)
      if (redis) await redis.set(cacheKey, 'granted', { EX: MEMBERSHIP_CACHE_TTL });


    } else {
      // Fallback: Lấy Personal Workspace của user (max_members = 1, owner = user)
      workspace = await db.getOne(
        `SELECT
           t.id,
           t.name,
           t.owner_id,
           t.max_members,
           u.storage_used_bytes AS used_storage_bytes,
           COALESCE(sp.max_storage_gb, 5) AS max_storage_gb,
           'personal' AS workspace_type,
           'owner' AS my_role,
           us.id   AS sub_id,
           us.status AS sub_status,
           us.current_period_end,
           sp.max_storage_gb AS plan_storage_gb,
           sp.max_team_members AS plan_max_members,
           sp.features AS plan_features,
           CASE 
             WHEN us.status = 'active' AND us.current_period_end > NOW() THEN true
             ELSE false
           END AS is_pro
         FROM teams t
         JOIN users u ON u.id = t.owner_id
         LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
           AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE t.owner_id = $1 AND t.max_members = 1
         LIMIT 1`,
        [userId]
      );
    }

    // Gán vào req để tất cả Controller phía sau đọc — KHÔNG cần query lại
    (req as any).workspace = {
      id: workspace?.id ?? null,
      name: workspace?.name ?? 'Unknown',
      type: workspace?.workspace_type ?? 'personal',
      myRole: workspace?.my_role ?? 'member',
      ownerId: workspace?.owner_id ?? userId,
      // Dung lượng của chính Workspace (đếm riêng theo từng Workspace)
      usedStorageBytes: Number(workspace?.used_storage_bytes ?? 0),
      // Hạn mức theo gói cước của Workspace (Free = 5GB, Pro = theo plan, Custom = db)
      maxStorageGb: Number(workspace?.max_storage_gb ?? 5),
      isPro: workspace?.is_pro ?? false,
      planFeatures: workspace?.plan_features ?? [],
      maxMembers: workspace?.is_pro
        ? Number(workspace?.plan_max_members ?? 1)
        : (workspace?.max_members ?? 1),
    };

    next();
  } catch (err) {
    console.error('[resolveWorkspace] Lỗi:', err);
    res.status(500).json({ error: 'Internal server error khi xác định không gian làm việc' });
  }
};
