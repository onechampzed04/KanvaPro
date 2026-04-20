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

  
};