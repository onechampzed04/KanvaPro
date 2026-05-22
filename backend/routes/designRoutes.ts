import { Router } from 'express';
import {
  createDesign, getUserDesigns, getDesignById, updateDesign,
  exportVideo, saveFullDesign, getRecentStickers,
  saveDesignVersion, getDesignVersions, restoreDesignVersion,
  deleteDesign, getTrashDesigns, restoreDesign, permanentlyDeleteDesign,
  bulkDeleteDesigns, emptyTrash,
  getDesignMeta, getPageElements, // === FIX #4: Lazy Loading ===
  createVideoJob, getVideoJobStatus, // === FIX #5: Server-side Video ===
} from '../controllers/designController';
import {
  getDesignShares, shareDesign, updateShareRole, removeShare,
  togglePublicLink, getShareLink
} from '../controllers/shareController';
import { authenticate } from '../middleware/authMiddleware';
import { checkDesignAccess, requireRole } from '../middleware/checkDesignAccess';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/export/video', upload.single('video'), exportVideo);

router.use(authenticate);

router.post('/', createDesign);
router.get('/my', getUserDesigns);
router.get('/recent-stickers', getRecentStickers);

// ── TRASH BIN ──────────────────────────────────────────────────────────────
router.get('/trash', getTrashDesigns);
router.delete('/trash/empty', emptyTrash);
router.put('/trash/:id/restore', restoreDesign);
router.delete('/trash/:id/permanent', permanentlyDeleteDesign);

// Bulk actions
router.post('/bulk-delete', bulkDeleteDesigns);

// viewer+ được xem (checkDesignAccess cho phép public viewer)
router.get('/:id', checkDesignAccess, getDesignById);

// === FIX #4: API mỏng - chỉ lấy metadata, không có elements ===
router.get('/:id/meta', checkDesignAccess, getDesignMeta);

// === FIX #4: Lazy load elements của 1 trang cụ thể ===
router.get('/:id/pages/:pageId/elements', checkDesignAccess, getPageElements);

// (save): chỉ owner và editor được lưu
router.put('/:id', checkDesignAccess, requireRole('owner', 'editor'), saveFullDesign);

// Soft delete: chỉ owner
router.delete('/:id', checkDesignAccess, requireRole('owner'), deleteDesign);

// Version History: chỉ owner và editor 
router.post('/:id/versions', checkDesignAccess, requireRole('owner', 'editor'), saveDesignVersion);
router.get('/:id/versions', checkDesignAccess, requireRole('owner', 'editor'), getDesignVersions);
router.post('/:id/versions/:versionId/restore', checkDesignAccess, requireRole('owner', 'editor'), restoreDesignVersion);

// Lấy danh sách share (commenter+ được xem)
router.get('/:id/shares', checkDesignAccess, requireRole('owner', 'editor', 'commenter', 'viewer'), getDesignShares);

// Lấy link chia sẻ
router.get('/:id/share-link', checkDesignAccess, getShareLink);

// Mời người dùng (chỉ Owner — controller cũng check thêm)
router.post('/:id/share', checkDesignAccess, requireRole('owner'), shareDesign);

// Cập nhật role của người được share (chỉ Owner)
router.put('/:id/share/:userId', checkDesignAccess, requireRole('owner'), updateShareRole);

// Gỡ quyền (chỉ Owner)
router.delete('/:id/share/:userId', checkDesignAccess, requireRole('owner'), removeShare);

// Bật/tắt public link (chỉ Owner)
router.put('/:id/public', checkDesignAccess, requireRole('owner'), togglePublicLink);

// === FIX #5: Server-side Video Export (Job Queue) ===
router.post('/export/video-job', authenticate, createVideoJob);
router.get('/export/video-job/:jobId', authenticate, getVideoJobStatus);

export default router;
