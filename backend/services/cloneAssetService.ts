// backend/services/cloneAssetService.ts
// Dịch vụ clone ảnh vật lý khi người dùng sử dụng template hoặc clone design của người khác.
//
// THIẾT KẾ:
//   - Chỉ copy file vật lý và tính quota với ảnh KHÔNG thuộc workspace đích.
//   - Nếu user clone design của CHÍNH MÌNH thì toàn bộ ảnh bị loại trừ → 0 MB tính thêm.
//   - Trả về urlMap (oldUrl → newUrl) để caller UPDATE design_elements sau khi clone.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');

export interface CloneAssetResult {
  urlMap: Map<string, string>; // oldUrl → newUrl
  totalBytes: number;
}

/**
 * Clone vật lý tất cả ảnh được dùng trong design_elements của sourceDesignId
 * sang workspace đích (userId / teamId).
 *
 * Bỏ qua ảnh đã thuộc về workspace đích để không tính quota hai lần.
 *
 * @param sourceDesignId - Design gốc (template hoặc design của người khác)
 * @param newDesignId    - Design mới vừa được clone (để biết context log)
 * @param userId         - User sẽ sở hữu bản copy
 * @param teamId         - Team workspace đích (null = personal)
 */
export async function cloneAssetsForDesign(
  sourceDesignId: string,
  newDesignId: string,
  userId: string,
  teamId: string | null
): Promise<CloneAssetResult> {
  const urlMap = new Map<string, string>();
  let totalBytes = 0;

  // 1. Lấy tất cả src URL dùng trong design, kèm thông tin asset nếu có.
  //    Chỉ lấy ảnh lưu trên server (/uploads/...) và chưa thuộc workspace đích.
  const assetInfoRes = await db.query(
    `SELECT DISTINCT ON (a.url)
       a.id, a.url, a.name, a.type, a.file_size, a.width, a.height
     FROM assets a
     WHERE a.url IN (
       SELECT DISTINCT de.properties->>'src'
       FROM design_elements de
       JOIN design_pages dp ON dp.id = de.page_id
       WHERE dp.design_id = $1
         AND de.properties->>'src' IS NOT NULL
         AND de.properties->>'src' != ''
         AND de.properties->>'src' LIKE '/uploads/%'
     )
     AND a.file_size IS NOT NULL AND a.file_size > 0
     AND NOT (
       CASE
         WHEN $2::uuid IS NULL
           THEN a.uploaded_by = $3::uuid AND a.team_id IS NULL
         ELSE
           a.team_id = $2::uuid
       END
     )`,
    [sourceDesignId, teamId, userId]
  );

  const assets = assetInfoRes.rows;
  if (assets.length === 0) return { urlMap, totalBytes };

  // 2. Copy file vật lý + tạo bản ghi asset mới cho mỗi ảnh
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const asset of assets) {
    const oldUrl: string = asset.url; // e.g. /uploads/images/abc123.png
    const oldFileName = path.basename(oldUrl);
    const ext = path.extname(oldFileName) || '.png';

    const newFileName = `${uuidv4()}${ext}`;
    const newUrl = `/uploads/images/${newFileName}`;

    const srcPath = path.join(IMAGES_DIR, oldFileName);
    const destPath = path.join(IMAGES_DIR, newFileName);

    if (!fs.existsSync(srcPath)) {
      console.warn(`[CloneAsset] File gốc không tồn tại, bỏ qua: ${srcPath}`);
      continue;
    }

    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (e) {
      console.error(`[CloneAsset] Lỗi copy file ${srcPath} → ${destPath}:`, e);
      continue;
    }

    const newAssetId = uuidv4();
    const fileSize = Number(asset.file_size);

    await db.execute(
      `INSERT INTO assets (id, name, type, url, uploaded_by, team_id, is_premium, file_size, width, height, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10::jsonb, NOW())`,
      [
        newAssetId,
        asset.name,
        asset.type,
        newUrl,
        userId,
        teamId,
        fileSize,
        asset.width ?? null,
        asset.height ?? null,
        JSON.stringify({ cloned_from: asset.id, source_design_id: sourceDesignId, dest_design_id: newDesignId }),
      ]
    );

    urlMap.set(oldUrl, newUrl);
    totalBytes += fileSize;
  }

  return { urlMap, totalBytes };
}

/**
 * Sau khi clone design_elements xong, UPDATE properties.src của các elements
 * trong newDesignId sang URL mới theo urlMap.
 */
export async function updateElementSrcs(
  newDesignId: string,
  urlMap: Map<string, string>
): Promise<void> {
  if (urlMap.size === 0) return;

  const oldUrls = Array.from(urlMap.keys());

  const elements = await db.query(
    `SELECT de.id, de.properties
     FROM design_elements de
     JOIN design_pages dp ON dp.id = de.page_id
     WHERE dp.design_id = $1
       AND de.properties->>'src' = ANY($2::text[])`,
    [newDesignId, oldUrls]
  );

  const updates = elements.rows.map((el: any) => {
    const props = typeof el.properties === 'string'
      ? JSON.parse(el.properties)
      : { ...el.properties };

    const newSrc = urlMap.get(props.src);
    if (!newSrc) return Promise.resolve();

    props.src = newSrc;
    return db.execute(
      `UPDATE design_elements SET properties = $1::jsonb WHERE id = $2`,
      [JSON.stringify(props), el.id]
    );
  });

  await Promise.all(updates);
}
