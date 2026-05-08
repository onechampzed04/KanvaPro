// src/components/editor/CanvasElements.tsx
import React, { useRef, useEffect } from 'react';
import { Rect, Circle, Text, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';

// --- IMAGE COMPONENT ---
export const URLImage = ({ image, onSelect, onChange, onDragMove }: any) => {
  const [img] = useImage(image.src, 'anonymous');
  const shapeRef = useRef<any>(null);

  return (
    <KonvaImage
      onClick={onSelect}
      onTap={onSelect}
      ref={shapeRef}
      id={image.id}
      image={img}
      {...image}
      draggable
      onDragMove={onDragMove}
      onDragEnd={(e) => onChange({ ...image, x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          ...image,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * Math.abs(scaleX)),
          height: Math.max(5, node.height() * Math.abs(scaleY)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
        });
      }}
    />
  );
};

// --- CIRCLE COMPONENT ---
export const CircleShape = ({ shape, onSelect, onChange, onDragMove }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <Circle
      onClick={onSelect}
      onTap={onSelect}
      id={shape.id}
      ref={shapeRef}
      {...shape}
      draggable
      onDragMove={onDragMove}
      onDragEnd={(e) => onChange({ ...shape, x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          ...shape,
          x: node.x(),
          y: node.y(),
          radius: Math.max(5, shape.radius * Math.abs(scaleX)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
        });
      }}
    />
  );
};

// --- RECTANGLE COMPONENT ---
export const RectangleShape = ({ shape, onSelect, onChange, onDragMove }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <Rect
      onClick={onSelect}
      onTap={onSelect}
      id={shape.id}
      ref={shapeRef}
      {...shape}
      draggable
      onDragMove={onDragMove}
      onDragEnd={(e) => onChange({ ...shape, x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          ...shape,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * Math.abs(scaleX)),
          height: Math.max(5, node.height() * Math.abs(scaleY)),
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
        });
      }}
    />
  );
};

// --- EDITABLE TEXT COMPONENT ---
export const EditableText = ({ text, onSelect, onDblClick, onChange, isEditing, onDragMove }: any) => {
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
      onDragMove={onDragMove}
      onDragEnd={(e) => onChange({ ...text, x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        node.scaleX(1);
        node.scaleY(1);

        const currentFontSize = node.fontSize();
        const newFontSize = Math.max(8, Math.round(currentFontSize * Math.abs(scaleY)));
        const newWidth   = Math.max(20, Math.round(node.width() * Math.abs(scaleX)));

        onChange({
          ...text,
          x: node.x(),
          y: node.y(),
          fontSize: newFontSize,
          width: newWidth,
          scaleX: Math.sign(scaleX),
          scaleY: Math.sign(scaleY),
        });
      }}
    />
  );
};

// --- INDIVIDUAL BORDER (Khung tím cho nhiều vật thể) ---
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