import { Request, Response } from 'express';
import db from '../config/db';
import { assertCanActOn, getRoleWeight } from '../middleware/roleHierarchy';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { paymentService } from '../services/paymentService';
import type { NextFunction } from 'express';
// [FIX Vấn đề 18] Import shared PII utility — GDPR-compliant IP hashing
import { hashIp } from '../utils/securityUtils';
// [FIX toggleUserBan] forceLogoutUser cần dùng sớm (dòng ~253) trước khi inline import ở dòng 1002
import { forceLogoutUser, getGlobalOnlineUsers, globalIo } from '../sockets/collaboration';
// [FIX 3 - Redis Cache] getRedis để cache admin metrics
import { getRedis } from '../config/redis';
// [FIX 4 - SVG Sanitization] DOMPurify + jsdom để strip XSS khỏi SVG trước khi lưu
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Multer config ──────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../sticker_upload/assets');
const fontsDir = path.join(__dirname, '../sticker_upload/fonts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const ALLOWED_FONT_MIMES = new Set([
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/x-font-ttf', 'application/x-font-otf',
  'application/font-woff', 'application/font-woff2',
  'application/octet-stream', // một số browser gửi font dạng octet-stream
]);
const ALLOWED_FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

// Storage tự động chia font / ảnh vào đúng folder
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_FONT_EXTS.has(ext) ? fontsDir : uploadDir);
  },
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
export const adminUpload = multer({
  storage, limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = ALLOWED_IMAGE_MIMES.has(file.mimetype) && ALLOWED_IMAGE_EXTS.has(ext);
    const isFont = ALLOWED_FONT_EXTS.has(ext); // trust extension cho font (MIME không đáng tin)
    if (isImage || isFont) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext}). Allowed: PNG, JPG, WEBP, GIF, SVG, TTF, OTF, WOFF, WOFF2`));
    }
  },
});

// [FIX 19 - Layer 2] Magic Number Verification: xác minh chữ ký nhị phân của file
// Ngăn chặn tấn công đổi tên file (như virus.exe → virus.png)
export const validateMagicNumber = async (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const single = req.file as Express.Multer.File | undefined;
  const allFiles = files ? files : (single ? [single] : []);
  if (allFiles.length === 0) return next();
  const ALLOWED_MIMES_SET = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
  const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
  try {
    const { fileTypeFromBuffer } = await import('file-type');
    for (const file of allFiles) {
      const filePath = file.path;
      const ext = path.extname(file.originalname).toLowerCase();

      // Font files không có magic bytes chuẩn ảnh → skip kiểm tra, đã được validate bởi fileFilter
      if (FONT_EXTS.has(ext)) continue;

      // SVG là XML nên không có magic bytes riêng — kiểm tra XSS trong nội dung
      if (file.mimetype === 'image/svg+xml') {
        const svgContent = fs.readFileSync(filePath, 'utf-8');
        if (/<script/i.test(svgContent) || /on\w+=/i.test(svgContent) || /javascript:/i.test(svgContent)) {
          fs.unlinkSync(filePath);
          return res.status(400).json({ error: `SVG '${file.originalname}' contains malicious code (XSS injection).` });
        }
        continue;
      }
      const buffer = Buffer.alloc(12);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 12, 0);
      fs.closeSync(fd);
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !ALLOWED_MIMES_SET.has(detected.mime)) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          error: `File '${file.originalname}' has mismatched signature (actual: ${detected?.mime ?? 'unknown'}). Possible malware.`,
        });
      }
    }
    next();
  } catch (err) {
    console.error('[validateMagicNumber]', err);
    next();
  }
};

const METRICS_CACHE_KEY = 'admin:metrics:snapshot';
const METRICS_CACHE_TTL = 600; // 10 phút

// [FIX 3] Hàm nội bộ thực hiện toàn bộ query — dùng chung bởi getMetrics và Cron pre-warm
export async function computeAdminMetrics() {
  const [
    userStats, newUsersThisMonth, revenueStats,
    storageStats, designStats, assetStats, templateStats
  ] = await Promise.all([
    db.getOne(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE is_verified = true) AS active_users
      FROM users
    `),
    db.getOne(`
      SELECT COUNT(*) AS new_users
      FROM users
      WHERE created_at >= date_trunc('month', NOW())
    `),
    db.getOne(`
      SELECT
        COALESCE(SUM(amount), 0) AS total_revenue,
        COUNT(*) AS total_payments
      FROM payments WHERE status = 'succeeded'
    `),
    db.getOne(`SELECT COALESCE(SUM(storage_used_bytes), 0) AS total_storage FROM users`),
    db.getOne(`SELECT COUNT(*) AS total_designs FROM designs WHERE is_deleted = false`),
    db.getOne(`SELECT COUNT(*) AS total_assets FROM assets`),
    db.getOne(`SELECT COUNT(*) AS total_templates FROM public_templates`),
  ]);

  const proSubs = await db.getOne(`
    SELECT COUNT(DISTINCT user_id) AS pro_users
    FROM user_subscriptions WHERE status = 'active'
  `);

  const monthlyRevenue = await db.query(`
    SELECT
      to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
      COALESCE(SUM(amount), 0) AS revenue,
      COUNT(*) AS transactions
    FROM payments
    WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '6 months'
    GROUP BY date_trunc('month', created_at)
    ORDER BY date_trunc('month', created_at)
  `);

  const dailyUsers = await db.query(`
    SELECT
      to_char(created_at::date, 'DD/MM') AS day,
      COUNT(*) AS count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY created_at::date
    ORDER BY created_at::date
  `);

  return {
    users: {
      total: parseInt(userStats?.total_users || 0),
      active: parseInt(userStats?.active_users || 0),
      newThisMonth: parseInt(newUsersThisMonth?.new_users || 0),
      proUsers: parseInt(proSubs?.pro_users || 0),
    },
    revenue: {
      total: parseFloat(revenueStats?.total_revenue || 0),
      totalPayments: parseInt(revenueStats?.total_payments || 0),
    },
    storage: {
      totalBytes: parseInt(storageStats?.total_storage || 0),
    },
    content: {
      designs: parseInt(designStats?.total_designs || 0),
      assets: parseInt(assetStats?.total_assets || 0),
      templates: parseInt(templateStats?.total_templates || 0),
    },
    charts: {
      monthlyRevenue: monthlyRevenue?.rows || [],
      dailyUsers: dailyUsers?.rows || [],
    }
  };
}

