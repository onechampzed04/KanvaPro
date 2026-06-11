import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
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
// [FIX Vấn đề 6] Redis Adapter cho Socket.io — phân phối event xuyên cluster
import { connectRedis, getRedis } from './config/redis';
import { createAdapter } from '@socket.io/redis-adapter';
// [FIX Vấn đề 8] Server-Side Write-Behind Scheduler
import { startWriteBehindScheduler } from './services/designWriteService';
import { runAssetGarbageCollection } from './workers/assetGarbageCollector';
import { computeAdminMetrics, invalidateMetricsCache } from './controllers/adminController';

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
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e7, // 10 MB — đã chuyển sang upload-image endpoint, không dùng Base64 qua Socket
  });

  // [FIX Vấn đề 6] Kết nối Redis và gắn adapter trước khi setupCollaboration
  // Nếu REDIS_URL không cấu hình, connectRedis() trả về null và hệ thống
  // chạy ở chế độ single-instance (in-memory) như cũ — không bị crash.
  const redisClient = await connectRedis();
  if (redisClient) {
    const subClient = redisClient.duplicate();
    await subClient.connect();
    io.adapter(createAdapter(redisClient, subClient));
    console.log('✅ [Socket.io] Redis Adapter attached — horizontal scaling enabled.');
  } else {
    console.log('ℹ️  [Socket.io] Running without Redis Adapter (single-instance mode).');
  }

  setupCollaboration(io);

  // [FIX Vấn đề 8] Khởi động Write-Behind Scheduler — flush dirty designs xuống DB mỗi 8s
  startWriteBehindScheduler();

  // ── Static Files ──────────────────────────────────────────────────────────
  app.use('/assets', express.static(path.join(__dirname, 'sticker_upload/assets')));
  app.use('/fonts',  express.static(path.join(__dirname, 'sticker_upload/fonts')));

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

  // ── [FIX Vấn đề 18] Cron Job: Dọn OTP hết hạn chưa được dùng ─────────────
  // deleteOtp() đã dùng DELETE thực sự (không còn soft-expire).
  // Job này dọn các OTP hết hạn mà user KHÔNG bao giờ nhập (abandoned OTPs).
  cron.schedule('30 0 * * *', async () => {
    try {
      const result = await db.query(
        `DELETE FROM otps WHERE expires_at < NOW() RETURNING id`,
        []
      );
      console.log(`🗑️ [Cron] Cleaned up ${result.rows.length} expired OTP(s).`);
    } catch (error) {
      console.error('❌ [Cron] OTP cleanup failed:', error);
    }
  });
  console.log('⏰ Cron: OTP cleanup scheduled (daily at 00:30).');

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

  // ── [FIX Vấn đề 12] Cron Job Đối soát Hàng ngày (Reconciliation) ──────────
  // Chạy mỗi ngày lúc 00:10 — 5 phút sau cron expiry để tránh xung đột
  // Mục tiêu: Phát hiện trường hợp DB nội bộ = 'active' nhưng thực tế đã quá hạn
  // (ví dụ: server crash lúc 00:05 → cron expiry bị bỏ lỡ)
  // Đây là safety net cuối cùng để đảm bảo tính đồng bộ trạng thái thanh toán.
  cron.schedule('10 0 * * *', async () => {
    try {
      console.log('[Reconciliation] Starting daily subscription reconciliation...');

      // Tìm các subscription "active" nhưng current_period_end đã qua
      // (đây là các sub bị bỏ sót bởi cron expiry vì lý do nào đó)
      const staleActive = await db.query(`
        SELECT id, user_id, current_period_end, stripe_subscription_id
        FROM user_subscriptions
        WHERE status = 'active'
          AND current_period_end < NOW() - INTERVAL '1 hour'
      `, []);

      if (staleActive.rows.length > 0) {
        console.warn(`[Reconciliation] Found ${staleActive.rows.length} stale active subscriptions. Correcting...`);

        // Tự động hạ xuống 'expired' để đảm bảo tính nhất quán
        await db.execute(`
          UPDATE user_subscriptions
          SET status = 'expired', updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [staleActive.rows.map((r: any) => r.id)]);

        // Ghi nhận vào audit log để admin có thể theo dõi
        for (const sub of staleActive.rows) {
          await db.execute(`
            INSERT INTO admin_audit_logs (actor_id, target_id, action_type, description, ip_address)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            null, // system action, không phải admin
            sub.user_id,
            'AUTO_RECONCILE_EXPIRED',
            `[System] Reconciliation: subscription id=${sub.id} hết hạn lúc ${sub.current_period_end} nhưng chưa được expire.`,
            '::1'
          ]);
        }
      } else {
        console.log('[Reconciliation] ✅ All subscriptions are in sync.');
      }
    } catch (error) {
      console.error('❌ [Reconciliation] Daily reconciliation failed:', error);
    }
  });
  console.log('⏰ Cron: Daily subscription reconciliation scheduled (00:10).');

  // ── [Virtual Referencing GC] Dọn file vật lý orphan lúc 2:00 AM ──────────
  // Logic: Quét mọi file trong /uploads/images và /fonts.
  // Nếu file không còn BẤT KỲ bản ghi nào trong bảng assets trỏ tới
  // (kể cả Bản ghi A lẫn Bản ghi B design_clone) → Xóa file vật lý thật.
  // Đây là safety net đảm bảo dung lượng ổ cứng không bị rò rỉ.
  cron.schedule('0 2 * * *', async () => {
    try {
      await runAssetGarbageCollection();
    } catch (error) {
      console.error('❌ [GC] Asset garbage collection failed:', error);
    }
  });
  console.log('⏰ Cron: Asset GC (Virtual Referencing) scheduled (daily at 02:00).');

  // ── [FIX 3] Cron Job: Pre-warm Admin Metrics Cache mỗi 5 phút ─────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const redis = getRedis();
      if (!redis) return; // Redis chưa kết nối — bỏ qua, không crash
      const metrics = await computeAdminMetrics();
      await redis.setEx('admin:metrics:snapshot', 600, JSON.stringify(metrics));
      console.log('[Cache] ✅ Admin metrics refreshed');
    } catch (error) {
      console.error('❌ [Cache] Admin metrics pre-warm failed:', error);
    }
  });
  console.log('⏰ Cron: Admin metrics cache pre-warm scheduled (every 5 minutes).');

  // ── Start ─────────────────────────────────────────────────────────────────
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`⚡ Socket.io ready for real-time collaboration`);
  });
}

startServer();

