import { Router } from 'express';
import { createDesign, getUserDesigns, getDesignById, updateDesign, exportVideo } from '../controllers/designController';
import { authenticate } from '../middleware/authMiddleware';
import { saveFullDesign } from '../controllers/designController';
import { getRecentStickers } from '../controllers/designController';
import { saveDesignVersion, getDesignVersions, restoreDesignVersion } from '../controllers/designController';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

// 🔥 ĐẶT LÊN ĐÂY: Mọi người đều có quyền upload video mà không cần Token
router.post('/export/video', upload.single('video'), exportVideo);

// ==========================================
// BẢO VỆ CÁC ROUTE BÊN DƯỚI BẰNG MIDDLEWARE
// ==========================================
router.use(authenticate);

router.post('/', createDesign);
router.get('/my', getUserDesigns);
router.get('/recent-stickers', getRecentStickers);
router.get('/:id', getDesignById);
router.put('/:id', saveFullDesign);

router.post('/:id/versions', saveDesignVersion);
router.get('/:id/versions', getDesignVersions);
router.post('/:id/versions/:versionId/restore', restoreDesignVersion);

export default router;