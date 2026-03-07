import { Router } from 'express';
import { searchAssets, getAssetCategories } from '../controllers/assetController';

const router = Router();

router.get('/search', searchAssets);
router.get('/categories', getAssetCategories);

export default router;
