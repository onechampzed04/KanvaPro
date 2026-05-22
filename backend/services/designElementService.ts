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

    // ─── BULK UPSERT với UNNEST: 1 câu SQL duy nhất thay vì vòng lặp for ──────
    // Fix: dùng $5::text[] thay vì $5::jsonb[] vì pg driver không auto-cast
    // JSON strings → jsonb[]. Thay vào đó cast t.properties::jsonb trong SELECT.
    syncElementsForPage: async (client: any, pageId: string, elements: any[]) => {
        if (!elements || !Array.isArray(elements)) return;

        const incomingIds = elements.map(el => el.id).filter(Boolean);

        // 1. Xóa các element không còn tồn tại trên UI
        if (incomingIds.length > 0) {
            await client.query(
                `DELETE FROM design_elements WHERE page_id = $1 AND id != ALL($2::uuid[])`,
                [pageId, incomingIds]
            );
        } else {
            await client.query(`DELETE FROM design_elements WHERE page_id = $1`, [pageId]);
            return; // Không có element nào để upsert
        }

        // 2. Chuẩn bị dữ liệu dưới dạng các mảng song song
        const ids: string[]       = [];
        const pageIds: string[]   = [];
        const elemTypes: string[] = [];
        const zIndices: number[]  = [];
        const propsList: string[] = []; // ← text[], sau đó cast sang jsonb trong SQL
        const lockedList: boolean[]  = [];
        const visibleList: boolean[] = [];

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
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
        // - t.element_type::element_type : cast TEXT → PostgreSQL ENUM 'element_type'
        // - $5::text[], t.properties::jsonb : cast TEXT → jsonb
        await client.query(`
            INSERT INTO design_elements (id, page_id, element_type, z_index, properties, locked, visible)
            SELECT
                t.id,
                t.page_id,
                t.elem_type,
                t.z_index,
                t.properties::jsonb,
                t.locked,
                t.visible
            FROM UNNEST(
                $1::uuid[],
                $2::uuid[],
                $3::element_type[],
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
                updated_at = NOW()
        `, [ids, pageIds, elemTypes, zIndices, propsList, lockedList, visibleList]);
    }
};