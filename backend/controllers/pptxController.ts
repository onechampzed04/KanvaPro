/**
 * pptxController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/designs/import/pptx
 * Nhận file .pptx, gọi pptxService để bóc tách, tạo Design + Pages + Elements
 * trong DB, trả về { designId } để frontend redirect vào EditorPage.
 */

import { Request, Response } from 'express';
import 'multer'; // side-effect: augments Express.Multer namespace
type MulterFile = Express.Multer.File;
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { parsePptx, validateMagicBytes, PptxPage } from '../services/pptxService';
import path from 'path';

// Extension whitelist — từ chối .ppt (nhị phân), .pptm (macro)
const ALLOWED_EXT = ['.pptx'];

export const importPptx = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const file = (req as any).file as MulterFile | undefined;
  if (!file) return res.status(400).json({ error: 'Không nhận được file PPTX.' });

  // ── 1. Kiểm tra extension ─────────────────────────────────────────────────
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return res.status(400).json({
      error: `Chỉ hỗ trợ file .pptx. File .ppt và .pptm không được chấp nhận vì lý do bảo mật.`,
    });
  }

  // ── 2. Kiểm tra Magic Bytes ───────────────────────────────────────────────
  try {
    validateMagicBytes(file.buffer);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  // ── 3. Giới hạn kích thước file gốc ──────────────────────────────────────
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File vượt quá giới hạn 20 MB.' });
  }

  console.log(`[PPTX Import] User ${userId} uploading "${file.originalname}" (${(file.size / 1024).toFixed(0)} KB)`);

  // ── 4. Parse PPTX ─────────────────────────────────────────────────────────
  let pages: PptxPage[];
  try {
    pages = await parsePptx(file.buffer);
  } catch (err: any) {
    console.error('[PPTX Import] Parse error:', err.message);
    return res.status(400).json({ error: err.message || 'Không thể đọc file PPTX.' });
  }

  // ── 5. Tạo Design + Pages + Elements trong DB ─────────────────────────────
  const designId = uuidv4();
  const designTitle = path.basename(file.originalname, '.pptx');
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Tạo design
    await client.query(
      `INSERT INTO designs (id, user_id, title, design_type, is_public)
       VALUES ($1, $2, $3, 'presentation', false)`,
      [designId, userId, designTitle]
    );

    // Tạo từng page + elements
    for (const page of pages) {
      // Insert page
      await client.query(
        `INSERT INTO design_pages (id, design_id, page_order, type, width, height, background_color)
         VALUES ($1, $2, $3, 'canvas', $4, $5, $6)`,
        [page.id, designId, page.page_order, page.width, page.height, page.background_color]
      );

      // Insert elements
      for (let i = 0; i < page.elements.length; i++) {
        const el = page.elements[i];
        // Build properties object matching EditorPage element structure
        const props: Record<string, any> = {
          id: el.id,
          type: el.type,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          rotation: el.rotation || 0,
          timeline: el.timeline,
          animation: el.animation,
        };

        if (el.type === 'text') {
          props.text = el.text;
          props.fontSize = el.fontSize;
          props.fontFamily = el.fontFamily;
          props.fill = el.fill;
          props.fontStyle = el.fontStyle;
          props.align = el.align;
        } else if (el.type === 'image') {
          // Prepend server URL so canvas can load the image
          props.src = el.src?.startsWith('http') ? el.src : `http://localhost:3000${el.src}`;
        }

        await client.query(
          `INSERT INTO design_elements (id, page_id, element_type, z_index, properties)
           VALUES ($1, $2, $3, $4, $5)`,
          [el.id, page.id, el.type, i, JSON.stringify(props)]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[PPTX Import] ✅ Design ${designId} created with ${pages.length} pages`);

    res.status(201).json({
      success: true,
      designId,
      slideCount: pages.length,
      message: `Đã nhập thành công ${pages.length} slide từ "${designTitle}"`,
    });
  } catch (dbErr: any) {
    await client.query('ROLLBACK');
    console.error('[PPTX Import] DB error:', dbErr);
    res.status(500).json({ error: 'Lỗi lưu thiết kế vào cơ sở dữ liệu.' });
  } finally {
    client.release();
  }
};
