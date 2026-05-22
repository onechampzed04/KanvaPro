import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDb } from '../backend/db/init';
import authRoutes from '../backend/routes/authRoutes';
import designRoutes from '../backend/routes/designRoutes';
import assetRoutes from '../backend/routes/assetRoutes';
import paymentRoutes from './routes/paymentRoutes';
import subscriptionRoute from './routes/subscriptionRoute';
import adminRoutes from './routes/adminRoutes';
import teamRoutes from './routes/teamRoutes';
import cors from 'cors';
import { setupCollaboration } from './sockets/collaboration';
import cron from 'node-cron';
import db from './config/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  // ── CORS cho Express REST ──────────────────────────────────────────────────
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));

  // Giảm giới hạn JSON từ 500MB xuống 50MB vì ảnh tự được upload lên bằng URL thay vì Base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // ── Socket.io (Real-Time Collaboration) ───────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Tăng timeout để tránh reconnect nhiễu
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  setupCollaboration(io);

  // ── Static Files ──────────────────────────────────────────────────────────
  app.use('/assets', express.static(path.join(__dirname, 'sticker_upload/assets')));

  // ── Database ──────────────────────────────────────────────────────────────
  await initDb();

  // ── Migration: add deleted_at column if not exists ────────────────────────
  try {
    await db.execute(`
      ALTER TABLE designs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'free_user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_storage_gb NUMERIC(5, 2) DEFAULT 1.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS used_storage_bytes BIGINT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

      -- === OCC: Theo dõi người lưu cuối để tránh self-conflict ===
      ALTER TABLE designs ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES users(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id SERIAL PRIMARY KEY,
          actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
          target_id UUID REFERENCES users(id) ON DELETE SET NULL,
          action_type VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          ip_address VARCHAR(45),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role);
    `, []);
    console.log('✅ Auto-migrations completed (designs, users, audit_logs).');
  } catch (e) {
    console.warn('⚠️ Auto-migrations skipped or failed:', e);
  }

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/designs', designRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
  app.use('/bg-removed', express.static(path.join(__dirname, 'public', 'uploads', 'bg-removed')));
  app.use('/uploads/avatars', express.static(path.join(__dirname, 'public', 'uploads', 'avatars')));
  // ── Tịnh chủ ảnh đã upload (thay thế Base64) và thumbnail ─────────────────────────────
  app.use('/uploads/images', express.static(path.join(__dirname, 'public', 'uploads', 'images')));
  app.use('/uploads/thumbnails', express.static(path.join(__dirname, 'public', 'uploads', 'thumbnails')));
  // === FIX #5: Serve file MP4 xuất từ Video Job Queue ===
  app.use('/exports', express.static(path.join(__dirname, 'public', 'exports')));
  app.use('/api/payments', paymentRoutes);
  app.use('/api/subscriptions', subscriptionRoute);
  app.use('/api/admin', adminRoutes);
  app.use('/api/teams', teamRoutes);

  // ── Cron Job: Auto-delete trash older than 30 days ───────────────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const result = await db.query(`
        DELETE FROM designs
        WHERE is_deleted = true
          AND deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '30 days'
        RETURNING id
      `, []);
      console.log(`🗑️ [Cron] Auto-deleted ${result.rows.length} expired design(s) from trash.`);
    } catch (error) {
      console.error('❌ [Cron] Trash cleanup failed:', error);
    }
  });
  console.log('⏰ Cron: Trash auto-cleanup scheduled (daily at midnight).');

  // ── [MỚI] Cron Job: Auto-expire subscriptions quá hạn ────────────────────
  // Chạy mỗi ngày lúc 00:05 — sau cronjob trash 5 phút để tránh xung đột
  // Đây là trái tim của nghiệp vụ "Read-Only Mode" khi user hết hạn gói
  cron.schedule('5 0 * * *', async () => {
    try {
      // 1. Expire các sub đã quá current_period_end (và không bị cancel thủ công trước)
      const expiredResult = await db.query(`
        UPDATE user_subscriptions
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
          AND current_period_end < NOW()
          AND (cancel_at IS NULL OR cancel_at <= NOW())
        RETURNING id, user_id
      `, []);
      console.log(`⏰ [Cron] Auto-expired ${expiredResult.rows.length} subscription(s).`);

      // 2. Cũng cancel các sub đã đến ngày cancel_at
      const canceledResult = await db.query(`
        UPDATE user_subscriptions
        SET status = 'canceled', updated_at = NOW()
        WHERE status = 'active'
          AND cancel_at IS NOT NULL
          AND cancel_at <= NOW()
        RETURNING id, user_id
      `, []);
      console.log(`⏰ [Cron] Auto-canceled ${canceledResult.rows.length} subscription(s) at period end.`);
    } catch (error) {
      console.error('❌ [Cron] Subscription expiry job failed:', error);
    }
  });
  console.log('⏰ Cron: Subscription auto-expiry scheduled (daily at 00:05).');


  // ── Start ─────────────────────────────────────────────────────────────────
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`⚡ Socket.io ready for real-time collaboration`);
  });
}

startServer();
