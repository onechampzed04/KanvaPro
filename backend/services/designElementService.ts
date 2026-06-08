// backend/src/services/designElementService.ts
import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';

export const designElementService = {
    // Lấy danh sách elements theo pageId - chỉ lấy chưa bị soft-delete
    getElementsByPageId: async (pageId: string) => {
        const result = await db.query(
            `SELECT * FROM design_elements 
             WHERE page_id = $1 AND is_deleted = false 
             ORDER BY z_index ASC`, 
            [pageId]
        );
        return result.rows.map((el: any) => {
            const props = typeof el.properties === 'string' ? JSON.parse(el.properties) : el.properties;
            return { id: el.id, type: el.element_type, ...props };
        });
    },

    // ─── BULK UPSERT với UNNEST: 1 câu SQL duy nhất thay vì vòng lặp for ─────
    // Soft Delete: không dùng DELETE vật lý — đánh dấu is_deleted = true
    syncElementsForPage: async (client: any, pageId: string, elements: any[]) => {
        if (!elements || !Array.isArray(elements)) return;

        const incomingIds = elements.map(el => el.id).filter(Boolean);

        // 1. SOFT DELETE: đánh dấu các element không còn tồn tại trên UI
        if (incomingIds.length > 0) {
            await client.query(
                `UPDATE design_elements 
                 SET is_deleted = true, deleted_at = NOW() 
                 WHERE page_id = $1 
                   AND NOT (id = ANY($2::uuid[]))
                   AND is_deleted = false`,
                [pageId, incomingIds]
            );
        } else {
            await client.query(
                `UPDATE design_elements 
                 SET is_deleted = true, deleted_at = NOW() 
                 WHERE page_id = $1 AND is_deleted = false`,
                [pageId]
            );
            return; // Không có element nào để upsert
        }

        // 2. Chuẩn bị dữ liệu dưới dạng các mảng song song
        // [FIX]: Deduplicate theo ID trước khi xây dựng mảng UNNEST.
        // Khi Undo + OT cùng khôi phục một element → mảng có thể có ID trùng lặp.
        // PostgreSQL ON CONFLICT DO UPDATE không thể xử lý cùng 1 row 2 lần trong 1 câu lệnh.
        // Giữ lại phần tử CUỐI CÙNG (index cao nhất) nếu trùng ID.
        const seenIds = new Map<string, any>();
        for (const el of elements) {
            if (el.id) seenIds.set(el.id, el);
        }
        const deduplicatedElements = Array.from(seenIds.values());

        const ids: string[]       = [];
        const pageIds: string[]   = [];
        const elemTypes: string[] = [];
        const zIndices: number[]  = [];
        const propsList: string[] = []; // ← text[], sau đó cast sang jsonb trong SQL
        const lockedList: boolean[]  = [];
        const visibleList: boolean[] = [];

        for (let i = 0; i < deduplicatedElements.length; i++) {
            const el = deduplicatedElements[i];
            ids.push(el.id || uuidv4());
            pageIds.push(pageId);
            elemTypes.push(el.element_type || el.type || 'shape');
            zIndices.push(typeof el.z_index === 'number' ? el.z_index : i);

            // Serialize properties → chuỗi JSON an toàn
            const rawProps = el.properties ?? el;
            propsList.push(
                typeof rawProps === 'string' ? rawProps : JSON.stringify(rawProps)
            );

            lockedList.push(el.locked === true);
            visibleList.push(el.visible !== false);
        }

        // 3. BULK INSERT/UPSERT với 1 câu SQL duy nhất
        // - $3::text[]          : element_type nhận dưới dạng text
        // - $5::text[], t.properties::jsonb : cast TEXT → jsonb
        await client.query(`
            INSERT INTO design_elements (id, page_id, element_type, z_index, properties, locked, visible, is_deleted)
            SELECT
                t.id,
                t.page_id,
                t.elem_type::element_type,
                t.z_index,
                t.properties::jsonb,
                t.locked,
                t.visible,
                false  -- is_deleted = false khi upsert
            FROM UNNEST(
                $1::uuid[],
                $2::uuid[],
                $3::text[],
                $4::int[],
                $5::text[],
                $6::boolean[],
                $7::boolean[]
            ) AS t(id, page_id, elem_type, z_index, properties, locked, visible)
            ON CONFLICT (id) DO UPDATE SET
                z_index    = EXCLUDED.z_index,
                properties = EXCLUDED.properties,
                locked     = EXCLUDED.locked,
                visible    = EXCLUDED.visible,
                is_deleted = false,
                deleted_at = NULL,
                updated_at = NOW()
        `, [ids, pageIds, elemTypes, zIndices, propsList, lockedList, visibleList]);
    }
};