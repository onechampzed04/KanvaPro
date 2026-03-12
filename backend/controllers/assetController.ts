import { Request, Response } from 'express';
import db from '../config/db';
import { Asset } from '../models/Asset';

export const searchAssets = async (req: Request, res: Response) => {
  const { q, type, category } = req.query;

  try {
    let sql = 'SELECT * FROM assets WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1; // Bộ đếm để tạo $1, $2, $3...

    if (q) {
      // PostgreSQL: ILIKE để search không phân biệt hoa thường
      // Dùng $1, $2 thay cho ?
      sql += ` AND (name ILIKE $${paramIndex} OR $${paramIndex + 1} = ANY(tags))`;
      params.push(`%${q}%`, q);
      paramIndex += 2;
    }

    if (type) {
      sql += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (category) {
      sql += ` AND category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    // Chú ý: PostgreSQL trả về object, chúng ta lấy .rows
    const result = await db.query(sql, params);
    const assets: Asset[] = result.rows;

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
    const result = await db.query('SELECT * FROM asset_categories ORDER BY name ASC');
    res.json({ categories: result.rows });
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