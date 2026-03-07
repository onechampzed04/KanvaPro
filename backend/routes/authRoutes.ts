import { Router } from 'express';
import { register, login, getMe, logout, verifyOtp } from '../controllers/authController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.get('/me', getMe);
router.post('/logout', logout);

export default router;
