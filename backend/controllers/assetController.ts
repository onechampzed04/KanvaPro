import { Request, Response } from 'express';
import db from '../config/db';
import { Asset } from '../models/Asset';
import { AssetType } from '../models/enums';
import { assetService } from '../services/assetService';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');

export const searchAssets = async (req: Request, res: Response) => {
  const { q, type, category } = req.query;

  try {
    const result = await assetService.searchAssets(q as string, type as string, category as string);
    const assets: Asset[] = result.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      is_premium: row.is_premium,
      created_at: row.created_at
    }));

    // Trả về dữ liệu mẫu nếu DB trống (để bạn dễ test giao diện ban đầu)
    if (assets.length === 0 && !q && !type) {
      const mockAssets = [
        { id: '1', name: 'Nature', type: 'image', url: 'https://picsum.photos/seed/nature/800/600', is_premium: false, created_at: new Date() },
        { id: '2', name: 'Business', type: 'image', url: 'https://picsum.photos/seed/business/800/600', is_premium: true, created_at: new Date() },
        { id: '3', name: 'Tech', type: 'image', url: 'https://picsum.photos/seed/tech/800/600', is_premium: false, created_at: new Date() },
      ];
      return res.json({ assets: mockAssets });
    }

    res.json({ assets });
  } catch (error) {
    console.error('Search Assets Error:', error);
    res.status(500).json({ error: 'Failed to search assets' });
  }
};

export const getAssetCategories = async (req: Request, res: Response) => {
  try {
    const categories = await assetService.getAssetCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Get Categories Error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

// Thêm hàm lấy chi tiết 1 Asset (Cần thiết cho editor)
export const getAssetById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const asset = await db.getOne('SELECT * FROM assets WHERE id = $1', [id]);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── FONT UPLOAD ──────────────────────────────────────────────────────────────

/**
 * POST /api/assets/upload-font
 * Nhận file .ttf / .otf qua Multer memoryStorage, lưu vào public/fonts/,
 * ghi bản ghi vào bảng assets (type = 'font').
 */
export const uploadFont = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'No font file provided' });

    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
      return res.status(400).json({ error: 'Only .ttf, .otf, .woff, .woff2 fonts are allowed' });
    }

    // Tên file an toàn: uuid + extension gốc
    const { v4: uuidv4 } = await import('uuid');
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(FONTS_DIR, fileName);

    // Đảm bảo thư mục tồn tại
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    fs.writeFileSync(filePath, file.buffer);

    // URL truy cập từ client (backend serve static tại /fonts)
    const fontUrl = `/fonts/${fileName}`;
    const fontName = path.basename(file.originalname, ext);

    // Ghi vào DB
    const result = await db.query(
      `INSERT INTO assets (name, type, url, uploaded_by, is_premium, created_at)
       VALUES ($1, $2, $3, $4, false, NOW())
       RETURNING id, name, type, url, created_at`,
      [fontName, 'font', fontUrl, user.id]
    );

    const asset = result.rows[0];
    res.status(201).json({ asset, url: fontUrl, name: fontName });
  } catch (error) {
    console.error('Upload Font Error:', error);
    res.status(500).json({ error: 'Failed to upload font' });
  }
};

/**
 * GET /api/assets/user-fonts
 * Trả về danh sách font đã upload của user hiện tại.
 */
export const getUserFonts = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const result = await db.query(
      `SELECT id, name, url, created_at
       FROM assets
       WHERE type = 'font' AND uploaded_by = $1
       ORDER BY created_at DESC`,
      [user.id]
    );

    res.json({ fonts: result.rows });
  } catch (error) {
    console.error('Get User Fonts Error:', error);
    res.status(500).json({ error: 'Failed to fetch user fonts' });
  }
};

/**
 * POST /api/assets/remove-bg
 * Gửi ảnh sang Python AI service để xóa nền và lưu lại.
 */
export const removeBackground = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Gửi ảnh sang Python Service
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append('image', blob, file.originalname);

    const aiResponse = await fetch('http://localhost:5000/remove-bg', {
      method: 'POST',
      body: formData,
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI Service error: ${errorText}`);
    }

    // Nhận ảnh trả về dạng binary (ArrayBuffer)
    const arrayBuffer = await aiResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Lưu ảnh vào thư mục public/uploads/bg-removed/
    const fileName = `${crypto.randomUUID()}.png`;
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'bg-removed');

    // Đảm bảo thư mục tồn tại (đã tạo bằng mkdir trước đó, nhưng phòng hờ)
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const assetUrl = `/bg-removed/${fileName}`;
    res.json({ url: assetUrl });
  } catch (error) {
    console.error('Remove Background Error:', error);
    res.status(500).json({ error: 'Failed to process background removal' });
  }
};