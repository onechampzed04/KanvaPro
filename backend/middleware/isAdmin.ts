// backend/middleware/isAdmin.ts
// [FIX Vấn đề 10] Bỏ verify JWT + query DB lần 2.
//   TRƯỚC: authenticate (verify JWT + DB) → isAdmin (verify JWT lần 2 + DB lần 2) → controller
//   SAU:   authenticate đã gán req.user.role → isAdmin chỉ đọc role từ đó
//   Lợi ích: Giảm 1 DB roundtrip trên mọi admin request.
//
// [FIX Vấn đề 20] Không cần JWT_SECRET ở đây nữa sau khi bỏ re-verify.

import { Request, Response, NextFunction } from 'express';

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // req.user đã được authenticate middleware gán đầy đủ (id, role, status...)
  const role = (req as any).user?.role;

  if (!role || (role !== 'admin' && role !== 'moderator')) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  // role hợp lệ → tiếp tục
  next();
};
