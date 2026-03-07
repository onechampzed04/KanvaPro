import { Request, Response } from 'express';
import db from '../config/db';
import { Asset, AssetType } from '../models/Asset';

export const searchAssets = async (req: Request, res: Response) => {
  const { q, type, category } = req.query;

  try {
    let sql = 'SELECT * FROM assets WHERE 1=1';
    const params: any[] = [];

    if (q) {
      sql += ' AND (name ILIKE ? OR ? = ANY(tags))';
      params.push(`%${q}%`, q);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (category) {
      sql += ' AND category_id = ?';
      params.push(category);
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const assets: Asset[] = await db.query(sql, params);

    // If no assets found in DB, return some mock data for preview
    if (assets.length === 0 && !q && !type) {
      const mockAssets = [
        { id: '1', name: 'Nature', type: 'image', url: 'https://picsum.photos/seed/nature/800/600', is_premium: false },
        { id: '2', name: 'Business', type: 'image', url: 'https://picsum.photos/seed/business/800/600', is_premium: true },
        { id: '3', name: 'Tech', type: 'image', url: 'https://picsum.photos/seed/tech/800/600', is_premium: false },
      ];
      return res.json({ assets: mockAssets });
    }

    res.json({ assets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to search assets' });
  }
};

export const getAssetCategories = async (req: Request, res: Response) => {
  try {
    const categories = await db.query('SELECT * FROM asset_categories ORDER BY name ASC');
    res.json({ categories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};
