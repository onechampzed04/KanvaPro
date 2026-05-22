import { Request, Response } from 'express';
import db from '../config/db';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { paymentService } from '../services/paymentService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Multer config ──────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../sticker_upload/assets');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
export const adminUpload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── GET /api/admin/metrics ─────────────────────────────────────────────────
export const getMetrics = async (_req: Request, res: Response) => {
  try {
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

    // Pro subscribers
    const proSubs = await db.getOne(`
      SELECT COUNT(DISTINCT user_id) AS pro_users
      FROM user_subscriptions WHERE status = 'active'
    `);

    // Revenue last 6 months
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

    // New users last 7 days
    const dailyUsers = await db.query(`
      SELECT
        to_char(created_at::date, 'DD/MM') AS day,
        COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY created_at::date
      ORDER BY created_at::date
    `);

    res.json({
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
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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
  if (!['user', 'admin', 'moderator'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  await db.execute('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  res.json({ success: true });
};

// ─── PUT /api/admin/users/:id/ban ───────────────────────────────────────────
export const toggleUserBan = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { banned } = req.body;
  // Sử dụng is_verified = false làm flag "banned" (hoặc thêm cột is_banned nếu muốn)
  await db.execute('UPDATE users SET is_verified = $1 WHERE id = $2', [!banned, id]);
  res.json({ success: true });
};

// ─── GET /api/admin/assets ───────────────────────────────────────────────────
export const getAdminAssets = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 30, type = '', search = '', is_premium = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE uploaded_by IS NULL';
    const params: any[] = [];

    if (type) {
      params.push(type);
      where += ` AND type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR $${params.length} = ANY(tags::text[]))`;
    }
    if (is_premium !== '') {
      params.push(is_premium === 'true');
      where += ` AND is_premium = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await db.query(`
      SELECT a.*, ac.name AS category_name
      FROM assets a
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await db.getOne(`SELECT COUNT(*) FROM assets ${where}`,
      params.slice(0, params.length - 2));

    const categories = await db.query('SELECT * FROM asset_categories ORDER BY name');

    res.json({
      assets: result?.rows || [],
      total: parseInt(countResult?.count || 0),
      categories: categories?.rows || [],
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

    const { type = 'image', category_id, tags, is_premium = 'false' } = req.body;
    const tagArray = tags ? tags.split(',').map((t: string) => t.trim()) : [];
    const baseUrl = `http://localhost:3000/assets`;

    const inserted: any[] = [];
    for (const file of files) {
      const url = `${baseUrl}/${file.filename}`;
      const row = await db.getOne(`
        INSERT INTO assets (name, type, url, is_premium, category_id, tags, uploaded_by, file_size)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
        RETURNING *
      `, [
        file.originalname.split('.')[0],
        type,
        url,
        is_premium === 'true',
        category_id || null,
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
  const { id } = req.params;
  const { is_premium, tags, category_id, name } = req.body;
  await db.execute(`
    UPDATE assets SET
      is_premium = COALESCE($1, is_premium),
      tags = COALESCE($2, tags),
      category_id = COALESCE($3, category_id),
      name = COALESCE($4, name)
    WHERE id = $5
  `, [is_premium, tags ? tags : null, category_id || null, name || null, id]);
  res.json({ success: true });
};

// ─── DELETE /api/admin/assets/:id ───────────────────────────────────────────
export const deleteAsset = async (req: Request, res: Response) => {
  const { id } = req.params;
  await db.execute('DELETE FROM assets WHERE id = $1', [id]);
  res.json({ success: true });
};

// ─── GET /api/admin/designs ─────────────────────────────────────────────────
export const getDesigns = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: any[] = search ? [`%${search}%`, Number(limit), offset] : [Number(limit), offset];
    const where = search ? `AND (d.title ILIKE $1 OR u.name ILIKE $1)` : '';

    const result = await db.query(`
      SELECT d.*, u.name AS user_name, u.email AS user_email,
        EXISTS(SELECT 1 FROM public_templates pt WHERE pt.design_id = d.id) AS is_published
      FROM designs d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.is_deleted = false ${where}
      ORDER BY d.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ designs: result?.rows || [] });
  } catch (err) {
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
    if (!user_id || !plan_id) return res.status(400).json({ error: 'user_id and plan_id required' });

    const periodDays = Number(days) || 30;
    const start = new Date();
    const end = new Date(start.getTime() + periodDays * 24 * 60 * 60 * 1000);

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
    await db.execute(
      `UPDATE user_subscriptions SET status = 'canceled', current_period_end = NOW(), cancel_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
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
      const { name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active } = req.body;
      const row = await db.getOne(`
        INSERT INTO subscription_plans (name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      `, [name, slug, monthly_price, yearly_price, max_storage_gb || null, max_team_members || null, JSON.stringify(features || []), is_active !== false]);
      res.json({ success: true, plan: row });
    } catch (err) {
      console.error('createPlan error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, slug, description, monthly_price, features, stripe_product_id, is_active, max_storage_gb, max_team_members, yearly_price } = req.body;

      // Nếu frontend chỉ gửi is_active (trong handleToggleActive)
      // Object.keys(req.body) có thể dài hơn 1 do framework, ta check nếu req.body chỉ chứa is_active
      const isStatusToggleOnly = Object.keys(req.body).length === 1 && req.body.hasOwnProperty('is_active');

      if (isStatusToggleOnly) {
        await db.execute(`
          UPDATE subscription_plans SET is_active = $1 WHERE id = $2
        `, [is_active, id]);
        return res.json({ success: true });
      }

      // Còn nếu có gửi thông tin thay đổi gói -> Tạo Version mới (Soft Delete bản cũ)
      // Nghiệp vụ: Bảo vệ người dùng cũ đang gia hạn tự động không bị đổi giá/dung lượng đột ngột

      // 1. Vô hiệu hóa bản cũ
      await db.execute('UPDATE subscription_plans SET is_active = false WHERE id = $1', [id]);

      // 2. Insert bản mới với is_active = true
      const result = await db.query(`
        INSERT INTO subscription_plans (
          id, name, slug, description, monthly_price, yearly_price, features, stripe_product_id, max_storage_gb, max_team_members, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true
        ) RETURNING *
      `, [
        uuidv4(),
        name,
        slug,
        description || '',
        monthly_price,
        yearly_price || 0,
        JSON.stringify(features || []),
        stripe_product_id || null,
        max_storage_gb || 1,
        max_team_members || 1
      ]);

      res.json({ success: true, plan: result.rows[0] });
    } catch (err) {
      console.error('updatePlan error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Nghiệp vụ: Thay vì xóa cứng gây lỗi foreign key, tiến hành Soft-Delete (is_active = false)
      await db.execute('UPDATE subscription_plans SET is_active = false WHERE id = $1', [id]);
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
    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'FORCE_PAYMENT_SUCCESS', `Admin duyệt tay payment id=${id}`, req.ip]
    );

    res.json(result);
  } catch (err: any) {
    console.error('adminForceSuccessPayment error:', err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
};

// ─── POST /api/admin/subscriptions/:id/revoke ────────────────────────────────
// Ngắt dịch vụ ngay lập tức (khác terminate: có audit log rõ ràng hơn)
export const revokeSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;

    await db.execute(
      `UPDATE user_subscriptions
       SET status = 'canceled', current_period_end = NOW(), cancel_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'REVOKE_SUBSCRIPTION', `Admin thu hồi subscription id=${id} ngay lập tức`, req.ip]
    );

    res.json({ success: true, message: 'Đã ngắt dịch vụ ngay lập tức' });
  } catch (err: any) {
    console.error('revokeSubscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/admin/subscriptions/:id/cancel-renewal ────────────────────────
// Admin hủy gia hạn tự động (user vẫn dùng nốt đến cuối kỳ)
export const adminCancelRenewal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;

    const sub = await db.getOne(
      `SELECT id, cancel_at, current_period_end FROM user_subscriptions WHERE id = $1`,
      [id]
    );
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy subscription' });

    await db.execute(
      `UPDATE user_subscriptions
       SET cancel_at = current_period_end, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'CANCEL_RENEWAL', `Admin hủy gia hạn subscription id=${id}`, req.ip]
    );

    res.json({ success: true, message: 'Đã hủy gia hạn. User vẫn dùng đến cuối kỳ.' });
  } catch (err: any) {
    console.error('adminCancelRenewal error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── USER MANAGEMENT (Real-time) ──────────────────────────────────────────

import { forceLogoutUser, getGlobalOnlineUsers } from '../sockets/collaboration';

export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', role = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await db.getOne(countQuery, params);

    const query = `
      SELECT id, name, email, avatar_url, is_verified, role, status, max_storage_gb, used_storage_bytes, ban_reason, created_at, last_active_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
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
    const adminId = (req as any).user.id;

    if (String(id) === String(adminId)) {
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản của chính mình!' });
    }

    await db.execute(
      `UPDATE users SET status = $1, ban_reason = $2 WHERE id = $3`,
      [status, reason || '', id]
    );

    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, target_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, id, status === 'banned' ? 'BAN_USER' : 'UPDATE_STATUS', reason || 'Khóa tài khoản', req.ip]
    );

    if (status === 'banned' || status === 'suspended') {
      forceLogoutUser(String(id), reason || 'Tài khoản của bạn đã bị khóa bởi ban quản trị.');
    }

    res.json({ success: true, message: 'Cập nhật trạng thái người dùng thành công' });
  } catch (err) {
    console.error('banUser error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserQuota = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, max_storage_gb } = req.body;
    const adminId = (req as any).user.id;

    if (String(id) === String(adminId) && role !== 'super_admin') {
      return res.status(400).json({ error: 'Không thể tự hạ cấp quyền của chính mình!' });
    }

    // 1. Lấy role hiện tại để ghi audit log rõ ràng hơn
    const currentUser = await db.getOne(`SELECT role FROM users WHERE id = $1`, [id]);
    const currentRole = currentUser?.role;

    // 2. Cập nhật role + quota
    // Lưu ý: role ở đây chỉ phân quyền truy cập hệ thống (user/admin/moderator)
    // KHÔNG liên quan đến gói subscription (Free/Pro). Quyền Pro do user_subscriptions quyết định.
    await db.execute(
      `UPDATE users SET role = $1, max_storage_gb = $2 WHERE id = $3`,
      [role, max_storage_gb, id]
    );

    // 3. Ghi audit log
    await db.execute(
      `INSERT INTO admin_audit_logs (actor_id, target_id, action_type, description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, id, 'UPDATE_QUOTA_ROLE', `Cập nhật role: ${currentRole} → ${role}, dung lượng: ${max_storage_gb}GB`, req.ip]
    );

    res.json({ success: true, message: 'Cập nhật thông tin thành công' });
  } catch (err) {
    console.error('updateUserQuota error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


