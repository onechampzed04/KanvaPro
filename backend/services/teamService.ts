// backend/services/teamService.ts
// ─── HARDENED v2: Race Condition Fix, Soft Delete, Audit Logs ─────────────────
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
// [FIX Vấn đề 18] Import từ shared utility — Single Source of Truth cho hashIp
import { hashIp } from '../utils/securityUtils';

// ─── Hằng số Nghiệp vụ ────────────────────────────────────────────────────────
const FREE_TEAM_MAX_MEMBERS = 5;   // Giới hạn thành viên cho team Free
const FREE_OWNER_MAX_TEAMS = 3;   // Số Team tối đa 1 user Free được tạo (chống DDoS)


// ─── Kiểu dữ liệu Audit Log ───────────────────────────────────────────────────
export type AuditAction =
  | 'CREATE_TEAM'
  | 'DELETE_TEAM'
  | 'UPDATE_TEAM_NAME'
  | 'INVITE_MEMBER'
  | 'REMOVE_MEMBER'
  | 'LEAVE_TEAM'
  | 'UPDATE_MEMBER_ROLE'
  | 'TRANSFER_OWNERSHIP'
  | 'CLONE_DESIGN'
  | 'UPDATE_TEAM_AVATAR';

// ─── Helper nội bộ: Ghi Audit Log (không ném lỗi nếu insert thất bại) ─────────
// [FIX 3] Lưu actor_name + actor_email vào details để giữ dấu vết kể cả khi user bị xóa.
async function writeAuditLog(
  teamId: string,
  actorId: string | null,
  action: AuditAction,
  targetId?: string | null,
  details?: Record<string, any> | null,
  ipAddress?: string | null,
  actorSnapshot?: { name?: string; email?: string } | null,
): Promise<void> {
  try {
    // Lấy thông tin actor từ DB nếu không được truyền vào (để đảm bảo có snapshot)
    let actorInfo = actorSnapshot;
    if (!actorInfo && actorId) {
      const res = await db.getOne<{ name: string; email: string }>(
        `SELECT name, email FROM users WHERE id = $1`,
        [actorId]
      );
      actorInfo = res ? { name: res.name, email: res.email } : null;
    }

    const enrichedDetails = {
      ...details,
      // [FIX 3] Ghi cứng vào details để không bao giờ mất dấu vết dù user bị xóa
      ...(actorInfo && { _actor_name: actorInfo.name, _actor_email: actorInfo.email }),
    };

    await db.execute(
      `INSERT INTO team_audit_logs (id, team_id, actor_id, action, target_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      // [FIX 18] hashIp ẩn danh hóa IP trước khi lưu vào DB (GDPR compliance)
      [uuidv4(), teamId, actorId, action, targetId ?? null, JSON.stringify(enrichedDetails), hashIp(ipAddress)]
    );
  } catch (err) {
    // Audit log KHÔNG được làm gián đoạn flow chính. Chỉ log ra console.
    console.error('[AuditLog] Ghi log thất bại (non-fatal):', err);
  }
}

export const teamService = {

  // ─── 1. createTeam ─────────────────────────────────────────────────────────
  // [FIX 2d] Kiểm tra số Team đang sở hữu trước khi tạo mới (chống DDoS).
  // [FIX 1c] Chỉ cho phép tạo Team nếu user chưa có gói Pro, tối đa FREE_OWNER_MAX_TEAMS.
  createTeam: async (userId: string, name: string, ipAddress?: string) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // [FIX 2d] Đếm số team mà user đang là owner (chưa bị soft-delete).
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM teams
         WHERE owner_id = $1 AND is_deleted = false`,
        [userId]
      );
      const ownedTeamCount = countRes.rows[0]?.cnt ?? 0;

      // [FIX] Mỗi user chỉ được sở hữu tối đa 1 Team
      if (ownedTeamCount >= 1) {
        await client.query('ROLLBACK');
        const err: any = new Error('Bạn chỉ được phép sở hữu tối đa 1 Đội nhóm. Vui lòng quản lý nhóm hiện tại của bạn.');
        err.code = 'TEAM_LIMIT_EXCEEDED';
        err.current = ownedTeamCount;
        err.max = 1;
        throw err;
      }

      // Kiểm tra xem user có gói Pro không VÀ gói đó có hỗ trợ Team không
      const subRes = await client.query(
        `SELECT us.id, sp.max_team_members 
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE us.user_id = $1 AND us.status = 'active'
           AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
         LIMIT 1`,
        [userId]
      );
      
      const hasTeamPlan = subRes.rows.length > 0 && subRes.rows[0].max_team_members > 1;

      // [FIX] Free user hoặc Personal Pro user: KHÔNG được phép tạo Team
      if (!hasTeamPlan) {
        await client.query('ROLLBACK');
        const err: any = new Error('Bạn cần nâng cấp lên gói Business/Team để tạo Đội nhóm.');
        err.code = 'TEAM_LIMIT_EXCEEDED';
        err.current = ownedTeamCount;
        err.max = 1;
        throw err;
      }

      const teamId = uuidv4();
      const planDefaultMaxMembers = subRes.rows[0].max_team_members || 2;

      await client.query(
        `INSERT INTO teams (id, name, owner_id, max_members, is_deleted, created_at, updated_at)
         VALUES ($1, $2, $3, $4, false, NOW(), NOW())`,
        [teamId, name, userId, planDefaultMaxMembers]
      );

      await client.query(
        `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')`,
        [uuidv4(), teamId, userId]
      );

      await client.query('COMMIT');

      // Ghi audit log sau khi commit thành công
      await writeAuditLog(teamId, userId, 'CREATE_TEAM', null, { name }, ipAddress);

      return teamId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ─── 2. getMyTeams ─────────────────────────────────────────────────────────
  // [FIX 1c] Lọc team chưa bị soft-delete (is_deleted = false)
  getMyTeams: async (userId: string) => {
    const result = await db.query(
      `SELECT t.*, tm.role AS my_role,
              (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count,
              us.id AS sub_id, us.status AS sub_status,
              sp.max_team_members AS plan_max_members,
              CASE WHEN us.status = 'active' AND us.current_period_end > NOW() AND (t.max_members = 1 OR COALESCE(sp.max_team_members, 1) > 1) THEN true ELSE false END AS is_pro,
              CASE WHEN t.max_members = 1 THEN true ELSE false END AS is_personal
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       -- [FIX Billing] Join theo owner_id vì subscription gắn với User, không phải Team
       LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE tm.user_id = $1
         AND t.is_deleted = false
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  // ─── 3. getTeamRole ────────────────────────────────────────────────────────
  getTeamRole: async (teamId: string, userId: string) => {
    const memberCheck = await db.query(
      `SELECT tm.role
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND tm.user_id = $2 AND t.is_deleted = false`,
      [teamId, userId]
    );
    return memberCheck.rows[0]?.role || null;
  },

  // ─── 4. getTeamDetails ─────────────────────────────────────────────────────
  getTeamDetails: async (teamId: string) => {
    const team = await db.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)::int AS member_count,
        us.id AS sub_id, us.status AS sub_status, us.current_period_end,
        sp.name AS plan_name, sp.slug AS plan_slug, sp.max_team_members AS plan_max_members,
        CASE WHEN us.status = 'active' AND us.current_period_end > NOW() AND (t.max_members = 1 OR COALESCE(sp.max_team_members, 1) > 1) THEN true ELSE false END AS is_pro,
        CASE
          WHEN us.status IS NULL OR us.status = 'expired' OR us.status = 'canceled' THEN
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) > t.max_members
          ELSE false
        END AS is_over_quota,
        -- [PERSONAL WORKSPACE GUARD] max_members=1 là dấu hiệu duy nhất của Personal Workspace
        CASE WHEN t.max_members = 1 THEN true ELSE false END AS is_personal
      FROM teams t
      -- [FIX Billing] Join theo owner_id vì subscription gắn với User, không phải Team
      LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
        AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE t.id = $1 AND t.is_deleted = false
    `, [teamId]);
    return team.rows[0];
  },

  // ─── 5. getTeamMembers (Paginated + Search) ────────────────────────────────
  // [FIX 3b] Thêm Pagination và Search để chống payload explosion.
  getTeamMembers: async (teamId: string, limit: number, offset: number, search?: string) => {
    const searchClause = search
      ? `AND (u.name ILIKE $4 OR u.email ILIKE $4)`
      : '';
    const params: any[] = search
      ? [teamId, limit, offset, `%${search}%`]
      : [teamId, limit, offset];

    const members = await db.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, tm.role, tm.created_at AS joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
         ${searchClause}
       ORDER BY
         CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,
         tm.created_at
       LIMIT $2 OFFSET $3`,
      params
    );

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
         ${search ? `AND (u.name ILIKE $2 OR u.email ILIKE $2)` : ''}`,
      search ? [teamId, `%${search}%`] : [teamId]
    );

    return {
      members: members.rows,
      total: totalRes.rows[0]?.total ?? 0,
      limit,
      offset,
    };
  },

  // ─── 6. getTeamDesigns ─────────────────────────────────────────────────────
  // [SECURITY FIX - BOLA/IDOR] Chỉ trả về designs của chính userId đang gọi.
  // Thành viên KHÔNG được liệt kê designs của người khác qua API.
  // Việc "nằm chung team" chỉ giúp share nhanh hơn, không phải xem tất cả.
  getTeamDesigns: async (teamId: string, userId: string) => {
    const designs = await db.query(
      `SELECT id, user_id, title, thumbnail_url, design_type, updated_at
       FROM designs
       WHERE team_id = $1 AND user_id = $2 AND is_deleted = false
       ORDER BY updated_at DESC`,
      [teamId, userId]
    );
    return designs.rows;
  },

  // ─── 7. inviteMemberAtomic ─────────────────────────────────────────────────
  // [FIX 1b] Thay thế hoàn toàn getTeamQuotaCheck + addTeamMember bằng một
  // Transaction duy nhất với SELECT FOR UPDATE để chống Race Condition.
  inviteMemberAtomic: async (
    teamId: string,
    targetUserId: string,
    role: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<'ok' | 'quota_exceeded' | 'already_member'> => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // [CRITICAL] Khóa dòng team lại. Mọi request đồng thời sẽ phải xếp hàng
      // chờ transaction này commit/rollback mới được đọc lại dòng này.
      const teamRes = await client.query(
        `SELECT t.max_members, t.is_deleted,
                us.status AS sub_status, us.current_period_end,
                sp.max_team_members AS plan_max,
                (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) AS current_count
         FROM teams t
         -- [FIX Vấn đề 8] JOIN theo owner_id (Owner-based billing model)
         -- KHÔNG dùng us.team_id = t.id vì subscription gắn với user, không phải team.
         -- Toàn bộ hệ thống (resolveWorkspace, getMyTeams, getTeamDetails) đều JOIN thế này.
         LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
           AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE t.id = $1 AND t.is_deleted = false
         FOR UPDATE OF t`,  /* Row-level lock: các request đồng thời phải chờ */
        [teamId]
      );

      if (!teamRes.rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('TEAM_NOT_FOUND');
      }

      const { max_members, sub_status, current_period_end, plan_max, current_count } = teamRes.rows[0];

      const isPro = sub_status === 'active' && current_period_end && new Date(current_period_end) > new Date() && (max_members === 1 || plan_max > 1);
      const effectiveMax = Number(max_members);

      // Kiểm tra Quota TRONG transaction, sau khi đã lock
      if (current_count >= effectiveMax) {
        await client.query('ROLLBACK');
        return 'quota_exceeded';
      }

      // Kiểm tra đã là thành viên chưa
      const memberCheck = await client.query(
        `SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`,
        [teamId, targetUserId]
      );
      if (memberCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return 'already_member';
      }

      // Insert an toàn — biết chắc không bị race condition
      await client.query(
        `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), teamId, targetUserId, role]
      );

      await client.query('COMMIT');

      // Ghi audit log ngoài transaction chính
      await writeAuditLog(teamId, actorId, 'INVITE_MEMBER', targetUserId, { role }, ipAddress);

      return 'ok';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ─── 8. getUserByEmail ─────────────────────────────────────────────────────
  getUserByEmail: async (email: string) => {
    const target = await db.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
    return target.rows[0];
  },

  // ─── 9. getTeamMemberCount ─────────────────────────────────────────────────
  getTeamMemberCount: async (teamId: string) => {
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = $1`,
      [teamId]
    );
    return countRes.rows[0]?.cnt ?? 0;
  },

  // ─── 10. softDeleteTeam ────────────────────────────────────────────────────
  // [FIX 1c] Soft Delete thay vì DELETE thật. Trước khi soft-delete:
  //   - Hủy subscription đang active (cập nhật status = 'canceled')
  //   - Ghi audit log
  // LƯU Ý: Gọi API hủy Stripe bên ngoài (trong controller) trước khi gọi hàm này.
  softDeleteTeam: async (teamId: string, ownerId: string, ipAddress?: string) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Kiểm tra team tồn tại và chưa bị xóa
      const teamRes = await client.query(
        `SELECT id FROM teams WHERE id = $1 AND owner_id = $2 AND is_deleted = false`,
        [teamId, ownerId]
      );
      if (!teamRes.rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('TEAM_NOT_FOUND_OR_FORBIDDEN');
      }

      // Hủy tất cả subscription đang active của team
      await client.query(
        `UPDATE user_subscriptions
         SET status = 'canceled', cancel_at = NOW(), updated_at = NOW()
         WHERE team_id = $1 AND status = 'active'`,
        [teamId]
      );

      // Soft-delete team (ghi nhận thời điểm xóa)
      await client.query(
        `UPDATE teams
         SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [teamId]
      );

      // [FIX 2] Cascade soft-delete tất cả designs thuộc team này.
      // Không dùng CASCADE DELETE ở DB vì cần giữ 30 ngày để user clone sang Personal.
      // Cron Job dọn rác sẽ tự động quét và xóa vĩnh viễn sau 30 ngày.
      await client.query(
        `UPDATE designs
         SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
         WHERE team_id = $1 AND is_deleted = false`,
        [teamId]
      );

      await client.query('COMMIT');

      await writeAuditLog(teamId, ownerId, 'DELETE_TEAM', null, { soft_deleted: true }, ipAddress);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateTeamAvatar(teamId: string, avatarUrl: string, actorId: string, ip: string) {
    try {
      await db.execute(
        'UPDATE teams SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
        [avatarUrl, teamId]
      );
      await writeAuditLog(teamId, actorId, 'UPDATE_TEAM_AVATAR', null, { avatarUrl }, ip);
    } catch (error) {
      console.error('Update team avatar error:', error);
      throw error;
    }
  },

  removeTeamMember: async (
    teamId: string,
    targetUserId: string,
    actorId: string,
    targetRole: string,
    ipAddress?: string,
  ) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Xóa user khỏi team
      await client.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, targetUserId]);

      // 2. Lấy owner_id của team để chuyển nhượng tài sản
      const teamRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
      if (teamRes.rows.length > 0) {
        const ownerId = teamRes.rows[0].owner_id;
        
        // [SECURITY FIX - Data Sovereignty] 
        // Khi một người bị đuổi khỏi Team, toàn bộ thiết kế và ảnh họ tải lên TRONG TEAM
        // phải thuộc về Team Owner. Nếu không, họ (người ngoài) vẫn giữ quyền 'owner' trên các
        // bản vẽ nằm trong Team (tiếp tục truy cập, sửa chữa, ngốn dung lượng Team).
        await client.query(
          `UPDATE designs SET user_id = $1 WHERE team_id = $2 AND user_id = $3`, 
          [ownerId, teamId, targetUserId]
        );
        await client.query(
          `UPDATE assets SET uploaded_by = $1 WHERE team_id = $2 AND uploaded_by = $3`, 
          [ownerId, teamId, targetUserId]
        );
      }

      await client.query('COMMIT');
      await writeAuditLog(teamId, actorId, 'REMOVE_MEMBER', targetUserId, { removed_role: targetRole }, ipAddress);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ─── 11b. updateMemberRole ─────────────────────────────────────────────────
  updateMemberRole: async (
    teamId: string,
    targetUserId: string,
    newRole: string,
    actorId: string,
    ipAddress?: string,
  ) => {
    await db.execute(
      `UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3`,
      [newRole, teamId, targetUserId]
    );
    await writeAuditLog(teamId, actorId, 'UPDATE_MEMBER_ROLE', targetUserId, { new_role: newRole }, ipAddress);
  },

  // ─── 12. leaveTeam (thành viên tự rời) ────────────────────────────────────
  leaveTeam: async (teamId: string, userId: string, ipAddress?: string) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Xóa user khỏi team
      await client.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);

      // 2. Chuyển nhượng tài sản cho Team Owner
      const teamRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
      if (teamRes.rows.length > 0) {
        const ownerId = teamRes.rows[0].owner_id;
        
        // [SECURITY FIX - Data Sovereignty] Tương tự như removeTeamMember
        await client.query(
          `UPDATE designs SET user_id = $1 WHERE team_id = $2 AND user_id = $3`, 
          [ownerId, teamId, userId]
        );
        await client.query(
          `UPDATE assets SET uploaded_by = $1 WHERE team_id = $2 AND uploaded_by = $3`, 
          [ownerId, teamId, userId]
        );
      }

      await client.query('COMMIT');
      await writeAuditLog(teamId, userId, 'LEAVE_TEAM', null, null, ipAddress);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ─── 13. updateTeamName ────────────────────────────────────────────────────
  updateTeamName: async (teamId: string, name: string, actorId: string, ipAddress?: string) => {
    await db.execute(
      `UPDATE teams SET name = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = false`,
      [name, teamId]
    );
    await writeAuditLog(teamId, actorId, 'UPDATE_TEAM_NAME', null, { new_name: name }, ipAddress);
  },

  // ─── 13b. getOwnerPlanInfo ─────────────────────────────────────────────────
  // Lấy thông tin gói cước hiện tại của 1 user (dùng để kiểm tra Quota khi Transfer).
  // Trả về null nếu user đang dùng gói Free (không có subscription active).
  getOwnerPlanInfo: async (userId: string) => {
    const res = await db.query(
      `SELECT sp.max_team_members, sp.name AS plan_name, sp.slug AS plan_slug
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1
         AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
         AND us.current_period_end > NOW()
       LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null; // null = Free plan
  },

  // ─── 14. transferOwnership ─────────────────────────────────────────────────
  // [BILLING MODEL: Owner-based]
  // resolveWorkspace join subscription qua teams.owner_id, KHÔNG phải team_id.
  // → Khi teams.owner_id = newOwnerId, workspace tự động nhận gói của owner mới.
  // → Không cần động vào user_subscriptions, mọi thứ tự giải quyết.
  transferOwnership: async (
    teamId: string,
    currentOwnerId: string,
    newOwnerId: string,
    ipAddress?: string,
  ): Promise<{ success: true }> => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Hạ cấp owner cũ xuống admin
      await client.query(
        `UPDATE team_members SET role = 'admin' WHERE team_id = $1 AND user_id = $2`,
        [teamId, currentOwnerId]
      );

      // 2. Thăng cấp thành viên mới lên owner
      await client.query(
        `UPDATE team_members SET role = 'owner' WHERE team_id = $1 AND user_id = $2`,
        [teamId, newOwnerId]
      );

      // 3. Cập nhật owner_id trên bảng teams
      //    → resolveWorkspace sẽ tự join subscription của newOwner
      //    → Workspace tự động nhận gói Pro/Free của owner mới, không cần làm gì thêm
      await client.query(
        `UPDATE teams SET owner_id = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = false`,
        [newOwnerId, teamId]
      );

      await client.query('COMMIT');

      await writeAuditLog(teamId, currentOwnerId, 'TRANSFER_OWNERSHIP', newOwnerId, {
        from: currentOwnerId,
        to: newOwnerId,
      }, ipAddress);

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },


  // ─── 15. getDesignDetails ──────────────────────────────────────────────────
  getDesignDetails: async (designId: string) => {
    const designRes = await db.query(
      `SELECT * FROM designs WHERE id = $1 AND is_deleted = false`,
      [designId]
    );
    return designRes.rows[0];
  },

  // ─── 16. cloneDesign ───────────────────────────────────────────────────────
  cloneDesign: async (designId: string, userId: string, ipAddress?: string) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const newDesignId = uuidv4();

      await client.query(
        `INSERT INTO designs (id, user_id, team_id, title, design_type, width, height, thumbnail_url, is_public, is_template, created_at, updated_at)
           SELECT $1, $2, NULL, title || ' (bản sao)', design_type, width, height, thumbnail_url, false, false, NOW(), NOW()
           FROM designs WHERE id = $3 AND is_deleted = false`,
        [newDesignId, userId, designId]
      );

      const pages = await client.query(
        `SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order`,
        [designId]
      );
      for (const page of pages.rows) {
        const newPageId = uuidv4();
        await client.query(
          `INSERT INTO design_pages (id, design_id, page_order, title, background_color, duration, transition, thumbnail, type, width, height, content, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
          [newPageId, newDesignId, page.page_order, page.title, page.background_color, page.duration, page.transition, page.thumbnail, page.type, page.width, page.height, page.content]
        );
      }

      await client.query('COMMIT');

      await writeAuditLog(
        // team_id của design gốc – lấy từ design record đã có ở controller
        designId, // NOTE: dùng designId làm teamId tạm thời, controller sẽ gọi riêng
        userId, 'CLONE_DESIGN', newDesignId, { source_design_id: designId }, ipAddress
      );

      return newDesignId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── 17. cloneDesignWithAudit (ghi log đúng team) ─────────────────────────
  cloneDesignWithAudit: async (
    designId: string,
    userId: string,
    sourceTeamId: string,
    ipAddress?: string,
    targetTeamId?: string | null,  // null = Personal Workspace, uuid = Team Workspace
    newTitle?: string,
  ) => {
    // Xác định workspace đích
    const destTeamId = targetTeamId || null;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const newDesignId = uuidv4();

      if (newTitle) {
        await client.query(
          `INSERT INTO designs (id, user_id, team_id, title, design_type, width, height, thumbnail_url, is_public, is_template, created_at, updated_at)
             SELECT $1, $2, $4, $5, design_type, width, height, thumbnail_url, false, false, NOW(), NOW()
             FROM designs WHERE id = $3 AND is_deleted = false`,
          [newDesignId, userId, designId, destTeamId, newTitle]
        );
      } else {
        await client.query(
          `INSERT INTO designs (id, user_id, team_id, title, design_type, width, height, thumbnail_url, is_public, is_template, created_at, updated_at)
             SELECT $1, $2, $4, title || ' (bản sao)', design_type, width, height, thumbnail_url, false, false, NOW(), NOW()
             FROM designs WHERE id = $3 AND is_deleted = false`,
          [newDesignId, userId, designId, destTeamId]
        );
      }

      const pages = await client.query(
        `SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order`,
        [designId]
      );
      for (const page of pages.rows) {
        const newPageId = uuidv4();
        await client.query(
          `INSERT INTO design_pages (id, design_id, page_order, title, background_color, duration, transition, thumbnail, type, width, height, content, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
          [newPageId, newDesignId, page.page_order, page.title, page.background_color, page.duration, page.transition, page.thumbnail, page.type, page.width, page.height, page.content]
        );

        // Copy toàn bộ elements của page này
        await client.query(
          `INSERT INTO design_elements (id, page_id, element_type, properties, z_index, locked, visible, is_deleted, created_at, updated_at)
           SELECT gen_random_uuid(), $1, element_type, properties, z_index, locked, visible, false, NOW(), NOW()
           FROM design_elements WHERE page_id = $2 AND is_deleted = false`,
          [newPageId, page.id]
        );
      }

      // [SECURITY FIX - Quota Bypass] Tính tổng dung lượng ảnh thực tế trong design gốc.
      // Không tính này, Free User có thể clone Design 500MB của Pro User mà không bị trừ quota.
      // Ta cộng tổng file_size của tất cả assets (ảnh gốc, không phải clone) mà design đang tham chiếu.
      const assetSizeRes = await client.query(
        `SELECT COALESCE(SUM(a.file_size), 0)::bigint AS total_bytes
         FROM assets a
         WHERE a.url IN (
           SELECT DISTINCT de.properties->>'src'
           FROM design_elements de
           JOIN design_pages dp ON dp.id = de.page_id
           WHERE dp.design_id = $1
             AND de.properties->>'src' IS NOT NULL
             AND de.properties->>'src' != ''
         )
         AND a.file_size IS NOT NULL`,
        [designId]
      );
      const designAssetBytes = Number(assetSizeRes.rows[0]?.total_bytes ?? 0);

      await client.query('COMMIT');

      // Cộng dồn quota vào workspace đích
      if (designAssetBytes > 0) {
        if (destTeamId) {
          await db.execute(
            `UPDATE teams SET used_storage_bytes = COALESCE(used_storage_bytes, 0) + $1 WHERE id = $2`,
            [designAssetBytes, destTeamId]
          );
        } else {
          await db.execute(
            `UPDATE users SET storage_used_bytes = COALESCE(storage_used_bytes, 0) + $1 WHERE id = $2`,
            [designAssetBytes, userId]
          );
        }
      }

      await writeAuditLog(sourceTeamId, userId, 'CLONE_DESIGN', newDesignId, {
        source_design_id: designId,
        cloned_to: destTeamId ? `team:${destTeamId}` : 'personal',
        estimated_bytes: designAssetBytes,
      }, ipAddress);

      return newDesignId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── 18. getActiveSubscription ──────────────────────────────────────────────────
  // Query theo user_id (Owner-based model): gói của user nào thì truyền userId của user đó
  getActiveSubscription: async (userId: string) => {
    const res = await db.getOne(
      `SELECT us.id, us.status, us.current_period_end,
              us.user_id AS billing_owner_id,
              sp.name AS plan_name, sp.slug AS plan_slug,
              sp.max_storage_gb, sp.max_team_members
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1 AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       ORDER BY us.updated_at DESC
       LIMIT 1`,
      [userId]
    );
    return res ?? null;
  },

  // ─── 18b. getUserById ──────────────────────────────────────────────────────
  getUserById: async (userId: string) => {
    return db.getOne(
      `SELECT id, name, email, avatar_url FROM users WHERE id = $1`,
      [userId]
    );
  },

  // ─── 19. getAuditLogs (cho trang xem lịch sử) ─────────────────────────────
  getAuditLogs: async (teamId: string, limit = 50, offset = 0) => {
    const logs = await db.query(
      `SELECT al.id, al.action, al.target_id, al.details, al.ip_address, al.created_at,
              u.id AS actor_id, u.name AS actor_name, u.email AS actor_email, u.avatar_url AS actor_avatar
       FROM team_audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.team_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [teamId, limit, offset]
    );
    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM team_audit_logs WHERE team_id = $1`,
      [teamId]
    );
    return {
      logs: logs.rows,
      total: totalRes.rows[0]?.total ?? 0,
      limit,
      offset,
    };
  },

  // ─── 20. getPersonalStorageUsage (kiểm tra Quota cá nhân trước khi Clone) ──
  getPersonalStorageUsage: async (userId: string) => {
    const res = await db.getOne(
      `SELECT t.used_storage_bytes, t.max_storage_gb,
              CASE
                WHEN us.status = 'active' AND us.current_period_end > NOW() THEN true
                ELSE false
              END AS is_pro,
              sp.max_storage_gb AS plan_storage_gb
       FROM teams t
       LEFT JOIN user_subscriptions us ON us.team_id = t.id AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE t.owner_id = $1 AND t.max_members = 1 AND t.is_deleted = false
       LIMIT 1`,
      [userId]
    );
    if (!res) return null;
    const isPro = res.is_pro;
    const maxGb = isPro ? Number(res.plan_storage_gb ?? 5) : 5;
    return {
      usedBytes: Number(res.used_storage_bytes ?? 0),
      maxBytes: maxGb * 1024 * 1024 * 1024,
      maxStorageGb: maxGb,
    };
  },

  // ─── 21. getTeamStorageUsage (kiểm tra Quota nhóm trước khi Clone) ──
  getTeamStorageUsage: async (teamId: string) => {
    const res = await db.getOne(
      `SELECT t.used_storage_bytes,
              CASE
                WHEN us.status = 'active' AND us.current_period_end > NOW() THEN true
                ELSE false
              END AS is_pro,
              sp.max_storage_gb AS plan_storage_gb
       FROM teams t
       LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
         AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE t.id = $1 AND t.is_deleted = false`,
      [teamId]
    );
    if (!res) return null;
    const isPro = res.is_pro;
    const maxGb = isPro ? Number(res.plan_storage_gb ?? 5) : 5;
    return {
      usedBytes: Number(res.used_storage_bytes ?? 0),
      maxBytes: maxGb * 1024 * 1024 * 1024,
      maxStorageGb: maxGb,
    };
  },

};
