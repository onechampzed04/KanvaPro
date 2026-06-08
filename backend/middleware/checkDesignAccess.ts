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

    // 2.5 [SECURITY FIX - BOLA/IDOR]
    // Việc nằm chung Team KHÔNG tự động cấp quyền truy cập bản vẽ của người khác.
    // Team membership chỉ là điều kiện cần để được share nội bộ nhanh hơn,
    // không phải điều kiện đủ để đọc/chỉnh sửa bản vẽ riêng tư của thành viên khác.
    // Quyền thực sự PHẢI đến từ bảng design_shares hoặc is_public.

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

/**
 * [FIX 4 - Trash RBAC]
 * Middleware dành riêng cho các Trash endpoint (restore, permanent delete).
 * Khác checkDesignAccess ở chỗ: tìm design với is_deleted = true thay vì false.
 * Chỉ cấp role 'owner' cho chủ sở hữu (user_id). Không có fallback team/share/public.
 *
 * Việc dùng middleware thay vì hard-code WHERE user_id = $2 đảm bảo tính
 * nhất quán RBAC và hỗ trợ tương lai khi có tính năng Transfer Ownership:
 * chủ mới (user_id mới) vẫn thao tác được Trash Bin mà không cần sửa lại controller.
 */
export const checkTrashedDesignAccess = async (req: Request, res: Response, next: NextFunction) => {
  const designId = req.params.id;
  const userId = (req as any).user?.id;

  if (!designId) {
    return res.status(400).json({ error: 'Design ID is required' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Tìm design trong Thùng rác (is_deleted = true)
    const designResult = await db.query(
      'SELECT user_id FROM designs WHERE id = $1 AND is_deleted = true',
      [designId]
    );

    if (designResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bản vẽ trong Thùng rác' });
    }

    const design = designResult.rows[0];

    // Chỉ owner (user_id) được thao tác — tương lai Transfer Ownership sẽ cập nhật user_id
    if (design.user_id === userId) {
      req.designRole = 'owner';
      return next();
    }

    return res.status(403).json({ error: 'Bạn không có quyền thao tác bản vẽ này trong Thùng rác' });

  } catch (error) {
    console.error('[checkTrashedDesignAccess] Error:', error);
    return res.status(500).json({ error: 'Lỗi server khi kiểm tra quyền Thùng rác' });
  }
};
