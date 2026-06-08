// backend/controllers/teamController.ts
// ─── HARDENED v2: Toàn bộ lỗ hổng đã được vá ─────────────────────────────────
import { Request, Response } from 'express';
import { teamService } from '../services/teamService';
import db from '../config/db';
import { emitTeamMemberRemoved, emitTeamOwnershipTransferred, emitTeamMemberAdded } from '../sockets/collaboration';

// ─── Hằng số Validation ────────────────────────────────────────────────────────
// [FIX 2c] Whitelist role được phép gửi lên khi Invite.
// Không bao giờ cho phép client tự đặt role = 'owner'.
const ALLOWED_INVITE_ROLES = ['admin', 'member', 'viewer'] as const;
type AllowedInviteRole = typeof ALLOWED_INVITE_ROLES[number];

// Helper lấy IP từ request
const getClientIp = (req: Request): string =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
  || req.socket?.remoteAddress
  || 'unknown';

// ── POST /api/teams ─────────────────────────────────────────────────────────
// [FIX 2d] Kiểm tra giới hạn số Team/User Free (đã xử lý trong service)
export const createTeam = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Tên nhóm không được để trống' });
  }

  try {
    const teamId = await teamService.createTeam(userId, name.trim(), getClientIp(req));
    res.status(201).json({ id: teamId, message: 'Tạo nhóm thành công' });
  } catch (error: any) {
    if (error.code === 'TEAM_LIMIT_EXCEEDED') {
      return res.status(403).json({
        error: 'TeamCreationLimitExceeded',
        message: `Bạn đã tạo ${error.current}/${error.max} nhóm (giới hạn gói Free). Hãy nâng cấp lên Pro để tạo thêm nhóm.`,
        current: error.current,
        max: error.max,
      });
    }
    console.error('Create Team Error:', error);
    res.status(500).json({ error: 'Lỗi tạo nhóm' });
  }
};

// ── GET /api/teams/my-teams ─────────────────────────────────────────────────
export const getMyTeams = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  try {
    const teams = await teamService.getMyTeams(userId);
    res.json({ teams });
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
    const myRole = await teamService.getTeamRole(id, userId);
    if (!myRole) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }

    const teamData = await teamService.getTeamDetails(id);
    if (!teamData) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    // Lấy 20 thành viên đầu tiên để hiển thị nhanh trên trang chi tiết
    const { members } = await teamService.getTeamMembers(id, 20, 0);
    const designs = await teamService.getTeamDesigns(id, userId);

    res.json({
      ...teamData,
      my_role: myRole,
      members,
      designs,
      is_read_only: teamData.is_over_quota === true,
    });
  } catch (error) {
    console.error('Get Team Error:', error);
    res.status(500).json({ error: 'Lỗi lấy thông tin nhóm' });
  }
};

// ── GET /api/teams/:id/members ──────────────────────────────────────────────
// [FIX 3b] Pagination + Search
export const getTeamMembersPaginated = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;

  // Parse query params với giá trị mặc định an toàn
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const search = (req.query.search as string)?.trim() || undefined;

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (!myRole) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }

    const result = await teamService.getTeamMembers(id, limit, offset, search);
    res.json(result);
  } catch (error) {
    console.error('Get Members Error:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách thành viên' });
  }
};

