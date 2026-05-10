// src/components/editor/CanvasEditor.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Group, Line } from 'react-konva';
import { CircleShape, RectangleShape, EditableText, URLImage, IndividualBorder } from './CanvasElements';

interface CanvasEditorProps {
  stageRef: any;
  layerRef: any;
  trRef: any;
  selectionRectRef: any;
  stageWidth: number;
  stageHeight: number;
  currentPage: any;
  elements: any[];
  selectedIds: string[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateElement: (el: any) => void;
  selectionRect: any;
  handleMouseDown: (e: any) => void;
  handleMouseMove: (e: any) => void;
  handleMouseUp: (e: any) => void;
  isPlaying: boolean;
  currentTime: number;
}

export default function CanvasEditor(props: CanvasEditorProps) {
  const {
    stageRef, layerRef, trRef, selectionRectRef, stageWidth, stageHeight,
    currentPage, elements, selectedIds, editingId, setEditingId,
    updateElement, selectionRect, handleMouseDown, handleMouseMove, handleMouseUp
  } = props;

  const editingElement = elements.find(el => el.id === editingId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- VIEWPORT STATES ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // logic tự động Fit To Screen
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setContainerSize({ width: clientWidth, height: clientHeight });

    const padding = 80;
    const scaleX = (clientWidth - padding) / stageWidth;
    const scaleY = (clientHeight - padding) / stageHeight;
    const newScale = Math.min(scaleX, scaleY, 2);

    setScale(newScale);
    setPosition({
      x: (clientWidth - stageWidth * newScale) / 2,
      y: (clientHeight - stageHeight * newScale) / 2
    });
  }, [stageWidth, stageHeight]);

  // cập nhật khi Resize trình duyệt hoặc đổi Project mới
  useEffect(() => {
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    return () => window.removeEventListener('resize', fitToScreen);
  }, [fitToScreen]);

