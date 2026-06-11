import { get } from 'http';
import db from '../config/db';
import { updateDesign } from '../controllers/designController';
import { Design } from '../models/Design';
import { v4 as uuidv4 } from 'uuid';
import { designPageService } from './designPageService';

export const designService = {
    // Hàm tạo design mới
    // Hàm tạo design mới (Đã update theo DB chuẩn)
    createDesign: async (design: any): Promise<string> => {
        const { id, user_id, title, width, height, design_type, page_type, team_id } = design;
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            // 1. Tạo bản ghi trong bảng designs (Lớp vỏ) - Đã bỏ width/height
            await client.query(`
                INSERT INTO designs (id, user_id, title, design_type, is_public, team_id)
                VALUES ($1, $2, $3, $4, false, $5)
            `, [id, user_id, title || 'Untitled Design', design_type || 'presentation', team_id || null]);

            // 2. Tạo trang đầu tiên mặc định trong design_pages (Lớp ruột)
            const firstPageId = uuidv4();
            await client.query(`
                INSERT INTO design_pages (id, design_id, page_order, type, width, height)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [firstPageId, id, 0, page_type || 'canvas', width || 1920, height || 1080]);

            await client.query('COMMIT');
            return id!;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    updateDesign: async (id: string, designUpdates: Partial<Design>, elements: any[]) => {
        // [FIX Vấn đề 14] Whitelist các cột được phép UPDATE.
        // TRƯỚC: for (const key in designUpdates) → key không được validate
        //         → attacker có thể inject key tùy ý (user_id, is_deleted, team_id...).
        // SAU:   Chỉ các cột trong ALLOWED_DESIGN_FIELDS mới được cập nhật.
        const ALLOWED_DESIGN_FIELDS = new Set(['title', 'thumbnail_url', 'last_edited_at', 'is_public']);

        const client = await db.connect();

        try {
            await client.query('BEGIN');

            const fields = [];
            const values = [];
            let index = 1;

            designUpdates.last_edited_at = new Date();

            for (const key in designUpdates) {
                if (!ALLOWED_DESIGN_FIELDS.has(key)) {
                    console.warn(`[designService] updateDesign: key "${key}" không nằm trong whitelist, bỏ qua.`);
                    continue; // Silently skip — không expose lỗi để tránh leak schema info
                }
                fields.push(`${key} = $${index}`);
                values.push((designUpdates as any)[key]);
                index++;
            }
            if (fields.length > 0) {
                values.push(id);
                const sql = `UPDATE designs SET ${fields.join(', ')} WHERE id = $${index}`;
                await client.query(sql, values);
            }

            if (elements && Array.isArray(elements)) {
                for (const el of elements) {
                    await client.query(`
                        INSERT INTO design_elements (id, page_id, element_type, z_index, properties)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO UPDATE SET
                            z_index = EXCLUDED.z_index,
                            properties = EXCLUDED.properties,
                            updated_at = NOW()
                    `, [el.id, el.page_id, el.element_type, el.z_index || 0, JSON.stringify(el.properties)]);
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    saveFullDesign: async (
        designId: string,
        userId: string,
        designData: { title: string; thumbnail_url?: string },
        pages: any[],
        clientVersion?: number  // ← Strict OCC: client gửi version hiện tại
    ) => {
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            // ═══════════════════════════════════════════════════════════════════
            // [FIX Vấn đề 16] OPTIMISTIC LOCKING thay thế Pessimistic Lock.
            //
            // TRƯỚC: SELECT ... FOR UPDATE ngay sau BEGIN → khóa row ngay lập tức,
            //        giữ suốt quá trình syncPagesForDesign → nghẽn tuyến tính.
            //
            // SAU:   3 pha tách biệt:
            //   Pha 1 — NON-LOCKING READ: Đọc version hiện tại, KHÔNG khóa row.
            //           Nhiều request đồng thời vẫn đọc được, không ai bị block.
            //   Pha 2 — FREE PROCESSING: Chạy toàn bộ I/O nặng (syncPagesForDesign)
            //           mà không giữ bất kỳ lock nào trên bảng designs.
            //   Pha 3 — ATOMIC COMMIT: UPDATE ... WHERE version = $clientVersion.
            //           Nếu version đã bị thay đổi bởi request khác trong lúc xử lý
            //           → rowCount = 0 → ROLLBACK và báo VERSION_CONFLICT.
            //           Nếu không ai chen vào → rowCount = 1 → COMMIT an toàn.
            //
            // Lợi ích: Throughput cao hơn hàng chục lần dưới tải đồng thời,
            //          không còn hiện tượng "thread starvation" hay timeout queue.
            // ═══════════════════════════════════════════════════════════════════

            // ── Pha 1: Đọc version hiện tại (KHÔNG khóa row) ────────────────
            const snapshot = await client.query(
                `SELECT id, version FROM designs WHERE id = $1`,
                [designId]
            );

            if (!snapshot.rows[0]) {
                await client.query('ROLLBACK');
                throw new Error('Design not found');
            }

            const serverVersion: number = snapshot.rows[0].version ?? 1;

            // Kiểm tra version sớm để fail-fast trước khi tốn I/O đồng bộ trang
            if (clientVersion !== undefined && clientVersion !== null) {
                if (clientVersion < serverVersion) {
                    await client.query('ROLLBACK');
                    const conflict = new Error('VERSION_CONFLICT') as any;
                    conflict.code = 'VERSION_CONFLICT';
                    conflict.serverVersion = serverVersion;
                    throw conflict;
                }
            }

            // ── Pha 2: Đồng bộ trang (I/O nặng, KHÔNG giữ lock trên designs) ─
            await designPageService.syncPagesForDesign(client, designId, pages);

            // ── Pha 3: Atomic Commit với điều kiện version ───────────────────
            // UPDATE chỉ thành công nếu version vẫn bằng giá trị ta đọc ở Pha 1.
            // Nếu một request khác đã commit trong lúc ta xử lý Pha 2 → rowCount=0.
            const queryParams: any[] = [
                designData.title,
                designData.thumbnail_url || '',
                designId,
                userId,
            ];

            let updateSql = `
                UPDATE designs 
                SET title = $1, 
                    thumbnail_url = COALESCE(NULLIF($2, ''), thumbnail_url), 
                    last_edited_at = NOW(), 
                    updated_at    = NOW(),
                    last_modified_by = $4,
                    version       = version + 1
                WHERE id = $3
            `;

            if (clientVersion !== undefined && clientVersion !== null) {
                updateSql += ` AND version = $5`;
                queryParams.push(serverVersion);
            }

            const updateResult = await client.query(updateSql, queryParams);

            if (updateResult.rowCount === 0) {
                // Phát hiện concurrent write trong Pha 2 → Rollback muộn
                await client.query('ROLLBACK');
                const conflict = new Error('VERSION_CONFLICT') as any;
                conflict.code = 'VERSION_CONFLICT';
                conflict.serverVersion = serverVersion + 1; // Version thực tế đã tăng
                throw conflict;
            }

            await client.query('COMMIT');

            // Trả về version mới để client cập nhật local ref
            return { newVersion: serverVersion + 1 };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    getUserDesigns: async (userId: string, workspaceId?: string | null): Promise<Design[]> => {
        if (workspaceId && workspaceId !== 'personal') {
            const result = await db.query(`
                SELECT d.*, u.email as owner_email, u.avatar_url as owner_avatar
                FROM designs d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.user_id = $1 AND d.team_id = $2 AND d.is_deleted = false
                ORDER BY d.updated_at DESC
            `, [userId, workspaceId]);
            return result.rows;
        } else {
            const result = await db.query(`
                SELECT d.*, u.email as owner_email, u.avatar_url as owner_avatar
                FROM designs d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.user_id = $1 AND d.team_id IS NULL AND d.is_deleted = false
                ORDER BY d.updated_at DESC
            `, [userId]);
            return result.rows;
        }
    },

    getSharedDesigns: async (userId: string, workspaceId?: string | null): Promise<any[]> => {
        if (workspaceId && workspaceId !== 'personal') {
            const result = await db.query(`
                SELECT d.*, ds.role as my_permission, u.email as owner_email, u.avatar_url as owner_avatar
                FROM designs d 
                JOIN design_shares ds ON d.id = ds.design_id 
                LEFT JOIN users u ON d.user_id = u.id
                WHERE ds.user_id = $1 AND d.user_id != $1 AND d.team_id = $2 AND d.is_deleted = false 
                ORDER BY ds.created_at DESC
            `, [userId, workspaceId]);
            return result.rows;
        } else {
            const result = await db.query(`
                SELECT d.*, ds.role as my_permission, u.email as owner_email, u.avatar_url as owner_avatar
                FROM designs d 
                JOIN design_shares ds ON d.id = ds.design_id 
                LEFT JOIN users u ON d.user_id = u.id
                WHERE ds.user_id = $1 AND d.user_id != $1 AND d.team_id IS NULL AND d.is_deleted = false 
                ORDER BY ds.created_at DESC
            `, [userId]);
            return result.rows;
        }
    },

    getDesignById: async (id: string): Promise<Design | null> => {
        const result = await db.query(`SELECT * FROM designs WHERE id = $1`, [id]);
        return result.rows[0] || null;
    },

    getDesignPages: async (designId: string) => {
        const pagesResult = await db.query(`SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order ASC`, [designId]);
        return pagesResult.rows;
    }
}