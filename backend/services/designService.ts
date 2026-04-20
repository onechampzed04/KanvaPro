import { get } from 'http';
import db from '../config/db';
import { updateDesign } from '../controllers/designController';
import { Design } from '../models/Design';
import { v4 as uuidv4 } from 'uuid';

export const designService = {
    // Hàm tạo design mới
    createDesign: async (design: Partial<Design>): Promise<string> => {
        const { id, user_id, title, width, height, design_type } = design; 
        await db.execute(`
            INSERT INTO designs (id, user_id, title, width, height, design_type, is_public)
            VALUES ($1, $2, $3, $4, $5, $6, false)
        `, [id, user_id, title || 'Untitled Design', width || 1920, height || 1080, design_type || 'presentation']);
        return id!;
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

            await client.query(`
                UPDATE designs 
                SET title = $1, thumbnail_url = $2, last_edited_at = NOW(), updated_at = NOW() 
                WHERE id = $3 AND user_id = $4
            `, [designData.title, designData.thumbnail_url || null, designId, userId]);

            if (pages && Array.isArray(pages)) {
                for (const page of pages) {
                    const pageId = page.id || uuidv4();
                    
                    await client.query(`
                        INSERT INTO design_pages (id, design_id, page_order, background_color, background_asset_id, thumbnail)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO UPDATE SET 
                            page_order = EXCLUDED.page_order,
                            background_color = EXCLUDED.background_color,
                            background_asset_id = EXCLUDED.background_asset_id,
                            thumbnail = EXCLUDED.thumbnail
                    `, [
                        pageId, 
                        designId, 
                        page.page_order || 0, 
                        page.background_color || null, 
                        page.background_asset_id || null, 
                        page.thumbnail || null // <--- THÊM DÒNG NÀY ĐỂ LƯU ẢNH
                    ]);

                    if (page.elements && Array.isArray(page.elements)) {
                        const incomingIds = page.elements.map((el: any) => el.id).filter(Boolean);
                        
                        if (incomingIds.length > 0) {
                            const placeholders = incomingIds.map((_: string, i: number) => `$${i + 2}`).join(',');
                            await client.query(`DELETE FROM design_elements WHERE page_id = $1 AND id NOT IN (${placeholders})`, [pageId, ...incomingIds]);
                        } else {
                            await client.query(`DELETE FROM design_elements WHERE page_id = $1`, [pageId]);
                        }

                        for (const el of page.elements) {
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
                                el.element_type, 
                                el.z_index || 0, 
                                JSON.stringify(el.properties), 
                                el.locked || false,
                                el.visible !== false
                            ]);
                        }
                    }
                }
            }

            await client.query('COMMIT'); // Lưu toàn bộ thay đổi vào DB
        } catch (error) {
            await client.query('ROLLBACK'); // Nếu có bất kỳ lỗi gì ở trên, hoàn tác lại toàn bộ
            throw error; // Ném lỗi lên Controller để xử lý response
        } finally {
            client.release(); // Quan trọng: Trả lại connection cho Pool
        }
    },

    getUserDesigns: async (userId: string): Promise<Design[]> => {
        const result = await db.query(`
            SELECT * FROM designs 
            WHERE user_id = $1 AND is_deleted = false
            ORDER BY updated_at DESC
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