// ── POST /api/teams/:id/members ─────────────────────────────────────────────
// [FIX 1b] Race Condition → inviteMemberAtomic (SELECT FOR UPDATE)
// [FIX 2c] Role Injection → whitelist validation
export const inviteMember = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = (req as any).user?.id;

  // [FIX 2c] Validate và sanitize role đầu vào
  const rawRole = req.body.role;
  const role: AllowedInviteRole = ALLOWED_INVITE_ROLES.includes(rawRole)
    ? rawRole
    : 'member'; // Default an toàn nếu không hợp lệ hoặc không có

  // Nếu client cố tình gửi role không hợp lệ (không phải undefined/null), từ chối luôn
  if (rawRole !== undefined && rawRole !== null && !ALLOWED_INVITE_ROLES.includes(rawRole)) {
    return res.status(400).json({
      error: 'InvalidRole',
      message: `Role không hợp lệ. Chỉ chấp nhận: ${ALLOWED_INVITE_ROLES.join(', ')}.`,
    });
  }

  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email không được để trống' });
  }

  try {
    // 1. Kiểm tra quyền của người gửi request
    const myRole = await teamService.getTeamRole(id, userId);
    if (!myRole || !['owner', 'admin'].includes(myRole)) {
      return res.status(403).json({ error: 'Chỉ Owner/Admin mới có thể mời thành viên' });
    }

    // 2. Tìm user target theo email
    const targetUser = await teamService.getUserByEmail(email.trim());
    if (!targetUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng với email này' });
    }

    // 3. [FIX 1b] Gọi atomic invite (kiểm tra quota + insert trong 1 transaction + lock)
    const result = await teamService.inviteMemberAtomic(id, targetUser.id, role, userId, getClientIp(req));

    if (result === 'quota_exceeded') {
      return res.status(403).json({ 
        error: 'Team đã đạt số lượng thành viên tối đa, vui lòng mua thêm chỗ để thêm thành viên.' 
      });
    }

    if (result === 'already_member') {
      return res.status(400).json({ error: 'Người dùng đã là thành viên của nhóm' });
    }

    // [REALTIME] Notify via socket
    const actorName = (req as any).user?.name || (req as any).user?.email?.split('@')[0] || 'Quản trị viên';
    emitTeamMemberAdded(id, targetUser.id, actorName);

    res.json({ message: `Đã mời ${targetUser.email} vào nhóm với vai trò ${role}` });
  } catch (error: any) {
    if (error.message === 'TEAM_NOT_FOUND') {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    console.error('Invite Member Error:', error);
    res.status(500).json({ error: 'Lỗi mời thành viên' });
  }
};

// ── DELETE /api/teams/:id/members/:memberId ──────────────────────────────────
// [FIX 2b] Admin chỉ được xóa Member. Chỉ Owner mới được xóa/giáng cấp Admin.
// [FIX 1c] Khi Owner là thành viên duy nhất, dùng Soft Delete thay vì DELETE.
export const removeMember = async (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);

  try {
    // ── [FIX 1] Bảo vệ Personal Workspace: Không bao giờ được rời/giải tán ──
    const teamDetails = await teamService.getTeamDetails(id);
    if (!teamDetails) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    if (teamDetails.is_personal) {
      return res.status(400).json({
        error: 'PersonalWorkspaceProtected',
        message: 'Bạn không thể rời khỏi hoặc giải tán Không gian cá nhân (Personal Workspace).',
      });
    }

    const myRole = await teamService.getTeamRole(id, userId);

    // ── Case 1: Owner tự rời (tự đá bản thân) ──────────────────────────────
    if (memberId === userId && myRole === 'owner') {
      const count = await teamService.getTeamMemberCount(id);
      if (count > 1) {
        return res.status(400).json({
          error: 'OwnerCannotLeave',
          message: 'Bạn là Chủ nhóm. Hãy chuyển quyền Owner cho thành viên khác trước khi rời nhóm.',
        });
      }
      // Owner là thành viên duy nhất → Soft Delete team
      await teamService.softDeleteTeam(id, userId, ip);
      return res.json({ message: 'Đã giải tán nhóm. Dữ liệu sẽ được lưu giữ trong 30 ngày.' });
    }

    // ── Case 2: Thành viên thường tự rời ────────────────────────────────────
    if (memberId === userId) {
      await teamService.leaveTeam(id, userId, ip);

      const actorName = (req as any).user?.name || (req as any).user?.email?.split('@')[0] || 'Thành viên';
      emitTeamMemberRemoved(id, memberId, actorName);

      return res.json({ message: 'Bạn đã rời khỏi nhóm' });
    }

    // ── Case 3: Ai đó bị đá ra ──────────────────────────────────────────────
    if (!myRole || !['owner', 'admin'].includes(myRole)) {
      return res.status(403).json({ error: 'Không có quyền xóa thành viên' });
    }

    const targetRole = await teamService.getTeamRole(id, memberId);
    if (!targetRole) {
      return res.status(404).json({ error: 'Thành viên không tồn tại trong nhóm' });
    }

    // Không thể xóa Owner
    if (targetRole === 'owner') {
      return res.status(403).json({ error: 'Không thể xóa Chủ nhóm' });
    }

    // [FIX 2b] Admin chỉ được xóa Member (không được xóa Admin khác)
    if (myRole === 'admin' && targetRole === 'admin') {
      return res.status(403).json({
        error: 'InsufficientPermission',
        message: 'Admin không thể xóa Admin khác. Chỉ Owner mới có quyền này.',
      });
    }

    await teamService.removeTeamMember(id, memberId, userId, targetRole, ip);

    // [REALTIME] Notify via socket
    const actorName = (req as any).user?.name || (req as any).user?.email?.split('@')[0] || 'Admin';
    emitTeamMemberRemoved(id, memberId, actorName);

    res.json({ message: 'Đã xóa thành viên khỏi nhóm' });
  } catch (error) {
    console.error('Remove Member Error:', error);
    res.status(500).json({ error: 'Lỗi xóa thành viên' });
  }
};

