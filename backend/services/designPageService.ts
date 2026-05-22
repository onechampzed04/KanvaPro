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

    // === FIX #4: Lấy danh sách pages (KHÔNG join elements để load nhanh) ===
    getPagesByDesignIdWithoutElements: async (designId: string) => {
        const pagesResult = await db.query(
            `SELECT id, design_id, page_order, type, width, height, thumbnail, content, duration, transition 
             FROM design_pages 
             WHERE design_id = $1 
             ORDER BY page_order ASC`, 
            [designId]
        );
        return pagesResult.rows;
    },

    // === FIX #4: Lấy elements của một page (Dùng cho lazy load) ===
    getElementsByPageId: async (pageId: string) => {
        return await designElementService.getElementsByPageId(pageId);
    },

    // Hàm nhận Transaction đồng bộ Pages
    syncPagesForDesign: async (client: any, designId: string, pages: any[]) => {
        if (!pages || !Array.isArray(pages)) return;

        // 1. Xóa các trang không còn tồn tại (bị xóa bởi client)
        const incomingIds = pages.filter(p => p.id).map(p => p.id);
        if (incomingIds.length > 0) {
            await client.query(
                `DELETE FROM design_pages WHERE design_id = $1 AND id != ALL($2::uuid[])`,
                [designId, incomingIds]
            );
        } else {
            // Nếu không có trang nào → xóa tất cả (trường hợp reset)
            await client.query(
                `DELETE FROM design_pages WHERE design_id = $1`,
                [designId]
            );
        }

        // 2. Upsert từng trang với page_order chuẩn hóa theo index
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pageId = page.id || uuidv4();
            
            // Chuẩn hóa content: HTML string → JSON string hợp lệ để lưu vào cột jsonb
            const contentToStore = page.content != null && page.content !== ''
                ? JSON.stringify(page.content)
                : null;

            await client.query(`
                INSERT INTO design_pages (id, design_id, page_order, type, width, height, duration, transition, thumbnail, content)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO UPDATE SET
                    page_order = EXCLUDED.page_order,
                    type = EXCLUDED.type,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    duration = EXCLUDED.duration,
                    transition = EXCLUDED.transition,
                    thumbnail = EXCLUDED.thumbnail,
                    content = EXCLUDED.content,
                    updated_at = NOW()
            `, [
                pageId, 
                designId, 
                i, // Dùng index trực tiếp để page_order luôn liên tục
                page.type, 
                page.width, 
                page.height, 
                page.duration || 5, 
                page.transition ? JSON.stringify(page.transition) : null,
                page.thumbnail,
                contentToStore
            ]);

            // 3. Ủy quyền lưu Elements cho ElementService
            await designElementService.syncElementsForPage(client, pageId, page.elements);
        }
    }
};

// helo chào các con vợ