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

import sizeOf from 'image-size';
import { v4 as uuidv4 } from 'uuid';

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

    if (file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must not exceed 20MB' });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(IMAGES_DIR, fileName);

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(filePath, file.buffer);

    let width = null;
    let height = null;
    try {
      const dimensions = sizeOf(file.buffer);
      width = dimensions.width || null;
      height = dimensions.height || null;
    } catch (err) {
      console.warn('[Upload] Could not read image dimensions:', err);
    }

    const imageUrl = `/uploads/images/${fileName}`;

    const workspace = (req as any).workspace;
    const workspaceId: string | undefined = workspace?.id;
    const workspaceType = workspace?.type;

    let assetId: string | null = null;
    const assetTeamId = (workspaceId && workspaceType !== 'personal') ? workspaceId : null;
    const metadataStr = JSON.stringify({ width, height });

    try {
      const insertResult = await db.query(
        `INSERT INTO assets (name, type, url, uploaded_by, team_id, is_premium, file_size, created_at, metadata)
         VALUES ($1, $2, $3, $4, $5, false, $6, NOW(), $7)
         RETURNING id`,
        [file.originalname, 'image', imageUrl, user.id, assetTeamId, file.size, metadataStr]
      );
      assetId = insertResult.rows[0]?.id ?? null;
      console.log(`[Upload] Asset inserted: id=${assetId}, user=${user.id}, workspace=${workspaceId ?? 'personal'}, file=${file.originalname}`);
    } catch (insertErr) {
      console.error('[Upload] FAILED to insert asset to DB:', insertErr);
    }

    await incrementStorageUsage(user.id, file.size, workspaceId, workspaceType).catch((e) => {
      console.error('[Upload] Failed to increment storage:', e);
    });

    res.status(201).json({
      url: imageUrl,
      assetId,
      name: file.originalname,
      width,
      height,
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

    // [FIX Cache-Bust] Dùng timestamp ngắn (ms) để mỗi lần upload tạo URL mới.
    // Không dùng filename cố định (thumb_${pageId}.png) vì browser sẽ cache URL cũ
    // và không tải lại ảnh dù nội dung đã thay đổi.
    const ts = Date.now();
    const fileName = `thumb_${pageId || uuidv4()}_${ts}.png`;
    const filePath = path.join(thumbDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const thumbUrl = `/uploads/thumbnails/${fileName}`;

    // Dọn file thumbnail cũ của cùng pageId để tránh disk growth vô hạn, nhưng giữ lại 2 file gần nhất để tránh 404 cho các collaborator khác
    if (pageId) {
      try {
        const files = fs.readdirSync(thumbDir);
        const oldThumbs = files
          .filter(f => f.startsWith(`thumb_${pageId}_`) && f !== fileName)
          .map(f => {
            const parts = f.split('_');
            const tsStr = parts[parts.length - 1].replace('.png', '');
            const ts = parseInt(tsStr, 10) || 0;
            return { name: f, ts };
          })
          .sort((a, b) => b.ts - a.ts); // Mới nhất xếp trước

        // Giữ lại 2 file mới nhất, xóa các file cũ hơn
        if (oldThumbs.length > 2) {
          oldThumbs.slice(2).forEach(item => {
            try { fs.unlinkSync(path.join(thumbDir, item.name)); } catch { /* bỏ qua */ }
          });
        }
      } catch { /* bỏ qua nếu readdir lỗi */ }
    }

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
  let { q, type } = req.query;

  try {
    // Nếu có từ khóa tìm kiếm, gửi qua AI service để dịch sang Tiếng Anh
    if (q) {
      try {
        const translateRes = await fetch('http://127.0.0.1:5000/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: q })
        });

        if (translateRes.ok) {
          const translateData = await translateRes.json();
          if (translateData.translatedText) {
            console.log(`Translated search query: "${q}" -> "${translateData.translatedText}"`);
            q = translateData.translatedText;
          }
        } else {
          console.warn('AI translation service returned error, falling back to original query');
        }
      } catch (err) {
        console.warn('Could not connect to AI translation service, falling back to original query:', err);
      }
    }

    const result = await assetService.searchAssets(q as string, type as string);
    const assets: Asset[] = result.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      is_premium: row.is_premium,
      created_at: row.created_at
    }));

    res.json({ assets });
  } catch (error) {
    console.error('Search Assets Error:', error);
    res.status(500).json({ error: 'Failed to search assets' });
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

    // ─── [WORKSPACE] Lấy workspaceId từ context (nếu có) ────────────────────
    const workspace = (req as any).workspace;
    const workspaceId: string | undefined = workspace?.id;

    // Ghi vào DB
    const result = await db.query(
      `INSERT INTO assets (name, type, url, uploaded_by, team_id, is_premium, file_size, created_at)
       VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
       RETURNING id, name, type, url, created_at`,
      [fontName, 'font', fontUrl, user.id, workspaceId ?? null, file.size]
    );

    // Cộng dồn dung lượng vào user (Incremental Update)
    await incrementStorageUsage(user.id, file.size, workspaceId).catch(() => { });

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

    // ─── [WORKSPACE] Lấy workspaceId từ context (nếu có) ────────────────────
    const workspace = (req as any).workspace;
    const workspaceId = workspace?.id;

    let result;
    if (workspaceId) {
      // Lấy font của team (bao gồm cả font do người khác trong team upload)
      result = await db.query(
        `SELECT id, name, url, created_at
         FROM assets
         WHERE type = 'font' AND team_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
      );
    } else {
      // Fallback lấy font cá nhân
      result = await db.query(
        `SELECT id, name, url, created_at
         FROM assets
         WHERE type = 'font' AND (uploaded_by = $1 AND team_id IS NULL)
         ORDER BY created_at DESC`,
        [user.id]
      );
    }

    res.json({ fonts: result.rows });
  } catch (error) {
    console.error('Get User Fonts Error:', error);
    res.status(500).json({ error: 'Failed to fetch user fonts' });
  }
};

/**
 * GET /api/assets/fonts
 * [PUBLIC] Trả về danh sách font hệ thống do Admin upload.
 * Bao gồm cả is_premium để frontend biết cần gói Pro hay không.
 * Không cần authenticate — Editor cần load fonts trước khi user login.
 */
export const getSystemFonts = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, url, is_premium
       FROM assets
       WHERE type = 'font' AND uploaded_by IS NULL
       ORDER BY name ASC`
    );
    res.json({ fonts: result.rows });
  } catch (error) {
    console.error('Get System Fonts Error:', error);
    res.status(500).json({ error: 'Failed to fetch system fonts' });
  }
};

