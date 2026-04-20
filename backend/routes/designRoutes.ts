import { Router } from 'express';
import { createDesign, getUserDesigns, getDesignById, updateDesign } from '../controllers/designController';
import { authenticate } from '../middleware/authMiddleware';
import { saveFullDesign } from '../controllers/designController';
import { getRecentStickers } from '../controllers/designController';

const router = Router();

router.use(authenticate); // All design routes require authentication

router.post('/', createDesign);
router.get('/my', getUserDesigns);
router.get('/recent-stickers', getRecentStickers);
router.get('/:id', getDesignById);
router.put('/:id', saveFullDesign);


export default router;
