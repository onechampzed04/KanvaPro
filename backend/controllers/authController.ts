import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { sendOtpEmail } from '../services/emailService';
import { User, UserDTO } from '../models/User';
import { authService } from '../services/authService';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  try {
    // 1. Sửa db.get -> db.getOne và ? -> $1
    const existingUser = await authService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    // 2. Sửa db.run -> db.execute và dùng $1, $2...
    authService.create({ id, email, password_hash: hashedPassword, name, is_verified: false });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Chú ý: Đảm bảo bạn đã có bảng otps trong Postgres
    authService.createOtp(id, otp, 'registration', expiresAt);

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
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    if (type === 'registration') {
      await db.execute('UPDATE users SET is_verified = true WHERE id = $1', [userId]);
    }

    authService.deleteOtp(otpRecord.id);
    const user = await authService.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found after verification' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });
    // 3. Sửa lỗi name: user.name (Thêm fallback || '')
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
    const user: User = await db.getOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash!);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
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
    
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });

    return res.json({ 
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_verified: user.is_verified },
      token // Trả về token nếu frontend cần lưu thêm vào localStorage
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user: User = await db.getOne('SELECT id, email, name, role, is_verified FROM users WHERE id = $1', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const userDto: UserDTO = {
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      is_verified: user.is_verified
    };

    res.json({ user: userDto });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
};