  // Chặn mặc định Zoom của Chrome
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Chặn Chrome zoom trang
      }
    };

    container.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => container.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  useEffect(() => {
    if (textareaRef.current && editingElement) {
      textareaRef.current.style.height = '0px';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editingElement?.text, scale]);

  // 3. Logic Zoom và Pan (Konva)
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.ctrlKey) {
      const scaleBy = 1.1;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      newScale = Math.max(0.05, Math.min(newScale, 5)); // Giới hạn zoom từ 5% đến 500%

      setScale(newScale);
      setPosition({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      // --- PAN (KÉO MÀN HÌNH BẰNG CHUỘT GIỮA / SCROLL TRƠN) ---
      setPosition((prev) => ({
        x: prev.x - (e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX),
        y: prev.y - (e.evt.shiftKey ? 0 : e.evt.deltaY)
      }));
    }
  };

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      // Tìm các vật thể dựa theo ID người dùng đang chọn
      const nodes = selectedIds.map(id => layerRef.current.findOne(`#${id}`)).filter(Boolean);

      trRef.current.nodes(nodes); // gắn khung viền vào các vật thể

      const rotater = trRef.current.findOne('.rotater'); // núm xoay
      if (rotater) {
        rotater.sceneFunc((ctx: any, shape: any) => {

          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);

          ctx.fillStrokeShape(shape);

          // vẽ icon xoay tròn
          const nativeCtx = ctx._context || ctx;
          nativeCtx.save();
          nativeCtx.translate(-7, -7);
          nativeCtx.scale(14 / 24, 14 / 24);

          const path = new Path2D('M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M16 21h5v-5');
          nativeCtx.strokeStyle = '#6366f1';
          nativeCtx.lineWidth = 3;
          nativeCtx.lineCap = 'round';
          nativeCtx.lineJoin = 'round';

          // Đảm bảo không bị đè path
          nativeCtx.beginPath();
          nativeCtx.stroke(path);
          nativeCtx.restore();
        });

        // Hitbox để bắt sự kiện click/kéo (To hơn một chút cho dễ bắt)
        rotater.hitFunc((ctx: any, shape: any) => {
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        });
      }

      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements]);

  // LOGIC KÉO THẢ TỰ ĐỘNG HÍT NAM CHÂM 
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const GUIDELINE_OFFSET = 5;

  const handleDragMove = useCallback((e: any) => {
    const node = e.target;
    const parent = node.getParent();
    const layer = node.getLayer();
    if (!parent || !layer) return;

    setGuidelines([]);

    // Thu thập tọa độ theo không gian gốc của project (Local Coordinates)
    const vertical: number[] = [0, stageWidth / 2, stageWidth];
    const horizontal: number[] = [0, stageHeight / 2, stageHeight];

    parent.children.forEach((child: any) => {
      // Bỏ qua chính nó, các đường kẻ, lưới, background
      if (child === node || child.getClassName() === 'Transformer' || child.getClassName() === 'Line' || child.name() === 'guideline' || child.id() === 'bg') return;

      const box = child.getClientRect({ relativeTo: parent });
      if (!box || box.width === 0) return;
      vertical.push(box.x, box.x + box.width / 2, box.x + box.width);
      horizontal.push(box.y, box.y + box.height / 2, box.y + box.height);
    });

    const box = node.getClientRect({ relativeTo: parent });
    const objVertical = [box.x, box.x + box.width / 2, box.x + box.width];
    const objHorizontal = [box.y, box.y + box.height / 2, box.y + box.height];

    // Chuyển đổi khoảng cách hít (Offset) tương đối theo mức độ Zoom
    const stage = node.getStage();
    const currentScale = stage ? stage.scaleX() : 1;
    const offset = GUIDELINE_OFFSET / currentScale;

    let minV = Number.MAX_VALUE;
    let snapV: number | null = null;
    let lineV: number | null = null;

    vertical.forEach((v) => {
      objVertical.forEach((ov) => {
        const diff = Math.abs(v - ov);
        if (diff < offset && diff < minV) {
          minV = diff;
          snapV = v - (ov - node.x()); // node.x() đang là tọa độ local
          lineV = v;
        }
      });
    });

    let minH = Number.MAX_VALUE;
    let snapH: number | null = null;
    let lineH: number | null = null;

    horizontal.forEach((h) => {
      objHorizontal.forEach((oh) => {
        const diff = Math.abs(h - oh);
        if (diff < offset && diff < minH) {
          minH = diff;
          snapH = h - (oh - node.y());
          lineH = h;
        }
      });
    });

    const newGuides = [];
    // Màu hồng Magenta đặc trưng của Canva
    const canvaPink = '#e8115b';

    if (snapV !== null) {
      node.x(snapV);
      newGuides.push({ points: [lineV, 0, lineV, stageHeight], stroke: canvaPink });
    }
    if (snapH !== null) {
      node.y(snapH);
      newGuides.push({ points: [0, lineH, stageWidth, lineH], stroke: canvaPink });
    }

    if (newGuides.length > 0) {
      setGuidelines(newGuides);
    }
  }, [stageWidth, stageHeight]);

  const handleDragEnd = useCallback(() => {
    setGuidelines([]);
  }, []);
  // LOGIC XỬ LÝ HIỆU ỨNG (ANIMATION IN & OUT) & ĐỘ DÀI (DURATION)
  const animatedElements = elements.map(el => {
    // Nếu đang dừng ở 0s (Chế độ Edit bình thường), hiện tất cả mọi thứ
    if (props.currentTime === 0 && !props.isPlaying) return el;

    const start = el.timeline?.start || 0;
    const duration = el.timeline?.duration || 5;
    const end = start + duration;

    // Lấy tên hiệu ứng (Nếu không có thì mặc định là 'none')
    const animIn = el.animation?.in || 'none';
    const animOut = el.animation?.out || 'none';

    let newEl = { ...el };

    if (props.currentTime < start || props.currentTime > end) {
      newEl.opacity = 0;
      newEl.listening = false; // Chặn click khi đang tàng hình
      return newEl;
    }

    const animDuration = 0.5;

    //  TÍNH TOÁN TIẾN ĐỘ VÀO (IN) VÀ RA (OUT) TỪ 0 ĐẾN 1
    let progressIn = 1;
    let progressOut = 1;

    if (props.currentTime < start + animDuration) {
      progressIn = (props.currentTime - start) / animDuration;
    } else if (props.currentTime > end - animDuration) {
      progressOut = (end - props.currentTime) / animDuration;
    }

    // 3. APPLY HIỆU ỨNG IN (Khi tiến độ In < 1)
    if (progressIn < 1 && animIn !== 'none') {
      const ease = 1 - Math.pow(1 - progressIn, 3); // Cubic Ease Out (Nhanh lúc đầu, mượt về cuối)
      const baseOpacity = el.opacity ?? 1;

      switch (animIn) {
        case 'appear': newEl.opacity = progressIn > 0 ? baseOpacity : 0; break;
        case 'fade': newEl.opacity = baseOpacity * ease; break;
        case 'flyIn': newEl.y = el.y + (1 - ease) * 200; newEl.opacity = baseOpacity * ease; break;
        case 'floatIn': newEl.y = el.y + (1 - ease) * 50; newEl.opacity = baseOpacity * ease; break;
        case 'zoom':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
        case 'growAndTurn':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.rotation = (el.rotation || 0) - 90 * (1 - ease);
          newEl.opacity = baseOpacity * ease;
          break;
        case 'swivel':
          newEl.scaleX = (el.scaleX || 1) * Math.cos((1 - ease) * Math.PI / 2);
          break;
        case 'bounce':
          // Mô phỏng lực đàn hồi (Spring Physics) cực kỳ tự nhiên
          const spring = 1 - Math.cos(progressIn * Math.PI * 3) * Math.exp(-progressIn * 5);
          newEl.scaleX = (el.scaleX || 1) * spring;
          newEl.scaleY = (el.scaleY || 1) * spring;
          break;
        // Các hiệu ứng cực khó vẽ bằng Canvas (như Split, Wipe) sẽ được Fallback về Fade+Zoom
        default:
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
      }
    }

    // 4. APPLY HIỆU ỨNG OUT (Khi tiến độ Out < 1)
    else if (progressOut < 1 && animOut !== 'none') {
      const ease = 1 - Math.pow(1 - progressOut, 3); // Mượt dần khi biến mất
      const baseOpacity = el.opacity ?? 1;

      switch (animOut) {
        case 'appear': newEl.opacity = progressOut > 0 ? baseOpacity : 0; break;
        case 'fade': newEl.opacity = baseOpacity * ease; break;
        case 'flyIn': newEl.y = el.y + (1 - ease) * 200; newEl.opacity = baseOpacity * ease; break; // Rớt thẳng xuống
        case 'floatIn': newEl.y = el.y + (1 - ease) * 50; newEl.opacity = baseOpacity * ease; break;
        case 'zoom':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
        case 'growAndTurn':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.rotation = (el.rotation || 0) + 90 * (1 - ease);
          newEl.opacity = baseOpacity * ease;
          break;
        case 'swivel':
          newEl.scaleX = (el.scaleX || 1) * Math.cos((1 - ease) * Math.PI / 2);
          break;
        case 'bounce':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
        default:
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
      }
    }

    return newEl;
  });
  // --- LOGIC HIỆU ỨNG CHUYỂN CẢNH (PAGE TRANSITION) ---
  let pageAnim = { x: 0, y: 0, opacity: 1, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

  // Chỉ chạy hiệu ứng chuyển cảnh khi đang Play và trang hiện tại có cài Transition
  if (props.isPlaying && currentPage?.transition && currentPage.transition.type !== 'none') {
    const tType = currentPage.transition.type;
    const tDuration = currentPage.transition.duration || 0.5;
    const timeIn = props.currentTime; // Thời gian local của trang (bắt đầu từ 0s)

    // Nếu thời gian chạy vẫn nằm trong khoảng của hiệu ứng (VD: 0 -> 0.5s)
    if (timeIn < tDuration) {
      const progress = timeIn / tDuration;
      const ease = 1 - Math.pow(1 - progress, 3); // Cubic Ease Out (Nhanh đầu, mượt cuối)

      switch (tType) {
        case 'fade':
        case 'dissolve':
          pageAnim.opacity = ease;
          break;
        case 'slideLeft':
          pageAnim.x = stageWidth * (1 - ease); // Đẩy từ mép phải màn hình trượt sang trái
          break;
        case 'slideRight':
          pageAnim.x = -stageWidth * (1 - ease); // Đẩy từ mép trái trượt sang phải
          break;
        case 'slideUp':
          pageAnim.y = stageHeight * (1 - ease); // Đẩy từ dưới lên
          break;
        case 'slideDown':
          pageAnim.y = -stageHeight * (1 - ease); // Đẩy từ trên xuống
          break;
        case 'zoom':
          pageAnim.scaleX = 0.5 + 0.5 * ease;
          pageAnim.scaleY = 0.5 + 0.5 * ease;
          pageAnim.offsetX = stageWidth / 2;
          pageAnim.offsetY = stageHeight / 2;
          pageAnim.x = stageWidth / 2;
          pageAnim.y = stageHeight / 2;
          pageAnim.opacity = ease;
          break;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-slate-200 overflow-hidden outline-none"
      tabIndex={0}
    >
      <Stage
        ref={stageRef}
        width={containerSize.width} // Mở rộng Stage 100% bằng màn hình
        height={containerSize.height}
        x={position.x} // Đẩy khung vẽ ra giữa
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer ref={layerRef} onDragEnd={handleDragEnd}>
          <Rect
            id="bg"
            width={stageWidth}
            height={stageHeight}
            fill={currentPage?.background_color || "#ffffff"}
            shadowBlur={15}
            shadowColor="rgba(0,0,0,0.1)"
            x={pageAnim.x} y={pageAnim.y} opacity={pageAnim.opacity}
            scaleX={pageAnim.scaleX} scaleY={pageAnim.scaleY}
            offsetX={pageAnim.offsetX} offsetY={pageAnim.offsetY}
          />

          <Group
            clipX={0} clipY={0} clipWidth={stageWidth} clipHeight={stageHeight}
            x={pageAnim.x} y={pageAnim.y} opacity={pageAnim.opacity}
            scaleX={pageAnim.scaleX} scaleY={pageAnim.scaleY}
            offsetX={pageAnim.offsetX} offsetY={pageAnim.offsetY}
          >
            {animatedElements.map((el) => {
              if (el.type === 'circle') return <CircleShape key={el.id} shape={el} onChange={updateElement} onSelect={() => { }} onDragMove={handleDragMove} />;
              if (el.type === 'rect' || el.type === 'shape') return <RectangleShape key={el.id} shape={el} onChange={updateElement} onSelect={() => { }} onDragMove={handleDragMove} />;
              if (el.type === 'text') return (
                <EditableText
                  key={el.id} text={el}
                  onDblClick={() => setEditingId(el.id)}
                  onChange={updateElement}
                  isEditing={editingId === el.id}
                  onSelect={() => { }}
                  onDragMove={handleDragMove}
                />
              );
              if (el.type === 'image') return <URLImage key={el.id} image={el} onChange={updateElement} onSelect={() => { }} onDragMove={handleDragMove} />;
              return null;
            })}
            {guidelines.map((guide, i) => (
              <Line key={`guide-${i}`} name="guideline" points={guide.points} stroke={guide.stroke} strokeWidth={1 / scale} opacity={0.8} listening={false} />
            ))}
          </Group>

          {selectionRect.visible && (
            <Rect
              ref={selectionRectRef}
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(99, 102, 241, 0.2)"
              stroke="#6366f1"
              strokeWidth={1}
              listening={false}
            />
          )}

          <Transformer ref={trRef} borderStroke="#6366f1" anchorStroke="#6366f1" anchorFill="#ffffff" anchorSize={8} boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox} />
          {selectedIds.length > 1 && selectedIds.map(id => <IndividualBorder key={`border-${id}`} nodeId={id} />)}
        </Layer>
      </Stage>

      {editingElement && (
        <textarea
          ref={textareaRef}
          autoFocus
          value={editingElement.text}
          onChange={(e) => updateElement({ ...editingElement, text: e.target.value })}
          onBlur={() => setEditingId(null)}

          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditingId(null);
            }
          }}

          style={{
            position: 'absolute',
            top: position.y + (editingElement.y * scale),
            left: position.x + (editingElement.x * scale),
            width: (editingElement.width || 200) * scale,
            fontSize: editingElement.fontSize * scale,
            fontFamily: editingElement.fontFamily,
            color: editingElement.fill,
            fontWeight: editingElement.fontStyle?.includes('bold') ? 'bold' : 'normal',
            fontStyle: editingElement.fontStyle?.includes('italic') ? 'italic' : 'normal',
            textDecoration: editingElement.textDecoration,
            border: '1px solid #6366f1',
            background: 'white',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.2,
            zIndex: 1000,
            padding: 0,
            margin: 0,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',   // Bắt buộc: Đảm bảo xuống dòng chuẩn xác
            wordWrap: 'break-word'    // Bắt buộc: Cắt chữ khi đụng lề phải
          }}
        />
      )}
    </div>
  );
}