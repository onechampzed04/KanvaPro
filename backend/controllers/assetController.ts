import { Request, Response } from 'express';
import db from '../config/db';
import { Asset } from '../models/Asset';
import { AssetType } from '../models/enums';
import { assetService } from '../services/assetService';

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