// src/components/editor/CanvasEditor.tsx
import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Stage, Layer, Rect, Transformer, Group, Line, Circle, Text } from 'react-konva';
import { CircleShape, RectangleShape, EditableText, URLImage, IndividualBorder, ProWatermarkOverlay } from './CanvasElements';

// ─── THUẬT TOÁN DOUGLAS-PEUCKER ─────────────────────────────────────────────
// Rút gọn mảng points [x0,y0,x1,y1,...] để giảm số điểm vẽ mà không làm méo hình
function perpendicularDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function douglasPeucker(points: number[], epsilon: number): number[] {
  if (points.length < 6) return points; // cần ít nhất 3 điểm
  const pts: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]]);

  function rdp(start: number, end: number, result: boolean[]) {
    let maxDist = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(pts[i][0], pts[i][1], pts[start][0], pts[start][1], pts[end][0], pts[end][1]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) {
      rdp(start, maxIdx, result);
      result[maxIdx] = true;
      rdp(maxIdx, end, result);
    }
  }

  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  rdp(0, pts.length - 1, keep);
  const simplified: number[] = [];
  keep.forEach((v, i) => { if (v) { simplified.push(pts[i][0], pts[i][1]); } });
  return simplified;
}

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
  updateElementImmediate: (el: any) => void;
  // Bulk update: cập nhật nhiều element cùng lúc trong 1 React state call (tránh stale closure)
  updateElementsBatch?: (updatedEls: any[]) => void;
  updateElementsBatchImmediate?: (updatedEls: any[]) => void;
  selectionRect: any;
  handleMouseDown: (e: any) => void;
  handleMouseMove: (e: any) => void;
  handleMouseUp: (e: any) => void;
  isPlaying: boolean;
  currentTime: number;
  canEdit?: boolean;
  onResizeLive?: (w: number, h: number) => void;
  onResizeFinal?: (w: number, h: number, dx: number, dy: number) => void;
  activeTool?: 'select' | 'draw' | 'shape' | 'line' | 'sticky' | 'text';
  setActiveTool?: (tool: any) => void;
  addElement?: (el: any) => void;
  isWhiteboard?: boolean;
  // Undo/Redo hooks: được gọi trước mỗi thao tác chỉnh sửa
  onActionStart?: () => void;
  // Được gọi khi người dùng xong chỉnh sửa text (để push undo snapshot thông minh)
  onTextEditEnd?: (finalText: string, elementId: string) => void;
  onTextEditStart?: (elementId: string) => void;
  elementLocks?: Map<string, { userId: string; name: string; avatarColor: string; pageId: string }>;
  animPreviewHiddenIds?: Set<string>;
  // Which animationOrder step is currently animating in (for applying the correct effect)
  animPreviewCurrentStep?: number;
  // Progress 0→1 of the current step's entry animation
  animPreviewProgress?: number;
  // Free user flag: if true, Pro stickers will show a watermark overlay
  isFreeUser?: boolean;
  onLimitReached?: () => void;
}

