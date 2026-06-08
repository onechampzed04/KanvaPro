// src/workers/pptx.worker.ts
// [FIX Vấn đề 4]: Xử lý sinh file PPTX hoàn toàn trên luồng nền (Web Worker).
// Luồng chính (Main UI Thread) KHÔNG còn bị block khi gọi pptxgen.writeFile().
//
// Cơ chế hoạt động:
// 1. EditorPage thu thập dữ liệu slides (JSON thuần) từ state.
// 2. Gửi xuống Worker qua postMessage (zero-copy với Transferable Objects nếu có thể).
// 3. Worker thực hiện toàn bộ vòng lặp nặng (addSlide, addText, addImage, addShape).
// 4. Worker gọi pptx.write('arraybuffer') — tác vụ CPU/memory nặng nhất.
// 5. Gửi trả ArrayBuffer về luồng chính bằng Transferable → không copy dữ liệu.
// 6. Luồng chính tạo Blob và trigger download.
// ─────────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-restricted-globals */
import pptxgen from 'pptxgenjs';

export interface SlideElementData {
  type: 'text' | 'rect' | 'shape' | 'circle' | 'image' | 'sticker' | string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  text?: string;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: string;
  fontStyle?: string;
  opacity?: number;
  rotation?: number;
  src?: string;
}

export interface SlideData {
  id: string;
  background_color?: string;
  elements: SlideElementData[];
}

export interface PptxWorkerMessage {
  slidesData: SlideData[];
  fileName: string;
  stageWidth: number;
  stageHeight: number;
}

self.onmessage = async (event: MessageEvent<PptxWorkerMessage>) => {
  const { slidesData, fileName, stageWidth, stageHeight } = event.data;

  try {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';

    const PPTX_W = 10;
    const PPTX_H = 5.625;

    for (const pageData of slidesData) {
      const slide = pptx.addSlide();

      if (pageData.background_color) {
        slide.background = { color: pageData.background_color.replace('#', '') };
      }

      for (const el of pageData.elements) {
        const x = (el.x / stageWidth) * PPTX_W;
        const y = (el.y / stageHeight) * PPTX_H;
        const w = (el.width / stageWidth) * PPTX_W;
        const h = (el.height / stageHeight) * PPTX_H;
        const colorHex = el.fill ? el.fill.replace('#', '') : '000000';
        const transparency = el.opacity !== undefined ? (1 - el.opacity) * 100 : 0;
        const rotate = el.rotation || 0;

        if (el.type === 'text') {
          const ptSize = (el.fontSize ?? 24) / stageWidth * 720;
          slide.addText(el.text || el.content || ' ', {
            x, y, w, h,
            fontSize: ptSize,
            color: colorHex,
            fontFace: el.fontFamily || 'Arial',
            align: (el.align as any) || 'center',
            valign: 'middle',
            bold: el.fontStyle?.includes('bold'),
            italic: el.fontStyle?.includes('italic'),
            transparency,
            rotate,
          });
        } else if (el.type === 'rect' || el.type === 'shape') {
          slide.addShape(pptx.ShapeType.rect, {
            x, y, w, h,
            fill: { color: colorHex, transparency },
            rotate,
          });
        } else if (el.type === 'circle') {
          slide.addShape(pptx.ShapeType.ellipse, {
            x, y, w, h,
            fill: { color: colorHex, transparency },
            rotate,
          });
        } else if ((el.type === 'image' || el.type === 'sticker') && el.src) {
          const isBase64 = el.src.startsWith('data:image');
          try {
            slide.addImage({
              x, y, w, h,
              [isBase64 ? 'data' : 'path']: el.src,
              sizing: { type: 'contain', w, h },
              transparency,
              rotate,
            });
          } catch {
            // Bỏ qua ảnh lỗi — không làm gián đoạn toàn bộ export
          }
        }
      }
    }

    // Tác vụ nặng nhất — chạy hoàn toàn trên luồng nền, UI không bị đơ
    const buffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;

    // Transfer ArrayBuffer (zero-copy) về luồng chính
    (self as any).postMessage(
      { success: true, buffer, fileName },
      [buffer]
    );
  } catch (err: any) {
    (self as any).postMessage({ success: false, error: err?.message ?? 'Unknown PPTX worker error' });
  }
};
