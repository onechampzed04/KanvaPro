import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDb } from '../backend/db/init';
import authRoutes from '../backend/routes/authRoutes';
import designRoutes from '../backend/routes/designRoutes';
import assetRoutes from '../backend/routes/assetRoutes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Initialize Database
  await initDb();

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/designs', designRoutes);
  app.use('/api/assets', assetRoutes);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
