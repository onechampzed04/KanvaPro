// backend/src/services/planService.ts
import db from '../config/db';

export const subscriptionService = {
  // Lấy tất cả gói (Dành cho Admin - hiện cả gói bị ẩn)
  getAllPlans: async () => {
    const result = await db.query('SELECT * FROM subscription_plans ORDER BY monthly_price ASC');
    return result.rows;
  },

  // Lấy danh sách gói cước đang bán (Public)
  getActivePlans: async () => {
    const result = await db.query('SELECT * FROM subscription_plans WHERE is_active = true ORDER BY monthly_price ASC');
    return result.rows;
  },

  // Lấy 1 gói theo ID
  getPlanById: async (id: string) => {
    const result = await db.query('SELECT * FROM subscription_plans WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Tạo gói mới
  createPlan: async (data: any) => {
    const { name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active } = data;
    
    // Ép features về chuỗi JSON để lưu vào cột JSONB
    const featuresJson = JSON.stringify(features || []);

    const result = await db.query(
      `INSERT INTO subscription_plans 
        (name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members || null, featuresJson, is_active !== false]
    );
    return result.rows[0];
  },

  // [FIX Vấn đề 6] DEPRECATED — Không dùng trực tiếp hàm này.
  // adminController.subscriptionPlanController.update() có guard chặn sửa monthly_price
  // để bảo toàn logic cấn trừ cho user cũ. Hàm này KHÔNG có guard đó.
  //
  // Nếu bạn cần cập nhật gói cước:
  //   - Thông tin không liên quan tiền (name, features...): dùng PUT /api/admin/plans/:id
  //   - Giá mới: tạo gói mới + ẩn gói cũ (POST /api/admin/plans + toggle is_active)
  //
  // Hàm này được giữ lại để tránh lỗi import, nhưng sẽ throw nếu ai gọi trong production.
  updatePlan: async (_id: string, _data: any): Promise<never> => {
    throw new Error(
      '[DEPRECATED] subscriptionService.updatePlan() đã bị vô hiệu hóa. ' +
      'Dùng PUT /api/admin/plans/:id (adminController) để cập nhật gói cước. ' +
      'Xem comment trong subscriptionService.ts để biết lý do.'
    );
  },

  // Xóa (Ẩn) gói cước - Soft Delete
  deletePlan: async (id: string) => {
    const result = await db.query(
      `UPDATE subscription_plans SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
};