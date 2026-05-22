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
        const client = await db.connect(); 

        try {
            await client.query('BEGIN'); 

            const fields = [];
            const values = [];
            let index = 1;

            designUpdates.last_edited_at = new Date(); 
            
            for (const key in designUpdates) {
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
    
    saveFullDesign: async (designId: string, userId: string, designData: { title: string, thumbnail_url?: string }, pages: any[]) => {
        const client = await db.connect();

        try {
            await client.query('BEGIN'); 

            // 1. Cập nhật lớp vỏ Design + ghi last_modified_by để OCC theo dõi ai lưu cuối
            // Không cần check user_id vì middleware đã kiểm tra quyền
            await client.query(`
                UPDATE designs 
                SET title = $1, thumbnail_url = $2, last_edited_at = NOW(), updated_at = NOW(),
                    last_modified_by = $4
                WHERE id = $3
            `, [designData.title, designData.thumbnail_url || null, designId, userId]);

            // 2. Gọi Nhạc trưởng PageService vào làm việc
            await designPageService.syncPagesForDesign(client, designId, pages);

            await client.query('COMMIT'); 
        } catch (error) {
            await client.query('ROLLBACK'); 
            throw error; 
        } finally {
            client.release(); 
        }
    },

    getUserDesigns: async (userId: string): Promise<Design[]> => {
        const result = await db.query(`
            SELECT d.* 
            FROM designs d
            LEFT JOIN team_members tm ON d.team_id = tm.team_id
            WHERE (d.user_id = $1 OR tm.user_id = $1) AND d.is_deleted = false
            GROUP BY d.id
            ORDER BY d.updated_at DESC
        `, [userId]);
        return result.rows;
    },

    getSharedDesigns: async (userId: string): Promise<any[]> => {
        const result = await db.query(`
            SELECT d.*, ds.role as my_permission 
            FROM designs d 
            JOIN design_shares ds ON d.id = ds.design_id 
            WHERE ds.user_id = $1 AND d.user_id != $1 AND d.is_deleted = false 
            ORDER BY ds.created_at DESC
        `, [userId]);
        return result.rows;
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