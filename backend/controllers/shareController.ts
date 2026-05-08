import { Request, Response } from 'express';
import db from '../config/db';

// Lấy danh sách chia sẻ của một bản vẽ
export const getDesignShares = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT ds.user_id, ds.role, u.name, u.email, u.avatar_url
      FROM design_shares ds
      JOIN users u ON ds.user_id = u.id
      WHERE ds.design_id = $1
    `;
    const result = await db.query(query, [id]);

    // Lấy thêm thông tin owner
    const ownerQuery = `
      SELECT d.user_id, 'owner' as role, u.name, u.email, u.avatar_url
      FROM designs d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1
    `;
    const ownerResult = await db.query(ownerQuery, [id]);

    // Check is_public
    const publicQuery = await db.query('SELECT is_public FROM designs WHERE id = $1', [id]);
    const isPublic = publicQuery.rows[0]?.is_public || false;

    res.json({
      shares: result.rows,
      owner: ownerResult.rows[0],
      is_public: isPublic
    });
  } catch (error) {
    console.error('Get Shares Error:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách chia sẻ' });
  }
};

// Chia sẻ bản vẽ cho một email
export const shareDesign = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email và Role là bắt buộc' });
  }

  try {
    // Tìm user theo email
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng với email này' });
    }

    const targetUserId = userResult.rows[0].id;

    // Kiểm tra xem đã có share chưa
    const existResult = await db.query('SELECT id FROM design_shares WHERE design_id = $1 AND user_id = $2', [id, targetUserId]);

    if (existResult.rows.length > 0) {
      // Cập nhật
      await db.query('UPDATE design_shares SET role = $1 WHERE design_id = $2 AND user_id = $3', [role, id, targetUserId]);
    } else {
      // Thêm mới
      await db.query('INSERT INTO design_shares (design_id, user_id, role) VALUES ($1, $2, $3)', [id, targetUserId, role]);
    }

    res.json({ message: 'Chia sẻ thành công' });
  } catch (error) {
    console.error('Share Design Error:', error);
    res.status(500).json({ error: 'Lỗi khi chia sẻ bản vẽ' });
  }
};

// Cập nhật quyền
export const updateShareRole = async (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const { role } = req.body;

  try {
    await db.query('UPDATE design_shares SET role = $1 WHERE design_id = $2 AND user_id = $3', [role, id, userId]);
    res.json({ message: 'Cập nhật quyền thành công' });
  } catch (error) {
    console.error('Update Share Role Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật quyền' });
  }
};

// Xoá quyền
export const removeShare = async (req: Request, res: Response) => {
  const { id, userId } = req.params;

  try {
    await db.query('DELETE FROM design_shares WHERE design_id = $1 AND user_id = $2', [id, userId]);
    res.json({ message: 'Đã gỡ quyền truy cập' });
  } catch (error) {
    console.error('Remove Share Error:', error);
    res.status(500).json({ error: 'Lỗi khi gỡ quyền truy cập' });
  }
};

// Bật/tắt public link
export const togglePublicLink = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_public } = req.body;

  try {
    await db.query('UPDATE designs SET is_public = $1 WHERE id = $2', [is_public, id]);
    res.json({ message: 'Cập nhật trạng thái public thành công', is_public });
  } catch (error) {
    console.error('Toggle Public Link Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái public' });
  }
};
