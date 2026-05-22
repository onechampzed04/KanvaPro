import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await db.getOne('SELECT id, role FROM users WHERE id = $1', [decoded.id]);
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    (req as any).user = { ...decoded, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