/**
   * GET /api/assets/user-images
   * Trả về danh sách hình ảnh đã upload của user hiện tại.
   * Luôn lọc theo uploaded_by để đảm bảo privacy.
   */
export const getUserImages = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const workspace = (req as any).workspace;
    const workspaceId = workspace?.id;
    const workspaceType = workspace?.type;

    const personalOnly = req.query.personalOnly === 'true';

    const ignoreWorkspace = req.query.ignoreWorkspace === 'true';

    let result;
    if (ignoreWorkspace) {
      // ─── Lấy tất cả ảnh của user không phân biệt workspace ───
      result = await db.query(
        `SELECT a.id, a.name, a.type, 
                CASE WHEN a.type::text = 'pptx' AND d.thumbnail_url IS NOT NULL THEN d.thumbnail_url ELSE a.url END as url, 
                a.file_size, a.created_at, a.metadata
         FROM assets a
         LEFT JOIN designs d ON a.metadata->>'design_id' = d.id::text
         WHERE a.type::text IN ('image', 'pptx')
           AND a.uploaded_by = $1
           AND (a.metadata->>'design_clone' IS NULL OR a.metadata->>'design_clone' = 'false')
         ORDER BY a.created_at DESC`,
        [user.id]
      );
    } else if (workspaceId && workspaceType !== 'personal') {
      const queryParams: any[] = [workspaceId];
      let uploadedByFilter = '';
      if (personalOnly) {
        uploadedByFilter = `AND uploaded_by = $2`;
        queryParams.push(user.id);
      }

      // ─── [WORKSPACE] Filter by team_id if inside a Team ───
      result = await db.query(
        `SELECT a.id, a.name, a.type, 
                CASE WHEN a.type::text = 'pptx' AND d.thumbnail_url IS NOT NULL THEN d.thumbnail_url ELSE a.url END as url, 
                a.file_size, a.created_at, a.metadata
         FROM assets a
         LEFT JOIN designs d ON a.metadata->>'design_id' = d.id::text
         WHERE a.type::text IN ('image', 'pptx')
           AND a.team_id = $1
           ${uploadedByFilter.replace('uploaded_by', 'a.uploaded_by')}
           AND (a.metadata->>'design_clone' IS NULL OR a.metadata->>'design_clone' = 'false')
         ORDER BY a.created_at DESC`,
        queryParams
      );
    } else {
      // ─── [WORKSPACE] Filter by personal (team_id IS NULL) ───
      result = await db.query(
        `SELECT a.id, a.name, a.type, 
                CASE WHEN a.type::text = 'pptx' AND d.thumbnail_url IS NOT NULL THEN d.thumbnail_url ELSE a.url END as url, 
                a.file_size, a.created_at, a.metadata
         FROM assets a
         LEFT JOIN designs d ON a.metadata->>'design_id' = d.id::text
         WHERE a.type::text IN ('image', 'pptx')
           AND a.uploaded_by = $1
           AND a.team_id IS NULL
           AND (a.metadata->>'design_clone' IS NULL OR a.metadata->>'design_clone' = 'false')
         ORDER BY a.created_at DESC`,
        [user.id]
      );
    }

    const imagesWithDimensions = result.rows.map((r: any) => {
      let width = null;
      let height = null;
      if (r.metadata) {
        try {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
          width = meta.width || null;
          height = meta.height || null;
        } catch (e) { }
      }
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        url: r.url,
        file_size: r.file_size,
        created_at: r.created_at,
        width,
        height
      };
    });

    res.json({ images: imagesWithDimensions });
  } catch (error) {
    console.error('Get User Images Error:', error);
    res.status(500).json({ error: 'Không thể lấy danh sách hình ảnh' });
  }
};

