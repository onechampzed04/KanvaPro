import { Router } from 'express';
import multer from 'multer';
import {
  searchAssets,
  uploadFont,
  getUserFonts,
  getUserImages,
  removeBackground,
  removeBgBrush,
  uploadImage,
  uploadThumbnail,
  cloneAssetForDesign,
  deleteUserAsset,
} from '../controllers/assetController';
import { authenticate } from '../middleware/authMiddleware';
import { checkStorageQuota } from '../middleware/checkStorageQuota';
import { resolveWorkspace } from '../middleware/resolveWorkspace';
import { thumbnailRateLimit } from '../middleware/thumbnailRateLimit';
import { validateImageFile } from '../middleware/validateImageFile';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Multer instance có giới hạn 2MB riêng cho thumbnail
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ─── Asset search & categories ────────────────────────────────────────────────
router.get('/', searchAssets);
router.get('/search', searchAssets);

// ─── Font routes ──────────────────────────────────────────────────────────────
router.post('/upload-font', authenticate, resolveWorkspace, checkStorageQuota, upload.single('font'), uploadFont);
router.get('/user-fonts', authenticate, resolveWorkspace, getUserFonts);

// ─── Image upload ─────────────────────────────────────────────────────────────
router.post('/upload-image', authenticate, resolveWorkspace, checkStorageQuota, upload.single('image'), uploadImage);
router.get('/user-images', authenticate, getUserImages);

// ─── [NEW] Clone asset cho design (Virtual Referencing - Bản ghi B) ──────────
// Gọi khi user kéo ảnh từ Uploads Sidebar vào Canvas.
// Không copy file vật lý — chỉ tạo bản ghi DB mới trỏ cùng URL.
router.post('/clone-for-design', authenticate, cloneAssetForDesign);

// ─── [NEW] Xóa ảnh khỏi thư viện Uploads (chỉ xóa Bản ghi A) ────────────────
// Ảnh đã kéo vào design (Bản ghi B) vẫn tồn tại → Canvas không mất ảnh.
// QUAN TRỌNG: Route này phải đặt SAU /clone-for-design để tránh conflict với /:id
router.delete('/:id', authenticate, deleteUserAsset);

// ─── Thumbnail upload ─────────────────────────────────────────────────────────
router.post(
  '/upload-thumbnail',
  authenticate,
  thumbnailRateLimit,
  thumbnailUpload.single('thumbnail'),
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
