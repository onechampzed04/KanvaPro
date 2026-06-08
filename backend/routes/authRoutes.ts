import { Router } from 'express';
import multer from 'multer';
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

// Avatar upload: giới hạn 5MB ở tầng multer
const MAX_AVATAR_MB = 5;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_MB * 1024 * 1024 },
}).single('avatar');

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/admin-verify-2fa', verifyAdmin2FA); // [FIX 5] Admin 2FA step 2
router.get('/me', getMe);
router.post('/logout', logout);

// Forgot Password flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-forgot-otp', verifyForgotOtp);
router.post('/reset-password', resetPassword);

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
router.post('/change-password/send-otp',    authenticate, sendChangePasswordOtp);
router.post('/change-password/verify-otp',  authenticate, verifyChangePasswordOtp);
router.patch('/change-password',            authenticate, changePassword);

export default router;

