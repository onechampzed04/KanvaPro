// backend/src/services/planService.ts
import db from '../config/db';

export const subscriptionService = {
  // Lấy tất cả gói (Dành cho Admin - hiện cả gói bị ẩn)
  getAllPlans: async () => {
    const result = await db.query('SELECT * FROM subscription_plans ORDER BY monthly_price ASC');
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

  // Cập nhật gói
  updatePlan: async (id: string, data: any) => {
    const { name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members, features, is_active } = data;
    const featuresJson = JSON.stringify(features || []);

    const result = await db.query(
      `UPDATE subscription_plans
       SET name = $1, slug = $2, monthly_price = $3, yearly_price = $4, 
           max_storage_gb = $5, max_team_members = $6, features = $7, is_active = $8
       WHERE id = $9 
       RETURNING *`,
      [name, slug, monthly_price, yearly_price, max_storage_gb, max_team_members || null, featuresJson, is_active, id]
    );
    return result.rows[0];
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