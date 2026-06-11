// frontend/src/hooks/useAutoThumbnail.ts
//
// Hook tự động sinh thumbnail cho TẤT CẢ các trang sau khi save.
// Dùng HTML5 Canvas 2D để render offscreen (không cần Konva stage hiển thị).
// Chỉ upload nếu trang chưa có thumbnail hoặc thumbnail cũ hơn 5 phút.
//
// Chiến lược:
//  1. Lấy elements của từng trang (từ LRU cache của lazyPageLoader, hoặc fetch nếu chưa có)
//  2. Render offscreen canvas 384x216 (16:9, 1/5 của 1920x1080)
//  3. Upload thumbnail lên server qua API
//  4. Emit socket event để cập nhật realtime cho collaborators

import { useCallback, useRef } from 'react';
import { uploadPageThumbnail } from '../api/api';

const THUMB_W = 384;
const THUMB_H = 216;
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const SCALE_X = THUMB_W / CANVAS_W;
const SCALE_Y = THUMB_H / CANVAS_H;

// Đợi hình ảnh load xong
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // Bỏ qua ảnh lỗi
    // Timeout 5s
    setTimeout(() => resolve(null), 5000);
    img.src = src;
  });
}

// Render 1 trang elements lên offscreen canvas, trả về Blob
async function renderPageToBlob(
  elements: any[],
  bgColor: string,
  pageWidth = CANVAS_W,
  pageHeight = CANVAS_H,
): Promise<Blob | null> {
  const scaleX = THUMB_W / pageWidth;
  const scaleY = THUMB_H / pageHeight;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Nền
  ctx.fillStyle = bgColor || '#ffffff';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  // Sắp xếp theo z_index
  const sorted = [...(elements || [])].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));

  for (const el of sorted) {
    const x = (el.x ?? 0) * scaleX;
    const y = (el.y ?? 0) * scaleY;
    const w = (el.width ?? 100) * scaleX;
    const h = (el.height ?? 100) * scaleY;
    const rot = ((el.rotation ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (rot) ctx.rotate(rot);
    ctx.globalAlpha = el.opacity ?? 1;

    const type = el.type || el.element_type || '';

    if (type === 'image' && el.src) {
      const img = await loadImage(el.src);
      if (img) {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    } else if (type === 'text') {
      const fontSize = Math.max(8, (el.fontSize ?? 18) * scaleY);
      const fontStyle = el.fontStyle || 'normal';
      const fontFamily = el.fontFamily || 'Arial';
      ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = el.fill || '#000000';
      let align = el.align || 'left';
      if (align === 'justify') align = 'left';
      ctx.textAlign = align as CanvasTextAlign;
      ctx.textBaseline = 'top';
      // Wrap text đơn giản
      const lines = (el.text || '').split('\n');
      let lineY = -h / 2;
      for (const line of lines) {
        if (lineY > h / 2) break;
        ctx.fillText(line, ctx.textAlign === 'center' ? 0 : -w / 2, lineY, w);
        lineY += fontSize * 1.3;
      }
    } else if (type === 'rect' || type === 'shape') {
      ctx.fillStyle = el.fill || '#cccccc';
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      if (el.stroke) {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = (el.strokeWidth || 1) * Math.min(scaleX, scaleY);
        ctx.stroke();
      }
    } else if (type === 'circle' || type === 'ellipse') {
      ctx.fillStyle = el.fill || '#cccccc';
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'line') {
      ctx.strokeStyle = el.stroke || '#000000';
      ctx.lineWidth = (el.strokeWidth || 2) * Math.min(scaleX, scaleY);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.7);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface Page {
  id: string;
  type?: string;
  width?: number;
  height?: number;
  background_color?: string;
  thumbnail?: string;
  elements?: any[];
  _lastThumbAt?: number;
}

interface UseAutoThumbnailOptions {
  lazyPageLoader: {
    loadPageElements: (pageId: string) => Promise<any[]>;
  };
  onThumbnailUpdated?: (pageId: string, url: string) => void;
  emitPageThumbnailUpdated?: (pageId: string, url: string) => void;
}

const THUMB_STALE_MS = 5 * 60 * 1000; // 5 phút

export function useAutoThumbnail({
  lazyPageLoader,
  onThumbnailUpdated,
  emitPageThumbnailUpdated,
}: UseAutoThumbnailOptions) {
  const isRunningRef = useRef(false);
  const attemptMap = useRef<Record<string, number>>({});

  /**
   * Chạy sau khi save — tự động render và upload thumbnail cho các trang
   * chưa có thumbnail hoặc thumbnail đã cũ.
   * currentPageId + currentElements: trang đang hiển thị trên editor (đã có Konva thumb),
   * nên sẽ bị bỏ qua để tránh upload trùng.
   */
  const generateAllPagesThumbnails = useCallback(async (
    pages: Page[],
    currentPageId: string | null,
  ) => {
    if (isRunningRef.current) return; // Tránh chạy song song
    isRunningRef.current = true;

    const canvasPages = pages.filter(p => (p.type || 'canvas') === 'canvas');

    for (const page of canvasPages) {
      // Bỏ qua trang hiện tại — Konva đã upload rồi
      if (page.id === currentPageId) continue;

      // Bỏ qua nếu thumbnail còn mới (< 5 phút)
      if (page.thumbnail && page._lastThumbAt && Date.now() - page._lastThumbAt < THUMB_STALE_MS) {
        continue;
      }

      // [FIX] Cờ giới hạn số lần thử, ngăn chặn vòng lặp vô tận (đặc biệt khi lỗi 404 không update được thumbnail)
      if (attemptMap.current[page.id] && Date.now() - attemptMap.current[page.id] < THUMB_STALE_MS) {
        continue;
      }
      attemptMap.current[page.id] = Date.now();

      try {
        // Lấy elements — ưu tiên từ LRU cache, fallback fetch API
        const elements = await lazyPageLoader.loadPageElements(page.id);
        if (!elements || elements.length === 0) continue;

        const blob = await renderPageToBlob(
          elements,
          page.background_color || '#ffffff',
          page.width || CANVAS_W,
          page.height || CANVAS_H,
        );
        if (!blob) continue;

        const thumbUrl = await uploadPageThumbnail(blob, page.id);
        if (thumbUrl) {
          const cacheBusted = thumbUrl.startsWith('data:')
            ? thumbUrl
            : thumbUrl.split('?')[0] + '?t=' + Date.now();

          onThumbnailUpdated?.(page.id, cacheBusted);
          emitPageThumbnailUpdated?.(page.id, cacheBusted);
        }
      } catch (e) {
        // Bỏ qua lỗi của từng trang, tiếp tục trang khác
        console.warn(`[AutoThumb] Failed for page ${page.id}:`, e);
      }
    }

    isRunningRef.current = false;
  }, [lazyPageLoader, onThumbnailUpdated, emitPageThumbnailUpdated]);

  return { generateAllPagesThumbnails };
}
