import { Router } from 'express';
import { createDesign, getMyDesigns, getDesignById, updateDesign } from '../controllers/designController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate); // All design routes require authentication

router.post('/', createDesign);
router.get('/my', getMyDesigns);
router.get('/:id', getDesignById);
router.put('/:id', updateDesign);

export default router;