export const getAssetUsages = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // [SECURITY FIX - IDOR] Chỉ cho phép xem usages của asset do chính user upload.
    // Ngăn user A dùng API này để liệt kê các design của user B đang dùng ảnh của user B.
    const asset = await db.getOne(
      'SELECT url FROM assets WHERE id = $1 AND uploaded_by = $2',
      [id, user.id]
    );
    if (!asset) return res.status(404).json({ error: 'Asset không tồn tại hoặc bạn không có quyền xem' });

    const usages = await db.query(
      `SELECT DISTINCT d.id, d.title, d.thumbnail_url
       FROM designs d
       JOIN design_pages dp ON d.id = dp.design_id
       JOIN design_elements de ON dp.id = de.page_id
       WHERE (
         de.properties->>'src' = $1
         OR de.properties->>'src' = $2
       ) AND d.is_deleted = false`,
      [asset.url, `http://localhost:3000${asset.url}`]
    );

    // [FIX PPTX] Nếu asset là PPTX, cũng tìm designs đang dùng các ảnh con
    const fullAsset = await db.getOne(
      'SELECT type, metadata FROM assets WHERE id = $1',
      [id]
    );
    if (fullAsset?.type === 'pptx') {
      const metadata = typeof fullAsset.metadata === 'string'
        ? JSON.parse(fullAsset.metadata)
        : fullAsset.metadata;
      const extractedImages: string[] = metadata?.extracted_images || [];
      if (extractedImages.length > 0) {
        // Tìm tất cả designs dùng bất kỳ ảnh con nào của PPTX này
        const extraUsages = await db.query(
          `SELECT DISTINCT d.id, d.title, d.thumbnail_url
           FROM designs d
           JOIN design_pages dp ON d.id = dp.design_id
           JOIN design_elements de ON dp.id = de.page_id
           WHERE (
             de.properties->>'src' = ANY($1::text[])
             OR de.properties->>'src' = ANY($2::text[])
           ) AND d.is_deleted = false`,
          [
            extractedImages,
            extractedImages.map((url: string) => `http://localhost:3000${url}`)
          ]
        );
        // Merge, dedup by id
        const seen = new Set(usages.rows.map((r: any) => r.id));
        for (const row of extraUsages.rows) {
          if (!seen.has(row.id)) {
            usages.rows.push(row);
            seen.add(row.id);
          }
        }
      }
    }

    res.json({ usages: usages.rows });
  } catch (err) {
    console.error('getAssetUsages error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const forceDeleteUserAsset = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // [SECURITY FIX - IDOR] Luôn lọc theo uploaded_by để chặn user A xóa ảnh của user B.
    // Nếu không có check này, bất kỳ user đăng nhập nào cũng có thể xóa asset của người khác
    // chỉ bằng cách đoán/brute-force UUID của asset đó.
    const asset = await db.getOne(
      'SELECT id, url, file_size, uploaded_by, team_id, type, metadata FROM assets WHERE id = $1 AND uploaded_by = $2',
      [id, user.id]
    );
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Xóa các elements trong tất cả các designs đang sử dụng ảnh này
    // [FIX] Search cả URL tương đối và URL tuyệt đối (có http://localhost:3000 prefix)
    await db.execute(
      `DELETE FROM design_elements WHERE properties->>'src' = $1 OR properties->>'src' = $2`,
      [asset.url, `http://localhost:3000${asset.url}`]
    );

    // Xóa mọi Bản ghi (A và B) trỏ tới file này
    await db.execute('DELETE FROM assets WHERE url = $1', [asset.url]);

    // Xóa file vật lý
    const filePath = path.join(__dirname, '..', 'public', asset.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Nếu là PPTX, xóa các ảnh con và design_elements tham chiếu đến chúng
    if (asset.type === 'pptx') {
      const metadata = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata) : asset.metadata;
      if (metadata && Array.isArray(metadata.extracted_images)) {
        for (const imgUrl of metadata.extracted_images) {
          try {
            // [FIX 404] Xóa design_elements đang tham chiếu đến ảnh con này
            // Search cả URL tương đối và tuyệt đối (có prefix http://localhost:3000)
            await db.execute(
              `DELETE FROM design_elements WHERE properties->>'src' = $1 OR properties->>'src' = $2`,
              [imgUrl, `http://localhost:3000${imgUrl}`]
            );

            const imgPath = path.join(__dirname, '..', 'public', imgUrl);
            if (fs.existsSync(imgPath)) {
              fs.unlinkSync(imgPath);
            }
          } catch (err) {
            console.warn(`[forceDeleteUserAsset] Lỗi xóa ảnh con PPTX: ${imgUrl}`, err);
          }
        }
      }
    }

    // Trừ dung lượng quota
    const { decrementStorageUsage } = await import('../middleware/checkStorageQuota.js');
    const fileSizeBytes = Number(asset.file_size ?? 0);
    if (fileSizeBytes > 0) {
      await decrementStorageUsage(asset.uploaded_by, fileSizeBytes, asset.team_id).catch(() => { });
    }

    res.json({ success: true, message: 'Ảnh đã được xóa khỏi hệ thống và tất cả dự án.' });
  } catch (err) {
    console.error('forceDeleteUserAsset error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
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
    const maskFile = files?.['mask']?.[0];

    if (!imageFile || !maskFile) {
      return res.status(400).json({ error: 'Both image and mask are required' });
    }

    // Forward cả 2 file sang Python AI service
    const formData = new FormData();
    const imageBlob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.mimetype });
    const maskBlob = new Blob([new Uint8Array(maskFile.buffer)], { type: maskFile.mimetype });
    formData.append('image', imageBlob, imageFile.originalname);
    formData.append('mask', maskBlob, maskFile.originalname);

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

// ─────────────────────────────────────────────────────────────────────────────
// CLONE ASSET FOR DESIGN (Tham chiếu ảo - Virtual Referencing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/assets/clone-for-design

/**
 * DELETE /api/assets/:id
 * Xóa Bản ghi A (ảnh trong thư viện Uploads của user).
 * Bản ghi B (ảnh đã kéo vào design) vẫn tồn tại → ảnh trên Canvas không bị mất.
 * File vật lý chỉ bị xóa bởi Cron GC khi không còn BẤT KỲ bản ghi nào trỏ tới URL đó.
 */
export const deleteUserAsset = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    // Chỉ cho phép xóa asset do chính user upload (và không phải design_clone)
    const asset = await db.getOne(
      `SELECT id, url, file_size, uploaded_by, metadata, team_id, type
       FROM assets
       WHERE id = $1 AND uploaded_by = $2
         AND (metadata->>'design_clone' IS NULL OR metadata->>'design_clone' = 'false')`,
      [id, user.id]
    );
    if (!asset) {
      return res.status(404).json({ error: 'Asset không tồn tại hoặc bạn không có quyền xóa' });
    }

    // Xóa Bản ghi A khỏi DB
    await db.execute(`DELETE FROM assets WHERE id = $1`, [id]);

    // [SECURITY FIX - Storage Quota Bypass]
    // KHÔNG trừ dung lượng ngay lập tức tại đây.
    // Lý do: Nếu Bản ghi B (clone) vẫn còn tồn tại trỏ tới cùng URL,
    // file vật lý KHÔNG được xóa → dung lượng thực tế trên server không thay đổi.
    // Trừ dung lượng khi và chỉ khi file vật lý thực sự bị xóa (không còn ref nào).

    // Kiểm tra xem còn Bản ghi B nào trỏ vào cùng URL không
    const remainingRef = await db.getOne(
      `SELECT id FROM assets WHERE url = $1 LIMIT 1`,
      [asset.url]
    );

    if (!remainingRef) {
      // Không còn bản ghi nào khác → xóa file vật lý VÀ trừ dung lượng
      try {
        const filePath = path.join(__dirname, '..', 'public', asset.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[DeleteAsset] File vật lý đã xóa: ${asset.url}`);
        }
        // Chỉ trừ dung lượng khi file vật lý thực sự không còn tồn tại
        const { decrementStorageUsage } = await import('../middleware/checkStorageQuota.js');
        const fileSizeBytes = Number(asset.file_size ?? 0);
        if (fileSizeBytes > 0) {
          // [FIX Storage Leak] Truyền thêm asset.team_id để trừ đúng quota của Workspace (nếu có)
          await decrementStorageUsage(user.id, fileSizeBytes, asset.team_id).catch((e: any) => {
            console.error('[DeleteAsset] Failed to decrement storage:', e);
          });
        }
        // Xử lý xóa thêm cho Asset loại PPTX
        if (asset.type === 'pptx') {
          const metadata = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata) : asset.metadata;
          if (metadata && Array.isArray(metadata.extracted_images)) {
            for (const imgUrl of metadata.extracted_images) {
              try {
                // [FIX] Xóa design_elements tham chiếu đến ảnh con (cả URL tương đối và tuyệt đối)
                await db.execute(
                  `DELETE FROM design_elements WHERE properties->>'src' = $1 OR properties->>'src' = $2`,
                  [imgUrl, `http://localhost:3000${imgUrl}`]
                );
                const imgPath = path.join(__dirname, '..', 'public', imgUrl);
                if (fs.existsSync(imgPath)) {
                  fs.unlinkSync(imgPath);
                  console.log(`[DeleteAsset] File ảnh con của PPTX đã xóa: ${imgUrl}`);
                }
              } catch (err) {
                console.warn('[DeleteAsset] Lỗi xóa file con PPTX:', err);
              }
            }
          }
        }

      } catch (e) {
        // Không chặn response nếu xóa file thất bại — GC sẽ dọn sau
        console.warn(`[DeleteAsset] Không xóa được file vật lý (GC sẽ dọn): ${asset.url}`, e);
      }
    } else {
      // Còn Bản ghi B trỏ tới URL → giữ file vật lý, KHÔNG trừ dung lượng
      // Dung lượng sẽ được trừ khi Bản ghi B cuối cùng bị xóa (bởi GC hoặc khi design bị xóa vĩnh viễn)
      console.log(`[DeleteAsset] Còn bản ghi khác trỏ tới ${asset.url} → Giữ file vật lý, không trừ quota.`);
    }

    res.json({ success: true, message: 'Đã xóa tài nguyên khỏi thư viện' });
  } catch (error) {
    console.error('Delete User Asset Error:', error);
    res.status(500).json({ error: 'Không thể xóa tài nguyên' });
  }
};

/**
 * GET /api/assets/user-images
 * CHỈ hiển thị Bản ghi A (ảnh user đã upload, KHÔNG phải ảnh clone của design).
 * Đã được filter theo metadata->>'design_clone' IS NULL.
 */
