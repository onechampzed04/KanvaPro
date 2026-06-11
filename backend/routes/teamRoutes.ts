// backend/routes/teamRoutes.ts
import { Router } from 'express';
import {
  createTeam,
  getMyTeams,
  getTeamById,
  inviteMember,
  removeMember,
  updateMemberRole,
  updateTeam,
  transferOwnership,
  previewTransferOwnership,
  cloneDesignToPersonal,
  getTeamMembersPaginated,
  getTeamAuditLogs,
  updateTeamAvatar,
  getTeamStorageBreakdown,
} from '../controllers/teamController';
import { authenticate } from '../middleware/authMiddleware';

import multer from 'multer';
import { validateImageFile } from '../middleware/validateImageFile';

const router = Router();
router.use(authenticate);

// Avatar upload: giới hạn 5MB ở tầng multer
const MAX_AVATAR_MB = 5;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_MB * 1024 * 1024 },
}).single('avatar');

// ─── Team CRUD ────────────────────────────────────────────────────────────────
router.post('/',           createTeam);         // [FIX 2d] Giới hạn số team
router.get('/my-teams',    getMyTeams);
router.get('/:id',         getTeamById);
router.put('/:id',         updateTeam);

router.post(
  '/:id/update-avatar',
  (req: any, res: any, next: any) => {
    avatarUpload(req, res, (err: any) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'FileTooLarge',
          message: `Ảnh đại diện không được vượt quá ${MAX_AVATAR_MB}MB.`,
        });
      }
      if (err) return next(err);
      next();
    });
  },
  validateImageFile,
  updateTeamAvatar
);

// ─── Member Management ────────────────────────────────────────────────────────
// [FIX 3b] Pagination + Search
router.get('/:id/members',               getTeamMembersPaginated);
// [FIX 1b] Atomic Invite (Row-level Lock) | [FIX 2c] Role Validation
router.post('/:id/members',              inviteMember);
// [FIX 2b] RBAC: Admin không đá Admin | [FIX 1c] Soft Delete khi Owner rời
router.delete('/:id/members/:memberId',  removeMember);
// [FIX 2c] RBAC: Owner/Admin có thể thay đổi role
router.put('/:id/members/:memberId/role', updateMemberRole);

// ─── Ownership Transfer ───────────────────────────────────────────────────────
// [BILLING] Preview: workspace sẽ downgrade/upgrade sau khi chuyển? (Frontend dùng để hiện cảnh báo)
router.get('/:id/preview-transfer',      previewTransferOwnership);
// [BILLING: Owner-based] Workspace tự động theo gói của Owner mới
router.post('/:id/transfer-ownership',   transferOwnership);

// ─── Audit Logs ───────────────────────────────────────────────────────────────
// [FIX 3c] Lịch sử hành động (chỉ Owner/Admin xem)
router.get('/:id/audit-logs',            getTeamAuditLogs);

// ─── Storage Breakdown ────────────────────────────────────────────────────────
router.get('/:id/storage-breakdown',     getTeamStorageBreakdown);

// ─── Design Clone ─────────────────────────────────────────────────────────────
// [FIX 2a] Quota cá nhân được kiểm tra trực tiếp trong controller (không cần middleware)
// vì đây là Personal Workspace, không phải Team Workspace
router.post('/designs/:designId/clone-to-personal', cloneDesignToPersonal);

export default router;
