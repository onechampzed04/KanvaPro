import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Check DB for banned status
    import('../config/db').then(db => {
      db.default.getOne('SELECT id, status, role, max_storage_gb, used_storage_bytes FROM users WHERE id = $1', [decoded.id])
        .then(user => {
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
            used_storage_bytes: user.used_storage_bytes
          };
          next();
        })
        .catch(err => {
          console.error('DB Check error in authMiddleware:', err);
          return res.status(500).json({ error: 'Internal server error' });
        });
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
