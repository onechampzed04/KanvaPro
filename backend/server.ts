import 'dotenv/config';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDb } from '../backend/db/init';
import authRoutes from '../backend/routes/authRoutes';
import designRoutes from '../backend/routes/designRoutes';
import assetRoutes from '../backend/routes/assetRoutes';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: 'http://localhost:5173', 
    credentials: true 
  }));

  // GOM LẠI THÀNH 1 CHỖ VÀ ĐẶT Ở TRÊN CÙNG
  app.use(express.json({ limit: '50mb' })); 
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // Serve sticker assets from backend folder
  app.use('/assets', express.static(path.join(__dirname, 'sticker_upload/assets')));

  // Initialize Database
  await initDb();
  
  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/designs', designRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/assets', express.static(path.join(__dirname, 'assets')));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();