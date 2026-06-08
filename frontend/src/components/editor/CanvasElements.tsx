// src/components/editor/CanvasElements.tsx
// [REVERT Fix Vấn đề 3 - node.destroy()]: Đã xác nhận node.destroy() thủ công
// gây xung đột với react-konva reconciler nội bộ.
//
// React-Konva quản lý vòng đời Konva Node hoàn toàn tự động thông qua custom reconciler.
// Khi component unmount, reconciler gọi instance.destroy() nội bộ.
// Nếu ta GỌI THÊM node.destroy() trong useEffect cleanup → node bị destroy 2 lần:
//   Lần 1: useEffect cleanup của chúng ta
//   Lần 2: React-Konva reconciler unmount
// → React-Konva cố update props của node đã bị destroy → element "biến mất" sau drag/zoom.
//
// GIẢI PHÁP ĐÚNG: Không gọi node.destroy() thủ công.
// Chỉ gọi node.off() nếu có event listener được đăng ký bằng node.on() thủ công.
// Với react-konva, tất cả event listeners đăng ký qua props (onClick, onDragMove...)
// → react-konva tự dọn khi unmount → KHÔNG cần node.off() thủ công.
// ─────────────────────────────────────────────────────────────────────────────────────────

import React, { useRef, useEffect, useState } from 'react';
import { Rect, Circle, Text, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

// ─── IMAGE COMPONENT ─────────────────────────────────────────────────────────
// Non-destructive crop: lưu cropRect, render bằng KonvaImage.crop native.
// KHÔNG dùng Group để tránh vấn đề hit detection với children listening=false.
export const URLImage = ({ image, onSelect, onChange, onChangeFinal, onDragMove, onActionStart, onDblClick }: any) => {
  const [img] = useImage(image.src, 'anonymous');
  const shapeRef = useRef<any>(null);

  const hasCrop = !!(image.cropRect &&
    image.cropRect.width > 0 && image.cropRect.height > 0);

  if (hasCrop) {
    const cr = image.cropRect;

    // Map từ display-space → source-image space để dùng Konva built-in crop
    // img.naturalWidth/Height = kích thước gốc của file ảnh
    const natW = img ? (img.naturalWidth || image.width) : image.width;
    const natH = img ? (img.naturalHeight || image.height) : image.height;
    const sx = image.width > 0 ? natW / image.width : 1;
    const sy = image.height > 0 ? natH / image.height : 1;

    return (
      <KonvaImage
        ref={shapeRef}
        id={image.id}
        // Đặt tại VỊ TRÍ VISUAL của crop (image.x + cr.x)
        x={(image.x ?? 0) + cr.x}
        y={(image.y ?? 0) + cr.y}
        // Hiển thị đúng kích thước vùng crop
        width={cr.width}
        height={cr.height}
        image={img}
        // Konva native crop — map display-px → source-px
        crop={{
          x: cr.x * sx,
          y: cr.y * sy,
          width: cr.width * sx,
          height: cr.height * sy,
        }}
        rotation={image.rotation || 0}
        opacity={image.opacity ?? 1}
        scaleX={image.scaleX ?? 1}
        scaleY={image.scaleY ?? 1}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        onDragStart={() => onActionStart?.()}
        onTransformStart={() => onActionStart?.()}
        onDragMove={onDragMove}
        onDragEnd={(e: any) => {
          // KonvaImage tại (image.x + cr.x) → khi drag: image.x = newX - cr.x
          onChangeFinal({
            ...image,
            x: e.target.x() - cr.x,
            y: e.target.y() - cr.y,
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scX = node.scaleX();
          const scY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const newCrW = Math.max(5, cr.width * Math.abs(scX));
          const newCrH = Math.max(5, cr.height * Math.abs(scY));
          onChangeFinal({
            ...image,
            x: node.x() - cr.x,
            y: node.y() - cr.y,
            width: Math.max(5, image.width * Math.abs(scX)),
            height: Math.max(5, image.height * Math.abs(scY)),
            cropRect: {
              x: cr.x,
              y: cr.y,
              width: newCrW,
              height: newCrH,
            },
            scaleX: Math.sign(scX),
            scaleY: Math.sign(scY),
            rotation: node.rotation(),
          });
        }}
      />
    );
  }

  // Không có crop: render bình thường (giữ nguyên như cũ)
  return (
    <KonvaImage
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDblClick}
      ref={shapeRef}
      id={image.id}
      image={img}
      {...image}
      draggable
      onDragStart={() => onActionStart?.()}
      onTransformStart={() => onActionStart?.()}
      onDragMove={onDragMove}
      onDragEnd={(e: any) => {
        onChangeFinal({ ...image, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChangeFinal({
          ...image,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * Math.abs(scaleX)),
          height: Math.max(5, node.height() * Math.abs(scaleY)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
          rotation: node.rotation(),
        });
      }}
    />
  );
};

// ─── CIRCLE COMPONENT ─────────────────────────────────────────────────────────
export const CircleShape = ({ shape, onSelect, onChange, onChangeFinal, onDragMove, onActionStart }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <Circle
      onClick={onSelect}
      onTap={onSelect}
      id={shape.id}
      ref={shapeRef}
      {...shape}
      draggable
      onDragStart={() => onActionStart?.()}
      onTransformStart={() => onActionStart?.()}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChangeFinal({ ...shape, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChangeFinal({
          ...shape,
          x: node.x(),
          y: node.y(),
          radius: Math.max(5, shape.radius * Math.abs(scaleX)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
          rotation: node.rotation(),
        });
      }}
    />
  );
};

// ─── RECTANGLE COMPONENT ───────────────────────────────────────────────────────
export const RectangleShape = ({ shape, onSelect, onChange, onChangeFinal, onDragMove, onActionStart }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <Rect
      onClick={onSelect}
      onTap={onSelect}
      id={shape.id}
      ref={shapeRef}
      {...shape}
      draggable
      onDragStart={() => onActionStart?.()}
      onTransformStart={() => onActionStart?.()}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChangeFinal({ ...shape, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChangeFinal({
          ...shape,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * Math.abs(scaleX)),
          height: Math.max(5, node.height() * Math.abs(scaleY)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
          rotation: node.rotation(),
        });
      }}
    />
  );
};

// ─── EDITABLE TEXT COMPONENT ──────────────────────────────────────────────────
export const EditableText = ({ text, onSelect, onDblClick, onChange, onChangeFinal, isEditing, onDragMove, onActionStart }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <Text
      ref={shapeRef}
      {...text}
      visible={!isEditing}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDblClick}
      draggable={!isEditing}
      id={text.id}
      onDragStart={() => onActionStart?.()}
      onTransformStart={() => onActionStart?.()}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChangeFinal({ ...text, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        node.scaleX(1);
        node.scaleY(1);

        const currentFontSize = node.fontSize();
        const newFontSize = Math.max(8, Math.round(currentFontSize * Math.abs(scaleY)));
        const newWidth = Math.max(20, Math.round(node.width() * Math.abs(scaleX)));

        onChangeFinal({
          ...text,
          x: node.x(),
          y: node.y(),
          fontSize: newFontSize,
          width: newWidth,
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
          rotation: node.rotation(),
        });
      }}
    />
  );
};

// ─── INDIVIDUAL BORDER ────────────────────────────────────────────────────────
export const IndividualBorder = ({ nodeId }: { nodeId: string }) => {
  const trRef = useRef<any>(null);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    const node = stage.findOne(`#${nodeId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer().batchDraw();
    }
  }, [nodeId]);

  return (
    <Transformer
      ref={trRef}
      resizeEnabled={false}
      rotateEnabled={false}
      borderStroke="#6366f1"
      borderStrokeWidth={1.5}
      borderDash={[4, 4]}
      anchorSize={0}
      listening={false}
    />
  );
};

// ─── PRO WATERMARK OVERLAY ─────────────────────────────────────────────────────
// Hiển thị lưới watermark "KanvaPro" đè lên Pro sticker cho Free user.
//
// Vấn đề cần giải quyết: React state (el.x/y/w/h) chỉ update sau khi thả chuột
// (onDragEnd / onTransformEnd), nhưng trong lúc kéo Konva di chuyển node trực tiếp
// (imperative). Nếu Rect chỉ đọc từ React state → watermark lag so với sticker.
//
// Giải pháp: Sau khi mount, tìm sibling KonvaImage node theo id, bind sự kiện
// 'dragmove' + 'transform' Konva, rồi sync vị trí/kích thước vào Rect node trực tiếp
// (imperatively, KHÔNG qua React state) → watermark luôn đồng bộ realtime.
export const ProWatermarkOverlay = ({ el }: { el: any }) => {
  const [patternImg, setPatternImg] = useState<HTMLCanvasElement | null>(null);
  const rectRef = useRef<any>(null);

  // ── Bước 1: Tạo tile pattern một lần duy nhất ──────────────────────────────
  useEffect(() => {
    const TILE = 130;
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, TILE, TILE);

    // Subtle tint
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, TILE, TILE);

    // Diagonal stripes
    ctx.strokeStyle = 'rgba(30,30,60,0.13)';
    ctx.lineWidth = 1.2;
    for (let i = -TILE; i < TILE * 2; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + TILE, TILE);
      ctx.stroke();
    }

    // Watermark text rotated -30°
    ctx.save();
    ctx.translate(TILE / 2, TILE / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = 'bold 11px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(20,20,80,0.25)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KanvaPro', 0, 0);
    ctx.restore();

    setPatternImg(canvas);
  }, []);

  // ── Bước 2: Sau khi Rect đã mount (patternImg ready), bind Konva events ────
  // Đọc vị trí trực tiếp từ image Konva node trong lúc drag/transform
  // để sync watermark mà KHÔNG cần React re-render.
  useEffect(() => {
    if (!patternImg) return;
    const rect = rectRef.current;
    if (!rect) return;

    const stage = rect.getStage();
    if (!stage) return;

    const imgNode = stage.findOne(`#${el.id}`);
    if (!imgNode) return;

    // Hàm sync: đọc trạng thái thực tế của imgNode → áp vào rectRef
    const syncToImg = () => {
      if (!rectRef.current) return;
      const r = rectRef.current;
      // Konva stores scale separately — width/height stay as "base" dims
      const scX = imgNode.scaleX?.() ?? 1;
      const scY = imgNode.scaleY?.() ?? 1;
      r.x(imgNode.x());
      r.y(imgNode.y());
      r.width(Math.max(1, (imgNode.width?.() ?? el.width ?? 200) * Math.abs(scX)));
      r.height(Math.max(1, (imgNode.height?.() ?? el.height ?? 200) * Math.abs(scY)));
      r.rotation(imgNode.rotation?.() ?? 0);
      // Chỉ batchDraw — không dispatch React action
      r.getLayer()?.batchDraw();
    };

    // Bind vào dragmove và transform (cả hai đều fire realtime trong Konva)
    imgNode.on('dragmove.wm transform.wm', syncToImg);

    return () => {
      imgNode.off('dragmove.wm transform.wm');
    };
  }, [el.id, patternImg]);

  if (!patternImg) return null;

  // Props ban đầu đọc từ React state — sẽ bị override imperatively trong lúc drag
  return (
    <Rect
      ref={rectRef}
      x={el.x ?? 0}
      y={el.y ?? 0}
      width={Math.max(1, el.width ?? 200)}
      height={Math.max(1, el.height ?? 200)}
      rotation={el.rotation ?? 0}
      opacity={el.opacity ?? 1}
      fillPatternImage={patternImg as unknown as HTMLImageElement}
      fillPatternRepeat="repeat"
      fillPatternScale={{ x: 1, y: 1 }}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};