// ── PUT /api/teams/:id/members/:memberId/role ──────────────────────────────
export const updateMemberRole = async (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const { role } = req.body;
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);

  if (!ALLOWED_INVITE_ROLES.includes(role as AllowedInviteRole)) {
    return res.status(400).json({ error: 'Role không hợp lệ' });
  }

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (!myRole || !['owner', 'admin'].includes(myRole)) {
      return res.status(403).json({ error: 'Không có quyền thay đổi vai trò' });
    }

    const targetRole = await teamService.getTeamRole(id, memberId);
    if (!targetRole) {
      return res.status(404).json({ error: 'Thành viên không tồn tại trong nhóm' });
    }

    if (targetRole === 'owner') {
      return res.status(403).json({ error: 'Không thể thay đổi quyền của Chủ nhóm' });
    }

    if (myRole === 'admin') {
      // Admin không thể phong ai làm admin, cũng không thể sửa quyền của admin khác
      if (targetRole === 'admin' || role === 'admin') {
        return res.status(403).json({ error: 'Admin không thể thăng cấp/giáng cấp Admin khác. Chỉ Owner mới có quyền này.' });
      }
    }

    await teamService.updateMemberRole(id, memberId, role, userId, ip);

    // [REALTIME] Notify via socket
    import('../sockets/collaboration').then(({ globalIo }) => {
      if (globalIo) {
        globalIo.to(`team-${id}`).emit('team:members_changed', { teamId: id });
      }
    });

    res.json({ message: 'Đã cập nhật vai trò thành công' });
  } catch (error) {
    console.error('Update Role Error:', error);
    res.status(500).json({ error: 'Lỗi cập nhật vai trò' });
  }
};

// ── PUT /api/teams/:id ──────────────────────────────────────────────────────
export const updateTeam = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  const userId = (req as any).user?.id;

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (myRole !== 'owner') {
      return res.status(403).json({ error: 'Chỉ Owner mới có thể sửa thông tin nhóm' });
    }

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Tên nhóm không được để trống' });
    }

    await teamService.updateTeamName(id, name.trim(), userId, getClientIp(req));
    res.json({ message: 'Cập nhật nhóm thành công' });
  } catch (error) {
    console.error('Update Team Error:', error);
    res.status(500).json({ error: 'Lỗi cập nhật nhóm' });
  }
};

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirnameTeam = path.dirname(fileURLToPath(import.meta.url));

// ── POST /api/teams/:id/update-avatar ───────────────────────────────────────
export const updateTeamAvatar = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;
  
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'Không có file ảnh nào được upload' });

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (myRole !== 'owner') {
      return res.status(403).json({ error: 'Chỉ Owner mới có thể đổi ảnh đại diện nhóm' });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const fileName = `team_${id}${ext}`;
    const avatarsDir = path.join(__dirnameTeam, '..', 'public', 'uploads', 'avatars');

    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const filePath = path.join(avatarsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const avatarUrl = `/uploads/avatars/${fileName}`;

    await teamService.updateTeamAvatar(id, avatarUrl, userId, getClientIp(req));

    res.json({ message: 'Cập nhật ảnh đại diện nhóm thành công', avatar_url: avatarUrl });
  } catch (error) {
    console.error('Update Team Avatar Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật ảnh đại diện nhóm' });
  }
};