export const getMetrics = async (_req: Request, res: Response) => {
  try {
    // [FIX 3 - Redis Cache] Kiểm tra cache trước khi query DB
    const redis = getRedis();
    if (redis) {
      const cached = await redis.get(METRICS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return res.json({ ...parsed, _source: 'cache' });
      }
    }

    // Cache MISS (hoặc Redis chưa sẵn sàng) — query DB trực tiếp
    const metrics = await computeAdminMetrics();
    if (redis) {
      await redis.setEx(METRICS_CACHE_KEY, METRICS_CACHE_TTL, JSON.stringify(metrics));
    }

    res.json({ ...metrics, _source: 'live' });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Hàm helper: xóa cache metrics sau các action quan trọng (ban, revoke, payment)
export async function invalidateMetricsCache() {
  try {
    const redis = getRedis();
    if (redis) await redis.del(METRICS_CACHE_KEY);
  } catch (e) {
    console.warn('[MetricsCache] Failed to invalidate:', e);
  }
}

// ─── GET /api/admin/users ────────────────────────────────────────────────────
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      where += ` AND u.role = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT
        u.id, u.email, u.name, u.avatar_url, u.role, u.is_verified,
        u.storage_used_bytes, u.created_at, u.last_login_at,
        COUNT(DISTINCT d.id) AS design_count,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'succeeded'), 0) AS total_spent,
        us.status AS subscription_status,
        sp.name AS plan_name
      FROM users u
      LEFT JOIN designs d ON d.user_id = u.id AND d.is_deleted = false
      LEFT JOIN payments p ON p.user_id = u.id
      LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      ${where}
      GROUP BY u.id, us.status, sp.name
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await db.getOne(`SELECT COUNT(*) FROM users u ${where}`,
      params.slice(0, params.length - 2));

    res.json({
      users: result?.rows || [],
      total: parseInt(countResult?.count || 0),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('Admin getUsers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── PUT /api/admin/users/:id/role ──────────────────────────────────────────
export const updateUserRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  const actorId = (req as any).user?.id;
  const actorRole = (req as any).user?.role;

  // [FIX Vấn đề 10] Validate role hợp lệ — ngăn role injection
  if (!['user', 'admin', 'moderator'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // [SECURITY FIX - Privilege Escalation]
  // Chặn actor gán một role có trọng số >= chính mình.
  // Ví dụ: Moderator (30) không thể gán 'admin' (50) hay 'moderator' (30) cho ai.
  // Chỉ Admin (50) mới có thể gán 'moderator' (30) hoặc 'user' (10).
  const newRoleWeight = getRoleWeight(role);
  const actorWeight = getRoleWeight(actorRole);
  if (newRoleWeight >= actorWeight) {
    return res.status(403).json({
      error: `Bạn không thể gán role '${role}' (trọng số ${newRoleWeight}) vì quyền của bạn (${actorRole}) chỉ ở mức ${actorWeight}.`,
    });
  }

  // [FIX Vấn đề 10] Lấy role hiện tại của Target trước khi kiểm tra thứ bậc
  const target = await db.getOne('SELECT role FROM users WHERE id = $1', [id]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const check = assertCanActOn(actorId, actorRole, id, target.role);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  await db.execute('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  res.json({ success: true });
};

// ─── PUT /api/admin/users/:id/ban (DEPRECATED — giữ lại để backward-compat) ──
// [FIX] Route này tr\u01b0\u1edbc \u0111\u00e2y d\u00f9ng is_verified = false nh\u01b0 flag "ban" — SAI NGHI\u1ec6P V\u1ee4.
// is_verified ch\u1ec9 \u0111\u1ec3 x\u00e1c nh\u1eadn email, kh\u00f4ng ph\u1ea3i ban flag.
// Gi\u1edd redirect sang \u0111\u00fang logic: c\u1eadp nh\u1eadt c\u1ed9t `status` + g\u1ecdi forceLogoutUser().
// Frontend m\u1edbi n\u00ean d\u00f9ng POST /api/admin/users-v2/:id/ban thay th\u1ebf.
export const toggleUserBan = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { banned } = req.body;
  const actorId = (req as any).user?.id;
  const actorRole = (req as any).user?.role;

  try {
    const target = await db.getOne('SELECT role FROM users WHERE id = $1', [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const check = assertCanActOn(actorId, actorRole, id, target.role);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    // [FIX] Dùng cột `status` thay vì is_verified
    const newStatus = banned ? 'banned' : 'active';
    await db.execute(
      `UPDATE users SET status = $1 WHERE id = $2`,
      [newStatus, id]
    );

    // Force logout n\u1ebfu b\u1ecb ban
    if (banned) {
      forceLogoutUser(String(id), 'Ban da bi ban.');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('toggleUserBan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/admin/assets ───────────────────────────────────────────────────
export const getAdminAssets = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 30, type = '', search = '', is_premium = '', is_active = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE a.uploaded_by IS NULL';
    const params: any[] = [];

    if (type) {
      params.push(type);
      where += ` AND a.type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (a.name ILIKE $${params.length} OR $${params.length} = ANY(a.tags::text[]))`;
    }
    if (is_premium !== '') {
      params.push(is_premium === 'true');
      where += ` AND a.is_premium = $${params.length}`;
    }
    // Admin mặc định thấy TẤT CẢ asset (cả active lẫn deactive).
    // Chỉ filter khi admin chủ động chọn Active/Deactive trong dropdown.
    if (is_active !== '') {
      params.push(is_active === 'true');
      where += ` AND a.is_active = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT a.*
      FROM assets a
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await db.getOne(
      `SELECT COUNT(*) FROM assets a ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      assets: result?.rows || [],
      total: parseInt(countResult?.count || 0),
    });
  } catch (err) {
    console.error('Admin getAssets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/admin/assets/bulk ────────────────────────────────────────────
export const bulkUploadAssets = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const { type = 'image', tags, is_premium = 'false' } = req.body;
    const tagArray = tags ? tags.split(',').map((t: string) => t.trim()) : [];
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

    // [FIX 4 - SVG Sanitization]
    const { window: jsdomWindow } = new JSDOM('');
    const purify = DOMPurify(jsdomWindow as any);

    const inserted: any[] = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const isFont = ALLOWED_FONT_EXTS.has(ext);

      // Bắt buộc file phải khớp với type được khai báo
      if (type === 'font' && !isFont) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: `File '${file.originalname}' không phải là font.` });
      }
      if (type !== 'font' && isFont) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: `File '${file.originalname}' là font, nhưng bạn đang chọn loại '${type}'.` });
      }

      const assetType = type;

      // [FIX 4 - Layer 2] Sanitize SVG
      if (file.mimetype === 'image/svg+xml') {
        const rawSvg = fs.readFileSync(file.path, 'utf-8');
        const cleanSvg = purify.sanitize(rawSvg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['script', 'foreignObject'],
          FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
          ALLOW_DATA_ATTR: false,
        });
        fs.writeFileSync(file.path, cleanSvg, 'utf-8');
      }

      // Font được serve qua /fonts/, ảnh/sticker qua /assets/
      const url = isFont
        ? `${API_BASE_URL}/fonts/${file.filename}`
        : `${API_BASE_URL}/assets/${file.filename}`;

      // Tên hiển thị: bỏ extension, giữ khoảng trắng/gạch ngang
      const displayName = file.originalname.replace(/\.[^/.]+$/, '');

      const row = await db.getOne(`
        INSERT INTO assets (name, type, url, is_premium, tags, uploaded_by, file_size)
        VALUES ($1, $2, $3, $4, $5, NULL, $6)
        RETURNING *
      `, [
        displayName,
        assetType,
        url,
        is_premium === 'true',
        tagArray,
        file.size,
      ]);
      inserted.push(row);
    }

    res.json({ inserted: inserted.length, assets: inserted });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── PATCH /api/admin/assets/:id ────────────────────────────────────────────
export const updateAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_premium, tags, name } = req.body;

    // tags có thể là string "facebook,nature" hoặc array ["facebook","nature"]
    // PostgreSQL text[] cần truyền dưới dạng JS array — pg driver tự chuyển sang {facebook,nature}
    let tagArray: string[] | null = null;
    if (tags !== undefined && tags !== null) {
      if (Array.isArray(tags)) {
        tagArray = tags.map((t: string) => t.trim()).filter(Boolean);
      } else if (typeof tags === 'string') {
        tagArray = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
      }
    }

    await db.execute(`
      UPDATE assets SET
        is_premium = COALESCE($1, is_premium),
        tags = COALESCE($2, tags),
        name = COALESCE($3, name)
      WHERE id = $4
    `, [
      is_premium !== undefined ? is_premium : null,
      tagArray,
      name || null,
      id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('[updateAsset]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── PUT /api/admin/assets/:id/toggle-active ─────────────────────────────────
// Admin bật/tắt trạng thái hiển thị của asset đối với người dùng.
// Asset bị deactive sẽ KHÔNG xuất hiện trong sidebar/search của editor,
// nhưng vẫn render bình thường trong các design đã dùng chúng (URL không thay đổi).
export const toggleAssetActive = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const asset = await db.getOne(
      'SELECT id, is_active, name FROM assets WHERE id = $1 AND uploaded_by IS NULL',
      [id]
    );
    if (!asset) return res.status(404).json({ error: 'Asset not found or not a system asset' });

    const newState = !asset.is_active;
    await db.execute(
      'UPDATE assets SET is_active = $1 WHERE id = $2',
      [newState, id]
    );

    console.log(`[Admin] Asset "${asset.name}" (${id}) → is_active=${newState}`);
    res.json({ success: true, is_active: newState });
  } catch (err) {
    console.error('[toggleAssetActive]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};




// ─── GET /api/admin/designs ──────────────────────────────────────────────────
// [FIX 1 - Template Privacy] Chỉ trả về design của tài khoản admin/moderator.
// Admin KHÔNG được xem design private của user thường — vi phạm GDPR.
// Admin tự tạo design trên editor của mình, sau đó publish từ đây.
export const getDesigns = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Base condition: chỉ lấy design của user có role admin/moderator
    const baseWhere = `u.role IN ('admin', 'moderator') AND d.is_deleted = false`;
    const searchParams: any[] = [];
    let searchClause = '';
    if (search) {
      searchParams.push(`%${search}%`);
      searchClause = `AND (d.title ILIKE $1 OR u.name ILIKE $1)`;
    }

    const countResult = await db.getOne(
      `SELECT COUNT(*)::int AS total
       FROM designs d
       JOIN users u ON u.id = d.user_id
       WHERE ${baseWhere} ${searchClause}`,
      searchParams
    );

    const queryParams = [...searchParams, Number(limit), offset];
    const limitIdx = queryParams.length - 1;
    const offsetIdx = queryParams.length;

    const result = await db.query(
      `SELECT d.*, u.name AS user_name, u.email AS user_email,
         EXISTS(SELECT 1 FROM public_templates pt WHERE pt.design_id = d.id) AS is_published
       FROM designs d
       JOIN users u ON u.id = d.user_id
       WHERE ${baseWhere} ${searchClause}
       ORDER BY d.updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      queryParams
    );

    res.json({
      designs: result?.rows || [],
      total: countResult?.total || 0,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('[getDesigns]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/admin/templates/publish ──────────────────────────────────────
export const publishTemplate = async (req: Request, res: Response) => {
  const { design_id, category_id } = req.body;
  try {
    await db.execute(`
      INSERT INTO public_templates (design_id, category_id)
      VALUES ($1, $2)
      ON CONFLICT (design_id) DO UPDATE SET category_id = EXCLUDED.category_id
    `, [design_id, category_id || null]);
    await db.execute('UPDATE designs SET is_template = true, is_public = true WHERE id = $1', [design_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── DELETE /api/admin/templates/:design_id ──────────────────────────────────
export const unpublishTemplate = async (req: Request, res: Response) => {
  const { design_id } = req.params;
  await db.execute('DELETE FROM public_templates WHERE design_id = $1', [design_id]);
  await db.execute('UPDATE designs SET is_template = false, is_public = false WHERE id = $1', [design_id]);
  res.json({ success: true });
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/subscriptions ───────────────────────────────────────────
export const getAdminSubscriptions = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      where += ` AND us.status = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT
        us.id, us.user_id, us.plan_id, us.status,
        us.current_period_start, us.current_period_end,
        us.cancel_at, us.stripe_subscription_id,
        us.created_at, us.updated_at,
        u.name AS user_name, u.email AS user_email,
        sp.name AS plan_name, sp.slug AS plan_slug,
        sp.monthly_price, sp.yearly_price
      FROM user_subscriptions us
      JOIN users u ON u.id = us.user_id
      JOIN subscription_plans sp ON sp.id = us.plan_id
      ${where}
      ORDER BY us.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await db.getOne(`
      SELECT COUNT(*) FROM user_subscriptions us
      JOIN users u ON u.id = us.user_id
      ${where}
    `, params.slice(0, params.length - 2));

    res.json({
      subscriptions: result?.rows || [],
      total: parseInt(countResult?.count || 0),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('Admin getSubscriptions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/admin/subscriptions/manual ───────────────────────────────────
export const createManualSubscription = async (req: Request, res: Response) => {
  try {
    const { user_id, plan_id, days } = req.body;
    const adminId = (req as any).user.id;
    const adminRole = (req as any).user?.role;
    if (!user_id || !plan_id) return res.status(400).json({ error: 'user_id and plan_id required' });

    // [SECURITY FIX - Missing Hierarchy Guard]
    // Kiểm tra role của user sắp được tặng gói. Moderator không thể tặng gói cho Admin.
    const targetUser = await db.getOne('SELECT role FROM users WHERE id = $1', [user_id]);
    if (!targetUser) return res.status(404).json({ error: 'Không tìm thấy user' });
    const check = assertCanActOn(adminId, adminRole, user_id, targetUser.role);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    // days phải là số nguyên dương, giới hạn tối đa 3650 ngày (~10 năm) để tránh buff vĩnh viễn
    const periodDays = Math.min(Math.max(1, Math.floor(Number(days) || 30)), 3650);
    const start = new Date();
    const end = new Date(start.getTime() + periodDays * 24 * 60 * 60 * 1000);

    // [FIX - Pending Payment Conflict] Hủy tất cả giao dịch đang chờ thanh toán của user.
    // Nếu không làm bước này: Admin tặng gói xong, webhook PayOS về sau vẫn kích hoạt lại
    // payment cũ → ghi đè subscription mới của Admin, gây xung đột current_period_end.
    await db.execute(
      `UPDATE payments SET status = 'canceled' WHERE user_id = $1 AND status = 'pending'`,
      [user_id]
    );

    // Hủy sub cũ nếu có
    await db.execute(
      `UPDATE user_subscriptions SET status = 'canceled' WHERE user_id = $1 AND status = 'active'`,
      [user_id]
    );

    const row = await db.getOne(`
      INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
      VALUES ($1, $2, 'active', $3, $4)
      RETURNING *
    `, [user_id, plan_id, start.toISOString(), end.toISOString()]);

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'CREATE_MANUAL_SUBSCRIPTION', `Tặng gói thủ công cho user_id=${user_id}, plan_id=${plan_id}, days=${periodDays}`, hashIp(req.ip)]
    );

    res.json({ success: true, subscription: row });
  } catch (err) {
    console.error('createManualSubscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── PUT /api/admin/subscriptions/:id ───────────────────────────────────────
export const updateSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, plan_id, extend_days } = req.body;
    const adminId = (req as any).user.id;

    const sets: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      sets.push(`status = $${params.length}`);
    }
    if (plan_id) {
      params.push(plan_id);
      sets.push(`plan_id = $${params.length}`);
    }
    if (extend_days) {
      params.push(Number(extend_days));
      sets.push(`current_period_end = current_period_end + ($${params.length} || ' days')::interval`);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    sets.push('updated_at = NOW()');
    params.push(id);

    await db.execute(`UPDATE user_subscriptions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'UPDATE_SUBSCRIPTION', `Sửa thông tin gói sub_id=${id}. Payload: ${JSON.stringify({ status, plan_id, extend_days })}`, hashIp(req.ip)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('updateSubscriptionStatus error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── DELETE /api/admin/subscriptions/:id ────────────────────────────────────
export const terminateSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;
    const adminRole = (req as any).user?.role;
    const { ban, reason } = req.query;

    // [SECURITY FIX - Missing Hierarchy Guard]
    // Tìm user_id của subscription, sau đó kiểm tra Moderator không được thu hồi gói của Admin.
    const sub = await db.getOne('SELECT user_id FROM user_subscriptions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy subscription' });
    const targetUser = await db.getOne('SELECT role FROM users WHERE id = $1', [sub.user_id]);
    if (targetUser) {
      const check = assertCanActOn(adminId, adminRole, sub.user_id, targetUser.role);
      if (!check.allowed) return res.status(403).json({ error: check.reason });
    }

    if (ban === 'true') {
      await db.execute(
        `UPDATE user_subscriptions SET status = 'canceled', current_period_end = NOW(), cancel_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await db.execute(
        `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [adminId, 'BAN_SUBSCRIPTION', `Tịch thu gói sub_id=${id} ngay lập tức. Lý do: ${reason || 'Không rõ'}`, hashIp(req.ip)]
      );
    } else {
      await db.execute(
        `UPDATE user_subscriptions SET status = 'canceled', cancel_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await db.execute(
        `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [adminId, 'CANCEL_SUBSCRIPTION', `Hủy gia hạn gói sub_id=${id} (Vẫn cho dùng hết chu kỳ)`, hashIp(req.ip)]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('terminateSubscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN MANAGEMENT (CRUD)
// ═══════════════════════════════════════════════════════════════════════════════

export const subscriptionPlanController = {
  getAll: async (_req: Request, res: Response) => {
    try {
      const result = await db.query('SELECT * FROM subscription_plans ORDER BY monthly_price ASC');
      res.json({ plans: result?.rows || [] });
    } catch (err) {
      console.error('getPlans error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const adminId = (req as any).user.id;
      const { name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active } = req.body;
      const row = await db.getOne(`
        INSERT INTO subscription_plans (name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      `, [name, slug, monthly_price, yearly_price, max_storage_gb || null, max_team_members || null, JSON.stringify(features || []), is_active !== false]);

      await db.execute(
        `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [adminId, 'CREATE_PLAN', `Tạo mới gói cước: ${slug}`, hashIp(req.ip)]
      );

      res.json({ success: true, plan: row });
    } catch (err) {
      console.error('createPlan error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = (req as any).user.id;
      const { name, slug, description, monthly_price, features, stripe_product_id, is_active, max_storage_gb, max_team_members, yearly_price } = req.body;

      // [FIX 2] Bảo toàn giá trị cấn trừ cho user cũ: CẤM sửa giá trị thanh toán của một gói đang tồn tại
      if (monthly_price !== undefined || yearly_price !== undefined) {
        return res.status(400).json({ error: 'Nghiệp vụ tài chính: Không được phép sửa giá của gói cước đang tồn tại để bảo toàn logic cấn trừ cho user cũ. Vui lòng tạo gói mới và ẩn (deactivate) gói cũ.' });
      }

      // N\u1ebfu frontend ch\u1ec9 g\u1eedi is_active (trong handleToggleActive)
      const isStatusToggleOnly = Object.keys(req.body).length === 1 && req.body.hasOwnProperty('is_active');

      if (isStatusToggleOnly) {
        await db.execute(`UPDATE subscription_plans SET is_active = $1 WHERE id = $2`, [is_active, id]);
        await db.execute(
          `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
           VALUES ($1, $2, $3, $4)`,
          [adminId, 'TOGGLE_PLAN_STATUS', `Đổi trạng thái is_active=${is_active} của gói id=${id}`, hashIp(req.ip)]
        );
        return res.json({ success: true });
      }

      // Cập nhật các trường thông tin không liên quan đến tiền bạc
      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];

      if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
      if (slug !== undefined) { params.push(slug); sets.push(`slug = $${params.length}`); }
      if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
      if (features !== undefined) { params.push(JSON.stringify(features)); sets.push(`features = $${params.length}`); }
      if (stripe_product_id !== undefined) { params.push(stripe_product_id); sets.push(`stripe_product_id = $${params.length}`); }
      if (is_active !== undefined) { params.push(is_active); sets.push(`is_active = $${params.length}`); }
      if (max_storage_gb !== undefined) { params.push(max_storage_gb); sets.push(`max_storage_gb = $${params.length}`); }
      if (max_team_members !== undefined) { params.push(max_team_members); sets.push(`max_team_members = $${params.length}`); }

      params.push(id);
      const result = await db.query(
        `UPDATE subscription_plans SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Kh\u00f4ng t\u00ecm th\u1ea5y g\u00f3i c\u01b0\u1edbc' });

      await db.execute(
        `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [adminId, 'UPDATE_PLAN', `Cập nhật thông tin gói id=${id}`, hashIp(req.ip)]
      );

      res.json({ success: true, plan: result.rows[0] });
    } catch (err: any) {
      // B\u1eaft l\u1ed7i tr\u00f9ng slug m\u1ed9t c\u00e1ch r\u00f5 r\u00e0ng
      if (err.code === '23505' && err.constraint?.includes('slug')) {
        return res.status(400).json({ error: 'Slug n\u00e0y \u0111\u00e3 \u0111\u01b0\u1ee3c d\u00f9ng b\u1edfi g\u00f3i kh\u00e1c. Vui l\u00f2ng ch\u1ecdn t\u00ean slug kh\u00e1c.' });
      }
      console.error('updatePlan error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = (req as any).user.id;
      // Nghiệp vụ: Thay vì xóa cứng gây lỗi foreign key, tiến hành Soft-Delete (is_active = false)
      await db.execute('UPDATE subscription_plans SET is_active = false WHERE id = $1', [id]);

      await db.execute(
        `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [adminId, 'DELETE_PLAN', `Soft-delete gói cước id=${id}`, hashIp(req.ip)]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('deletePlan error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT / REVENUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/payments ────────────────────────────────────────────────
export const getAdminPayments = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, status = '', gateway = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (status) {
      params.push(status);
      where += ` AND p.status = $${params.length}`;
    }
    if (gateway) {
      params.push(gateway);
      where += ` AND p.gateway = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT
        p.*, u.name AS user_name, u.email AS user_email,
        sp.name AS plan_name
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN user_subscriptions us ON us.id = p.subscription_id
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await db.getOne(`SELECT COUNT(*) FROM payments p ${where}`, params.slice(0, params.length - 2));

    // Tổng doanh thu
    const revenueResult = await db.getOne(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'succeeded'`);

    // Doanh thu 12 tháng gần nhất
    const monthlyChart = await db.query(`
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0) AS revenue,
        COUNT(*) AS count
      FROM payments
      WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at)
    `);

    res.json({
      payments: result?.rows || [],
      total: parseInt(countResult?.count || 0),
      totalRevenue: parseFloat(revenueResult?.total || 0),
      monthlyChart: monthlyChart?.rows || [],
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('getAdminPayments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PAYMENT ACTIONS (Duyệt tay / Đối soát)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/admin/payments/:id/force-success ──────────────────────────────
// Admin xác nhận tiền đã về tài khoản thật → kích hoạt gói ngay lập tức
export const adminForceSuccessPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // DB uuid của record payment
    const adminId = (req as any).user.id;

    const result = await paymentService.forceActivateByPaymentId(id);

    // Ghi audit log
    // [FIX Vấn đề 18] dùng hashIp() — KHÔNG lưu raw IP (GDPR compliance)
    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'FORCE_PAYMENT_SUCCESS', `Admin duyệt tay payment id=${id}`, hashIp(req.ip)]
    );

    res.json(result);
  } catch (err: any) {
    console.error('adminForceSuccessPayment error:', err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
};

// ─── POST /api/admin/subscriptions/:id/revoke ────────────────────────────────
// [FIX Vấn đề 12] Two-Phase Revocation: Hủy Hai Pha
//
// Pha 1: Hủy trên cổng thanh toán TRƯỚC (ngăn trừ tiền kỳ tiếp theo)
// Pha 2: Chỉ khi cổng xác nhận thành công → mới cập nhật DB nội bộ
//
// Lưu ý về PayOS: PayOS là cổng thanh toán một-lần (one-time payment), không phải
// recurring billing như Stripe. Vì vậy không có API "cancel subscription" trực tiếp.
// Giải pháp: Đặt cancel_at = NOW() để ngăn hệ thống tự gia hạn, đồng thời ghi nhận
// lý do hủy để dùng trong Cron Job đối soát hàng ngày.
// Nếu tích hợp Stripe sau này: thay khối comment dưới đây bằng stripe.subscriptions.cancel(stripeSubId)
export const revokeSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;

    // Bước 0: Lấy thông tin subscription hiện tại
    const sub = await db.getOne(
      `SELECT id, user_id, status, stripe_subscription_id, current_period_end
       FROM user_subscriptions WHERE id = $1`,
      [id]
    );

    if (!sub) {
      return res.status(404).json({ error: 'Không tìm thấy subscription' });
    }

    if (sub.status === 'canceled') {
      return res.status(400).json({ error: 'Subscription đã bị hủy trước đó' });
    }

    // ── Pha 1: Hủy trên cổng thanh toán (Stripe integration point) ──────────
    // Với PayOS (one-time payment): không có recurring subscription để cancel.
    // Với Stripe: bỏ comment đoạn dưới và nhập stripe_subscription_id từ DB.
    //
    // if (sub.stripe_subscription_id) {
    //   try {
    //     await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    //     console.log(`[Revoke] Stripe subscription ${sub.stripe_subscription_id} canceled successfully.`);
    //   } catch (stripeErr: any) {
    //     // Nếu Stripe báo lỗi → DỪNG ngay, KHÔNG cập nhật DB nội bộ
    //     // Tránh trường hợp DB = canceled nhưng Stripe vẫn tiếp tục trừ tiền
    //     console.error('[Revoke] Stripe cancel failed:', stripeErr.message);
    //     return res.status(502).json({
    //       error: 'GatewayError',
    //       message: 'Không thể hủy gói cước trên cổng thanh toán. Vui lòng thử lại.',
    //     });
    //   }
    // }

    // ── Pha 2: Chỉ sau khi cổng xác nhận → cập nhật DB nội bộ ───────────────
    await db.execute(
      `UPDATE user_subscriptions
       SET status = 'canceled',
           current_period_end = NOW(),
           cancel_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Ghi audit log với đầy đủ thông tin
    // [FIX Vấn đề 18] hashIp() — GDPR compliance
    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, target_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        sub.user_id,
        'REVOKE_SUBSCRIPTION',
        `Admin thu hồi subscription id=${id} (user_id=${sub.user_id}). Gói cước hết hiệu lực ngay lập tức.`,
        hashIp(req.ip),
      ]
    );

    res.json({
      success: true,
      message: 'Đã ngắt dịch vụ ngay lập tức và đồng bộ với cổng thanh toán.',
    });
  } catch (err: any) {
    console.error('revokeSubscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// ─── USER MANAGEMENT (Real-time) ──────────────────────────────────────────
// forceLogoutUser + getGlobalOnlineUsers đã được import ở đầu file


export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', role = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      whereClause += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (role) {
      whereClause += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const countResult = await db.getOne(countQuery, params);

    const query = `
      SELECT u.id, u.name, u.email, u.avatar_url, u.is_verified, u.role, u.status, 
             COALESCE(sp.max_storage_gb, 5) AS max_storage_gb, 
             COALESCE(u.storage_used_bytes, 0) AS used_storage_bytes, 
             u.ban_reason, u.created_at, u.last_active_at
      FROM users u
      LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active' AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const usersResult = await db.query(query, [...params, limit, offset]);

    const onlineUserIds = getGlobalOnlineUsers();

    const users = usersResult.rows.map((u: any) => ({
      ...u,
      isOnline: onlineUserIds.includes(String(u.id))
    }));

    res.json({
      users,
      total: parseInt(countResult?.count || 0),
      page: Number(page),
      limit: Number(limit),
      onlineCount: onlineUserIds.length
    });
  } catch (err) {
    console.error('getAdminUsers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const banUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, status = 'banned' } = req.body;
    const actorId = (req as any).user.id;
    const actorRole = (req as any).user?.role;

    // [SECURITY FIX] Whitelist enum cho status — ngăn hacker gửi status='admin' để leo thang đặc quyền
    const ALLOWED_STATUSES = ['banned', 'suspended', 'active'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${ALLOWED_STATUSES.join(', ')}` });
    }

    // [FIX Vấn đề 10] Lấy role của Target để kiểm tra thứ bậc
    const target = await db.getOne('SELECT role FROM users WHERE id = $1', [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Hierarchy Assertion: Actor phải có roleWeight cao hơn Target
    const check = assertCanActOn(actorId, actorRole, id, target.role);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    await db.execute(
      `UPDATE users SET status = $1, ban_reason = $2 WHERE id = $3`,
      [status, reason || '', id]
    );

    // [FIX Vấn đề 18] hashIp() — GDPR compliance
    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, target_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, id, status === 'banned' ? 'BAN_USER' : 'UPDATE_STATUS', reason || 'Khóa tài khoản', hashIp(req.ip)]
    );

    if (status === 'banned' || status === 'suspended') {
      forceLogoutUser(String(id), reason || 'Tài khoản của bạn đã bị khóa bởi ban quản trị.');
    }

    // [FIX 2] Emit sự kiện thấy đổi status của user lên admin-dashboard room
    if (globalIo) {
      globalIo.to('admin-dashboard').emit('admin:user-banned', {
        userId: id,
        status,
        reason: reason || ''
      });
    }

    // [FIX 3] Xóa metrics cache vì pro/active user count có thể thay đổi
    await invalidateMetricsCache();

    res.json({ success: true, message: 'Cập nhật trạng thái người dùng thành công' });
  } catch (err) {
    console.error('banUser error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};



// ═══════════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT (Admin)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/teams ────────────────────────────────────────────────────
// Admin xem TẤT CẢ team (kể cả bị ban/xóa). Filter theo status: active | deleted
export const getAdminTeams = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: any[] = [];

    // Chỉ lấy Team thực sự (bỏ Personal Workspace có max_members=1)
    let where = 'WHERE t.max_members > 1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (t.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    // Filter theo trạng thái: deleted = bị ban/xóa, active = đang hoạt động
    if (status === 'deleted') {
      where += ` AND t.is_deleted = true`;
    } else if (status === 'active') {
      where += ` AND t.is_deleted = false`;
    }
    // Không filter (mặc định) → hiển thị tất cả

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT
        t.id, t.name, t.avatar_url, t.max_members,
        t.is_deleted, t.deleted_at,
        t.used_storage_bytes, 
        COALESCE(sp.max_storage_gb, 5) AS max_storage_gb, 
        t.created_at,
        t.owner_id, u.name AS owner_name, u.email AS owner_email,
        (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) AS member_count,
        (SELECT COUNT(*)::int FROM designs WHERE team_id = t.id AND is_deleted = false) AS design_count,
        us.status AS sub_status, us.current_period_end,
        CASE WHEN sp.max_team_members > 1 THEN sp.name ELSE NULL END AS plan_name,
        CASE WHEN sp.max_team_members > 1 THEN sp.slug ELSE NULL END AS plan_slug
      FROM teams t
      JOIN users u ON u.id = t.owner_id
      LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
        AND (us.cancel_at IS NULL OR us.cancel_at > NOW())
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      ${where}
      ORDER BY t.is_deleted ASC, t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countRes = await db.getOne(
      `SELECT COUNT(*)::int AS total FROM teams t JOIN users u ON u.id = t.owner_id ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({ teams: result?.rows || [], total: countRes?.total || 0, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('getAdminTeams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/admin/teams/:id ─────────────────────────────────────────────────
// Admin có thể xem chi tiết cả team đang bị is_deleted (không thêm WHERE is_deleted=false)
export const getAdminTeamDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const team = await db.getOne(`
      SELECT t.*, u.name AS owner_name, u.email AS owner_email,
        us.status AS sub_status, us.current_period_end,
        CASE WHEN sp.max_team_members > 1 THEN sp.name ELSE NULL END AS plan_name,
        CASE WHEN sp.max_team_members > 1 THEN sp.max_storage_gb ELSE NULL END AS plan_storage_gb,
        (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) AS member_count,
        (SELECT COUNT(*)::int FROM designs WHERE team_id = t.id AND is_deleted = false) AS design_count
      FROM teams t
      JOIN users u ON u.id = t.owner_id
      LEFT JOIN user_subscriptions us ON us.user_id = t.owner_id AND us.status = 'active'
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE t.id = $1
    `, [id]);
    if (!team) return res.status(404).json({ error: 'Team không tồn tại' });

    team.max_storage_gb = Number(team.plan_storage_gb) || 5;

    const members = await db.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, tm.role, tm.created_at AS joined_at
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
      LIMIT 50
    `, [id]);

    res.json({ team, members: members.rows });
  } catch (err) {
    console.error('getAdminTeamDetail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/admin/teams/:id/ban ────────────────────────────────────────────
// Dùng is_deleted để "ban" (vô hiệu hóa) team thay vì thêm cột mới.
// is_deleted = true  → team bị khóa, thành viên không thể truy cập
// is_deleted = false → mở khóa, team hoạt động trở lại
export const banTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { banned, reason } = req.body;  // banned: boolean
    const adminId = (req as any).user.id;

    // Lấy bất kỳ team nào (kể cả đang bị xóa) để admin có thể restore
    const team = await db.getOne('SELECT id, name, is_deleted FROM teams WHERE id = $1', [id]);
    if (!team) return res.status(404).json({ error: 'Team không tồn tại' });

    if (banned) {
      // Khóa team: set is_deleted = true + ghi thời điểm + lý do vào deleted_at
      await db.execute(
        `UPDATE teams SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id]
      );
      if (globalIo) {
        const members = await db.query('SELECT user_id FROM team_members WHERE team_id = $1', [id]);
        members.rows.forEach(member => {
          globalIo!.to(`user-${member.user_id}`).emit('team:banned', {
            teamId: id,
            message: `Team "${team.name}" của bạn đã bị khóa bởi Quản trị viên. Lý do: ${reason || 'Vi phạm chính sách'}`
          });
        });
      }
    } else {
      // Mở khóa: restore lại team
      await db.execute(
        `UPDATE teams SET is_deleted = false, deleted_at = NULL, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      if (globalIo) {
        const members = await db.query('SELECT user_id FROM team_members WHERE team_id = $1', [id]);
        members.rows.forEach(member => {
          globalIo!.to(`user-${member.user_id}`).emit('team:unbanned', {
            teamId: id,
            message: `Team "${team.name}" của bạn đã được Quản trị viên khôi phục!`
          });
        });
      }
    }

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, banned ? 'BAN_TEAM' : 'UNBAN_TEAM',
        `${banned ? 'Khóa (is_deleted=true)' : 'Mở khóa (is_deleted=false)'} team "${team.name}" (id=${id}). Lý do: ${reason || 'Không rõ'}`,
        hashIp(req.ip)]
    );

    res.json({ success: true, message: banned ? 'Đã khóa team' : 'Đã mở khóa và khôi phục team' });
  } catch (err) {
    console.error('banTeam error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

