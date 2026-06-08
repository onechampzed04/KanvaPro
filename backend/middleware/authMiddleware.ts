// backend/middleware/authMiddleware.ts
// [FIX Vấn đề 19] Dùng static import thay dynamic import() trong hot path.
//                 Dynamic import() mỗi request là overhead không cần thiết,
//                 và nếu DB pool cạn callback sẽ pending vô thời hạn.
// [FIX Vấn đề 20] Dùng JWT_SECRET từ config/jwt.ts (single source of truth).

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db';
import { JWT_SECRET } from '../config/jwt';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await db.getOne(
      'SELECT id, status, role, max_storage_gb, used_storage_bytes FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }
    if (user.status === 'banned' || user.status === 'suspended') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa bởi Admin.' });
    }

    (req as any).user = {
      ...decoded,
      status: user.status,
      role: user.role,
      max_storage_gb: user.max_storage_gb,
      used_storage_bytes: user.used_storage_bytes,
    };
    next();
  } catch (err) {
    console.error('DB check error in authMiddleware:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
