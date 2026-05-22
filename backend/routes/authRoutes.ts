import { Router } from 'express';
import multer from 'multer';
import {
  register, login, getMe, logout, verifyOtp,
  forgotPassword, verifyForgotOtp, resetPassword,
  updateAvatar
} from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.get('/me', getMe);
router.post('/logout', logout);

// Forgot Password flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-forgot-otp', verifyForgotOtp);
router.post('/reset-password', resetPassword);

// Update Avatar (yêu cầu xác thực + multer)
router.post('/update-avatar', authenticate, upload.single('avatar'), updateAvatar);

export default router;
