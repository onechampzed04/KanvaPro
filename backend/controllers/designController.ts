import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { Design } from '../models/Design'; // Import từ bộ model đã tạo
import { DesignType } from '../models/enums'; // Import enum nếu cần

// 1. Tạo bản thiết kế mới
export const createDesign = async (req: Request, res: Response) => {
    const { title, width, height, design_type } = req.body;
    const userId = (req as any).user?.id; // Lấy từ authMiddleware

    try {
        const id = uuidv4();
        // THAY db.run bằng db.execute và ? bằng $1, $2...
        await db.execute(`
            INSERT INTO designs (id, user_id, title, width, height, design_type, is_public)
            VALUES ($1, $2, $3, $4, $5, $6, false)
        `, [id, userId, title || 'Untitled Design', width || 1920, height || 1080, design_type || DesignType.PRESENTATION]);

        // Tạo page đầu tiên mặc định cho design
        const pageId = uuidv4(); // tao chuoi dinh dang uuid ngau nhien duy nhat cho page
        await db.execute(`
            INSERT INTO design_pages (id, design_id, page_order)
            VALUES ($1, $2, 0)
        `, [pageId, id]);

        res.status(201).json({ id, message: 'Design created successfully' });
    } catch (error) {
        console.error('Create Design Error:', error);
        res.status(500).json({ error: 'Failed to create design' });
    }
};

// 2. Lấy danh sách thiết kế của người dùng
export const getUserDesigns = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    try {
        // THAY db.all bằng db.query và lấy .rows
        const result = await db.query(`
            SELECT * FROM designs 
            WHERE user_id = $1 AND is_deleted = false 
            ORDER BY updated_at DESC
        `, [userId]);

        res.json({ designs: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch designs' });
    }
};

// 3. Lấy chi tiết một bản thiết kế (bao gồm cả Page và Elements)
export const getDesignById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const design = await db.getOne(`SELECT * FROM designs WHERE id = $1`, [id]);
        if (!design) return res.status(404).json({ error: 'Design not found' });

        const pagesResult = await db.query(`SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order ASC`, [id]);

        const pages = await Promise.all(pagesResult.rows.map(async (page: any) => {
            const elementsResult = await db.query(
                `SELECT * FROM design_elements WHERE page_id = $1 ORDER BY z_index ASC`, 
                [page.id]
            );

            // QUAN TRỌNG: Biến đổi dữ liệu từ DB về định dạng FE hiểu được
            const formattedElements = elementsResult.rows.map((el: any) => {
                return {
                    id: el.id,
                    type: el.element_type, // Chuyển 'element_type' thành 'type' cho khớp FE
                    ...el.properties       // Trải các thuộc tính x, y, width, height từ JSONB ra ngoài
                };
            });

            return { ...page, elements: formattedElements };
        }));

        res.json({ ...design, pages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 4. Lưu/Cập nhật thiết kế (Save logic)
export const updateDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, elements } = req.body;
    const userId = (req as any).user?.id;

    try {
        // 1. Cập nhật Title và thời gian sửa đổi
        await db.execute(
            `UPDATE designs SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
            [title, id, userId]
        );

        // 2. Lấy pageId của trang đầu tiên (vì editor của bạn đang mặc định 1 trang)
        const page = await db.getOne(`SELECT id FROM design_pages WHERE design_id = $1 LIMIT 1`, [id]);
        const pageId = page.id;

        // 3. Xóa các element cũ để ghi đè cái mới (Cách đơn giản nhất cho bản clone)
        await db.execute(`DELETE FROM design_elements WHERE page_id = $1`, [pageId]);

        // 4. Lưu mảng elements mới vào DB
        if (elements && elements.length > 0) {
            for (const [index, el] of elements.entries()) {
                // Tách ID và Type ra khỏi properties để đúng cấu trúc bảng
                const { id: elId, type, ...restProps } = el;

                await db.execute(`
                    INSERT INTO design_elements (id, page_id, element_type, z_index, properties)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    elId, 
                    pageId, 
                    type,     // Ví dụ: 'rect', 'text', 'image'
                    index,    // Dùng thứ tự trong mảng làm z-index
                    JSON.stringify(restProps) // Lưu tọa độ, màu sắc, nội dung vào JSONB
                ]);
            }
        }

        res.json({ success: true, message: "Design saved successfully" });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ error: "Failed to save design" });
    }
};

// 5. Xóa thiết kế (Soft delete)
export const deleteDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await db.execute('UPDATE designs SET is_deleted = true WHERE id = $1', [id]);
        res.json({ message: 'Design moved to trash' });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
};

export const saveFullDesign = async (req: Request, res: Response) => {
    const { id } = req.params; // ID của Design
    const { title, thumbnail_url, pages } = req.body; 
    const userId = (req as any).user?.id;

    try {
        // 1. Cập nhật thông tin cơ bản của Design
        await db.execute(`
            UPDATE designs 
            SET title = $1, thumbnail_url = $2, last_edited_at = NOW(), updated_at = NOW() 
            WHERE id = $3 AND user_id = $4
        `, [title, thumbnail_url, id, userId]);

        if (pages && Array.isArray(pages)) {
            for (const page of pages) {
                // 2. Cập nhật hoặc Thêm mới Page
                // Dùng ON CONFLICT để nếu page_id đã có thì chỉ update page_order
                await db.execute(`
                    INSERT INTO design_pages (id, design_id, page_order, background_color, background_asset_id)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id) DO UPDATE SET 
                        page_order = EXCLUDED.page_order,
                        background_color = EXCLUDED.background_color,
                        background_asset_id = EXCLUDED.background_asset_id
                `, [page.id || uuidv4(), id, page.page_order || 0, page.background_color, page.background_asset_id]);

                // 3. Xử lý Elements trong Page
                if (page.elements && Array.isArray(page.elements)) {
                    // Bước này quan trọng: Xóa các element cũ không còn tồn tại trong request (nếu cần)
                    // Hoặc đơn giản là Upsert toàn bộ
                    for (const el of page.elements) {
                        await db.execute(`
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
                            page.id, 
                            el.element_type, 
                            el.z_index || 0, 
                            JSON.stringify(el.properties), // Lưu toàn bộ tọa độ, scale, rotation vào JSONB
                            el.locked || false,
                            el.visible !== false
                        ]);
                    }
                }
            }
        }

        res.json({ success: true, message: "Design saved successfully!" });
    } catch (error) {
        console.error("Save Design Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};