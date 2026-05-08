// backend/src/services/designPageService.ts
import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { designElementService } from './designElementService';

export const designPageService = {
    // Lấy danh sách pages (kèm elements)
    getPagesWithElementsByDesignId: async (designId: string) => {
        const pagesResult = await db.query(`SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order ASC`, [designId]);
        
        const pages = await Promise.all(pagesResult.rows.map(async (page: any) => {
            const elements = await designElementService.getElementsByPageId(page.id);
            return { ...page, elements };
        }));
        
        return pages;
    },

    // Hàm nhận Transaction đồng bộ Pages
    syncPagesForDesign: async (client: any, designId: string, pages: any[]) => {
        if (!pages || !Array.isArray(pages)) return;

        for (const page of pages) {
            const pageId = page.id || uuidv4();
            
            await client.query(`
                INSERT INTO design_pages (id, design_id, page_order, type, width, height, duration, transition, thumbnail)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    page_order = EXCLUDED.page_order,
                    type = EXCLUDED.type,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    duration = EXCLUDED.duration,
                    transition = EXCLUDED.transition,
                    thumbnail = EXCLUDED.thumbnail
            `, [
                page.id, 
                designId, 
                page.page_order, 
                page.type, 
                page.width, 
                page.height, 
                page.duration || 5, 
                page.transition ? JSON.stringify(page.transition) : null, // Chuyển object thành JSONB
                page.thumbnail
            ]);

            // 2. Ủy quyền lưu Elements cho ElementService
            await designElementService.syncElementsForPage(client, pageId, page.elements);
        }
    }
};