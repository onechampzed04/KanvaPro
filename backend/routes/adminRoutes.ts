import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { isAdmin } from '../middleware/isAdmin';
import {
  getMetrics, getUsers, updateUserRole, toggleUserBan,
  getAdminAssets, bulkUploadAssets, updateAsset, toggleAssetActive,
  getDesigns, publishTemplate, unpublishTemplate, adminUpload, validateMagicNumber,
  getAdminSubscriptions, createManualSubscription,
  updateSubscriptionStatus, terminateSubscription,
  subscriptionPlanController, getAdminPayments,
  getAdminUsers, banUser,
  adminForceSuccessPayment, revokeSubscription,
  getAdminTeams, getAdminTeamDetail, banTeam,
} from '../controllers/adminController';

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, isAdmin);

// Dashboard
router.get('/metrics', getMetrics);

// Users (Real-time V2)
router.get('/users-v2', getAdminUsers);
router.post('/users-v2/:id/ban', banUser);

// Legacy fallback
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserRole);
router.put('/users/:id/ban', toggleUserBan);

// Assets
router.get('/assets', getAdminAssets);
router.post('/assets/bulk', (req: any, res: any, next: any) => {
  adminUpload.array('files', 50)(req, res, (err: any) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Tối đa chỉ được tải lên 50 file mỗi lần' });
    }
    if (err) return next(err);
    next();
  });
}, validateMagicNumber, bulkUploadAssets);
router.patch('/assets/:id', updateAsset);
router.put('/assets/:id/toggle-active', toggleAssetActive);

// Designs & Templates
router.get('/designs', getDesigns);
router.post('/templates/publish', publishTemplate);
router.delete('/templates/:design_id', unpublishTemplate);

// ── Subscriptions ──────────────────────────────────────────────────────────
router.get('/subscriptions', getAdminSubscriptions);
router.post('/subscriptions/manual', createManualSubscription);
router.put('/subscriptions/:id', updateSubscriptionStatus);
router.delete('/subscriptions/:id', terminateSubscription);
// [MỚI] Nút thay cho Terminate đơn lẻ
router.post('/subscriptions/:id/revoke', revokeSubscription);          // Ngắt ngay lập tức

// ── Plans ──────────────────────────────────────────────────────────────────
router.get('/plans', subscriptionPlanController.getAll);
router.post('/plans', subscriptionPlanController.create);
router.put('/plans/:id', subscriptionPlanController.update);
router.delete('/plans/:id', subscriptionPlanController.delete);

// ── Payments / Revenue ─────────────────────────────────────────────────────
router.get('/payments', getAdminPayments);
// [MỚI] Admin duyệt tay giao dịch Pending (PayOS webhook bị miss)
router.post('/payments/:id/force-success', adminForceSuccessPayment);

// ── Teams ──────────────────────────────────────────────────────────
router.get('/teams', getAdminTeams);
router.get('/teams/:id', getAdminTeamDetail);
router.post('/teams/:id/ban', banTeam);

export default router;
