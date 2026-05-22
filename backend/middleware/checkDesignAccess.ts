import { Request, Response, NextFunction } from 'express';
import db from '../config/db';

declare global {
  namespace Express {
    interface Request {
      designRole?: 'owner' | 'editor' | 'commenter' | 'viewer';
    }
  }
}

export const checkDesignAccess = async (req: Request, res: Response, next: NextFunction) => {
  const designId = req.params.id;
  // userId có thể undefined nếu user chưa đăng nhập (public design)
  const userId = (req as any).user?.id;

  if (!designId) {
    return res.status(400).json({ error: 'Design ID is required' });
  }

  try {
    // 1. Lấy thông tin design (owner + is_public + team_id)
    const designResult = await db.query(
      'SELECT user_id, team_id, is_public FROM designs WHERE id = $1 AND is_deleted = false',
      [designId]
    );

    if (designResult.rows.length === 0) {
      return res.status(404).json({ error: 'Design không tồn tại' });
    }

    const design = designResult.rows[0];

    // 2. Nếu user là Owner  -> quyền max
    if (userId && design.user_id === userId) {
      req.designRole = 'owner';
      return next();
    }

    // 2.5 Kiểm tra quyền qua Team
    if (userId && design.team_id) {
      const teamResult = await db.query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [design.team_id, userId]
      );
      if (teamResult.rows.length > 0) {
        const tRole = teamResult.rows[0].role;
        // owner, admin, member in team get 'editor' access to team designs. viewer gets 'viewer'
        req.designRole = tRole === 'viewer' ? 'viewer' : 'editor';
        return next();
      }
    }

    // 3. Kiểm tra bảng design_shares
    if (userId) {
      const shareResult = await db.query(
        'SELECT role FROM design_shares WHERE design_id = $1 AND user_id = $2',
        [designId, userId]
      );

      if (shareResult.rows.length > 0) {
        req.designRole = shareResult.rows[0].role as 'editor' | 'commenter' | 'viewer';
        return next();
      }
    }

    // 4. Fallback: Nếu design là public → cho vào với role viewer
    if (design.is_public) {
      req.designRole = 'viewer';
      return next();
    }

    // 5. Không có quyền gì hết → 403
    return res.status(403).json({ error: 'Bạn không có quyền truy cập bản vẽ này' });

  } catch (error) {
    console.error('[checkDesignAccess] Error:', error);
    return res.status(500).json({ error: 'Lỗi server khi kiểm tra quyền' });
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.designRole;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Yêu cầu quyền: ${allowedRoles.join(' hoặc ')}. Quyền hiện tại: ${role || 'không xác định'}`
      });
    }
    next();
  };
};
