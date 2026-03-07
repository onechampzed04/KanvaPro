import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { Design, DesignType } from '../models/Design';

export const createDesign = async (req: Request, res: Response) => {
  const { title, design_type, width, height } = req.body;
  const userId = (req as any).user?.id;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const id = uuidv4();
    await db.run(`
      INSERT INTO designs (id, user_id, title, design_type, width, height)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, title, design_type, width, height]);

    // Create first page automatically
    const pageId = uuidv4();
    await db.run(`
      INSERT INTO design_pages (id, design_id, page_order)
      VALUES (?, ?, 0)
    `, [pageId, id]);

    const design = await db.get('SELECT * FROM designs WHERE id = ?', [id]);
    res.status(201).json({ design });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create design' });
  }
};

export const getMyDesigns = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const designs: Design[] = await db.query(`
      SELECT * FROM designs 
      WHERE user_id = ? AND is_deleted = false 
      ORDER BY last_edited_at DESC
    `, [userId]);
    res.json({ designs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch designs' });
  }
};

export const getDesignById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;

  try {
    const design: Design = await db.get('SELECT * FROM designs WHERE id = ?', [id]);
    if (!design) return res.status(404).json({ error: 'Design not found' });

    // Fetch pages and elements
    const pages = await db.query('SELECT * FROM design_pages WHERE design_id = ? ORDER BY page_order ASC', [id]);
    
    // For each page, fetch elements
    const pagesWithElements = await Promise.all(pages.map(async (page: any) => {
      const elements = await db.query('SELECT * FROM design_elements WHERE page_id = ? ORDER BY z_index ASC', [page.id]);
      return { ...page, elements };
    }));

    res.json({ design, pages: pagesWithElements });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch design details' });
  }
};

export const updateDesign = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, is_public } = req.body;

  try {
    await db.run(`
      UPDATE designs 
      SET title = COALESCE(?, title), 
          is_public = COALESCE(?, is_public),
          last_edited_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
    `, [title, is_public, id]);

    const design = await db.get('SELECT * FROM designs WHERE id = ?', [id]);
    res.json({ design });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update design' });
  }
};
