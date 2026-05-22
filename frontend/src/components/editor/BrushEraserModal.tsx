// frontend/src/components/editor/BrushEraserModal.tsx
// Tính năng bôi vùng để xóa nền ảnh (Brush Background Eraser)
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Eraser, RotateCcw, Check, Loader2 } from 'lucide-react';

interface BrushEraserModalProps {
  element: any;               // Element ảnh đang chọn
  onClose: () => void;
  onResult: (newSrc: string) => void; // Trả về URL ảnh mới đã xóa nền
}

export default function BrushEraserModal({ element, onClose, onResult }: BrushEraserModalProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null); // Canvas hiển thị preview
  const maskCanvasRef    = useRef<HTMLCanvasElement>(null); // Canvas vẽ mask ẩn
  const containerRef     = useRef<HTMLDivElement>(null);

  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // ─── Load ảnh gốc vào cả hai canvas khi modal mở ──────────────────────────
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = element.src;
    img.onload = () => {
      imgRef.current = img;

      const preview = previewCanvasRef.current;
      const mask    = maskCanvasRef.current;
      if (!preview || !mask) return;

      // Scale ảnh vừa với modal (tối đa 800x600)
      const maxW = 800;
      const maxH = 600;
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);

      preview.width  = w;
      preview.height = h;
      mask.width     = img.width;  // Mask giữ kích thước gốc để chính xác
      mask.height    = img.height;

      // Vẽ ảnh gốc lên preview canvas
      const ctx = preview.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      // Mask canvas: nền đen (sẽ tô trắng ở vùng cần xóa)
      const mCtx = mask.getContext('2d')!;
      mCtx.fillStyle = 'black';
      mCtx.fillRect(0, 0, img.width, img.height);

      setImgLoaded(true);
    };
    img.onerror = () => console.error('[BrushEraser] Failed to load image:', element.src);
  }, [element.src]);

  // ─── Helper: chuyển tọa độ chuột (CSS pixels) → tọa độ canvas ─────────────
  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }, []);

  // ─── Vẽ nét xóa tại một điểm ──────────────────────────────────────────────
  const eraseAt = useCallback((x: number, y: number, fromX?: number, fromY?: number) => {
    const preview = previewCanvasRef.current;
    const mask    = maskCanvasRef.current;
    const img     = imgRef.current;
    if (!preview || !mask || !img) return;

    // Scale từ preview-space → mask-space
    const scaleX = img.width  / preview.width;
    const scaleY = img.height / preview.height;
    const mx = x * scaleX;
    const my = y * scaleY;

    // -- Preview canvas: destination-out để xóa pixel --
    const pCtx = preview.getContext('2d')!;
    pCtx.save();
    pCtx.globalCompositeOperation = 'destination-out';
    pCtx.beginPath();
    if (fromX !== undefined && fromY !== undefined) {
      pCtx.moveTo(fromX, fromY);
      pCtx.lineTo(x, y);
      pCtx.lineWidth   = brushSize;
      pCtx.lineCap     = 'round';
      pCtx.lineJoin    = 'round';
      pCtx.strokeStyle = 'rgba(0,0,0,1)';
      pCtx.stroke();
    } else {
      pCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      pCtx.fillStyle = 'rgba(0,0,0,1)';
      pCtx.fill();
    }
    pCtx.restore();

    // -- Mask canvas: vẽ trắng ở vùng bị xóa (gửi lên server) --
    const mCtx = mask.getContext('2d')!;
    mCtx.save();
    mCtx.beginPath();
    if (fromX !== undefined && fromY !== undefined) {
      mCtx.moveTo(fromX * scaleX, fromY * scaleY);
      mCtx.lineTo(mx, my);
      mCtx.lineWidth   = brushSize * scaleX;
      mCtx.lineCap     = 'round';
      mCtx.lineJoin    = 'round';
      mCtx.strokeStyle = 'white';
      mCtx.stroke();
    } else {
      mCtx.arc(mx, my, (brushSize / 2) * scaleX, 0, Math.PI * 2);
      mCtx.fillStyle = 'white';
      mCtx.fill();
    }
    mCtx.restore();
  }, [brushSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDrawing(true);
    const pos = getCanvasPos(e);
    if (!pos) return;
    lastPosRef.current = pos;
    eraseAt(pos.x, pos.y);
  }, [getCanvasPos, eraseAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    const last = lastPosRef.current;
    eraseAt(pos.x, pos.y, last?.x, last?.y);
    lastPosRef.current = pos;
  }, [isDrawing, getCanvasPos, eraseAt]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    lastPosRef.current = null;
  }, []);

  // ─── Reset về ảnh gốc ─────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const preview = previewCanvasRef.current;
    const mask    = maskCanvasRef.current;
    const img     = imgRef.current;
    if (!preview || !mask || !img) return;

    const ctx = preview.getContext('2d')!;
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.drawImage(img, 0, 0, preview.width, preview.height);

    const mCtx = mask.getContext('2d')!;
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, mask.width, mask.height);
  }, []);

  // ─── Gửi ảnh + mask lên server để xử lý ──────────────────────────────────
  const handleApply = useCallback(async () => {
    const mask = maskCanvasRef.current;
    const img  = imgRef.current;
    if (!mask || !img) return;

    setIsProcessing(true);
    try {
      // Chuyển ảnh gốc thành Blob
      const imageBlob: Blob = await new Promise((resolve, reject) => {
        const c = document.createElement('canvas');
        c.width  = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        c.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
      });

      // Chuyển mask thành Blob
      const maskBlob: Blob = await new Promise((resolve, reject) => {
        mask.toBlob(b => b ? resolve(b) : reject(new Error('mask toBlob failed')), 'image/png');
      });

      const formData = new FormData();
      formData.append('image', imageBlob, 'image.png');
      formData.append('mask',  maskBlob,  'mask.png');

      const token = localStorage.getItem('token');
      const res = await fetch('/api/assets/remove-bg-brush', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      onResult(data.url);
      onClose();
    } catch (err) {
      console.error('[BrushEraser] Apply error:', err);
      alert('Có lỗi khi xử lý ảnh. Vui lòng thử lại!');
    } finally {
      setIsProcessing(false);
    }
  }, [onResult, onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Eraser size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Brush Background Eraser</h2>
              <p className="text-xs text-slate-500">Tô lên vùng muốn xóa, sau đó nhấn Apply</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eraser size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Brush Size</span>
            <input
              type="range" min={5} max={120} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="w-28 accent-indigo-600"
            />
            <span className="text-xs font-bold text-indigo-600 w-7">{brushSize}</span>
          </div>

          {/* Cursor preview */}
          <div
            className="rounded-full border-2 border-dashed border-indigo-400 bg-indigo-100/40 flex-shrink-0"
            style={{ width: Math.min(brushSize, 48), height: Math.min(brushSize, 48) }}
          />
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[#e2e8f0] min-h-0">
          {!imgLoaded && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Đang tải ảnh...</span>
            </div>
          )}
          <div
            ref={containerRef}
            className="relative"
            style={{ display: imgLoaded ? 'block' : 'none', cursor: 'crosshair' }}
          >
            {/* Checkerboard background for transparency preview */}
            <div className="absolute inset-0 rounded-lg overflow-hidden"
              style={{ backgroundImage: 'repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%)', backgroundSize: '20px 20px' }}
            />
            <canvas
              ref={previewCanvasRef}
              className="relative z-10 rounded-lg max-w-full max-h-[450px] block"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ userSelect: 'none' }}
            />
            {/* Hidden mask canvas */}
            <canvas ref={maskCanvasRef} className="hidden" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0 bg-white">
          <button
            onClick={handleReset}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <RotateCcw size={14} /> Làm lại
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={isProcessing} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button
              onClick={handleApply}
              disabled={isProcessing || !imgLoaded}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md transition disabled:opacity-60"
            >
              {isProcessing ? (
                <><Loader2 size={14} className="animate-spin" /> Đang xử lý...</>
              ) : (
                <><Check size={14} /> Áp dụng</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
