
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
