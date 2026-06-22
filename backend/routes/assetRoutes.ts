import { Router } from 'express';
import multer from 'multer';
import {
  searchAssets,
  uploadFont,
  getUserFonts,
  getSystemFonts,
  getUserImages,
  removeBackground,
  removeBgBrush,
  uploadImage,
  uploadThumbnail,
  deleteUserAsset,
  getAssetUsages,
  forceDeleteUserAsset,
} from '../controllers/assetController';
import { authenticate } from '../middleware/authMiddleware';
import { checkStorageQuota } from '../middleware/checkStorageQuota';
import { resolveWorkspace } from '../middleware/resolveWorkspace';
import { thumbnailRateLimit } from '../middleware/thumbnailRateLimit';
import { validateImageFile } from '../middleware/validateImageFile';

const router = Router();

// [SECURITY FIX - DoS] Giới hạn 20MB ở tầng Multer, TRƯỚC khi đưa vào RAM.
// Nếu không có limits, Multer sẽ buffer toàn bộ file vào Heap → OOM crash server.
const MAX_IMAGE_MB = 20;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
});

// Multer instance có giới hạn 2MB riêng cho thumbnail
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ─── Asset search & categories ────────────────────────────────────────────────
router.get('/', searchAssets);
router.get('/search', searchAssets);

// ─── Font routes ──────────────────────────────────────────────────────────────
// [PUBLIC] Font hệ thống do Admin upload — không cần auth
router.get('/fonts', getSystemFonts);
router.post('/upload-font', authenticate, resolveWorkspace, checkStorageQuota, upload.single('font'), uploadFont);
router.get('/user-fonts', authenticate, resolveWorkspace, getUserFonts);

// ─── Image upload ─────────────────────────────────────────────────────────────
// [SECURITY FIX - RCE] validateImageFile kiểm tra magic bytes thực sự của file,
// không tin vào Content-Type do client khai báo. Chặn .php, .exe, .sh giả mạo.
router.post(
  '/upload-image',
  authenticate,
  resolveWorkspace,
  checkStorageQuota,
  (req: any, res: any, next: any) => {
    upload.single('image')(req, res, (err: any) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'FileTooLarge',
          message: `Ảnh không được vượt quá ${MAX_IMAGE_MB}MB.`,
        });
      }
      if (err) return next(err);
      next();
    });
  },
  validateImageFile,
  uploadImage,
);
router.get('/user-images', authenticate, resolveWorkspace, getUserImages);

// ─── [NEW] Xóa ảnh khỏi thư viện Uploads (chỉ xóa Bản ghi A) ────────────────
// Ảnh đã kéo vào design (Bản ghi B) vẫn tồn tại → Canvas không mất ảnh.
// QUAN TRỌNG: Route này phải đặt SAU /clone-for-design để tránh conflict với /:id
router.delete('/:id', authenticate, deleteUserAsset);

// ─── [NEW] Tìm các design đang dùng ảnh này ────────────────────────────────────
router.get('/:id/usages', authenticate, getAssetUsages);

// ─── [NEW] Xóa ảnh VÀ tự động xóa khỏi tất cả các project đang dùng ảnh này ──
router.delete('/:id/force', authenticate, forceDeleteUserAsset);

// ─── Thumbnail upload ─────────────────────────────────────────────────────────
router.post(
  '/upload-thumbnail',
  authenticate,
  thumbnailRateLimit,
  (req: any, res: any, next: any) => {
    thumbnailUpload.single('thumbnail')(req, res, (err: any) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'FileTooLarge',
          message: 'Thumbnail quá lớn (vượt quá 2MB).',
        });
      }
      if (err) return next(err);
      next();
    });
  },
  validateImageFile,
  uploadThumbnail
);

// ─── Background removal (AI auto) ────────────────────────────────────────────
router.post('/remove-bg', authenticate, upload.single('image'), removeBackground);

// ─── Brush background eraser (Mask-based) ────────────────────────────────────
router.post(
  '/remove-bg-brush',
  authenticate,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 },
  ]),
  removeBgBrush
);

export default router;