// ─── CACHED LINE COMPONENT ────────────────────────────────────────────────────
// Memo: chỉ re-render khi el thay đổi thực sự. Sau mount gọi .cache() để tạo bitmap GPU.
const CachedLine = memo(({ el, activeTool, onDragStart, onDragMove, onDragEnd, onClick, onTransformStart, onTransformEnd }: {
  el: any;
  activeTool?: string;
  onDragStart?: (e: any) => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
  onClick: (e: any) => void;
  onTransformStart?: (e: any) => void;
  onTransformEnd?: (e: any) => void;
}) => {
  const lineRef = useRef<any>(null);

  // Tính toán Bounding Box từ mảng points để phủ vùng click toàn bộ khung hộp
  const { minX, minY, width, height } = React.useMemo(() => {
    const pts = el.points || [];
    if (pts.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [el.points]);

  useEffect(() => {
    const node = lineRef.current;
    if (!node) return;

    // Chỉ cache nếu là nét vẽ tay siêu phức tạp (nhiều hơn 150 điểm) để tối ưu hiệu năng.
    // Với nét vẽ bình thường (dưới 150 điểm), không cache giúp giữ nét vẽ sắc nét và đảm bảo hitStrokeWidth hoạt động chuẩn xác.
    if (el.points && el.points.length > 150) {
      node.cache({ offset: 25 });
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [el.points, el.stroke, el.strokeWidth, el.dash]);

  return (
    <Line
      ref={lineRef}
      id={el.id}
      points={el.points}
      stroke={el.stroke || '#6366f1'}
      strokeWidth={el.strokeWidth || 3}
      hitStrokeWidth={20}
      tension={el.tension || 0}
      lineCap={el.lineCap || 'round'}
      lineJoin={el.lineJoin || 'round'}
      dash={el.dash || undefined}
      x={el.x || 0}
      y={el.y || 0}
      rotation={el.rotation || 0}
      scaleX={el.scaleX || 1}
      scaleY={el.scaleY || 1}
      draggable={activeTool === 'select' || !activeTool}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformStart={onTransformStart}
      onTransformEnd={onTransformEnd}
      onClick={onClick}
      perfectDrawEnabled={!el.points || el.points.length <= 150}
      // Bắt click trên toàn bộ bounding box của nét vẽ (cộng thêm 10px lề xung quanh)
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(minX - 10, minY - 10, width + 20, height + 20);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
});

export default function CanvasEditor(props: CanvasEditorProps) {
  const {
    stageRef, layerRef, trRef, selectionRectRef, stageWidth, stageHeight,
    currentPage, elements, selectedIds, editingId, setEditingId,
    updateElement, updateElementImmediate, selectionRect,
    handleMouseDown, handleMouseMove, handleMouseUp
  } = props;

  // ─── Ref cho Static Group để áp dụng Konva Caching ─────────────────────
  const staticGroupRef = useRef<any>(null);
  // Track text state khi bắt đầu edit để kiểm tra thay đổi khi blur
  const editingOriginalTextRef = useRef<string | null>(null);

  const editingElement = elements.find(el => el.id === editingId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- VIEWPORT STATES ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const [lines, setLines] = useState<any[]>([]);
  const isDrawingRef = useRef(false);

  // DOT PATTERN CHO WHITEBOARD
  const [dotPattern, setDotPattern] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (props.isWhiteboard) {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 40, 40);
        ctx.fillStyle = '#cbd5e1'; // slate-300
        ctx.beginPath();
        ctx.arc(4, 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const img = new window.Image();
      img.src = canvas.toDataURL();
      img.onload = () => setDotPattern(img);
    }
  }, [props.isWhiteboard]);

  // logic tự động Fit To Screen
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setContainerSize({ width: clientWidth, height: clientHeight });

    const paddingTop = 64; // Vừa đủ cho toolbar top-2 (cao khoảng 40px + margin)
    const paddingBottom = 24;
    const paddingX = 64;
    const scaleX = (clientWidth - paddingX) / stageWidth;
    const scaleY = (clientHeight - paddingTop - paddingBottom) / stageHeight;
    let newScale = Math.min(scaleX, scaleY, 2);

    if (props.isWhiteboard) {
      newScale = 1; // Default to 100% zoom cho whiteboard để khung trông rất to
    } else {
      newScale = Math.max(0.5, newScale);
    }

    setScale(newScale);
    setPosition({
      x: (clientWidth - stageWidth * newScale) / 2,
      y: paddingTop + (clientHeight - paddingTop - paddingBottom - stageHeight * newScale) / 2
    });
  }, [stageWidth, stageHeight, props.isWhiteboard]);

  // cập nhật khi Resize trình duyệt hoặc đổi Project mới (Tránh tự reset camera khi auto-expand stageWidth/Height)
  const lastPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentPage?.id && currentPage.id !== lastPageIdRef.current) {
      fitToScreen();
      lastPageIdRef.current = currentPage.id;
    }
  }, [currentPage?.id, fitToScreen]);

  useEffect(() => {
    const handleResize = () => fitToScreen();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      if (textareaRef.current.innerText !== editingElement.text) {
        textareaRef.current.innerText = editingElement.text;

        // Focus and place cursor at the end
        const el = textareaRef.current;
        el.focus();
        if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    }
  }, [editingId, scale]);

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
    } else if (props.activeTool === 'select' || !props.activeTool) {
      // --- PAN (KÉO MÀN HÌNH BẰNG CHUỘT GIỮA / SCROLL TRƠN) ---
      setPosition((prev) => ({
        x: prev.x - (e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX),
        y: prev.y - (e.evt.shiftKey ? 0 : e.evt.deltaY)
      }));
    }
  };

  // ─── Konva Group Caching: gộp các element tĩnh thành 1 bitmap GPU ──────
  useEffect(() => {
    const group = staticGroupRef.current;
    if (!group) return;
    // Không cache khi đang play animation
    if (props.isPlaying) {
      group.clearCache();
      group.getLayer()?.batchDraw();
      return;
    }
    // Chỉ cache khi có nhiều element tĩnh (>= 10) để tránh overhead
    const staticElements = elements.filter(el => !selectedIds.includes(el.id) && el.id !== editingId);
    if (staticElements.length >= 10) {
      // Thêm padding nhỏ để tránh clipping
      group.cache({ offset: 50, pixelRatio: window.devicePixelRatio || 1 });
    } else {
      group.clearCache();
    }
    group.getLayer()?.batchDraw();
  }, [elements, selectedIds, editingId, props.isPlaying]);

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      const nodes = selectedIds
        .filter(id => id !== editingId) // Hide Transformer for the currently editing element
        .map(id => layerRef.current.findOne(`#${id}`))
        .filter(Boolean);

      trRef.current.nodes(nodes);

      const rotater = trRef.current.findOne('.rotater');
      if (rotater) {
        rotater.sceneFunc((ctx: any, shape: any) => {
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fillStrokeShape(shape);

          const nativeCtx = ctx._context || ctx;
          nativeCtx.save();
          nativeCtx.translate(-7, -7);
          nativeCtx.scale(14 / 24, 14 / 24);

          const path = new Path2D('M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M16 21h5v-5');
          nativeCtx.strokeStyle = '#6366f1';
          nativeCtx.lineWidth = 3;
          nativeCtx.lineCap = 'round';
          nativeCtx.lineJoin = 'round';
          nativeCtx.beginPath();
          nativeCtx.stroke(path);
          nativeCtx.restore();
        });

        rotater.hitFunc((ctx: any, shape: any) => {
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        });
      }

      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements, editingId]);

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

  const handleDragEnd = useCallback((e: any) => {
    setGuidelines([]);

    // INFINITE CANVAS AUTO-EXPAND LOGIC
    const node = e.target;
    if (node.id() === 'bg' || node.name() === 'guideline' || node.getClassName() === 'Transformer') return;

    const parent = node.getParent();
    if (!parent) return;

    const box = node.getClientRect({ relativeTo: parent });
    if (!box) return;

    if (!props.isWhiteboard) return;

    const PADDING = 150;
    const STEP = 500;
    const currentW = Number(stageWidth);
    const currentH = Number(stageHeight);
    let newW = currentW;
    let newH = currentH;
    let dx = 0;
    let dy = 0;

    const LIMIT = 10000;
    let limitReached = false;

    if (box.x + box.width > currentW - PADDING) newW = Math.max(currentW + STEP, Math.ceil((box.x + box.width + PADDING) / STEP) * STEP);
    if (box.y + box.height > currentH - PADDING) newH = Math.max(currentH + STEP, Math.ceil((box.y + box.height + PADDING) / STEP) * STEP);
    if (box.x < PADDING) {
      const diff = Math.ceil((PADDING - box.x) / STEP) * STEP;
      newW += diff; dx = -diff;
    }
    if (box.y < PADDING) {
      const diff = Math.ceil((PADDING - box.y) / STEP) * STEP;
      newH += diff; dy = -diff;
    }

    if (newW > LIMIT) {
      if (dx < 0) {
        const maxDiff = LIMIT - currentW;
        dx = maxDiff >= 0 ? -maxDiff : 0;
      }
      newW = LIMIT;
      limitReached = true;
    }
    if (newH > LIMIT) {
      if (dy < 0) {
        const maxDiff = LIMIT - currentH;
        dy = maxDiff >= 0 ? -maxDiff : 0;
      }
      newH = LIMIT;
      limitReached = true;
    }

    if (limitReached && props.onLimitReached) {
      props.onLimitReached();
    }

    if (newW !== currentW || newH !== currentH) {
      // SỬA LỖI GIẬT CAMERA: Di chuyển camera tương ứng với độ tịnh tiến của vật thể
      setPosition(prev => ({
        x: prev.x + dx * scale,
        y: prev.y + dy * scale
      }));
      if (props.onResizeFinal) props.onResizeFinal(newW, newH, dx, dy);
    }
  }, [stageWidth, stageHeight, scale, props]);

  const getStageRelativePointerPos = useCallback((e: any) => {
    const stage = stageRef.current;
    if (!stage) return null;

    const clientX = e.clientX !== undefined ? e.clientX : (e.evt?.clientX !== undefined ? e.evt.clientX : null);
    const clientY = e.clientY !== undefined ? e.clientY : (e.evt?.clientY !== undefined ? e.evt.clientY : null);

    if (clientX !== null && clientY !== null) {
      const rect = stage.container().getBoundingClientRect();
      const transform = stage.getAbsoluteTransform().copy().invert();
      return transform.point({ x: clientX - rect.left, y: clientY - rect.top });
    }

    return stage.getRelativePointerPosition();
  }, [stageRef]);

  // TOOLBOX EVENT HANDLERS
  const onStageMouseDown = (e: any) => {
    // Bắt buộc blur text editor nếu đang edit mà click ra ngoài canvas
    if (editingId && textareaRef.current) {
      textareaRef.current.blur();
    }

    if (props.activeTool === 'draw' || props.activeTool === 'line') {
      isDrawingRef.current = true;
      const pos = stageRef.current?.getRelativePointerPosition();
      if (!pos) return;

      const currentLines = [...lines, { tool: props.activeTool, points: [pos.x, pos.y] }];
      setLines(currentLines);

      let localLines = currentLines;

      const handleGlobalDrawingMove = (moveEvt: MouseEvent) => {
        if (!isDrawingRef.current) return;
        const point = getStageRelativePointerPos(moveEvt);
        if (!point) return;

        let lastLine = { ...localLines[localLines.length - 1] };
        if (props.activeTool === 'draw') {
          const newPoints = lastLine.points.concat([point.x, point.y]);
          lastLine.points = newPoints.length > 16 && newPoints.length % 16 === 0
            ? douglasPeucker(newPoints, 1.5)
            : newPoints;
        } else {
          lastLine.points = [lastLine.points[0], lastLine.points[1], point.x, point.y];
        }

        localLines = [...localLines.slice(0, -1), lastLine];
        setLines(localLines);
      };

      const handleGlobalDrawingUp = (upEvt: MouseEvent) => {
        isDrawingRef.current = false;
        window.removeEventListener('mousemove', handleGlobalDrawingMove);
        window.removeEventListener('mouseup', handleGlobalDrawingUp);

        const lastLine = localLines[localLines.length - 1];
        if (lastLine && props.addElement) {
          const finalPoints = props.activeTool === 'draw'
            ? douglasPeucker(lastLine.points, 2)
            : lastLine.points;
          props.addElement({
            id: crypto.randomUUID(),
            type: 'line',
            tool: props.activeTool,
            points: finalPoints,
            stroke: '#6366f1',
            strokeWidth: props.activeTool === 'draw' ? 3 : 2,
            tension: props.activeTool === 'draw' ? 0.5 : 0,
            lineCap: 'round',
            lineJoin: 'round',
            x: 0,
            y: 0,
          });

          // AUTO EXPAND KHUNG KHI VẼ CHẠM LỀ
          const xs = lastLine.points.filter((_: any, i: number) => i % 2 === 0);
          const ys = lastLine.points.filter((_: any, i: number) => i % 2 !== 0);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          if (!props.isWhiteboard) {
            setLines([]);
            return;
          }

          const PADDING = 150;
          const STEP = 500;
          const currentW = Number(stageWidth);
          const currentH = Number(stageHeight);
          let newW = currentW;
          let newH = currentH;
          let dx = 0; let dy = 0;

          const LIMIT = 10000;
          let limitReached = false;

          if (maxX > currentW - PADDING) newW = Math.max(currentW + STEP, Math.ceil((maxX + PADDING) / STEP) * STEP);
          if (maxY > currentH - PADDING) newH = Math.max(currentH + STEP, Math.ceil((maxY + PADDING) / STEP) * STEP);
          if (minX < PADDING) {
            const diff = Math.ceil((PADDING - minX) / STEP) * STEP;
            newW += diff; dx = -diff;
          }
          if (minY < PADDING) {
            const diff = Math.ceil((PADDING - minY) / STEP) * STEP;
            newH += diff; dy = -diff;
          }

          if (newW > LIMIT) {
            if (dx < 0) {
              const maxDiff = LIMIT - currentW;
              dx = maxDiff >= 0 ? -maxDiff : 0;
            }
            newW = LIMIT;
            limitReached = true;
          }
          if (newH > LIMIT) {
            if (dy < 0) {
              const maxDiff = LIMIT - currentH;
              dy = maxDiff >= 0 ? -maxDiff : 0;
            }
            newH = LIMIT;
            limitReached = true;
          }

          if (limitReached && props.onLimitReached) {
            props.onLimitReached();
          }

          if (newW !== currentW || newH !== currentH) {
            // SỬA LỖI GIẬT CAMERA KHI ĐANG VẼ
            setPosition(prev => ({
              x: prev.x + dx * scale,
              y: prev.y + dy * scale
            }));
            if (props.onResizeFinal) props.onResizeFinal(newW, newH, dx, dy);
          }
        }
        setLines([]);
      };

      window.addEventListener('mousemove', handleGlobalDrawingMove);
      window.addEventListener('mouseup', handleGlobalDrawingUp);
      return;
    }

    if (props.activeTool === 'sticky') {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos && props.addElement) {
        props.addElement({
          id: crypto.randomUUID(), type: 'text', text: 'Ghi chú', x: pos.x, y: pos.y,
          fill: '#334155', backgroundColor: '#fef08a', fontSize: 18, fontFamily: 'Inter', align: 'center', verticalAlign: 'middle', padding: 20,
        });
      }
      return;
    }

    if (props.activeTool === 'text') {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos && props.addElement) {
        props.addElement({
          id: crypto.randomUUID(), type: 'text', text: 'Nhập văn bản', x: pos.x, y: pos.y,
          fill: '#000000', fontSize: 24, fontFamily: 'Inter', align: 'left', verticalAlign: 'top', padding: 10,
        });
      }
      return;
    }

    if (!props.activeTool || props.activeTool === 'select') {
      props.handleMouseDown(e);
    }
  };



  // LOGIC XỬ LÝ HIỆU ỨNG (ANIMATION IN & OUT) & ĐỘ DÀI (DURATION)
  const animatedElements = elements.map(el => {
    // Preview mode: ẩn elements chưa đến lượt xuất hiện
    if (props.animPreviewHiddenIds?.has(el.id)) {
      return { ...el, opacity: 0, listening: false };
    }

    // Preview mode: apply đúng animation effect cho elements đang animate vào
    const previewCurrentStep = props.animPreviewCurrentStep;
    const previewProgress = props.animPreviewProgress ?? 1;
    if (
      previewCurrentStep !== undefined && previewCurrentStep >= 0 &&
      previewProgress < 1 &&
      (el.animationOrder ?? 999) === previewCurrentStep &&
      el.animation?.in && el.animation.in !== 'none'
    ) {
      const ease = 1 - Math.pow(1 - previewProgress, 3);
      const baseOpacity = el.opacity ?? 1;
      let newEl = { ...el };
      switch (el.animation.in) {
        case 'appear':
          newEl.opacity = previewProgress > 0 ? baseOpacity : 0;
          break;
        case 'fade':
          newEl.opacity = baseOpacity * ease;
          break;
        case 'flyIn':
          newEl.y = el.y + (1 - ease) * 200;
          newEl.opacity = baseOpacity * ease;
          break;
        case 'floatIn':
          newEl.y = el.y + (1 - ease) * 50;
          newEl.opacity = baseOpacity * ease;
          break;
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
        case 'bounce': {
          const spring = 1 - Math.cos(previewProgress * Math.PI * 3) * Math.exp(-previewProgress * 5);
          newEl.scaleX = (el.scaleX || 1) * spring;
          newEl.scaleY = (el.scaleY || 1) * spring;
          break;
        }
        case 'wipe':
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
        case 'split':
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
        default:
          newEl.opacity = baseOpacity * ease;
          break;
      }
      return newEl;
    }

    if (!el.timeline) return el; // Các phần tử vẽ tay/sticky không có timeline sẽ không bị dính animation
    if (props.currentTime === 0 && !props.isPlaying) return el;

    const start = el.timeline?.start || 0;
    const duration = el.timeline?.duration || 5;
    const end = start + duration;

    const animIn = el.animation?.in || 'none';
    const animOut = el.animation?.out || 'none';

    let newEl = { ...el };

    if (props.currentTime < start || props.currentTime > end) {
      newEl.opacity = 0;
      newEl.listening = false; // Chặn click khi đang tàng hình
      return newEl;
    }

    const animDuration = 0.5;

    let progressIn = 1;
    let progressOut = 1;

    if (props.currentTime < start + animDuration) {
      progressIn = (props.currentTime - start) / animDuration;
    } else if (props.currentTime > end - animDuration) {
      progressOut = (end - props.currentTime) / animDuration;
    }

    if (progressIn < 1 && animIn !== 'none') {
      const ease = 1 - Math.pow(1 - progressIn, 3);
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
          const spring = 1 - Math.cos(progressIn * Math.PI * 3) * Math.exp(-progressIn * 5);
          newEl.scaleX = (el.scaleX || 1) * spring;
          newEl.scaleY = (el.scaleY || 1) * spring;
          break;
        default:
          newEl.scaleX = (el.scaleX || 1) * ease;
          newEl.scaleY = (el.scaleY || 1) * ease;
          newEl.opacity = baseOpacity * ease;
          break;
      }
    }

    else if (progressOut < 1 && animOut !== 'none') {
      const ease = 1 - Math.pow(1 - progressOut, 3);
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

  // Cursor style tương ứng với công cụ đang chọn
  const cursorStyle: React.CSSProperties = {
    cursor: props.activeTool === 'draw' || props.activeTool === 'line' ? 'crosshair'
      : props.activeTool === 'text' ? 'text'
        : props.activeTool === 'sticky' ? 'cell'
          : 'default'
  };

  // --- Scrollbar calculations ---
  const SCROLL_PADDING = 200;
  const virtualWidth = Math.max(containerSize.width, stageWidth * scale + SCROLL_PADDING * 2);
  const virtualHeight = Math.max(containerSize.height, stageHeight * scale + SCROLL_PADDING * 2);

  const showScrollX = virtualWidth > containerSize.width;
  const showScrollY = virtualHeight > containerSize.height;

  const maxScrollX = virtualWidth - containerSize.width;
  const scrollRatioX = maxScrollX === 0 ? 0 : Math.max(0, Math.min(1, (SCROLL_PADDING - position.x) / maxScrollX));
  const trackWidthX = containerSize.width - (showScrollY ? 12 : 0);
  const thumbWidthX = Math.max(40, (trackWidthX / virtualWidth) * trackWidthX);
  const thumbLeftX = scrollRatioX * (trackWidthX - thumbWidthX);

  const maxScrollY = virtualHeight - containerSize.height;
  const scrollRatioY = maxScrollY === 0 ? 0 : Math.max(0, Math.min(1, (SCROLL_PADDING - position.y) / maxScrollY));
  const trackHeightY = containerSize.height - (showScrollX ? 12 : 0);
  const thumbHeightY = Math.max(40, (trackHeightY / virtualHeight) * trackHeightY);
  const thumbTopY = scrollRatioY * (trackHeightY - thumbHeightY);

  const handleThumbXDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startRatio = scrollRatioX;
    const trackSize = trackWidthX - thumbWidthX;
    if (trackSize <= 0) return;
    const handleMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const newRatio = Math.max(0, Math.min(1, startRatio + delta / trackSize));
      setPosition(prev => ({ ...prev, x: SCROLL_PADDING - newRatio * maxScrollX }));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleThumbYDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startRatio = scrollRatioY;
    const trackSize = trackHeightY - thumbHeightY;
    if (trackSize <= 0) return;
    const handleMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY;
      const newRatio = Math.max(0, Math.min(1, startRatio + delta / trackSize));
      setPosition(prev => ({ ...prev, y: SCROLL_PADDING - newRatio * maxScrollY }));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-slate-200 overflow-hidden outline-none"
      tabIndex={0}
      style={cursorStyle}
    >
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onWheel={handleWheel}
        onMouseDown={props.canEdit === false ? undefined : onStageMouseDown}
        onTouchStart={props.canEdit === false ? undefined : onStageMouseDown}
      >
        {/* ── STATIC LAYER: background + tất cả vật thể tĩnh ── */}
        <Layer ref={layerRef} onDragEnd={handleDragEnd}>
          <Rect
            id="bg"
            width={stageWidth}
            height={stageHeight}
            fill={currentPage?.background_color || "#ffffff"}
            fillPatternImage={props.isWhiteboard ? (dotPattern || undefined) : undefined}
            fillPatternRepeat="repeat"
            shadowBlur={props.isWhiteboard ? 0 : 15}
            shadowColor="rgba(0,0,0,0.1)"
            x={props.isWhiteboard ? 0 : pageAnim.x}
            y={props.isWhiteboard ? 0 : pageAnim.y}
            opacity={pageAnim.opacity}
            scaleX={pageAnim.scaleX} scaleY={pageAnim.scaleY}
            offsetX={props.isWhiteboard ? 0 : pageAnim.offsetX}
            offsetY={props.isWhiteboard ? 0 : pageAnim.offsetY}
          />

          <Group
            clipX={0}
            clipY={0}
            clipWidth={stageWidth}
            clipHeight={stageHeight}
            x={pageAnim.x} y={pageAnim.y} opacity={pageAnim.opacity}
            scaleX={pageAnim.scaleX} scaleY={pageAnim.scaleY}
            offsetX={pageAnim.offsetX} offsetY={pageAnim.offsetY}
            listening={props.canEdit === false ? false : (!props.activeTool || props.activeTool === 'select')}
          >
            {animatedElements.map((el) => {
              const isActive = selectedIds.includes(el.id) || editingId === el.id;
              if (el.type === 'circle') return <CircleShape key={el.id} shape={el} onChange={updateElement} onChangeFinal={updateElementImmediate} onSelect={() => { }} onDragMove={handleDragMove} onActionStart={props.onActionStart} />;
              if (el.type === 'rect' || el.type === 'shape') return <RectangleShape key={el.id} shape={el} onChange={updateElement} onChangeFinal={updateElementImmediate} onSelect={() => { }} onDragMove={handleDragMove} onActionStart={props.onActionStart} />;
              if (el.type === 'text') {
                // [FIX #8] Kiểm tra xem element này có đang bị người khác lock không
                const lockInfo = props.elementLocks?.get(el.id);
                const isLockedByOther = !!lockInfo;

                return (
                  <React.Fragment key={el.id}>
                    <EditableText
                      text={el}
                      onDblClick={() => {
                        // [FIX #8] Nếu element đang bị người khác lock → chặn edit
                        if (isLockedByOther) return;
                        // Lưu lại text gốc khi bắt đầu edit để kiểm tra sau khi blur
                        editingOriginalTextRef.current = el.text;
                        setEditingId(el.id);
                        // [FIX #8] Phát sự kiện lock lên EditorPage → broadcast qua socket
                        props.onTextEditStart?.(el.id);
                      }}
                      onChange={updateElement}
                      onChangeFinal={updateElementImmediate}
                      isEditing={editingId === el.id}
                      onSelect={() => { }}
                      onDragMove={handleDragMove}
                      onActionStart={props.onActionStart}
                    />
                    {/* [FIX #8] Lock Overlay: khung đỏ + tên người đang edit */}
                    {isLockedByOther && (
                      <Group
                        x={el.x}
                        y={el.y}
                        listening={false}
                      >
                        <Rect
                          width={el.width || 200}
                          height={el.height || 40}
                          stroke={lockInfo.avatarColor || '#ef4444'}
                          strokeWidth={2}
                          fill="transparent"
                          listening={false}
                          dash={[6, 3]}
                        />
                        <Text
                          text={`✏️ ${lockInfo.name} đang sửa...`}
                          fontSize={11}
                          fontFamily="Inter, sans-serif"
                          fill="white"
                          padding={3}
                          x={0}
                          y={-20}
                          listening={false}
                        />
                      </Group>
                    )}
                  </React.Fragment>
                );
              }
              if (el.type === 'image') return (
                <React.Fragment key={el.id}>
                  <URLImage image={el} onChange={updateElement} onChangeFinal={updateElementImmediate} onSelect={() => { }} onDragMove={handleDragMove} onActionStart={props.onActionStart} />
                  {/* Pro watermark overlay: visible only for Free users on Pro sticker elements */}
                  {el.is_premium && props.isFreeUser && (
                    <ProWatermarkOverlay el={el} />
                  )}
                </React.Fragment>
              );
              if (el.type === 'line') return (
                <CachedLine
                  key={el.id}
                  el={el}
                  activeTool={props.activeTool}
                  onDragStart={() => props.onActionStart?.()}
                  onTransformStart={() => props.onActionStart?.()}
                  onDragMove={(e: any) => {
                    updateElement({ ...el, x: e.target.x(), y: e.target.y() });
                    handleDragMove(e);
                  }}
                  onDragEnd={(e: any) => {
                    updateElementImmediate({ ...el, x: e.target.x(), y: e.target.y() });
                  }}
                  onTransformEnd={(e: any) => {
                    const node = e.target;
                    updateElementImmediate({
                      ...el,
                      x: node.x(),
                      y: node.y(),
                      scaleX: node.scaleX(),
                      scaleY: node.scaleY(),
                      rotation: node.rotation()
                    });
                  }}
                  onClick={(e: any) => props.handleMouseDown({ target: e.target })}
                />
              );
              return null;
            })}
            {guidelines.map((guide, i) => (
              <Line key={`guide-${i}`} name="guideline" points={guide.points} stroke={guide.stroke} strokeWidth={1 / scale} opacity={0.8} listening={false} />
            ))}
          </Group>

          {selectionRect.visible && props.activeTool === 'select' && (
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

          <Transformer
            ref={trRef}
            borderStroke="#6366f1"
            anchorStroke="#6366f1"
            anchorFill="#ffffff"
            anchorSize={8}
            boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox}
            onTransformEnd={() => {
              // Chỉ xử lý multi-select (nodes.length > 1).
              // Single element đã được xử lý bởi onTransformEnd của từng element component.
              // KHÔNG cập nhật React state trong onTransform — Konva tự xử lý visual realtime.
              if (!trRef.current) return;
              const nodes = trRef.current.nodes();
              if (nodes.length <= 1) return;

              // Đọc giá trị TRƯỚC khi bị individual handlers reset scale.
              // Vì Transformer.onTransformEnd fires AFTER mỗi node.onTransformEnd,
              // các individual handlers đã gọi node.scaleX(1) rồi, nên ta đọc từ props.elements
              // (React state chưa update vì đang cùng batch) để lấy giá trị gốc.
              const commitedEls: any[] = [];

              nodes.forEach((node: any) => {
                const el = props.elements.find((e: any) => e.id === node.id());
                if (!el) return;

                // node.rotation() luôn đúng (rotation không bị reset bởi individual handlers)
                const finalRotation = node.rotation();
                // node.x(), node.y() cũng luôn đúng
                const finalX = node.x();
                const finalY = node.y();
                // scaleX/scaleY: đọc trực tiếp từ node.
                // Nếu individual handler đã reset về 1 và bake vào width, ta lấy từ node.
                const scX = node.scaleX();
                const scY = node.scaleY();

                if (el.type === 'text') {
                  node.scaleX(1); node.scaleY(1);
                  const newFontSize = Math.max(8, Math.round((el.fontSize || 16) * Math.abs(scY)));
                  const newWidth = Math.max(20, Math.round((node.width() || el.width || 100) * Math.abs(scX)));
                  commitedEls.push({
                    ...el,
                    x: finalX, y: finalY,
                    fontSize: newFontSize, width: newWidth,
                    scaleX: Math.sign(scX) || 1, scaleY: Math.sign(scY) || 1,
                    rotation: finalRotation,
                  });
                } else if (el.type === 'image') {
                  node.scaleX(1); node.scaleY(1);
                  if (el.cropRect) {
                    const cr = el.cropRect;
                    commitedEls.push({
                      ...el,
                      x: finalX - cr.x, y: finalY - cr.y,
                      width: Math.max(5, el.width * Math.abs(scX)),
                      height: Math.max(5, el.height * Math.abs(scY)),
                      cropRect: { ...cr, width: Math.max(5, cr.width * Math.abs(scX)), height: Math.max(5, cr.height * Math.abs(scY)) },
                      scaleX: Math.sign(scX) || 1, scaleY: Math.sign(scY) || 1,
                      rotation: finalRotation,
                    });
                  } else {
                    commitedEls.push({
                      ...el,
                      x: finalX, y: finalY,
                      width: Math.max(5, (node.width() || el.width || 100) * Math.abs(scX)),
                      height: Math.max(5, (node.height() || el.height || 100) * Math.abs(scY)),
                      scaleX: Math.sign(scX) || 1, scaleY: Math.sign(scY) || 1,
                      rotation: finalRotation,
                    });
                  }
                } else if (el.type === 'circle') {
                  node.scaleX(1); node.scaleY(1);
                  commitedEls.push({
                    ...el,
                    x: finalX, y: finalY,
                    radius: Math.max(5, (el.radius || 50) * Math.abs(scX)),
                    scaleX: Math.sign(scX) || 1, scaleY: Math.sign(scY) || 1,
                    rotation: finalRotation,
                  });
                } else if (el.type === 'line') {
                  commitedEls.push({
                    ...el,
                    x: finalX, y: finalY,
                    scaleX: node.scaleX(), scaleY: node.scaleY(),
                    rotation: finalRotation,
                  });
                } else {
                  // rect / shape
                  node.scaleX(1); node.scaleY(1);
                  commitedEls.push({
                    ...el,
                    x: finalX, y: finalY,
                    width: Math.max(5, (node.width() || el.width || 100) * Math.abs(scX)),
                    height: Math.max(5, (node.height() || el.height || 100) * Math.abs(scY)),
                    scaleX: Math.sign(scX) || 1, scaleY: Math.sign(scY) || 1,
                    rotation: finalRotation,
                  });
                }
              });

              if (commitedEls.length > 0) {
                props.updateElementsBatchImmediate?.(commitedEls);
              }
            }}
          />


          {selectedIds.length > 1 && selectedIds.filter(id => id !== editingId).map(id => <IndividualBorder key={`border-${id}`} nodeId={id} />)}
        </Layer>

        {/* ── DYNAMIC LAYER: chỉ chứa nét vẽ tạm thời đang kéo (60fps, tách biệt) ── */}
        <Layer listening={false}>
          {lines.map((line, i) => (
            <Line
              key={i}
              points={line.points}
              stroke="#6366f1"
              strokeWidth={props.activeTool === 'draw' ? 3 : 2}
              tension={props.activeTool === 'draw' ? 0.5 : 0}
              lineCap="round"
              lineJoin="round"
              perfectDrawEnabled={false}
            />
          ))}
        </Layer>
      </Stage>

      {/* --- Custom Scrollbars --- */}
      {showScrollX && (
        <div className={`absolute bottom-0 left-0 h-3 bg-slate-800/10 hover:bg-slate-800/20 z-50 ${showScrollY ? 'right-3' : 'right-0'}`} onPointerDown={e => e.stopPropagation()}>
          <div
            className="absolute top-0 bottom-0 bg-slate-800/40 rounded-full cursor-pointer hover:bg-slate-800/60 transition-colors"
            style={{ width: thumbWidthX, left: thumbLeftX }}
            onPointerDown={handleThumbXDown}
          />
        </div>
      )}
      {showScrollY && (
        <div className={`absolute top-0 right-0 w-3 bg-slate-800/10 hover:bg-slate-800/20 z-50 ${showScrollX ? 'bottom-3' : 'bottom-0'}`} onPointerDown={e => e.stopPropagation()}>
          <div
            className="absolute left-0 right-0 bg-slate-800/40 rounded-full cursor-pointer hover:bg-slate-800/60 transition-colors"
            style={{ height: thumbHeightY, top: thumbTopY }}
            onPointerDown={handleThumbYDown}
          />
        </div>
      )}

      {editingElement && (
        <div
          ref={textareaRef as any}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const finalText = e.currentTarget.innerText;
            const originalText = editingOriginalTextRef.current;
            if (originalText !== null && finalText !== originalText) {
              props.onTextEditEnd?.(finalText, editingElement.id);
            }
            editingOriginalTextRef.current = null;
            setEditingId(null);
            updateElementImmediate({ ...editingElement, text: finalText });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              editingOriginalTextRef.current = null;
              setEditingId(null);
            }
          }}
          style={{
            position: 'absolute',
            top: position.y + (editingElement.y * scale),
            left: position.x + (editingElement.x * scale),
            minWidth: `${20 * scale}px`,
            width: editingElement.width ? `${editingElement.width * scale}px` : 'max-content',
            fontSize: editingElement.fontSize * scale,
            fontFamily: editingElement.fontFamily,
            color: editingElement.fill,
            fontWeight: editingElement.fontStyle?.includes('bold') ? 'bold' : 'normal',
            fontStyle: editingElement.fontStyle?.includes('italic') ? 'italic' : 'normal',
            textDecoration: editingElement.textDecoration || 'none',
            textAlign: editingElement.align || 'left',
            letterSpacing: editingElement.letterSpacing ? `${editingElement.letterSpacing}px` : 'normal',
            lineHeight: editingElement.lineHeight || 1.2,
            border: 'none',
            background: 'rgba(255, 255, 255, 0.02)',
            outline: 'none',
            boxShadow: '0 0 0 2px #6366f1, 0 4px 12px rgba(0, 0, 0, 0.1)',
            borderRadius: '4px',
            zIndex: 1000,
            padding: editingElement.padding ? `${editingElement.padding * scale}px` : '0px',
            margin: 0,
            boxSizing: 'border-box',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            transformOrigin: 'top left',
            transform: `rotateZ(${editingElement.rotation || 0}deg)`,
            cursor: 'text'
          }}
        />
      )}
    </div>
  );
}
