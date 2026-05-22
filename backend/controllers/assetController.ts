import { Request, Response } from 'express';
import 'multer';
type MulterFile = Express.Multer.File;
import db from '../config/db';
import { Asset } from '../models/Asset';
import { AssetType } from '../models/enums';
import { assetService } from '../services/assetService';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { incrementStorageUsage } from '../middleware/checkStorageQuota';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');

/**
 * POST /api/assets/upload-image
 * Nhận file ảnh (png, jpg, webp, gif, svg) qua Multer memoryStorage,
 * lưu vào public/uploads/images/, trả về URL tĩnh để gán vào element.src.
 * Đây là giải pháp thay thế cho việc lưu Base64 trong DB.
 */
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const file = (req as any).file as MulterFile | undefined;
    if (!file) return res.status(400).json({ error: 'No image file provided' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Only image files (jpg, png, webp, gif, svg) are allowed' });
    }

    // Giới hạn 20MB
    if (file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must not exceed 20MB' });
    }

    const { v4: uuidv4 } = await import('uuid');
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(IMAGES_DIR, fileName);

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(filePath, file.buffer);

    const imageUrl = `/uploads/images/${fileName}`;

    // Ghi vào DB để quản lý file của user (tuỳ chọn)
    await db.query(
      `INSERT INTO assets (name, type, url, uploaded_by, is_premium, file_size, created_at)
       VALUES ($1, $2, $3, $4, false, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [file.originalname, 'image', imageUrl, user.id, file.size]
    ).catch(() => { /* Không throw nếu bảng assets không có ON CONFLICT */ });

    // Cộng dồn dung lượng vào user (Incremental Update)
    await incrementStorageUsage(user.id, file.size).catch(() => {});

    res.status(201).json({
      url: imageUrl,
      name: file.originalname,
      width: null,
      height: null,
    });
  } catch (error) {
    console.error('Upload Image Error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

/**
 * POST /api/assets/upload-thumbnail
 * Nhận file ảnh thumbnail từ Frontend (Blob từ stage.toBlob()),
 * lưu vào public/uploads/thumbnails/, cập nhật thumbnail cho design_page.
 * Tách biệt hoàn toàn khỏi payload lưu design (không còn base64 trong JSON).
 */
export const uploadThumbnail = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as MulterFile | undefined;
    if (!file) return res.status(400).json({ error: 'No thumbnail file provided' });

    const { pageId } = req.body;

    const { v4: uuidv4 } = await import('uuid');
    const thumbDir = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');
    fs.mkdirSync(thumbDir, { recursive: true });

    const fileName = `thumb_${pageId || uuidv4()}.png`;
    const filePath = path.join(thumbDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const thumbUrl = `/uploads/thumbnails/${fileName}`;

    // Cập nhật thumbnail cho page nếu có pageId
    if (pageId) {
      await db.query(
        `UPDATE design_pages SET thumbnail = $1, updated_at = NOW() WHERE id = $2`,
        [thumbUrl, pageId]
      );
    }

    res.status(200).json({ url: thumbUrl });
  } catch (error) {
    console.error('Upload Thumbnail Error:', error);
    res.status(500).json({ error: 'Failed to upload thumbnail' });
  }
};

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

    const file = (req as any).file as MulterFile | undefined;
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
      `INSERT INTO assets (name, type, url, uploaded_by, is_premium, file_size, created_at)
       VALUES ($1, $2, $3, $4, false, $5, NOW())
       RETURNING id, name, type, url, created_at`,
      [fontName, 'font', fontUrl, user.id, file.size]
    );

    // Cộng dồn dung lượng vào user (Incremental Update)
    await incrementStorageUsage(user.id, file.size).catch(() => {});

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
    const file = (req as any).file as MulterFile | undefined;
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

/**
 * POST /api/assets/remove-bg-brush
 * Nhận ảnh gốc + ảnh mask (vùng người dùng tô xoá) từ Frontend,
 * gửi cả hai sang Python AI service tại /remove-bg-mask,
 * lưu kết quả PNG nền trong suốt và trả về URL.
 */
export const removeBgBrush = async (req: Request, res: Response) => {
  try {
    const files = (req as any).files as { [fieldname: string]: MulterFile[] } | undefined;
    const imageFile = files?.['image']?.[0];
    const maskFile  = files?.['mask']?.[0];

    if (!imageFile || !maskFile) {
      return res.status(400).json({ error: 'Both image and mask are required' });
    }

    // Forward cả 2 file sang Python AI service
    const formData = new FormData();
    const imageBlob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.mimetype });
    const maskBlob  = new Blob([new Uint8Array(maskFile.buffer)],  { type: maskFile.mimetype });
    formData.append('image', imageBlob, imageFile.originalname);
    formData.append('mask',  maskBlob,  maskFile.originalname);

    const aiResponse = await fetch('http://localhost:5000/remove-bg-mask', {
      method: 'POST',
      body: formData,
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI Service error: ${errorText}`);
    }

    const arrayBuffer = await aiResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${crypto.randomUUID()}_brush.png`;
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'bg-removed');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    res.json({ url: `/bg-removed/${fileName}` });
  } catch (error) {
    console.error('Remove BG Brush Error:', error);
    res.status(500).json({ error: 'Failed to process brush background removal' });
  }
};