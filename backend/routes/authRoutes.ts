import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  register, login, getMe, logout, verifyOtp,
  forgotPassword, verifyForgotOtp, resetPassword,
  updateAvatar, updateProfile,
  sendChangePasswordOtp, verifyChangePasswordOtp, changePassword,
  verifyAdmin2FA, // [FIX 5] Admin 2FA
} from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';
import { validateImageFile } from '../middleware/validateImageFile';

const router = Router();

// ─── [SECURITY FIX - Brute-force Protection] Rate Limiters ───────────────────

// Limiter cho Register/Login: 20 lần/15 phút/IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
});

// Limiter cho OTP verify (registration + admin 2FA): 10 lần/15 phút/IP
// OTP 6 số = 1.000.000 mã. 10 lần = hacker cần 100.000 phiên → không khả thi.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Quá nhiều lần thử OTP. Vui lòng thử lại sau 15 phút.' },
});

// Limiter riêng cho forgot-password: 5 lần/15 phút/IP (chặn email bombing)
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.' },
});

// Avatar upload: giới hạn 5MB ở tầng multer
const MAX_AVATAR_MB = 5;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_MB * 1024 * 1024 },
}).single('avatar');

router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/admin-verify-2fa', otpLimiter, verifyAdmin2FA); // [FIX 5] Admin 2FA step 2
router.get('/me', getMe);
router.post('/logout', logout);

// Forgot Password flow
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/verify-forgot-otp', otpLimiter, verifyForgotOtp);
router.post('/reset-password', otpLimiter, resetPassword);

// Update Avatar: xác thực → multer (giới hạn 5MB) → validate magic bytes → handler
// Multer LIMIT_FILE_SIZE phải được bắt bằng error-handler 4-arg riêng
router.post(
  '/update-avatar',
  authenticate,
  (req: any, res: any, next: any) => {
    avatarUpload(req, res, (err: any) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'FileTooLarge',
          message: `Ảnh đại diện không được vượt quá ${MAX_AVATAR_MB}MB.`,
        });
      }
      if (err) return next(err);
      next();
    });
  },
  validateImageFile,
  updateAvatar,
);


// Update Profile (display name)
router.patch('/update-profile', authenticate, updateProfile);

// Change Password flow (authenticated – 3 bước: gửi OTP → xác thực OTP → đổi mật khẩu)
router.post('/change-password/send-otp', authenticate, sendChangePasswordOtp);
router.post('/change-password/verify-otp', authenticate, verifyChangePasswordOtp);
router.patch('/change-password', authenticate, changePassword);

export default router;

