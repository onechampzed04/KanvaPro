// backend/controllers/teamController.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';

// ── POST /api/teams ─────────────────────────────────────────────────────────
export const createTeam = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { name, max_members } = req.body;

  if (!name) return res.status(400).json({ error: 'Tên nhóm không được để trống' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const teamId = uuidv4();

    await client.query(
      `INSERT INTO teams (id, name, owner_id, max_members) VALUES ($1, $2, $3, $4)`,
      [teamId, name, userId, max_members || 10]
    );

    // Owner automatically becomes a member with 'owner' role
    await client.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')`,
      [uuidv4(), teamId, userId]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: teamId, message: 'Tạo nhóm thành công' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create Team Error:', error);
    res.status(500).json({ error: 'Lỗi tạo nhóm' });
  } finally {
    client.release();
  }
};

// ── GET /api/teams/my-teams ─────────────────────────────────────────────────
export const getMyTeams = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  try {
    const result = await db.query(
      `SELECT t.*, tm.role AS my_role,
              (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [userId]
    );
    res.json({ teams: result.rows });
  } catch (error) {
    console.error('Get Teams Error:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách nhóm' });
  }
};

// ── GET /api/teams/:id ──────────────────────────────────────────────────────
export const getTeamById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;

  try {
    // Check membership
    const memberCheck = await db.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }

    const team = await db.query(`SELECT * FROM teams WHERE id = $1`, [id]);
    if (!team.rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const members = await db.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, tm.role, tm.created_at AS joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.role, tm.created_at`,
      [id]
    );

    const designs = await db.query(
      `SELECT id, title, thumbnail_url, design_type, updated_at
       FROM designs
       WHERE team_id = $1 AND is_deleted = false
       ORDER BY updated_at DESC`,
      [id]
    );

    res.json({
      ...team.rows[0],
      my_role: memberCheck.rows[0].role,
      members: members.rows,
      designs: designs.rows,
    });
  } catch (error) {
    console.error('Get Team Error:', error);
    res.status(500).json({ error: 'Lỗi lấy thông tin nhóm' });
  }
};

// ── POST /api/teams/:id/members ─────────────────────────────────────────────
export const inviteMember = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, role = 'member' } = req.body;
  const userId = (req as any).user?.id;

  try {
    // Must be owner or admin
    const myRole = await db.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!myRole.rows[0] || !['owner', 'admin'].includes(myRole.rows[0].role)) {
      return res.status(403).json({ error: 'Chỉ Owner/Admin mới có thể mời thành viên' });
    }

    // Check max_members
    const team = await db.query(`SELECT max_members FROM teams WHERE id = $1`, [id]);
    const current = await db.query(
      `SELECT COUNT(*) AS cnt FROM team_members WHERE team_id = $1`,
      [id]
    );
    if (parseInt(current.rows[0].cnt) >= team.rows[0].max_members) {
      return res.status(400).json({ error: 'Nhóm đã đạt số lượng thành viên tối đa' });
    }

    // Find user by email
    const target = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (!target.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng với email này' });
    }
    const targetId = target.rows[0].id;

    // Check if already a member
    const existing = await db.query(
      `SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, targetId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Người dùng đã là thành viên của nhóm' });
    }

    await db.execute(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), id, targetId, role]
    );

    res.json({ message: 'Đã mời thành viên vào nhóm' });
  } catch (error) {
    console.error('Invite Member Error:', error);
    res.status(500).json({ error: 'Lỗi mời thành viên' });
  }
};

// ── DELETE /api/teams/:id/members/:memberId ──────────────────────────────────
export const removeMember = async (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const userId = (req as any).user?.id;

  try {
    const myRole = await db.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!myRole.rows[0] || !['owner', 'admin'].includes(myRole.rows[0].role)) {
      // Allow self-leave
      if (memberId !== userId) {
        return res.status(403).json({ error: 'Không có quyền xóa thành viên' });
      }
    }

    await db.execute(
      `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, memberId]
    );
    res.json({ message: 'Đã xóa thành viên khỏi nhóm' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi xóa thành viên' });
  }
};

// ── PUT /api/teams/:id ──────────────────────────────────────────────────────
export const updateTeam = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, max_members } = req.body;
  const userId = (req as any).user?.id;

  try {
    const myRole = await db.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!myRole.rows[0] || myRole.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Chỉ Owner mới có thể sửa thông tin nhóm' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (name) { updates.push(`name = $${i++}`); values.push(name); }
    if (max_members) { updates.push(`max_members = $${i++}`); values.push(max_members); }
    if (updates.length === 0) return res.status(400).json({ error: 'Không có thông tin để cập nhật' });

    values.push(id);
    await db.execute(`UPDATE teams SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
    res.json({ message: 'Cập nhật nhóm thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật nhóm' });
  }
};
