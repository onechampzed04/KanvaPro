import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { User } from '../models/User';

export const authService = {
  // Tìm user theo email
  findByEmail: async (email: string): Promise<User | null> => {
    return await db.getOne('SELECT * FROM users WHERE email = $1', [email]);
  },

  // Tìm user theo ID
  findById: async (id: string): Promise<User | null> => {
    return await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
  },

  // Tạo user mới
  create: async (user: Partial<User>): Promise<void> => {
    await db.execute(`
      INSERT INTO users (id, email, password_hash, name, is_verified)
      VALUES ($1, $2, $3, $4, $5)
    `, [user.id, user.email, user.password_hash, user.name, user.is_verified ?? false]);
  },


  // Cập nhật trạng thái verify

  verifyUser: async (id: string): Promise<void> => {
    await db.execute('UPDATE users SET is_verified = true WHERE id = $1', [id]);
  },

  createOtp: async (userId: string, code: string, type: string, expiresAt: Date): Promise<void> => {
    await db.execute(`
      INSERT INTO otps (user_id, code, type, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [userId, code, type, expiresAt]);
  },

  OtpRecord: async (userId: string, code: string, type: string): Promise<{ id: string } | null> => {
    return await db.getOne(`
      SELECT id FROM otps 
      WHERE user_id = $1 AND code = $2 AND type = $3 AND expires_at > NOW()
    `, [userId, code, type]);
  },

  // [FIX Vấn đề 18] Xóa OTP thực sự bằng DELETE thay vì UPDATE expires_at=NOW().
  // TRƯỚC: UPDATE expires_at = NOW() → record vẫn tồn tại trong DB, bảng otps phình to.
  // SAU:   DELETE xóa luôn → sạch sẽ, không cần cleanup riêng cho các OTP đã dùng.
  // Note: Cron Job trong server.ts vẫn nên dọn OTP hết hạn chưa dùng (quá 10 phút).
  deleteOtp: async (otpId: string): Promise<void> => {
    await db.execute('DELETE FROM otps WHERE id = $1', [otpId]);
  },

  getUserWithSubscription: async (id: string): Promise<any> => {
    return await db.getOne(
      `SELECT 
         u.id, u.email, u.name, u.role, u.is_verified, u.avatar_url,
         u.storage_used_bytes, u.max_storage_gb,
         us.id AS sub_id,
         us.plan_id,
         us.status AS sub_status,
         us.current_period_end,
         sp.name AS plan_name,
         sp.slug AS plan_slug,
         sp.max_team_members AS plan_max_members
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE u.id = $1
       ORDER BY us.current_period_end DESC NULLS LAST
       LIMIT 1`,
      [id]
    );
  },

  // ─── [WORKSPACE] Lấy tất cả Workspaces user tham gia (Personal + Team) ────
  getWorkspaces: async (userId: string): Promise<any[]> => {
    const result = await db.query(
      `SELECT
         t.id,
         t.name,
         t.avatar_url,
         t.owner_id,
         t.max_members,
         CASE WHEN t.max_members = 1 THEN u.storage_used_bytes ELSE t.used_storage_bytes END AS used_storage_bytes,
         COALESCE(sp.max_storage_gb, 5) AS max_storage_gb,
         tm.role AS my_role,
         CASE WHEN t.max_members = 1 AND t.owner_id = $1 THEN 'personal' ELSE 'team' END AS workspace_type,
         (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)::int AS member_count,
         us.id   AS sub_id,
         us.status AS sub_status,
         us.current_period_end,
         sp.name AS plan_name,
         sp.slug AS plan_slug,
         sp.max_storage_gb AS plan_storage_gb,
         sp.max_team_members AS plan_max_members,
         CASE 
           WHEN us.status = 'active' AND us.current_period_end > NOW() THEN
             CASE 
               WHEN t.max_members = 1 AND t.owner_id = $1 THEN (sp.max_team_members = 1)
               WHEN sp.max_team_members > 1 THEN true
               ELSE false
             END
           ELSE false
         END AS is_pro
       FROM teams t
       JOIN users u ON u.id = t.owner_id
       JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
       -- [FIX Billing] Join theo owner_id vì subscription gắn với User, không phải Team
       LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE t.is_deleted = false
       ORDER BY workspace_type ASC, t.created_at ASC`,
      [userId]
    );
    return result.rows;
  },
};