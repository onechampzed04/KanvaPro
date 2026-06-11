// backend/src/services/designPageService.ts
import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { designElementService } from './designElementService';

export const designPageService = {
    // Lấy danh sách pages (kèm elements) - chỉ lấy những page chưa bị soft-delete
    getPagesWithElementsByDesignId: async (designId: string) => {
        const pagesResult = await db.query(
            `SELECT * FROM design_pages WHERE design_id = $1 AND is_deleted = false ORDER BY page_order ASC`,
            [designId]
        );
        
        const pages = await Promise.all(pagesResult.rows.map(async (page: any) => {
            const elements = await designElementService.getElementsByPageId(page.id);
            return { ...page, elements };
        }));
        return pages;
    },

    // === FIX #4: Lấy danh sách pages (KHÔNG join elements để load nhanh) ===
    getPagesByDesignIdWithoutElements: async (designId: string) => {
        const pagesResult = await db.query(
            `SELECT id, design_id, page_order, type, width, height, thumbnail, content, duration, transition, background_color 
             FROM design_pages 
             WHERE design_id = $1 AND is_deleted = false
             ORDER BY page_order ASC`, 
            [designId]
        );
        return pagesResult.rows;
    },

    // === FIX #4: Lấy elements của một page (Dùng cho lazy load) ===
    getElementsByPageId: async (pageId: string) => {
        return await designElementService.getElementsByPageId(pageId);
    },

    // Hàm nhận Transaction đồng bộ Pages — dùng SOFT DELETE thay vì DELETE cứng
    syncPagesForDesign: async (client: any, designId: string, pages: any[]) => {
        if (!pages || !Array.isArray(pages)) return;

        // 1. SOFT DELETE: đánh dấu is_deleted các trang không còn trong payload
        //    Không dùng DELETE vật lý để: (a) tránh Deadlock concurrent, (b) giữ lịch sử
        const incomingIds = pages.filter(p => p.id).map(p => p.id);
        if (incomingIds.length > 0) {
            await client.query(
                `UPDATE design_pages 
                 SET is_deleted = true, deleted_at = NOW() 
                 WHERE design_id = $1 
                   AND NOT (id = ANY($2::uuid[]))
                   AND is_deleted = false`,
                [designId, incomingIds]
            );
        } else {
            // Không có trang nào → soft delete tất cả
            await client.query(
                `UPDATE design_pages 
                 SET is_deleted = true, deleted_at = NOW() 
                 WHERE design_id = $1 AND is_deleted = false`,
                [designId]
            );
            return;
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
                INSERT INTO design_pages (id, design_id, page_order, type, width, height, duration, transition, thumbnail, content, background_color, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
                ON CONFLICT (id) DO UPDATE SET
                    page_order = EXCLUDED.page_order,
                    type = EXCLUDED.type,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    duration = EXCLUDED.duration,
                    transition = EXCLUDED.transition,
                    thumbnail = COALESCE(NULLIF(EXCLUDED.thumbnail, ''), design_pages.thumbnail),
                    content = EXCLUDED.content,
                    background_color = EXCLUDED.background_color,
                    is_deleted = false,
                    deleted_at = NULL,
                    updated_at = NOW()
                WHERE design_pages.design_id = EXCLUDED.design_id
            `, [
                pageId, 
                designId, 
                i,
                page.type, 
                page.width, 
                page.height, 
                page.duration || 5, 
                page.transition ? JSON.stringify(page.transition) : null,
                page.thumbnail,
                contentToStore,
                page.background_color || null
            ]);

            // 3. Ủy quyền lưu Elements cho ElementService
            // Chỉ sync nếu elements không phải undefined (lazy-load: undefined = chưa load)
            if (page.elements !== undefined) {
                await designElementService.syncElementsForPage(client, pageId, page.elements);
            }
        }
    }
};