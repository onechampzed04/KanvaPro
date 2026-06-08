// src/workers/zip.worker.ts
// [FIX Vấn đề 4]: Xử lý nén file ZIP trên luồng nền (Web Worker).
// Với bộ sưu tập ảnh nền lớn (nhiều trang xuất hình PNG/JPG),
// zip.generateAsync() là tác vụ CPU nặng chiếm nhiều giây.
// Đẩy xuống Worker giải phóng hoàn toàn Main Thread.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-restricted-globals */
import JSZip from 'jszip';

export interface ZipFileEntry {
  name: string;        // Tên file trong zip (e.g., "Page_1.png")
  dataUrl: string;     // Data URL base64 của ảnh (từ stageRef.toDataURL())
}

export interface ZipWorkerMessage {
  files: ZipFileEntry[];
  zipName: string;
}

self.onmessage = async (event: MessageEvent<ZipWorkerMessage>) => {
  const { files, zipName } = event.data;

  try {
    const zip = new JSZip();

    for (const file of files) {
      // Tách phần base64 từ data URL
      const base64Data = file.dataUrl.split(',')[1];
      if (base64Data) {
        zip.file(file.name, base64Data, { base64: true });
      }
    }

    // Tác vụ nén nặng — chạy hoàn toàn trên luồng nền
    const content = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }, // Cân bằng tốc độ và kích thước
    });

    // Transfer ArrayBuffer (zero-copy) về luồng chính
    (self as any).postMessage(
      { success: true, buffer: content, zipName },
      [content]
    );
  } catch (err: any) {
    (self as any).postMessage({ success: false, error: err?.message ?? 'Unknown ZIP worker error' });
  }
};
