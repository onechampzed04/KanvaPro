// backend/routes/teamRoutes.ts
import { Router } from 'express';
import {
  createTeam, getMyTeams, getTeamById,
  inviteMember, removeMember, updateTeam
} from '../controllers/teamController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.post('/', createTeam);
router.get('/my-teams', getMyTeams);
router.get('/:id', getTeamById);
router.put('/:id', updateTeam);
router.post('/:id/members', inviteMember);
router.delete('/:id/members/:memberId', removeMember);

export default router;