// ── GET /api/teams/:id/preview-transfer?newOwnerId=xxx ──────────────────────
// Frontend gọi API này TRƯỚC khi hiện confirmation dialog.
// Trả về thông tin để hiển thị cảnh báo: workspace sẽ bị downgrade không?
export const previewTransferOwnership = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newOwnerId } = req.query as { newOwnerId?: string };
  const userId = (req as any).user?.id;

  if (!newOwnerId) {
    return res.status(400).json({ error: 'newOwnerId là bắt buộc' });
  }

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (myRole !== 'owner') {
      return res.status(403).json({ error: 'Chỉ Owner mới có thể xem preview chuyển nhượng' });
    }

    const targetRole = await teamService.getTeamRole(id, newOwnerId);
    if (!targetRole) {
      return res.status(404).json({ error: 'Người nhận quyền chưa là thành viên nhóm' });
    }

    // Lấy gói của Owner hiện tại (workspace đang dùng gói này)
    const currentOwnerSub = await teamService.getActiveSubscription(userId);

    // Lấy gói của Owner mới (workspace sẽ dùng gói này sau khi chuyển)
    const newOwnerSub = await teamService.getActiveSubscription(newOwnerId);

    // Lấy thông tin user của newOwner để hiển thị tên
    const newOwnerInfo = await teamService.getUserById(newOwnerId);

    const willDowngrade = !!currentOwnerSub && !newOwnerSub;
    const willUpgrade = !currentOwnerSub && !!newOwnerSub;

    res.json({
      current_plan: currentOwnerSub
        ? { name: currentOwnerSub.plan_name, is_pro: true }
        : { name: 'Free', is_pro: false },
      new_plan: newOwnerSub
        ? { name: newOwnerSub.plan_name, is_pro: true }
        : { name: 'Free', is_pro: false },
      new_owner: {
        id: newOwnerInfo?.id,
        name: newOwnerInfo?.name,
        email: newOwnerInfo?.email,
      },
      will_downgrade: willDowngrade,
      will_upgrade: willUpgrade,
      // Message gợi ý cho Frontend hiển thị
      warning: willDowngrade
        ? `Workspace sẽ bị hạ xuống gói Free vì ${newOwnerInfo?.name ?? 'người nhận'} đang dùng gói Free. Các tính năng Pro sẽ bị khóa ngay sau khi chuyển nhượng.`
        : willUpgrade
          ? `Workspace sẽ được nâng lên gói ${newOwnerSub?.plan_name} vì ${newOwnerInfo?.name ?? 'người nhận'} đang có gói Pro.`
          : null,
    });
  } catch (error) {
    console.error('Preview Transfer Error:', error);
    res.status(500).json({ error: 'Lỗi preview chuyển nhượng' });
  }
};

// ── POST /api/teams/:id/transfer-ownership ──────────────────────────────────
// [BILLING: Owner-based] Workspace tự động theo gói của Owner mới.

export const transferOwnership = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newOwnerId } = req.body;
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);

  if (!newOwnerId) {
    return res.status(400).json({ error: 'newOwnerId là bắt buộc' });
  }

  try {
    // ── [FIX 1] Bảo vệ Personal Workspace ──────────────────────────────────
    const teamDetails = await teamService.getTeamDetails(id);
    if (!teamDetails) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    if (teamDetails.is_personal) {
      return res.status(400).json({
        error: 'PersonalWorkspaceProtected',
        message: 'Không thể chuyển nhượng quyền sở hữu Không gian cá nhân (Personal Workspace).',
      });
    }

    const myRole = await teamService.getTeamRole(id, userId);
    if (myRole !== 'owner') {
      return res.status(403).json({ error: 'Chỉ Owner mới có thể chuyển nhượng quyền' });
    }

    const targetRole = await teamService.getTeamRole(id, newOwnerId);
    if (!targetRole) {
      return res.status(404).json({ error: 'Người nhận quyền chưa là thành viên nhóm' });
    }

    // ── [FIX 2] Kiểm tra Quota của Owner mới trước khi chuyển nhượng ────────
    const newOwnerPlan = await teamService.getOwnerPlanInfo(newOwnerId);
    const currentMemberCount = await teamService.getTeamMemberCount(id);
    const newMaxMembers = newOwnerPlan?.max_team_members ?? teamDetails.max_members; // fallback về Free plan
    if (currentMemberCount > newMaxMembers) {
      return res.status(400).json({
        error: 'QuotaExceeded',
        message: `Gói cước của người nhận (tối đa ${newMaxMembers} thành viên) không đủ để chứa số lượng thành viên hiện tại của nhóm (${currentMemberCount} người). Vui lòng xóa bớt thành viên trước khi chuyển nhượng.`,
        current: currentMemberCount,
        max: newMaxMembers,
      });
    }

    // Service tự xử lý 3 bước trong 1 transaction
    await teamService.transferOwnership(id, userId, newOwnerId, ip);

    // [REALTIME] Notify via socket
    const actorName = (req as any).user?.name || (req as any).user?.email?.split('@')[0] || 'Chủ cũ';
    emitTeamOwnershipTransferred(id, newOwnerId, actorName);

    res.json({
      message: 'Đã chuyển nhượng quyền Owner thành công',
      // Workspace tự động nhận gói của Owner mới nhờ cơ chế Owner-based billing.
      // Nếu Owner mới có gói Pro → workspace lên Pro ngay. Ngược lại → workspace về Free.
      note: 'Gói của workspace sẽ tự động phản ánh gói hiện tại của Owner mới.',
    });
  } catch (error) {
    console.error('Transfer Ownership Error:', error);
    res.status(500).json({ error: 'Lỗi chuyển nhượng quyền' });
  }
};


