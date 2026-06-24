import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { sendOtpEmail } from '../services/emailService';
import { User, UserDTO } from '../models/User';
import { authService } from '../services/authService';
import { JWT_SECRET } from '../config/jwt'; // [FIX Vấn đề 20] Dùng từ config tập trung
import { getRedis } from '../config/redis'; // [FIX 5] Redis để lưu 2FA OTP cho Admin

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  try {
    const existingUser = await authService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await authService.create({ id, email, password_hash: hashedPassword, name, is_verified: false });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await authService.createOtp(id, otp, 'registration', expiresAt);

    try {
      await sendOtpEmail(email, otp, 'registration');
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({ message: 'Registration successful. Please check your email for OTP.', userId: id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { userId, otp, type } = req.body;

  try {
    const otpRecord = await authService.OtpRecord(userId, otp, type);

    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP không hợp lệ hoặc đã hết hạn =D' });
    }

    if (type === 'registration') {
      await db.execute('UPDATE users SET is_verified = true WHERE id = $1', [userId]);
      // Không còn tạo Personal Workspace tự động nữa.
      // User muốn tạo Team phải mua gói pro_team theo flow Onboarding mới.
    }


    authService.deleteOtp(otpRecord.id);
    const user = await authService.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'K thấy user này' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const userDto: UserDTO = {
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      is_verified: user.is_verified
    };

    res.json({ user: userDto, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user: User | null = await db.getOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không chính xác' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash!);
    if (!validPassword) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không chính xác' });
    }

    // Kiểm tra tài khoản bị ban
    if ((user as any).status === 'banned') {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.' });
    }

    if (!user.is_verified) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.execute(`
        INSERT INTO otps (user_id, code, type, expires_at)
        VALUES ($1, $2, 'login', $3)
      `, [user.id, otp, expiresAt]);

      try {
        await sendOtpEmail(user.email, otp, 'login');
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
      }

      return res.json({
        user: { is_verified: false },
        userId: user.id,
        message: 'OTP sent to your email'
      });
    }

    //  Nếu là admin → bắt buộc xác thực OTP email trước khi cấp token
    if (user.role === 'admin' || user.role === 'moderator') {
      const otp2fa = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // TTL 5 phút

      // Dùng bảng `otps` sẵn có — nhất quán với luồng OTP đăng ký, không phụ thuộc Redis
      await db.execute(`
        INSERT INTO otps (user_id, code, type, expires_at)
        VALUES ($1, $2, 'admin_2fa', $3)
      `, [user.id, otp2fa, expiresAt]);

      try {
        await sendOtpEmail(user.email, otp2fa, 'login'); // tái dùng template login
      } catch (emailError) {
        console.error('[2FA] Failed to send admin OTP:', emailError);
      }

      return res.json({
        require2FA: true,
        userId: user.id,
        message: 'Mã xác thực 2 bước đã được gửi về email của bạn.'
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_verified: user.is_verified },
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

//  Verify Admin 2FA OTP
export const verifyAdmin2FA = async (req: Request, res: Response) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return res.status(400).json({ error: 'userId và otp là bắt buộc' });

  try {
    // Tra cứu OTP từ DB — cùng pattern với authService.OtpRecord
    const record = await db.getOne(`
      SELECT id FROM otps
      WHERE user_id = $1 AND code = $2 AND type = 'admin_2fa'
        AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `, [userId, String(otp)]);

    if (!record) {
      return res.status(401).json({ error: 'Mã OTP không hợp lệ hoặc đã hết hạn (5 phút)' });
    }

    // Xóa OTP sau khi dùng (one-time) — cùng pattern với authService.deleteOtp
    await db.execute('DELETE FROM otps WHERE id = $1', [record.id]);

    const user: User | null = await db.getOne('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Kiểm tra lại role — tránh race condition
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({ error: 'Không đủ quyền' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_verified: user.is_verified },
      token
    });
  } catch (error) {
    console.error('[verifyAdmin2FA]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const row = await authService.getUserWithSubscription(decoded.id);

    if (!row) return res.status(401).json({ error: 'User not found' });

    const userDto = {
      id: row.id,
      email: row.email,
      name: row.name || '',
      role: row.role,
      is_verified: row.is_verified,
      avatar_url: row.avatar_url || null,
      storage_used_bytes: row.storage_used_bytes || 0,
      max_storage_gb: row.max_storage_gb || 5,
      subscription: row.sub_id ? {
        id: row.sub_id,
        plan_id: row.plan_id,
        status: row.sub_status,
        current_period_end: row.current_period_end,
        plan_name: row.plan_name,
        plan_slug: row.plan_slug,
        plan_max_members: row.plan_max_members,
      } : null
    };

    // ─── [WORKSPACE] Kèm danh sách Workspaces vào response ──────────────────
    const workspaces = await authService.getWorkspaces(decoded.id);

    res.json({ user: userDto, workspaces });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};


export const logout = (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
};

// ─── Forgot Password
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email là bắt buộc' });

  try {
    const user = await authService.findByEmail(email);
    // Không tiết lộ email có tồn tại hay không (security best practice)
    if (!user) {
      return res.json({ message: 'Nếu email tồn tại, mã OTP đã được gửi.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    // Xóa OTP cũ cùng type để tránh nhiều OTP tồn tại
    await db.execute(
      `DELETE FROM otps WHERE user_id = $1 AND type = 'forgot_password'`,
      [user.id]
    );
    await authService.createOtp(user.id, otp, 'forgot_password', expiresAt);

    try {
      await sendOtpEmail(email, otp, 'forgot_password');
    } catch (emailError) {
      console.error('Failed to send forgot-password email:', emailError);
    }

    // Trả về userId để FE dùng ở bước verify OTP
    res.json({ message: 'OTP đã được gửi tới email của bạn.', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/auth/verify-forgot-otp
 * Bước 2: Kiểm tra OTP, trả về reset_token JWT ngắn hạn (10 phút)
 */
export const verifyForgotOtp = async (req: Request, res: Response) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return res.status(400).json({ error: 'userId và otp là bắt buộc' });

  try {
    const otpRecord = await authService.OtpRecord(userId, otp, 'forgot_password');
    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    // Xóa OTP sau khi xác thực thành công
    await authService.deleteOtp(otpRecord.id);

    // Tạo reset_token ngắn hạn (10 phút), payload chứa userId và purpose
    const resetToken = jwt.sign(
      { id: userId, purpose: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({ message: 'OTP hợp lệ', reset_token: resetToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/auth/reset-password
 * Bước 3: Nhận reset_token + newPassword → cập nhật mật khẩu
 */
export const resetPassword = async (req: Request, res: Response) => {
  const { reset_token, newPassword } = req.body;
  if (!reset_token || !newPassword) {
    return res.status(400).json({ error: 'reset_token và newPassword là bắt buộc' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }

  try {
    let decoded: any;
    try {
      decoded = jwt.verify(reset_token, JWT_SECRET) as any;
    } catch {
      return res.status(400).json({ error: 'Reset token không hợp lệ hoặc đã hết hạn' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Token không hợp lệ' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, decoded.id]
    );

    res.json({ message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Update Avatar ────────────────────────────────────────────────────────────

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirnameAuth = path.dirname(fileURLToPath(import.meta.url));

/**
 * POST /api/auth/update-avatar
 * Nhận file ảnh qua multer, lưu vào public/uploads/avatars/, cập nhật DB
 */
export const updateAvatar = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'Không có file ảnh nào được upload' });

  try {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const fileName = `user_${userId}${ext}`;
    const avatarsDir = path.join(__dirnameAuth, '..', 'public', 'uploads', 'avatars');

    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Lưu file (ghi đè file cũ nếu cùng userId)
    const filePath = path.join(avatarsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // Thêm query parameter timestamp để phá browser cache khi file bị ghi đè
    const avatarUrl = `/uploads/avatars/${fileName}?v=${Date.now()}`;

    // Cập nhật DB
    await db.execute('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, userId]);

    res.json({ message: 'Cập nhật ảnh đại diện thành công', avatar_url: avatarUrl });
  } catch (error) {
    console.error('Update Avatar Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật ảnh đại diện' });
  }
};

// ─── Update Profile (display name) ──────────────────────────────────────────

/**
 * PATCH /api/auth/update-profile
 * Cập nhật tên hiển thị của người dùng
 */
export const updateProfile = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Tên không được để trống' });
  }

  const trimmedName = name.trim().slice(0, 60);

  try {
    await db.execute('UPDATE users SET name = $1 WHERE id = $2', [trimmedName, userId]);
    res.json({ message: 'Cập nhật tên thành công', name: trimmedName });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật thông tin' });
  }
};

// ─── Change Password (authenticated) ───────────────────────────────────────────

/**
 * POST /api/auth/change-password/send-otp
 * Bước 1: Gửi OTP loại 'change_password' tới email của user đang đăng nhập
 */
export const sendChangePasswordOtp = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await authService.findById(userId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    // Xóa OTP cũ cùng type
    await db.execute(`DELETE FROM otps WHERE user_id = $1 AND type = 'change_password'`, [userId]);
    await authService.createOtp(userId, otp, 'change_password', expiresAt);

    try {
      await sendOtpEmail(user.email, otp, 'forgot_password'); // tái dùng template forgot_password
    } catch (emailErr) {
      console.error('Failed to send change-password OTP email:', emailErr);
    }

    res.json({ message: 'Mã OTP đã được gửi tới email của bạn.' });
  } catch (error) {
    console.error('sendChangePasswordOtp Error:', error);
    res.status(500).json({ error: 'Lỗi khi gửi OTP' });
  }
};

/**
 * POST /api/auth/change-password/verify-otp
 * Bước 2: Kiểm tra OTP 'change_password', trả về change_token JWT ngắn hạn (10 phút)
 */
export const verifyChangePasswordOtp = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { otp } = req.body;
  if (!otp) return res.status(400).json({ error: 'OTP là bắt buộc' });

  try {
    const otpRecord = await authService.OtpRecord(userId, otp, 'change_password');
    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    await authService.deleteOtp(otpRecord.id);

    // Tạo change_token ngắn hạn (10 phút)
    const changeToken = jwt.sign(
      { id: userId, purpose: 'change_password' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({ message: 'OTP hợp lệ', change_token: changeToken });
  } catch (error) {
    console.error('verifyChangePasswordOtp Error:', error);
    res.status(500).json({ error: 'Lỗi khi xác thực OTP' });
  }
};

/**
 * PATCH /api/auth/change-password
 * Bước 3: Dùng change_token + mật khẩu mới → cập nhật DB
 */
export const changePassword = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { change_token, newPassword } = req.body;
  if (!change_token || !newPassword) {
    return res.status(400).json({ error: 'change_token và newPassword là bắt buộc' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }

  try {
    let decoded: any;
    try {
      decoded = jwt.verify(change_token, JWT_SECRET) as any;
    } catch {
      return res.status(400).json({ error: 'Token không hợp lệ hoặc đã hết hạn. Hãy thực hiện lại từ đầu.' });
    }

    if (decoded.purpose !== 'change_password' || decoded.id !== userId) {
      return res.status(400).json({ error: 'Token không hợp lệ' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (error) {
    console.error('changePassword Error:', error);
    res.status(500).json({ error: 'Lỗi khi đổi mật khẩu' });
  }
};
