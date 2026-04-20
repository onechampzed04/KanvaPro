import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { Design } from '../models/Design';
import { DesignType } from '../models/enums'; 
import { designService } from '../services/designService';
import { assetService } from '../services/assetService'; 

export const createDesign = async (req: Request, res: Response) => {
    const { title, width, height, design_type } = req.body;
    const userId = (req as any).user?.id; 

    try {
        const id = uuidv4();
        await designService.createDesign({
            id,
            user_id: userId,
            title: title || 'Untitled Design',
            width: width || 1920,
            height: height || 1080,
            design_type: design_type || 'presentation'
        });

        res.status(201).json({ id, message: 'Design created successfully' });
    } catch (error) {
        console.error('Create Design Error:', error);
        res.status(500).json({ error: 'Failed to create design' });
    }
};

export const getUserDesigns = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    try {
        // THAY db.all bằng db.query và lấy .rows
        const result = await designService.getUserDesigns(userId);
        res.json({ designs: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch designs' });
    }
};

export const getDesignById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const design = await designService.getDesignById(id);
        if (!design) return res.status(404).json({ error: 'Design not found' });

        const design_pagesResult = await designService.getDesignPages(id);
        const pages = await Promise.all(design_pagesResult.map(async (page: any) => {
            const elementsResult = await db.query(
                `SELECT * FROM design_elements WHERE page_id = $1 ORDER BY z_index ASC`, 
                [page.id]
            );

            const formattedElements = elementsResult.rows.map((el: any) => {
                // FIX JSON PARSE: Xử lý triệt để nếu DB trả về chuỗi thay vì object
                const props = typeof el.properties === 'string' ? JSON.parse(el.properties) : el.properties;
                return {
                    id: el.id,
                    type: el.element_type,
                    ...props
                };
            });

            return { ...page, elements: formattedElements };
        }));

        res.json({ ...design, pages });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, elements } = req.body;
    const userId = (req as any).user?.id;

    try {
        await designService.updateDesign(id, { title }, elements);

        res.json({ success: true, message: "Design saved successfully" });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ error: "Failed to save design" });
    }
};

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
    const { id } = req.params; 
    const { title, thumbnail_url, pages } = req.body; 
    const userId = (req as any).user?.id;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: Missing User ID" });
    }

    try {
        await designService.saveFullDesign(id, userId, { title, thumbnail_url }, pages);

        res.json({ success: true, message: "Design saved successfully!" });
    } catch (error) {
        console.error("Save Design Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getRecentStickers = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    try {
        // Truy vấn lấy các src duy nhất được dùng gần đây nhất bởi user
        const query = `
            SELECT 
                de.properties->>'src' as url,
                MAX(de.updated_at) as last_used
            FROM design_elements de
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1 
              AND de.properties->>'src' IS NOT NULL
              AND de.properties->>'src' != ''
            GROUP BY de.properties->>'src'
            ORDER BY last_used DESC
            LIMIT $2 OFFSET $3
        `;
        
        // Đếm tổng số lượng sticker để làm phân trang
        const countQuery = `
            SELECT COUNT(DISTINCT de.properties->>'src') as total
            FROM design_elements de
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1 AND de.properties->>'src' IS NOT NULL
        `;

        const result = await db.query(query, [userId, limit, offset]);
        const countResult = await db.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total) || 0;

        res.json({
            data: result.rows,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error) {
        console.error("Get Recent Stickers Error:", error);
        res.status(500).json({ error: "Failed to fetch recent stickers" });
    }
};