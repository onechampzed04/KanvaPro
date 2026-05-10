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
import cors from 'cors';
import { setupCollaboration } from './sockets/collaboration';

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

  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));
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

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/designs', designRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
  app.use('/bg-removed', express.static(path.join(__dirname, 'public', 'uploads', 'bg-removed')));
  app.use('/api/payments', paymentRoutes);
  app.use('/api/subscriptions', subscriptionRoute);

  // ── Start ─────────────────────────────────────────────────────────────────
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`⚡ Socket.io ready for real-time collaboration`);
  });
}

startServer();