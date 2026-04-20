import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Stage, Layer, Rect, Circle, Text, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { 
  ChevronLeft, Type, Image as ImageIcon, Square, Download, 
  Settings, Save, Search, Upload, Trash2
} from 'lucide-react';
import { updateDesignFull } from '../api/api';
import TextToolbar from '../components/TextToolbar';
import { fetchDesigns, createDesign } from '../api/api';
import Konva from 'konva';

const ElementRenderer = ({ el, isSelected, onSelect, onDblClick, onChange, isEditing }: any) => {
  const shapeRef = useRef<any>(null);
  const [img] = useImage(el.src || '');

  const handleDragEnd = (e: any) => {
    onChange({ ...el, x: e.target.x(), y: e.target.y() }, true);
  };

  const commonProps = {
    ref: shapeRef,
    ...el,
    draggable: !isEditing,
    onClick: onSelect,
    onTap: onSelect,
    onDblClick: onDblClick,
    onDragEnd: handleDragEnd,
    name: 'selectable',
    id: el.id
  };

  if (el.type === 'rect') return <Rect {...commonProps} />;
  if (el.type === 'image') return <KonvaImage {...commonProps} image={img} />;
  if (el.type === 'text') return (
    <Text 
      {...commonProps} 
      visible={!isEditing} 
      onTransformEnd={() => {
        const node = shapeRef.current;
        const scaleX = node.scaleX();
        node.scaleX(1);
        onChange({ ...el, x: node.x(), y: node.y(), fontSize: el.fontSize * scaleX, width: node.width() * scaleX });
      }}
    />
  );
  return null;
};

const URLImage = ({ image, isSelected, onSelect, onChange }: any) => {
  const [img] = useImage(image.src, 'anonymous');
  const shapeRef = useRef<any>(null);

  return (
    <>
      <KonvaImage
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        id={image.id}
        image={img}
        {...image}
        draggable
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
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
    </ >
  );
};
const CircleShape = ({ shape, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <>
      <Circle
        onClick={onSelect}
        onTap={onSelect}
        id={shape.id}
        ref={shapeRef}
        {...shape}
        draggable
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

            radius: Math.max(5, shape.radius * scaleX)
          });
        }}
      />
    </ >
  );
};

const RectangleShape = ({ shape, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>(null);

  return (
    <>
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        id={shape.id}
        ref={shapeRef}
        {...shape}
        draggable
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
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
    </ >
  );
};

const EditableText = ({ text, isSelected, onSelect, onDblClick, onChange, isEditing }: any) => {
  const shapeRef = useRef<any>(null);
  return (
    <>
      <Text
        ref={shapeRef}
        {...text}
        visible={!isEditing}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        draggable={!isEditing}
        id={text.id}
        onDragEnd={(e) => onChange({ ...text, x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...text,
            x: node.x(),
            y: node.y(),
            fontSize: text.fontSize * scaleX,
            width: node.width() * scaleX,
          });
        }}
      />
    </ >
  );
};

