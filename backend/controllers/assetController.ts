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

    // ─── [WORKSPACE] Lấy workspaceId từ context (nếu có) ────────────────────
    const workspace = (req as any).workspace;
    const workspaceId: string | undefined = workspace?.id;

    // Ghi vào DB assets, kèm team_id để phân biệt tài sản của Workspace nào
    // RETURNING id để frontend lấy assetId gọi cloneAssetForDesign
    let assetId: string | null = null;
    try {
      const insertResult = await db.query(
        `INSERT INTO assets (name, type, url, uploaded_by, team_id, is_premium, file_size, created_at)
         VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
         RETURNING id`,
        [file.originalname, 'image', imageUrl, user.id, workspaceId ?? null, file.size]
      );
      assetId = insertResult.rows[0]?.id ?? null;
      console.log(`[Upload] Asset inserted: id=${assetId}, user=${user.id}, workspace=${workspaceId ?? 'personal'}, file=${file.originalname}`);
    } catch (insertErr) {
      console.error('[Upload] FAILED to insert asset to DB:', insertErr);
    }

    // ─── [WORKSPACE] Trừ dung lượng vào Workspace (không phải User cá nhân) ─
    await incrementStorageUsage(user.id, file.size, workspaceId).catch((e) => {
      console.error('[Upload] Failed to increment storage:', e);
    });

    res.status(201).json({
      url: imageUrl,
      assetId,          // [NEW] Trả về để frontend gọi cloneAssetForDesign
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
   * GET /api/assets/user-images
   * Trả về danh sách hình ảnh đã upload của user hiện tại.
   * Luôn lọc theo uploaded_by để đảm bảo privacy.
   */
export const getUserImages = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // CHỈ lấy Bản ghi A (ảnh user upload), KHÔNG lấy design_clone (Bản ghi B)
    const result = await db.query(
      `SELECT id, name, url, file_size, created_at
       FROM assets
       WHERE type = 'image'
         AND uploaded_by = $1
         AND (metadata->>'design_clone' IS NULL OR metadata->>'design_clone' = 'false')
       ORDER BY created_at DESC`,
      [user.id]
    );

    res.json({ images: result.rows });
  } catch (error) {
    console.error('Get User Images Error:', error);
    res.status(500).json({ error: 'Failed to fetch user images' });
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
 * Khi user kéo ảnh từ Thư viện Uploads vào Canvas, Frontend gọi API này.
 * Hệ thống tạo Bản ghi B trỏ cùng URL với Bản ghi A (không copy file vật lý).
 * Bản ghi B gán với design_id → ảnh tồn tại độc lập khỏi thư viện cá nhân.
 *
 * Body: { assetId: string, designId: string }
 * Response: { clonedAssetId: string, url: string }
 */
export const cloneAssetForDesign = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { assetId, designId } = req.body;
    if (!assetId || !designId) {
      return res.status(400).json({ error: 'assetId và designId là bắt buộc' });
    }

    // [SECURITY FIX - BOLA/IDOR] 1. Kiểm tra quyền của User đối với Design (Phải là owner hoặc editor)
    const designRes = await db.query('SELECT user_id, team_id FROM designs WHERE id = $1 AND is_deleted = false', [designId]);
    if (designRes.rows.length === 0) return res.status(404).json({ error: 'Design không tồn tại' });
    
    const design = designRes.rows[0];
    let hasEditAccess = design.user_id === user.id;

    if (!hasEditAccess) {
      const shareRes = await db.query(
        "SELECT role FROM design_shares WHERE design_id = $1 AND user_id = $2 AND role IN ('owner', 'editor')", 
        [designId, user.id]
      );
      if (shareRes.rows.length > 0) hasEditAccess = true;
    }
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa bản thiết kế này' });
    }

    // Lấy thông tin Bản ghi A (asset gốc)
    const original = await db.getOne(
      `SELECT id, name, type, url, file_size, width, height, metadata, uploaded_by, team_id
       FROM assets WHERE id = $1`,
      [assetId]
    );
    if (!original) {
      return res.status(404).json({ error: 'Asset không tồn tại' });
    }

    // [SECURITY FIX - BOLA/IDOR] 2. Kiểm tra quyền của User đối với Asset gốc
    const isPublicAsset = !original.uploaded_by || original.uploaded_by === 'admin' || (original.metadata && original.metadata.is_public);
    if (!isPublicAsset && original.uploaded_by !== user.id) {
      // Nếu là asset của team, kiểm tra xem user có nằm trong team_id đó không
      if (original.team_id) {
        const teamCheck = await db.query('SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2', [original.team_id, user.id]);
        if (teamCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Bạn không có quyền truy cập tài nguyên của team này' });
        }
      } else {
        return res.status(403).json({ error: 'Bạn không có quyền sử dụng tài nguyên này' });
      }
    }

    // Tạo Bản ghi B: trỏ cùng URL, gán design_id, đánh dấu là design_clone
    const { v4: uuidv4 } = await import('uuid');
    const cloneId = uuidv4();

    await db.execute(
      `INSERT INTO assets (id, name, type, url, uploaded_by, team_id, is_premium, file_size, width, height, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, false, $6, $7, $8,
         COALESCE($9::jsonb, '{}'::jsonb) || $10::jsonb,
         NOW())`,
      [
        cloneId,
        original.name,
        original.type,
        original.url,
        user.id,
        original.file_size ?? 0,
        original.width ?? null,
        original.height ?? null,
        JSON.stringify(original.metadata ?? {}),
        // Ghi metadata đặc biệt: đây là bản clone cho design, không hiện trong Uploads
        JSON.stringify({ design_clone: true, design_id: designId, source_asset_id: assetId }),
      ]
    );

    console.log(`[CloneAsset] Bản ghi B created: clone=${cloneId}, source=${assetId}, design=${designId}`);

    res.status(201).json({ clonedAssetId: cloneId, url: original.url });
  } catch (error) {
    console.error('Clone Asset For Design Error:', error);
    res.status(500).json({ error: 'Không thể nhân bản tài nguyên cho design' });
  }
};

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
      `SELECT id, url, file_size, uploaded_by, metadata, team_id
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
