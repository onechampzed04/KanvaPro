import { create } from 'domain';
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

  deleteOtp: async (otpId: string): Promise<void> => {
    await db.execute('UPDATE otps SET expires_at = NOW() WHERE id = $1', [otpId]);
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
         sp.slug AS plan_slug
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE u.id = $1
       ORDER BY us.current_period_end DESC NULLS LAST
       LIMIT 1`,
      [id]
    );
  },
};