import { Router } from 'express';
import multer from 'multer';
import { searchAssets, getAssetCategories, uploadFont, getUserFonts, removeBackground, removeBgBrush, uploadImage, uploadThumbnail } from '../controllers/assetController';
import { authenticate } from '../middleware/authMiddleware';
import { checkStorageQuota } from '../middleware/checkStorageQuota';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Asset search & categories ────────────────────────────────────────────────
router.get('/', searchAssets);
router.get('/search', searchAssets);
router.get('/categories', getAssetCategories);

// ─── Font routes ──────────────────────────────────────────────────────────────
// checkStorageQuota chặn upload khi user đã vượt hạn mức
router.post('/upload-font', authenticate, checkStorageQuota, upload.single('font'), uploadFont);
router.get('/user-fonts', authenticate, getUserFonts);

// ─── Image upload (thay thế Base64) ──────────────────────────────────────────
// checkStorageQuota chặn upload khi user đã vượt hạn mức
router.post('/upload-image', authenticate, checkStorageQuota, upload.single('image'), uploadImage);

// ─── Thumbnail upload (tách khỏi payload lưu design) ─────────────────────────
// Thumbnail không tính vào quota user (system file)
router.post('/upload-thumbnail', upload.single('thumbnail'), uploadThumbnail);

// ─── Background removal (AI auto) ────────────────────────────────────────────
router.post('/remove-bg', authenticate, upload.single('image'), removeBackground);

// ─── Brush background eraser (Mask-based) ────────────────────────────────────
router.post(
  '/remove-bg-brush',
  authenticate,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask',  maxCount: 1 },
  ]),
  removeBgBrush
);

export default router;