// ── POST /api/designs/:designId/clone-to-personal ────────────────────────────
// [FIX 2a] Kiểm tra Quota cá nhân trước khi clone.
// [FIX BOLA] Kiểm tra quyền truy cập bản vẽ nguồn trước khi clone.
export const cloneDesignToPersonal = async (req: Request, res: Response) => {
  const { designId } = req.params;
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);

  try {
    // 1. Tìm thiết kế gốc
    const design = await teamService.getDesignDetails(designId);
    if (!design) {
      return res.status(404).json({ error: 'Không tìm thấy thiết kế' });
    }

    if (!design.team_id) {
      return res.status(400).json({ error: 'Đây không phải bản vẽ của nhóm' });
    }

    // 2. Kiểm tra user có thuộc team không (điều kiện cần tối thiểu)
    const myRole = await teamService.getTeamRole(design.team_id, userId);
    if (!myRole) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm sở hữu thiết kế này' });
    }

    // 3. [FIX BOLA/IDOR] Kiểm tra quyền THỰC SỰ trên bản vẽ nguồn.
    //    Thuộc cùng Team KHÔNG tự động cấp quyền đọc bản vẽ của người khác.
    //    Quy tắc "Private by default": phải là Owner, được Share, hoặc bản vẽ là Public.
    //    Logic này nhất quán với middleware checkDesignAccess.ts.
    const isOwner = design.user_id === userId;
    let hasAccess = isOwner;

    if (!hasAccess) {
      // Kiểm tra bảng design_shares (được share nội bộ)
      const shareResult = await db.query(
        'SELECT role FROM design_shares WHERE design_id = $1 AND user_id = $2',
        [designId, userId]
      );
      if (shareResult.rows.length > 0) {
        hasAccess = true;
      }
    }

    if (!hasAccess && design.is_public) {
      // Bản vẽ public → ai cũng được clone
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'AccessDenied',
        message: 'Bạn không có quyền nhân bản bản vẽ này. Bản vẽ đang ở chế độ Private — chỉ chủ sở hữu hoặc người được chia sẻ mới có thể clone.',
      });
    }

    // 4. Kiểm tra Quota của Personal Workspace
    const personalQuota = await teamService.getPersonalStorageUsage(userId);
    if (!personalQuota) {
      return res.status(500).json({ error: 'Không tìm thấy Personal Workspace của bạn' });
    }

    if (personalQuota.usedBytes >= personalQuota.maxBytes) {
      const usedGB = (personalQuota.usedBytes / (1024 ** 3)).toFixed(2);
      return res.status(403).json({
        error: 'PersonalQuotaExceeded',
        message: `Bộ nhớ cá nhân của bạn đã đầy (${usedGB}GB / ${personalQuota.maxStorageGb}GB). Vui lòng xóa bớt tài nguyên hoặc nâng cấp gói cá nhân.`,
        used_bytes: personalQuota.usedBytes,
        max_bytes: personalQuota.maxBytes,
        max_storage_gb: personalQuota.maxStorageGb,
      });
    }

    // 5. Tiến hành clone (ghi audit log đúng vào team nguồn)
    const newDesignId = await teamService.cloneDesignWithAudit(designId, userId, design.team_id, ip);

    res.json({
      message: 'Đã nhân bản thiết kế về không gian cá nhân',
      designId: newDesignId,
    });
  } catch (error) {
    console.error('Clone Design Error:', error);
    res.status(500).json({ error: 'Lỗi nhân bản thiết kế' });
  }
};

// ── GET /api/teams/:id/audit-logs ──────────────────────────────────────────
// [FIX 3c] API xem lịch sử hành động của nhóm (chỉ Owner/Admin mới xem được)
export const getTeamAuditLogs = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  try {
    const myRole = await teamService.getTeamRole(id, userId);
    if (!myRole || !['owner', 'admin'].includes(myRole)) {
      return res.status(403).json({ error: 'Chỉ Owner/Admin mới có thể xem lịch sử hành động' });
    }

    const result = await teamService.getAuditLogs(id, limit, offset);
    res.json(result);
  } catch (error) {
    console.error('Get Audit Logs Error:', error);
    res.status(500).json({ error: 'Lỗi lấy lịch sử hành động' });
  }
};
