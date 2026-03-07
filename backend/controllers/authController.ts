import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { sendOtpEmail } from '../services/emailService';
import { User, UserDTO } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  try {
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.run(`
      INSERT INTO users (id, email, password_hash, name, is_verified)
      VALUES (?, ?, ?, ?, false)
    `, [id, email, hashedPassword, name]);

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.run(`
      INSERT INTO otps (user_id, code, type, expires_at)
      VALUES (?, ?, 'registration', ?)
    `, [id, otp, expiresAt]);

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
    const otpRecord = await db.get(`
      SELECT * FROM otps 
      WHERE user_id = ? AND code = ? AND type = ? AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `, [userId, otp, type]);

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    if (type === 'registration') {
      await db.run('UPDATE users SET is_verified = true WHERE id = ?', [userId]);
    }

    await db.run('DELETE FROM otps WHERE id = ?', [otpRecord.id]);

    const user: User = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', [userId]);
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const userDto: UserDTO = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
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
    const user: User = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash!);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Please verify your email first', userId: user.id });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.run(`
      INSERT INTO otps (user_id, code, type, expires_at)
      VALUES (?, ?, 'login', ?)
    `, [user.id, otp, expiresAt]);

    try {
      await sendOtpEmail(user.email, otp, 'login');
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({ message: 'OTP sent to your email', userId: user.id });
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
    const user: User = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const userDto: UserDTO = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
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
