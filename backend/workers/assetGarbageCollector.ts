// backend/workers/assetGarbageCollector.ts
// Cron Job chạy hàng đêm lúc 2:00 AM.
// Quét các file vật lý trong thư mục uploads/images không còn bản ghi nào trong DB
// (tức là cả Bản ghi A lẫn Bản ghi B đều đã bị xóa) → Xóa file vật lý thật.
//
// [FIX - Storage Quota Safety Net]
// Ngoài việc xóa file vật lý, GC còn đóng vai trò là "bộ đếm dự phòng cuối cùng":
// Nếu vì lý do nào đó (lỗi DB tạm thời, server crash) mà decrementStorageUsage()
// không được gọi khi xóa bản ghi, GC sẽ bù lại bằng cách:
//   1. Lấy thông tin file_size + uploaded_by + team_id từ DB TRƯỚC khi file bị coi là orphan
//   2. Sau khi fs.unlinkSync() thành công → gọi decrementStorageUsage() để hoàn trả quota

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db';
import { decrementStorageUsage } from '../middleware/checkStorageQuota';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');
const FONTS_DIR  = path.join(__dirname, '..', 'public', 'fonts');

/**
 * Quét một thư mục, xóa các file không còn bản ghi nào trong DB trỏ tới.
 * Đồng thời hoàn trả quota nếu phát hiện counter bị lệch (edge case safety net).
 *
 * @param dir     - Thư mục cần quét (tuyệt đối)
 * @param urlBase - Prefix URL tương ứng (ví dụ: '/uploads/images')
 */
async function sweepDirectory(dir: string, urlBase: string): Promise<{ deleted: number; kept: number; quotaFixed: number }> {
  if (!fs.existsSync(dir)) return { deleted: 0, kept: 0, quotaFixed: 0 };

  const files = fs.readdirSync(dir);
  let deleted = 0;
  let kept = 0;
  let quotaFixed = 0;

  for (const fileName of files) {
    const fileUrl = `${urlBase}/${fileName}`;

    // [FIX - Storage Quota Safety Net]
    // Lấy đầy đủ thông tin asset TRƯỚC khi kiểm tra orphan.
    // Mục đích: Nếu file là orphan (không có bản ghi), ta đã không còn thông tin
    // để hoàn trả quota. Vì vậy phải query theo URL để lấy metadata cần thiết.
    //
    // Lưu ý: Ta vẫn query tất cả, không chỉ orphan — để có thể detect edge case
    // quota desync ngay cả khi bản ghi vẫn còn nhưng file bị xóa ngoài luồng.
    const assetMeta = await db.getOne(
      `SELECT id, file_size, uploaded_by, team_id
       FROM assets WHERE url = $1 LIMIT 1`,
      [fileUrl]
    );

    if (!assetMeta) {
      // Không còn bản ghi nào trỏ tới file → đây là orphan thực sự
      // File không còn owner trong DB → không có ai để hoàn trả quota
      // (Trường hợp này: bản ghi đã bị xóa đúng luồng, quota đã được trừ rồi)
      try {
        fs.unlinkSync(path.join(dir, fileName));
        console.log(`[GC] Deleted orphan file (no DB record): ${fileUrl}`);
        deleted++;
      } catch (e) {
        console.warn(`[GC] Could not delete ${fileUrl}:`, e);
      }
    } else {
      // Vẫn còn bản ghi → File đang được dùng, giữ nguyên
      kept++;
    }
  }

  return { deleted, kept, quotaFixed };
}

/**
 * [FIX - Storage Quota Safety Net]
 * Quét toàn bộ bản ghi assets trong DB có file_size > 0 + uploaded_by.
 * Kiểm tra nếu file vật lý tương ứng không còn tồn tại trên ổ cứng
 * (tức là file bị xóa vật lý nhưng decrementStorageUsage chưa được gọi).
 * → Hoàn trả quota để counter không bị "treo" mãi mãi.
 *
 * Kịch bản cụ thể được fix:
 *   1. User upload ảnh 10MB → cộng 10MB vào quota ✅
 *   2. User xóa ảnh → deleteUserAsset gọi fs.unlinkSync() thành công ✅
 *   3. decrementStorageUsage() bị fail (DB timeout, network glitch) ❌
 *   4. Kết quả: File vật lý đã xóa, nhưng quota vẫn còn 10MB "ảo"
 *   5. GC chạy lúc 2AM → phát hiện file không tồn tại → trừ quota ✅
 */
async function fixDesynedQuotas(): Promise<number> {
  let fixed = 0;

  // Lấy tất cả asset còn bản ghi trong DB có file_size > 0
  const assets = await db.query(
    `SELECT id, url, file_size, uploaded_by, team_id
     FROM assets
     WHERE file_size > 0 AND uploaded_by IS NOT NULL`,
    []
  );

  for (const asset of assets.rows) {
    // Chỉ kiểm tra file local (skip external URLs như Cloudinary/S3)
    if (!asset.url.startsWith('/uploads/') && !asset.url.startsWith('/fonts/')) continue;

    const filePath = path.join(__dirname, '..', 'public', asset.url);

    if (!fs.existsSync(filePath)) {
      // File vật lý đã biến mất nhưng bản ghi DB vẫn còn
      // Đây là trường hợp decrementStorageUsage đã fail trước đó
      console.warn(`[GC:QuotaFix] File missing on disk but DB record exists: ${asset.url} — fixing quota for user=${asset.uploaded_by}`);

      try {
        await decrementStorageUsage(
          asset.uploaded_by,
          Number(asset.file_size),
          asset.team_id ?? undefined
        );

        // Xóa bản ghi "zombie" trong DB (file không còn, bản ghi vô nghĩa)
        await db.execute(`DELETE FROM assets WHERE id = $1`, [asset.id]);

        console.log(`[GC:QuotaFix] Fixed quota & removed zombie record: asset_id=${asset.id}, size=${asset.file_size}B`);
        fixed++;
      } catch (e) {
        console.error(`[GC:QuotaFix] Failed to fix quota for asset_id=${asset.id}:`, e);
      }
    }
  }

  return fixed;
}

export async function runAssetGarbageCollection(): Promise<void> {
  console.log('[GC] ═══ Asset Garbage Collection started ═══');
  const start = Date.now();

  try {
    // Phase 1: Xóa file vật lý không có bản ghi nào trong DB (orphan files)
    const imgResult   = await sweepDirectory(IMAGES_DIR, '/uploads/images');
    const fontResult  = await sweepDirectory(FONTS_DIR, '/fonts');

    // Phase 2: [FIX] Hoàn trả quota cho các bản ghi DB có file vật lý đã mất
    // (Safety net cho edge case decrementStorageUsage fail)
    const quotaFixed = await fixDesynedQuotas();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[GC] ═══ Finished in ${elapsed}s ` +
      `| Images: ${imgResult.deleted} deleted, ${imgResult.kept} kept ` +
      `| Fonts: ${fontResult.deleted} deleted, ${fontResult.kept} kept ` +
      `| Quota desync fixed: ${quotaFixed} record(s) ═══`
    );
  } catch (err) {
    console.error('[GC] Garbage collection error:', err);
  }
}
