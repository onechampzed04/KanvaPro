// backend/src/services/designElementService.ts
import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';

export const designElementService = {
    // Lấy danh sách elements theo pageId
    getElementsByPageId: async (pageId: string) => {
        const result = await db.query(
            `SELECT * FROM design_elements WHERE page_id = $1 ORDER BY z_index ASC`, 
            [pageId]
        );
        return result.rows.map((el: any) => {
            const props = typeof el.properties === 'string' ? JSON.parse(el.properties) : el.properties;
            return { id: el.id, type: el.element_type, ...props };
        });
    },

    // Hàm nhận Transaction (client) từ trên truyền xuống để đồng bộ elements
    syncElementsForPage: async (client: any, pageId: string, elements: any[]) => {
        if (!elements || !Array.isArray(elements)) return;

        const incomingIds = elements.map(el => el.id).filter(Boolean);
        
        // 1. Xóa các element không còn tồn tại trên UI
        if (incomingIds.length > 0) {
            const placeholders = incomingIds.map((_: string, i: number) => `$${i + 2}`).join(',');
            await client.query(`DELETE FROM design_elements WHERE page_id = $1 AND id NOT IN (${placeholders})`, [pageId, ...incomingIds]);
        } else {
            await client.query(`DELETE FROM design_elements WHERE page_id = $1`, [pageId]);
        }

        // 2. Upsert (Cập nhật hoặc Thêm mới) các element hiện có
        for (const el of elements) {
            await client.query(`
                INSERT INTO design_elements (id, page_id, element_type, z_index, properties, locked, visible)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET 
                    z_index = EXCLUDED.z_index,
                    properties = EXCLUDED.properties,
                    locked = EXCLUDED.locked,
                    visible = EXCLUDED.visible,
                    updated_at = NOW()
            `, [
                el.id || uuidv4(), 
                pageId, 
                el.element_type || el.type, 
                el.z_index || 0, 
                JSON.stringify(el.properties || el), // Chống lỗi nếu properties bị bọc sai
                el.locked || false,
                el.visible !== false
            ]);
        }
    }
};