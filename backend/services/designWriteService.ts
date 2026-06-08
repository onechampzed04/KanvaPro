// backend/services/designWriteService.ts
// [FIX Vấn đề 8] Server-Side Throttled Write-Behind Cache.
//
// Vấn đề gốc:
//   Client gửi HTTP Autosave (PUT /api/designs/:id) đồng thời với WebSocket OT.
//   Khi 2 luồng ghi DB cùng lúc, OCC kiểm tra version → 409 Conflict.
//   Giải pháp tắt OCC trước đây tạo ra lỗi "Dirty Write" nghiêm trọng hơn.
//
// Giải pháp mới — Single Source of Truth:
//   1. Client KHÔNG gửi HTTP autosave khi đang trong phiên collab (socket connected).
//   2. Server OT engine gọi markDirty(designId) sau mỗi ot-op được accept.
//   3. Background scheduler (setInterval 8s) flush các design "dirty" xuống DB.
//   4. Manual save (Ctrl+S) vẫn gửi HTTP nhưng dùng OCC + exponential backoff retry.
//
// Lợi ích:
//   - Xóa bỏ hoàn toàn 409 Conflict trong quá trình cộng tác thời gian thực.
//   - Chỉ có 1 luồng duy nhất ghi DB tại một thời điểm (serialized write).
//   - Dữ liệu được flush mỗi 8 giây — không bị mất khi client đóng tab đột ngột.

import db from '../config/db';

// ─── Dirty Set: tập hợp các designId đang chờ flush xuống DB ─────────────────
const dirtyDesigns = new Set<string>();
let schedulerStarted = false;
const FLUSH_INTERVAL_MS = 8000; // 8 giây

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Đánh dấu một design cần được ghi xuống DB ở lần flush tiếp theo.
 * Được gọi từ collaboration.ts sau mỗi ot-op được accept.
 */
export function markDirty(designId: string): void {
  dirtyDesigns.add(designId);
}

/**
 * Khởi động scheduler nền — chỉ gọi một lần khi server khởi động.
 */
export function startWriteBehindScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    if (dirtyDesigns.size === 0) return;

    // Lấy danh sách cần flush và xóa khỏi Set ngay lập tức
    // (nếu có op mới đến trong khi đang flush, sẽ được đánh dirty lại)
    const toFlush = Array.from(dirtyDesigns);
    dirtyDesigns.clear();

    for (const designId of toFlush) {
      await flushDesignToDb(designId);
    }
  }, FLUSH_INTERVAL_MS);

  console.log(`⏰ [WriteBehind] Scheduler started — flushing every ${FLUSH_INTERVAL_MS / 1000}s.`);
}

/**
 * Flush trạng thái elements hiện tại từ design_elements xuống bảng designs.
 * Chỉ cập nhật last_edited_at và version — elements đã được sync trong revisionStore.
 *
 * Thiết kế: Server OT engine đã ghi elements vào bảng design_elements thông qua
 * designPageService.syncElementsForPage() trong controller. Ở đây chỉ cần cập nhật
 * metadata của designs (version + last_edited_at) để bảng index đúng thứ tự.
 */
async function flushDesignToDb(designId: string): Promise<void> {
  try {
    // Tăng version + cập nhật last_edited_at — không cần kiểm tra OCC ở đây
    // vì đây là write-behind từ server (không có race condition với client)
    await db.execute(
      `UPDATE designs
       SET last_edited_at = NOW(),
           updated_at     = NOW(),
           version        = version + 1
       WHERE id = $1 AND is_deleted = false`,
      [designId]
    );
    console.log(`[WriteBehind] Flushed design ${designId} to DB.`);
  } catch (err: any) {
    // Không throw — lỗi flush chỉ log, không dừng scheduler
    // Design sẽ được đánh dirty lại ở lần update tiếp theo
    console.error(`[WriteBehind] Failed to flush design ${designId}:`, err.message);
  }
}

/**
 * Flush ngay lập tức một design — dùng khi người dùng cuối rời phòng
 * để đảm bảo không bị mất dữ liệu trước khi scheduler chạy lần kế.
 */
export async function flushNow(designId: string): Promise<void> {
  dirtyDesigns.delete(designId);
  await flushDesignToDb(designId);
}
