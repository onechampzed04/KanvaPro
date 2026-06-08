import { Request, Response } from 'express';
import db from '../config/db';

// =============================================
// GET /api/designs/:id/shares
// Lấy danh sách chia sẻ (commenter+ được xem)
// =============================================
export const getDesignShares = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Lấy danh sách người được share
    const sharesResult = await db.query(`
      SELECT ds.user_id, ds.role, u.name, u.email, u.avatar_url
      FROM design_shares ds
      JOIN users u ON ds.user_id = u.id
      WHERE ds.design_id = $1
      ORDER BY ds.created_at ASC
    `, [id]);

    // Lấy thông tin owner
    const ownerResult = await db.query(`
      SELECT d.user_id, 'owner' as role, u.name, u.email, u.avatar_url
      FROM designs d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1
    `, [id]);

    // Lấy trạng thái is_public
    const publicResult = await db.query('SELECT is_public FROM designs WHERE id = $1', [id]);
    const isPublic = publicResult.rows[0]?.is_public || false;

    res.json({
      shares: sharesResult.rows,
      owner: ownerResult.rows[0] || null,
      is_public: isPublic
    });
  } catch (error) {
    console.error('Get Shares Error:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách chia sẻ' });
  }
};

// =============================================
// POST /api/designs/:id/share
// Gửi lời mời chia sẻ (chỉ Owner)
// =============================================
export const shareDesign = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, role } = req.body;

  // Chỉ Owner mới được mời người khác
  if ((req as any).designRole !== 'owner') {
    return res.status(403).json({ error: 'Chỉ chủ sở hữu mới có thể mời người dùng' });
  }

  if (!email || !role) {
    return res.status(400).json({ error: 'Email và Role là bắt buộc' });
  }

  const validRoles = ['editor', 'commenter', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Role không hợp lệ. Chọn: ${validRoles.join(', ')}` });
  }

  try {
    // Tìm user theo email
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng với email này' });
    }

    const targetUserId = userResult.rows[0].id;

    // Không cho phép share cho chính mình (owner)
    const designResult = await db.query('SELECT user_id FROM designs WHERE id = $1', [id]);
    if (designResult.rows[0]?.user_id === targetUserId) {
      return res.status(400).json({ error: 'Không thể chia sẻ với chính chủ sở hữu' });
    }

    // Upsert: thêm mới hoặc cập nhật nếu đã có
    const existResult = await db.query(
      'SELECT id FROM design_shares WHERE design_id = $1 AND user_id = $2',
      [id, targetUserId]
    );

    if (existResult.rows.length > 0) {
      await db.query(
        'UPDATE design_shares SET role = $1 WHERE design_id = $2 AND user_id = $3',
        [role, id, targetUserId]
      );
    } else {
      await db.query(
        'INSERT INTO design_shares (design_id, user_id, role) VALUES ($1, $2, $3)',
        [id, targetUserId, role]
      );
    }

    res.json({ message: 'Chia sẻ thành công' });
  } catch (error) {
    console.error('Share Design Error:', error);
    res.status(500).json({ error: 'Lỗi khi chia sẻ bản vẽ' });
  }
};

// =============================================
// PUT /api/designs/:id/share/:userId
// Thay đổi quyền của một người (chỉ Owner)
// =============================================
export const updateShareRole = async (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const { role } = req.body;

  if ((req as any).designRole !== 'owner') {
    return res.status(403).json({ error: 'Chỉ chủ sở hữu mới có thể thay đổi quyền' });
  }

  const validRoles = ['editor', 'commenter', 'viewer'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: `Role không hợp lệ. Chọn: ${validRoles.join(', ')}` });
  }

  try {
    const result = await db.query(
      'UPDATE design_shares SET role = $1 WHERE design_id = $2 AND user_id = $3 RETURNING id',
      [role, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi chia sẻ này' });
    }

    res.json({ message: 'Cập nhật quyền thành công' });
  } catch (error) {
    console.error('Update Share Role Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật quyền' });
  }
};

// =============================================
// DELETE /api/designs/:id/share/:userId
// Gỡ quyền truy cập (chỉ Owner)
// =============================================
export const removeShare = async (req: Request, res: Response) => {
  const { id, userId } = req.params;

  if ((req as any).designRole !== 'owner') {
    return res.status(403).json({ error: 'Chỉ chủ sở hữu mới có thể gỡ quyền' });
  }

  try {
    await db.query(
      'DELETE FROM design_shares WHERE design_id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ message: 'Đã gỡ quyền truy cập' });
  } catch (error) {
    console.error('Remove Share Error:', error);
    res.status(500).json({ error: 'Lỗi khi gỡ quyền truy cập' });
  }
};

// =============================================
// PUT /api/designs/:id/public
// Bật/tắt public link (chỉ Owner)
// =============================================
export const togglePublicLink = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_public } = req.body;

  if ((req as any).designRole !== 'owner') {
    return res.status(403).json({ error: 'Chỉ chủ sở hữu mới có thể thay đổi cài đặt public' });
  }

  if (typeof is_public !== 'boolean') {
    return res.status(400).json({ error: 'is_public phải là boolean' });
  }

  try {
    await db.query('UPDATE designs SET is_public = $1 WHERE id = $2', [is_public, id]);
    res.json({ message: 'Cập nhật trạng thái public thành công', is_public });
  } catch (error) {
    console.error('Toggle Public Link Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái public' });
  }
};

// =============================================
// GET /api/designs/:id/share-link
// Lấy link chia sẻ public
// =============================================
export const getShareLink = async (req: Request, res: Response) => {
  const { id } = req.params;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.json({ link: `${frontendUrl}/editor/${id}` });
};
