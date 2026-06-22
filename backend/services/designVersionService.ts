// backend/src/services/designVersionService.ts
import db from '../config/db';

export const designVersionService = {
    // 1. CHỤP ẢNH RAW (Lấy thẳng từ DB, không qua chế biến)
    createVersionSnapshot: async (designId: string, userId: string) => {
        const client = await db.connect();
        try {
            // Lấy toàn bộ Pages nguyên gốc từ DB
            const pagesRes = await client.query(`SELECT * FROM design_pages WHERE design_id = $1`, [designId]);
            
            // Lấy toàn bộ Elements nguyên gốc từ DB
            const elementsRes = await client.query(`
                SELECT de.* FROM design_elements de
                JOIN design_pages dp ON de.page_id = dp.id
                WHERE dp.design_id = $1
            `, [designId]);

            const snapshot = {
                pages: pagesRes.rows,
                elements: elementsRes.rows
            };

            const versionRes = await client.query(
                `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM design_versions WHERE design_id = $1`,
                [designId]
            );
            const nextVersion = versionRes.rows[0].next_version;

            await client.query(
                `INSERT INTO design_versions (design_id, version_number, snapshot, created_by)
                 VALUES ($1, $2, $3, $4)`,
                [designId, nextVersion, JSON.stringify(snapshot), userId]
            );

            return nextVersion;
        } finally {
            client.release();
        }
    },

    // 2. Lấy danh sách lịch sử
    getVersionHistory: async (designId: string) => {
        const result = await db.query(`
            SELECT dv.id, dv.version_number, dv.created_at, u.name as creator_name
            FROM design_versions dv
            LEFT JOIN users u ON dv.created_by = u.id
            WHERE dv.design_id = $1
            ORDER BY dv.created_at DESC
        `, [designId]);
        return result.rows;
    },

    // 2.5 Lấy chi tiết một snapshot (dành cho Preview)
    getVersionSnapshot: async (designId: string, versionId: string) => {
        const result = await db.query(`
            SELECT snapshot
            FROM design_versions
            WHERE id = $1 AND design_id = $2
        `, [versionId, designId]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return result.rows[0].snapshot;
    },

    // 3. KHÔI PHỤC BẰNG CÁCH WIPE & RESTORE
    restoreVersion: async (designId: string, versionId: string, userId: string) => {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // 1. Lấy snapshot
            const result = await client.query(`SELECT snapshot FROM design_versions WHERE id = $1 AND design_id = $2`, [versionId, designId]);
            if (result.rows.length === 0) throw new Error("Version không tồn tại");

            const snapshot = result.rows[0].snapshot;
            
            // Fallback: Chống lỗi nếu người dùng khôi phục cái snapshot cũ đã bị lưu sai định dạng trước đó
            let pagesToRestore = snapshot.pages || [];
            let elementsToRestore = snapshot.elements || [];

            if (elementsToRestore.length === 0 && pagesToRestore.length > 0 && pagesToRestore[0].elements) {
                 pagesToRestore.forEach((p: any) => {
                     if (p.elements && Array.isArray(p.elements)) {
                         elementsToRestore.push(...p.elements.map((el: any) => ({
                             id: el.id, page_id: p.id, element_type: el.element_type || el.type || 'text',
                             z_index: el.z_index || 0, locked: el.locked || false, visible: el.visible !== false,
                             properties: el.properties || el // Gói lại properties nếu bị ép phẳng
                         })));
                     }
                 });
            }

            // 2. DỌN SẠCH DỮ LIỆU HIỆN TẠI (Wipe out)
            // Phải xóa theo đúng thứ tự để không bị kẹt khóa ngoại (Foreign Key)
            await client.query(`DELETE FROM design_comments WHERE design_id = $1`, [designId]); 
            await client.query(`DELETE FROM design_elements WHERE page_id IN (SELECT id FROM design_pages WHERE design_id = $1)`, [designId]);
            await client.query(`DELETE FROM design_pages WHERE design_id = $1`, [designId]);

            // 3. ĐỔ DỮ LIỆU TỪ SNAPSHOT VÀO LẠI (Insert Raw)
            for (const page of pagesToRestore) {
                await client.query(`
                    INSERT INTO design_pages (
                        id, design_id, page_order, title, background_color, 
                        background_asset_id, duration, transition, thumbnail, 
                        type, width, height, content
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [
                    page.id, designId, page.page_order || 0, page.title || null, page.background_color || null,
                    page.background_asset_id || null, page.duration || null, 
                    typeof page.transition === 'object' && page.transition !== null ? JSON.stringify(page.transition) : page.transition, 
                    page.thumbnail || null, page.type || 'canvas', page.width || null, page.height || null, 
                    typeof page.content === 'object' && page.content !== null ? JSON.stringify(page.content) : page.content
                ]);
            }

            if (elementsToRestore.length > 0) {
                for (const el of elementsToRestore) {
                    await client.query(`
                        INSERT INTO design_elements (
                            id, page_id, element_type, z_index, locked, visible, properties
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        el.id, el.page_id, el.element_type, el.z_index || 0, el.locked || false, el.visible !== false,
                        typeof el.properties === 'object' && el.properties !== null ? JSON.stringify(el.properties) : el.properties
                    ]);
                }
            }

            // Cập nhật lại thời gian last_edited_at
            await client.query(`UPDATE designs SET last_edited_at = NOW() WHERE id = $1`, [designId]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
};