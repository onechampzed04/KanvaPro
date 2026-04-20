import { get } from 'http';
import db from '../config/db';
import { Asset } from '../models/Asset';

export const assetService = {
    searchAssets: async (q?: string, type?: string, category?: string): Promise<Asset[]> => {
        let sql = 'SELECT * FROM assets WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
            
        if (q) {
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
        const result = await db.query(sql, params);
        return result.rows;
    },

    getAssetCategories: async (): Promise<{ id: string; name: string }[]> => {
        const result = await db.query('SELECT * FROM asset_categories ORDER BY name ASC');
        return result.rows;
    },

    getRecentStickers: async (userId: string): Promise<string[]> => {
        const query = `
            SELECT DISTINCT de.properties->>'src' as url    
            FROM design_elements de 
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1
                AND de.element_type = 'sticker' 
                AND de.properties->>'src' IS NOT NULL
                AND de.properties->>'src' != ''
            ORDER BY de.updated_at DESC
            LIMIT 20
        `;
        const result = await db.query(query, [userId]);
        return result.rows.map(row => row.url);
    }


}