const IndividualBorder = ({ nodeId }: { nodeId: string }) => {
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

// --- MAIN PAGE COMPONENT ---

export default function EditorPage() {

  // --- 1. Component State & Refs ---
  // Tất cả state, ref và hằng số của component được định nghĩa tại đây.
  
  const { id } = useParams();
  const [design, setDesign] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pages, setPages] = useState<any[]>([]); 
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const isInitialMount = useRef(true); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State cho UI
  const [activeTab, setActiveTab] = useState('elements');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [customFonts, setCustomFonts] = useState<string[]>(['Arial', 'Verdana', 'Roboto', 'Oswald', 'Inter']);
  const [recentStickers, setRecentStickers] = useState<any[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const [totalRecentPages, setTotalRecentPages] = useState(1);
  
  // State cho việc vẽ vùng chọn và kéo group
  const [selectionRect, setSelectionRect] = useState({
    visible: false, x: 0, y: 0, width: 0, height: 0, startX: 0, startY: 0
  });
  const [groupDrag, setGroupDrag] = useState({ isDragging: false, startX: 0, startY: 0 });

  // Refs
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const selectionRectRef = useRef<any>(null);

  // Constants
  const stageWidth = 800;
  const stageHeight = 600;

  // --- 2. Data Fetching & Initial Load ---
  // Các hàm và effect dùng để tải dữ liệu ban đầu khi component được mount.
  useEffect(() => {
    if (design?.title) setTempTitle(design.title);
  }, [design?.title]);

  useEffect(() => {
    fetch(`/api/designs/${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
        setDesign(data);
        if (data.pages && data.pages.length > 0) {
            // SỬA ĐOẠN NÀY ĐỂ NHẬN THUMBNAIL TỪ DB:
            const loadedPages = data.pages.map((p: any) => ({
              ...p, 
              elements: p.elements || [],
              thumbnail: p.thumbnail || '' // <--- GÁN THUMBNAIL TỪ DB VÀO ĐÂY
            }));
            
            loadedPages.sort((a: any, b: any) => a.page_order - b.page_order);

            setPages(loadedPages);
            setCurrentPageId(loadedPages[0].id);
            setElements(loadedPages[0].elements);
        } else {
            const initPageId = crypto.randomUUID();
            setPages([{ id: initPageId, page_order: 0, elements: [], thumbnail: '' }]);
            setCurrentPageId(initPageId);
            setElements([]);
        }
    })
    .catch(err => console.error(err));
  }, [id]);

  const fetchRecentStickers = async (page = 1, limit = 10) => {
    try {
      const res = await fetch(`/api/designs/recent-stickers?page=${page}&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setRecentStickers(data.data || []);
      setTotalRecentPages(data.totalPages || 1);
      setRecentPage(page);
    } catch (error) { 
      console.error('Fetch recent stickers failed:', error); 
    }
  };

  useEffect(() => {
    // Load recent stickers on first mount
    fetchRecentStickers(1, 10);
  }, []);

  // --- 3. Core Canvas Interaction: Selection & Dragging ---
  // Các hàm xử lý sự kiện chuột trực tiếp trên Konva Stage để chọn, di chuyển, và thay đổi kích thước.

  const handleMouseDown = (e: any) => {
    const isTransformer = e.target.getParent()?.className === 'Transformer';
    if (isTransformer) return;

    const isBackground = e.target === e.target.getStage() || e.target.id() === 'bg';

    if (isBackground) {
      const pos = e.target.getStage().getPointerPosition();

      if (selectedIds.length > 1 && trRef.current) {
        const box = trRef.current.getClientRect();
        if (
          pos.x >= box.x && pos.x <= box.x + box.width &&
          pos.y >= box.y && pos.y <= box.y + box.height
        ) {
          const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
          nodes.forEach(node => {
            node.setAttr('dragStartX', node.x());
            node.setAttr('dragStartY', node.y());
          });
          
          setGroupDrag({ isDragging: true, startX: pos.x, startY: pos.y });
          return;
        }
      }

      e.evt.preventDefault();
      setSelectionRect({
        visible: true, startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, width: 0, height: 0,
      });
      setSelectedIds([]);
      return;
    }

    const clickedOnId = e.target.id();
    if (!clickedOnId) return;

    if (!e.evt.shiftKey) {
      if (!selectedIds.includes(clickedOnId)) setSelectedIds([clickedOnId]);
    } else {
      if (selectedIds.includes(clickedOnId)) setSelectedIds(selectedIds.filter(id => id !== clickedOnId));
      else setSelectedIds([...selectedIds, clickedOnId]);
    }
  };

  const handleMouseMove = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();

    if (groupDrag.isDragging) {
      e.evt.preventDefault();
      const dx = pos.x - groupDrag.startX;
      const dy = pos.y - groupDrag.startY;

      const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
      nodes.forEach(node => {
        node.x(node.getAttr('dragStartX') + dx);
        node.y(node.getAttr('dragStartY') + dy);
      });
      
      trRef.current?.getLayer().batchDraw();
      return;
    }

    if (!selectionRect.visible) return;
    e.evt.preventDefault();
    setSelectionRect(prev => ({
      ...prev,
      x: Math.min(pos.x, prev.startX),
      y: Math.min(pos.y, prev.startY),
      width: Math.abs(pos.x - prev.startX),
      height: Math.abs(pos.y - prev.startY),
    }));
  };

  const handleMouseUp = (e: any) => {
    if (groupDrag.isDragging) {
      e.evt.preventDefault();
      const pos = e.target.getStage().getPointerPosition();
      const dx = pos.x - groupDrag.startX;
      const dy = pos.y - groupDrag.startY;

      setElements(prevElements => prevElements.map(el => {
        if (selectedIds.includes(el.id)) {
          return { ...el, x: el.x + dx, y: el.y + dy };
        }
        return el;
      }));
      
      setGroupDrag({ isDragging: false, startX: 0, startY: 0 });
      return;
    }

    if (!selectionRect.visible) return;
    e.evt.preventDefault();

    setTimeout(() => {
      setSelectionRect(prev => ({ ...prev, visible: false }));
    });

    const selBox = selectionRectRef.current.getClientRect();
    const newSelectedIds = elements.filter(el => {
      const node = layerRef.current.findOne(`#${el.id}`);
      if (!node) return false;
      const nodeBox = node.getClientRect();
      return Konva.Util.haveIntersection(selBox, nodeBox);
    }).map(el => el.id);

    setSelectedIds(newSelectedIds);
  };

  const handlePageChange = (newPageId: string) => {
    if (newPageId === currentPageId) return;

    // 1. Chụp ảnh thumbnail trang hiện tại (chất lượng thấp để nhẹ máy)
    let thumb = '';
    if (stageRef.current) {
      // Ẩn khung chọn tím trước khi chụp
      setSelectedIds([]); 
      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
    }

    // 2. Lưu elements và thumbnail vào page cũ
    const updatedPages = pages.map(p => 
      p.id === currentPageId ? { ...p, elements: elements, thumbnail: thumb } : p
    );
    setPages(updatedPages);

    // 3. Nạp elements của trang mới lên Canvas
    const targetPage = updatedPages.find(p => p.id === newPageId);
    setElements(targetPage?.elements || []);
    setCurrentPageId(newPageId);
  };

  // Hàm 2: Thêm trang mới
  const handleAddPage = () => {
    // 1. Chụp và lưu trang hiện tại
    let thumb = '';
    if (stageRef.current) {
      setSelectedIds([]);
      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
    }
    const updatedPages = pages.map(p => 
      p.id === currentPageId ? { ...p, elements: elements, thumbnail: thumb } : p
    );

    // 2. Tạo trang trống mới
    const newPageId = crypto.randomUUID();
    const newPage = { 
      id: newPageId, 
      page_order: updatedPages.length, 
      elements: [], 
      thumbnail: '' 
    };

    // 3. Cập nhật state
    setPages([...updatedPages, newPage]);
    setElements([]); // Xóa trắng Canvas
    setCurrentPageId(newPageId);
  };

  // --- 4. Element Management (CRUD Operations) ---
  // Các hàm thêm, cập nhật, xóa, và di chuyển các phần tử trong state `elements`.

  const addText = () => {
    setElements([...elements, { 
      id: crypto.randomUUID(), type: 'text', x: 150, y: 150, 
      text: 'Double click to edit', fontSize: 32, fontFamily: 'Arial', 
      fill: '#000000', width: 300, fontStyle: 'normal' 
    }]);
  };

  const addRectangle = () => {
    setElements([...elements, { id: crypto.randomUUID(), type: 'rect', x: 100, y: 100, width: 100, height: 100, fill: '#6366f1' }]);
  };

  const addCircle = () => {
    setElements([...elements, { id: crypto.randomUUID(), type: 'circle', x: 150, y: 150, radius: 50, fill: '#6366f1' }]);
  };

  const addImage = (src: string) => {
    setElements([...elements, { id: crypto.randomUUID(), type: 'image', x: 200, y: 200, width: 200, height: 200, src }]);
  };

  const updateElement = (newAttrs: any) => {
    setElements(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  const deleteSelectedElement = () => {
    if (selectedIds.length === 0) return;
    setElements(elements.filter(el => !selectedIds.includes(el.id)));
    setSelectedIds([]); 
  };
  
  const moveElement = (direction: 'up' | 'down') => {
    if (selectedIds.length !== 1) return;
    const index = elements.findIndex(el => el.id === selectedIds[0] );
    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) {
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    } else if (direction === 'down' && index > 0) {
      [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
    }
    setElements(newElements);
  };

  // --- 5. Side Panel & Asset Management ---
  // Logic liên quan đến các tab ở thanh bên: tìm kiếm, tải lên, v.v.

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try { 
      const res = await fetch(`/api/assets/search?q=${encodeURIComponent(searchQuery)}&type=sticker`);
      const data = await res.json();
      setSearchResults(data.assets || []);
      setActiveTab('search_results');
    } catch (error) { console.error('Search failed:', error); }
  };

  const fetchAssets = async (type: string) => {
    try {
      const res = await fetch(`/api/assets/search?type=${type}`);
      const data = await res.json();
      setSearchResults(data.assets || []);
      setActiveTab('search_results');
    } catch (error) { console.error('Search failed:', error); }
  };
  
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fontName = file.name.split('.')[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      const fontData = event.target?.result as ArrayBuffer;
      const fontFace = new FontFace(fontName, fontData);
      try {
        const loadedFace = await fontFace.load();
        (document.fonts as any).add(loadedFace);
        setCustomFonts(prev => [...prev, fontName]);
        alert(`Font ${fontName} đã được nạp!`);
      } catch (err) { alert("Lỗi font!"); }
    };
    reader.readAsArrayBuffer(file);
  };
  
  // --- 6. Save & Export ---
  // Các hàm xử lý việc lưu trữ dữ liệu thiết kế lên server và xuất file ảnh.

  const handleSave = async (isSilent = false) => {
    setSaveStatus('saving');
    setIsSaving(true);
    try {
      let currentThumb = '';
      if (stageRef.current) {
         currentThumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
      }

      const finalPages = pages.map(p => 
        p.id === currentPageId ? { ...p, elements: elements, thumbnail: currentThumb } : p
      );

      // 👇 LẤY THUMBNAIL CỦA PAGE ĐẦU TIÊN
      const projectThumbnail = finalPages.length > 0 ? finalPages[0].thumbnail : '';

      const payload = {
        title: design?.title || 'Untitled Design',
        thumbnail_url: projectThumbnail, // 👇 THÊM DÒNG NÀY ĐỂ GỬI ẢNH BÌA XUỐNG DB
        pages: finalPages.map((page, index) => ({
          id: page.id,
          page_order: index,
          thumbnail: page.thumbnail, 
          elements: page.elements.map((el: any, idx: number) => {
            let dbType = el.type || el.element_type || 'text';
            if (dbType === 'rect') dbType = 'shape'; 

            return {
              id: el.id,
              element_type: dbType,
              z_index: idx,
              properties: el, 
              visible: true,
              locked: false
            };
          })
        }))
      };

      await updateDesignFull(id!, payload);
      setSaveStatus('saved');
      if (!isSilent) alert("Thiết kế đã được lưu thành công!");
    } catch (error) {
      setSaveStatus('unsaved');
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    setSelectedIds([]);
    setSelectionRect(prev => ({ ...prev, visible: false }));

    setTimeout(() => {
      if (!stageRef.current) return;

      const dataURL = stageRef.current.toDataURL({
        pixelRatio: 2,
        mimeType: 'image/png',
      });

      const link = document.createElement('a');
      link.download = `${design?.title || 'Untitled-Design'}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 100); 
  };
  
  // --- 7. Side Effects (useEffect Hooks) & Event Listeners ---
  // Các hook `useEffect` để xử lý các tác vụ phụ thuộc vào sự thay đổi của state hoặc lắng nghe sự kiện toàn cục.

  useEffect(() => {
    if (isInitialMount.current) {
      if (elements.length > 0 || pages.length > 0) {
          isInitialMount.current = false;
      }
      return;
    }

    setSaveStatus('unsaved');

    const timer = setTimeout(() => {
      handleSave(true); 
    }, 3000);

    return () => clearTimeout(timer);
  }, [elements, pages, design?.title]);

  // Effect để gắn các nodes đã chọn vào Transformer
  useEffect(() => {
    if (trRef.current && layerRef.current) {
      const nodes = selectedIds
        .map(id => layerRef.current.findOne(`#${id}`))
        .filter(Boolean);
      
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements]);

  // Effect cho phím tắt Xóa (Delete/Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !editingId && selectedIds.length > 0) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        deleteSelectedElement();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, elements, editingId]);

  // Effect cho chức năng Dán (Paste) ảnh từ clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Url = event.target?.result as string;
            const img = new window.Image();
            img.src = base64Url;
            img.onload = () => {
              const maxWidth = 400;
              const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
              const finalWidth = img.width * ratio;
              const finalHeight = img.height * ratio;

              setElements(prev => [...prev, { 
                id: crypto.randomUUID(), type: 'image', 
                x: stageWidth / 2 - finalWidth / 2, y: stageHeight / 2 - finalHeight / 2, 
                width: finalWidth, height: finalHeight, src: base64Url 
              }]);
              setActiveTab('elements'); 
            };
          };
          reader.readAsDataURL(file);
          e.preventDefault(); 
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste as any);
    return () => window.removeEventListener('paste', handlePaste as any);
  }, [stageWidth, stageHeight]);

  // --- 8. Derived State & Render Helpers ---
  // Các biến được tính toán từ state, dùng để đơn giản hóa logic trong JSX.
  
  const selectedElement = selectedIds.length === 1 
    ? elements.find(el => el.id === selectedIds[0]) 
    : null;
  const editingElement = elements.find(el => el.id === editingId);

  // --- 9. JSX Rendering ---
  // Cấu trúc giao diện người dùng của component.

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 z-30 shadow-md">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-white/10 rounded-full transition"><ChevronLeft size={20} /></Link>
          <div className="flex flex-col">
            {/* LOGIC ĐỔI TÊN PROJECT */}
            {isEditingTitle ? (
              <input
                type="text"
                autoFocus
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  setDesign({ ...design, title: tempTitle || 'Untitled Design' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    setDesign({ ...design, title: tempTitle || 'Untitled Design' });
                  }
                }}
                className="font-bold text-sm tracking-tight bg-slate-800 text-white border border-indigo-500 rounded px-1 py-0 outline-none w-48"
              />
            ) : (
              <span 
                onDoubleClick={() => setIsEditingTitle(true)}
                className="font-bold text-sm tracking-tight cursor-text hover:bg-slate-800 rounded px-1 -ml-1 transition border border-transparent hover:border-slate-600"
                title="Double click to rename"
              >
                {design?.title || 'Untitled Design'}
              </span>
            )}
            
            {/* Đèn trạng thái Auto-save giữ nguyên ở dưới */}
            <div className="flex items-center gap-1.5 px-1 -ml-1 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
                saveStatus === 'unsaved' ? 'bg-rose-400' : 'bg-emerald-400'
              }`} />
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {saveStatus === 'saving' ? 'Đang lưu...' : 
                saveStatus === 'unsaved' ? 'Có thay đổi chưa lưu' : 'Đã lưu vào hệ thống'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => handleSave(false)} disabled={isSaving} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-bold flex items-center gap-2 transition">
            <Save size={16} /> {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button 
            onClick={handleExport} 
            className="px-4 py-1.5 bg-white text-slate-900 hover:bg-slate-50 rounded text-sm font-bold flex items-center gap-2 transition shadow-sm"
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Left */}
        <div className="w-20 bg-slate-800 text-slate-400 flex flex-col items-center py-6 gap-8 z-20 shrink-0 border-r border-slate-700">
          <button onClick={() => setActiveTab('elements')} className={`flex flex-col items-center gap-1 ${activeTab === 'elements' || activeTab === 'search_results' ? 'text-white' : 'hover:text-slate-200'}`}>
            <Square size={24} /><span className="text-[10px] font-bold uppercase tracking-tighter">Elements</span>
          </button>
          <button onClick={() => setActiveTab('uploads')} className={`flex flex-col items-center gap-1 ${activeTab === 'uploads' ? 'text-white' : 'hover:text-slate-200'}`}>
            <ImageIcon size={24} /><span className="text-[10px] font-bold uppercase tracking-tighter">Uploads</span>
          </button>
          <button onClick={() => setActiveTab('text')} className={`flex flex-col items-center gap-1 ${activeTab === 'text' ? 'text-white' : 'hover:text-slate-200'}`}>
            <Type size={24} /><span className="text-[10px] font-bold uppercase tracking-tighter">Text</span>
          </button>
          <label className="flex flex-col items-center gap-1 cursor-pointer hover:text-white mt-auto mb-4">
            <Upload size={22} />
            <span className="text-[10px] font-bold text-center">Import<br/>Font</span>
            <input type="file" accept=".ttf,.otf" onChange={handleFontUpload} className="hidden" />
          </label>
        </div>

        {/* Object Panel (Drawer) */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-700 uppercase text-[11px] tracking-widest flex justify-between items-center">
             <span>{activeTab.replace('_', ' ')}</span>
             {activeTab === 'search_results' && <button onClick={() => setActiveTab('elements')} className="text-indigo-600 text-[10px]">Back</button>}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Elements & Search */}
            {(activeTab === 'elements' || activeTab === 'search_results') && (
              <div className="space-y-6">
                <form onSubmit={handleSearch} className="relative">
                    <input 
                        type="text" placeholder="Search icons, stickers..." value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                </form>

                {activeTab === 'search_results' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {searchResults.map((asset: any) => (
                      <button key={asset.id} onClick={() => addImage(asset.url)} className="aspect-square bg-slate-50 rounded border hover:border-indigo-500 transition overflow-hidden">
                        <img src={asset.thumbnail_url || asset.url} className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentStickers.length > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase">Recently Used</h4>
                          {recentStickers.length >= 1 && (
                            <button 
                              onClick={() => { setActiveTab('recent_all'); fetchRecentStickers(1, 20); }} 
                              className="text-[10px] text-indigo-600 font-bold hover:underline"
                            >
                              See all
                            </button>
                          )}
                        </div>
                        <div className="flex overflow-x-auto gap-2 pb-2 snap-x smooth-scroll" style={{ scrollbarWidth: 'none' }}>
                          {recentStickers.slice(0, 10).map((sticker, idx) => (
                            <button 
                              key={idx} 
                              onClick={() => addImage(sticker.url)} 
                              className="shrink-0 w-16 h-16 bg-slate-50 rounded border border-slate-200 hover:border-indigo-500 overflow-hidden transition snap-center flex items-center justify-center"
                            >
                              <img src={sticker.url} className="w-12 h-12 object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={addRectangle} className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs border border-indigo-100 hover:bg-indigo-100">Add Rectangle</button>
                    {/* <button onClick={addCircle} className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs border border-indigo-100 hover:bg-indigo-100">Add Circle</button> */}
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Featured Graphics</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <button key={i} onClick={() => addImage(`https://picsum.photos/seed/${i+100}/200`)} className="aspect-square bg-slate-50 rounded hover:ring-2 ring-indigo-500 overflow-hidden transition">
                          <img src={`https://picsum.photos/seed/${i+100}/200`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'recent_all' && (
              <div className="space-y-4 flex flex-col h-full">
                <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 content-start">
                  {recentStickers.map((sticker, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => addImage(sticker.url)} 
                      className="aspect-square bg-slate-50 rounded border hover:border-indigo-500 transition overflow-hidden p-2 flex items-center justify-center"
                    >
                      <img src={sticker.url} className="w-full h-full object-contain" />
                    </button>
                  ))}
                </div>

                {totalRecentPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                    <button 
                      disabled={recentPage === 1}
                      onClick={() => fetchRecentStickers(recentPage - 1, 20)}
                      className="px-3 py-1.5 bg-slate-100 text-xs font-bold rounded text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition"
                    >
                      Prev
                    </button>
                    <span className="text-[11px] font-bold text-slate-400">
                      Page {recentPage} of {totalRecentPages}
                    </span>
                    <button 
                      disabled={recentPage === totalRecentPages}
                      onClick={() => fetchRecentStickers(recentPage + 1, 20)}
                      className="px-3 py-1.5 bg-slate-100 text-xs font-bold rounded text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-4">
                <button onClick={addText} className="w-full py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg font-bold text-lg hover:bg-slate-100 transition">Add a heading</button>
                <button onClick={addText} className="w-full py-3 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-md hover:bg-slate-100 transition text-left px-4">Add a subheading</button>
                <div className="pt-4">
                   <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3">Custom Fonts</h4>
                   <div className="flex flex-wrap gap-2">
                      {customFonts.map(f => <span key={f} className="px-2 py-1 bg-slate-100 rounded text-[10px] border shadow-sm cursor-default" style={{fontFamily: f}}>{f}</span>)}
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'uploads' && (
              <div className="space-y-4 text-center">
                 <button className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition">Upload Files</button>
                 <p className="text-[10px] text-slate-400 italic">Support PNG, JPG, SVG up to 10MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Work Area */}
        <div className="flex-1 bg-slate-200 flex flex-col relative overflow-hidden">
          {/* Top Toolbar */}
          <div className="h-12 bg-white border-b border-slate-300 flex items-center px-4 shadow-sm z-20">
            {selectedElement?.type === 'text' && (
              <TextToolbar 
                element={selectedElement} 
                onUpdate={updateElement} 
                onDelete={deleteSelectedElement} 
                onMove={moveElement}
                fontList={customFonts}
              />
            )}
            {!selectedElement && <span className="text-[11px] text-slate-400 font-medium">Select an element to start editing</span>}
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-12">
            <div className="relative shadow-2xl bg-white" style={{ width: stageWidth, height: stageHeight }}>
              <Stage
                ref={stageRef}
                width={stageWidth}
                height={stageHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <Layer ref={layerRef}>
                  <Rect id="bg" width={stageWidth} height={stageHeight} fill="#ffffff" />
                  
                  {elements.map((el) => {
                    // if (el.type === 'line') return <Line key={el.id} line={el} onChange={updateElement} />;
                    // if (el.type === 'ellipse') return <EllipseShape key={el.id} shape={el} onChange={updateElement} />;
                    if (el.type === 'circle') return <CircleShape key={el.id} shape={el} onChange={updateElement} />;
                    if (el.type === 'rect') return <RectangleShape key={el.id} shape={el} onChange={updateElement} />;
                    if (el.type === 'text') return (
                      <EditableText 
                        key={el.id} text={el} 
                        onDblClick={() => setEditingId(el.id)}
                        onChange={updateElement}
                        isEditing={editingId === el.id}
                      />
                    );
                    if (el.type === 'image') return <URLImage key={el.id} image={el} onChange={updateElement} />;
                    return null;
                  })}

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

                  <Transformer 
                    ref={trRef} 
                    borderStroke="#6366f1"
                    anchorStroke="#6366f1"
                    anchorFill="#ffffff"
                    anchorSize={8}
                    boundBoxFunc={(oldBox, newBox) => {
                      if (newBox.width < 5 || newBox.height < 5) return oldBox;
                      return newBox;
                    }}
                  />

                  {selectedIds.length > 1 && selectedIds.map(id => (
                    <IndividualBorder key={`border-${id}`} nodeId={id} />
                  ))}
                  
                </Layer>
              </Stage>

              {editingElement && (
                <textarea
                  autoFocus
                  value={editingElement.text}
                  onChange={(e) => updateElement({ ...editingElement, text: e.target.value })}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && setEditingId(null)}
                  style={{
                    position: 'absolute',
                    top: editingElement.y, left: editingElement.x,
                    width: editingElement.width || 200, fontSize: editingElement.fontSize,
                    fontFamily: editingElement.fontFamily, color: editingElement.fill,
                    fontWeight: editingElement.fontStyle?.includes('bold') ? 'bold' : 'normal',
                    fontStyle: editingElement.fontStyle?.includes('italic') ? 'italic' : 'normal',
                    textDecoration: editingElement.textDecoration,
                    border: '1px solid #6366f1', background: 'white',
                    outline: 'none', resize: 'none', lineHeight: 1.2,
                    zIndex: 1000, padding: 0, margin: 0, overflow: 'hidden'
                  }}
                />
              )}
            </div>
          </div>
          
          <div className="h-32 bg-slate-100 border-t border-slate-300 flex items-center px-4 overflow-x-auto gap-4 shadow-inner" style={{ scrollbarWidth: 'thin' }}>
            
            {/* Render danh sách các trang */}
            {pages.map((page, index) => (
              <div key={page.id} className="flex flex-col items-center gap-2 shrink-0">
                <button 
                  onClick={() => handlePageChange(page.id)}
                  className={`relative w-28 h-20 bg-white shadow-sm border-2 transition overflow-hidden ${
                    currentPageId === page.id ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-transparent hover:border-slate-300'
                  }`}
                >
                  {/* Số thứ tự trang */}
                  <span className="absolute top-1 left-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-70 z-10">
                    {index + 1}
                  </span>
                  
                  {/* Hiển thị Thumbnail */}
                  {(page.id === currentPageId) ? (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-indigo-500 font-bold bg-indigo-50">
                      Đang chỉnh sửa
                    </div>
                  ) : page.thumbnail ? (
                    <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-white">
                      Trống
                    </div>
                  )}
                </button>
                
                {/* Nút xóa trang (Tùy chọn, chỉ hiện khi có > 1 trang) */}
                {pages.length > 1 && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if(window.confirm('Xóa trang này?')) {
                        const newPages = pages.filter(p => p.id !== page.id);
                        setPages(newPages);
                        if (currentPageId === page.id) {
                           setCurrentPageId(newPages[0].id);
                           setElements(newPages[0].elements);
                        }
                      }
                    }}
                    className="text-[10px] text-red-400 hover:text-red-600 font-bold"
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}

            {/* Nút Thêm Trang (Nằm cuối cùng) */}
            <button 
              onClick={handleAddPage}
              className="shrink-0 w-12 h-20 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 transition"
              title="Add new page"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            
          </div>
          {/* END MULTI-PAGE BOTTOM BAR */}


          {/* Zoom & Canvas Info */}
          <div className="h-8 bg-white border-t border-slate-300 flex items-center justify-between px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <div>Stage: {stageWidth}x{stageHeight}</div>
            <div className="flex gap-4">
                <span>
                  Selected: {
                    selectedIds.length === 0 ? 'None' : 
                    selectedIds.length === 1 ? selectedIds[0].slice(0, 8) : 
                    `${selectedIds.length} items`
                  }
                </span>
                <span>Elements: {elements.length}</span>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}