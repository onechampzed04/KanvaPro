import { Router } from 'express';
import multer from 'multer';
import { searchAssets, getAssetCategories, uploadFont, getUserFonts } from '../controllers/assetController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Asset search & categories
router.get('/', searchAssets);
router.get('/search', searchAssets);
router.get('/categories', getAssetCategories);

// Font routes (yêu cầu xác thực)
router.post('/upload-font', authenticate, upload.single('font'), uploadFont);
router.get('/user-fonts', authenticate, getUserFonts);

// Background removal route
import { removeBackground } from '../controllers/assetController';
router.post('/remove-bg', authenticate, upload.single('image'), removeBackground);

export default router;
