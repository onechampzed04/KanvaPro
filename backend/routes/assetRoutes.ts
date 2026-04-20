import { Router } from 'express';
import { searchAssets, getAssetCategories } from '../controllers/assetController';

const router = Router();

// Hỗ trợ cả API asset search trực tiếp và đường dẫn gốc
router.get('/', searchAssets);
router.get('/search', searchAssets);
router.get('/categories', getAssetCategories);

export default router;
