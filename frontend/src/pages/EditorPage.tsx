import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Zap } from 'lucide-react';
import ShareModal from '../components/editor/ShareModal';
import Konva from 'konva';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import pptxgen from 'pptxgenjs';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDesignVersions, restoreDesignVersion, updateDesignFull, createDesignVersion, uploadVideoForExport } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useCollaboration } from '../hooks/useCollaboration';

// Components đã tách sẵn
import EditorSidebar from '../components/editor/EditorSidebar';
import DocEditor from '../components/editor/DocEditor';
import SheetEditor from '../components/editor/SheetEditor';
import CanvasEditor from '../components/editor/CanvasEditor';
import BottomTimeline from '../components/editor/BottomTimeline';
import ElementToolbar from '../components/ElementToolbar';

// Components mới tách
import EditorTopBar from '../components/editor/EditorTopBar';
import SidebarDrawer from '../components/editor/SidebarDrawer';
import TransitionBox from '../components/editor/TransitionBox';
import AnimateBox from '../components/editor/AnimateBox';
import VersionHistoryModal from '../components/editor/VersionHistoryModal';
import ExportProgressToast from '../components/editor/ExportProgressToast';


export default function EditorPage() {
  // --- 1. Component State & Refs ---
  const { id } = useParams();
  const { user } = useAuth(); // Lấy current user để truyền cho collaboration
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

  // RBAC States
  const [currentRole, setCurrentRole] = useState<'owner' | 'editor' | 'commenter' | 'viewer'>('viewer');
  const [showShareModal, setShowShareModal] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({ format: 'png' });
  const [exportSelectedPages, setExportSelectedPages] = useState<string[]>([]);

  const [showPositionBox, setShowPositionBox] = useState(false);
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null); // ThÃƒÂªm dÃƒÂ²ng nÃƒÂ y Ã„â€˜Ã¡Â»Æ’ theo dÃƒÂµi vÃ¡Â»â€¹ trÃƒÂ­ thanh ngangconst [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [showAnimateBox, setShowAnimateBox] = useState(false);
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');

  const PPTX_ANIMATIONS = [
    { id: 'none', label: 'None' },
    { id: 'appear', label: 'Appear' },
    { id: 'fade', label: 'Fade' },
    { id: 'flyIn', label: 'Fly In' },
    { id: 'floatIn', label: 'Float In' },
    { id: 'split', label: 'Split' },
    { id: 'wipe', label: 'Wipe' },
    { id: 'shape', label: 'Shape' },
    { id: 'wheel', label: 'Wheel' },
    { id: 'randomBars', label: 'Random Bars' },
    { id: 'growAndTurn', label: 'Grow & Turn' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'swivel', label: 'Swivel' },
    { id: 'bounce', label: 'Bounce' }
  ];
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // --- NEW EXPORT STATES ---
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'uploading' | 'completed'>('idle');
  const [exportScale, setExportScale] = useState(1);

  const PAGE_DURATION = 5;

  const pageTimings = pages.reduce((acc, page, index) => {
    const start = index === 0 ? 0 : acc[index - 1].end;
    const duration = Number(page.duration) || PAGE_DURATION;
    acc.push({ id: page.id, start, duration, end: start + duration });
    return acc;
  }, [] as any[]);

  const totalDuration = pageTimings.length > 0 ? pageTimings[pageTimings.length - 1].end : PAGE_DURATION;

  useEffect(() => {
    if (pageTimings.length === 0) return;
    const activeTiming = pageTimings.find((p: any) => currentTime >= p.start && currentTime < p.end) || pageTimings[pageTimings.length - 1];

    if (activeTiming && activeTiming.id !== currentPageId) {
      setCurrentPageId(activeTiming.id);
      const targetPage = pages.find((p: any) => p.id === activeTiming.id);
      setElements(targetPage?.elements || []);
      setSelectedIds([]);
    }
  }, [currentTime, pageTimings, currentPageId, pages]);

  const currentTiming = pageTimings.find((p: any) => p.id === currentPageId);
  const localTime = currentTiming ? Math.max(0, currentTime - currentTiming.start) : currentTime;

  // State cho UI Sidebar
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [customFonts, setCustomFonts] = useState<string[]>(['Arial', 'Verdana', 'Roboto', 'Oswald', 'Inter']);
  const [recentStickers, setRecentStickers] = useState<any[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const [totalRecentPages, setTotalRecentPages] = useState(1);


  // State cho Canvas
  const [selectionRect, setSelectionRect] = useState({
    visible: false, x: 0, y: 0, width: 0, height: 0, startX: 0, startY: 0
  });
  const [groupDrag, setGroupDrag] = useState({ isDragging: false, startX: 0, startY: 0 });

  // STATE CHO TRANSITION PAGE
  const [showTransitionBox, setShowTransitionBox] = useState(false);
  const [transitionTargetId, setTransitionTargetId] = useState<string | null>(null);

  const PAGE_TRANSITIONS = [
    { id: 'none', label: 'None' },
    { id: 'fade', label: 'Fade' },
    { id: 'slideLeft', label: 'Slide Left' },
    { id: 'slideRight', label: 'Slide Right' },
    { id: 'slideUp', label: 'Slide Up' },
    { id: 'slideDown', label: 'Slide Down' },
    { id: 'dissolve', label: 'Dissolve' },
    { id: 'zoom', label: 'Zoom' }
  ];

  // Refs
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const selectionRectRef = useRef<any>(null);

  // Constants
  const currentPage = pages.find(p => p.id === currentPageId);
  const stageWidth = currentPage?.width || 1920;
  const stageHeight = currentPage?.height || 1080;
  const currentPageType = currentPage?.type || 'canvas';
  const selectedElement = selectedIds.length === 1 ? elements.find(el => el.id === selectedIds[0]) : null;

  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, percent: number }>({ visible: false, percent: 0 });
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  // ─── REAL-TIME COLLABORATION ────────────────────────────────────────────────
  const handleRemoteElementsUpdate = useCallback((pageId: string, remoteElements: any[]) => {
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, elements: remoteElements } : p
    ));
    setCurrentPageId(prev => {
      if (prev === pageId) {
        setElements(remoteElements);
      }
      return prev;
    });
  }, []);

  const { activeUsers, isConnected, emitElementsUpdate, emitPageChanged } = useCollaboration({
    designId: id,
    onRemoteUpdate: handleRemoteElementsUpdate,
  });

  const addImageOriginal = (src: string, originalWidth: number, originalHeight: number) => {
    let finalW = originalWidth;
    let finalH = originalHeight;

    if (finalW > stageWidth) { const r = stageWidth / finalW; finalW = stageWidth; finalH *= r; }
    if (finalH > stageHeight) { const r = stageHeight / finalH; finalH = stageHeight; finalW *= r; }

    syncElements([...elements, {
      id: crypto.randomUUID(), type: 'image',
      x: stageWidth / 2 - finalW / 2, y: stageHeight / 2 - finalH / 2,
      width: finalW, height: finalH, src,
      timeline: { start: 0, duration: 5, lane: elements.length % 4 }, animation: { in: 'none' }
    }]);
  };

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return alert("Vui lòng chọn file hình ảnh!");

    setUploadProgress({ visible: true, percent: 0 });
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10;
      if (progress >= 90) progress = 90;
      setUploadProgress({ visible: true, percent: progress });
    }, 150);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      const img = new window.Image();
      img.src = base64Url;
      img.onload = () => {
        clearInterval(interval);
        setUploadProgress({ visible: true, percent: 100 });

        setUploadedImages(prev => [{ id: crypto.randomUUID(), url: base64Url, width: img.width, height: img.height }, ...prev]);

        setTimeout(() => setUploadProgress({ visible: false, percent: 0 }), 500);
      };
    };
    reader.readAsDataURL(file);
  };

  // --- 2. Data Fetching ---
  useEffect(() => {
    if (design?.title) setTempTitle(design.title);
  }, [design?.title]);

  useEffect(() => {
    fetch(`/api/designs/${id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (res.status === 403) {
          // Không có quyền truy cập
          alert('Bạn không có quyền truy cập bản vẽ này.');
          window.location.href = '/';
          throw new Error('403 Forbidden');
        }
        return res.json();
      })
      .then(data => {
        setDesign(data);
        // Lấy role từ response (được gắn bởi checkDesignAccess middleware)
        if (data.current_user_role) {
          setCurrentRole(data.current_user_role);
        }
        if (data.pages && data.pages.length > 0) {
          const loadedPages = data.pages.map((p: any) => ({
            ...p,
            duration: Number(p.duration) || 5,
            elements: p.elements || [],
            thumbnail: p.thumbnail || ''
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

  useEffect(() => {
    if (id && stageWidth > 0 && stageHeight > 0) {
      const pendingImg = sessionStorage.getItem(`pending_import_image_${id}`);
      if (pendingImg) {
        sessionStorage.removeItem(`pending_import_image_${id}`);
        const img = new window.Image();
        img.src = pendingImg;
        img.onload = () => {
          let finalW = img.width;
          let finalH = img.height;
          const ratio = Math.min(stageWidth / finalW, stageHeight / finalH) * 0.8;
          if (ratio < 1) {
            finalW *= ratio;
            finalH *= ratio;
          }
          const newEl = {
            id: crypto.randomUUID(), type: 'image',
            x: stageWidth / 2 - finalW / 2, y: stageHeight / 2 - finalH / 2,
            width: finalW, height: finalH, src: pendingImg,
            timeline: { start: 0, duration: 5, lane: elements.length % 4 }, animation: { in: 'none' }
          };
          setElements(prev => [...prev, newEl as any]);
          setUploadedImages(prev => [{ id: crypto.randomUUID(), url: pendingImg, width: img.width, height: img.height }, ...prev]);
        };
      }
    }
  }, [id, stageWidth, stageHeight]);

  const fetchRecentStickers = async (page = 1, limit = 10) => {
    try {
      const res = await fetch(`/api/designs/recent-stickers?page=${page}&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setRecentStickers(data.data || []);
      setTotalRecentPages(data.totalPages || 1);
      setRecentPage(page);
    } catch (error) { console.error(error); }
  };

  useEffect(() => { fetchRecentStickers(1, 10); }, []);

  const loadUserFonts = async () => {
    try {
      const res = await fetch('/api/assets/user-fonts', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const fontList: { name: string; url: string }[] = data.fonts || [];
      for (const font of fontList) {
        try {
          const buffer = await (await fetch(font.url)).arrayBuffer();
          const face = new FontFace(font.name, buffer);
          const loaded = await face.load();
          (document.fonts as any).add(loaded);
          setCustomFonts(prev => prev.includes(font.name) ? prev : [...prev, font.name]);
        } catch { }
      }
    } catch (error) { console.error('Load user fonts error:', error); }
  };

  useEffect(() => { loadUserFonts(); }, []);

  const handleMouseDown = (e: any) => {
    const isTransformer = e.target.getParent()?.className === 'Transformer';
    if (isTransformer) return;
    const isBackground = e.target === e.target.getStage() || e.target.id() === 'bg';

    const stage = e.target.getStage();

    const pointerPosition = stage.getPointerPosition();
    const pos = {
      x: (pointerPosition.x - stage.x()) / stage.scaleX(),
      y: (pointerPosition.y - stage.y()) / stage.scaleY()
    };

    if (isBackground) {
      if (selectedIds.length > 1 && trRef.current) {
        const box = trRef.current.getClientRect();
        if (pointerPosition.x >= box.x && pointerPosition.x <= box.x + box.width && pointerPosition.y >= box.y && pointerPosition.y <= box.y + box.height) {
          const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
          nodes.forEach(node => { node.setAttr('dragStartX', node.x()); node.setAttr('dragStartY', node.y()); });
          setGroupDrag({ isDragging: true, startX: pos.x, startY: pos.y });
          return;
        }
      }
      e.evt.preventDefault();
      setSelectionRect({ visible: true, startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, width: 0, height: 0 });
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
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const pos = {
      x: (pointerPosition.x - stage.x()) / stage.scaleX(),
      y: (pointerPosition.y - stage.y()) / stage.scaleY()
    };

    if (groupDrag.isDragging) {
      e.evt.preventDefault();
      const dx = pos.x - groupDrag.startX;
      const dy = pos.y - groupDrag.startY;
      const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
      nodes.forEach(node => { node.x(node.getAttr('dragStartX') + dx); node.y(node.getAttr('dragStartY') + dy); });
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
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const pos = {
      x: (pointerPosition.x - stage.x()) / stage.scaleX(),
      y: (pointerPosition.y - stage.y()) / stage.scaleY()
    };

    if (groupDrag.isDragging) {
      e.evt.preventDefault();
      const dx = pos.x - groupDrag.startX;
      const dy = pos.y - groupDrag.startY;

      const newElements = elements.map(el => {
        if (selectedIds.includes(el.id)) return { ...el, x: el.x + dx, y: el.y + dy };
        return el;
      });
      syncElements(newElements);

      setGroupDrag({ isDragging: false, startX: 0, startY: 0 });
      return;
    }

    if (!selectionRect.visible) return;
    e.evt.preventDefault();
    setTimeout(() => { setSelectionRect(prev => ({ ...prev, visible: false })); });

    const selBox = selectionRectRef.current.getClientRect();
    const newSelectedIds = elements.filter(el => {
      const node = layerRef.current.findOne(`#${el.id}`);
      if (!node) return false;
      const nodeBox = node.getClientRect();
      return Konva.Util.haveIntersection(selBox, nodeBox);
    }).map(el => el.id);

    setSelectedIds(newSelectedIds);
  };

  // --- 4. Page Management ---
  const handlePageChange = (newPageId: string) => {
    if (newPageId === currentPageId) return;
    let thumb = '';
    if (stageRef.current && currentPageType === 'canvas') {
      setSelectedIds([]);
      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
    }
    const updatedPages = pages.map(p =>
      p.id === currentPageId ? { ...p, elements: elements, thumbnail: thumb } : p
    );
    setPages(updatedPages);
    const targetPage = updatedPages.find(p => p.id === newPageId);
    setElements(targetPage?.elements || []);
    setCurrentPageId(newPageId);

    const targetTiming = pageTimings.find((pt: any) => pt.id === newPageId);
    if (targetTiming) {
      setCurrentTime(targetTiming.start);
    }
  };

  const handleAddPage = () => {
    let thumb = '';
    if (stageRef.current && currentPageType === 'canvas') {
      setSelectedIds([]);
      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
    }
    const updatedPages = pages.map(p =>
      p.id === currentPageId ? { ...p, elements: elements, thumbnail: thumb } : p
    );
    const newPageId = crypto.randomUUID();
    const newPage = {
      id: newPageId, page_order: updatedPages.length,
      type: currentPageType, width: stageWidth, height: stageHeight,
      elements: [], content: '', thumbnail: ''
    };
    setPages([...updatedPages, newPage]);
    setElements([]);
    setCurrentPageId(newPageId);

    setCurrentTime(totalDuration);
  };

  const reorderPages = (dragIndex: number, dropIndex: number) => {
    const newPages = [...pages];
    const draggedItem = newPages.splice(dragIndex, 1)[0];
    newPages.splice(dropIndex, 0, draggedItem);

    const updatedOrderPages = newPages.map((p, idx) => ({ ...p, page_order: idx }));
    setPages(updatedOrderPages);
  };

  // --- 5. Element CRUD ---

  const syncElements = useCallback((newElements: any[], _skipEmit = false) => {
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));

    if (!_skipEmit && currentPageId) {
      emitElementsUpdate(currentPageId, newElements);
    }
  }, [currentPageId, emitElementsUpdate]);

  const addText = () => syncElements([...elements, { id: crypto.randomUUID(), type: 'text', x: stageWidth / 2 - 150, y: stageHeight / 2 - 25, text: 'Double click to edit', fontSize: 32, fontFamily: 'Arial', fill: '#000000', width: 300, fontStyle: 'normal', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'fadeIn' } }]);
  const addRectangle = () => syncElements([...elements, { id: crypto.randomUUID(), type: 'rect', x: stageWidth / 2 - 100, y: stageHeight / 2 - 100, width: 200, height: 200, fill: '#6366f1', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]);
  const addImage = (src: string) => {
    syncElements([...elements, { id: crypto.randomUUID(), type: 'image', x: stageWidth / 2 - 100, y: stageHeight / 2 - 100, width: 200, height: 200, src, timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]);
    setRecentStickers(prev => {
      if (prev.some(s => s.url === src)) return prev;
      return [{ url: src, last_used: new Date().toISOString() }, ...prev].slice(0, 10);
    });
  };

  const updateElement = (newAttrs: any) => {
    syncElements(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  const updateElements = (updatedElements: any[]) => {
    const updatedIds = updatedElements.map(el => el.id);
    const updatedMap = new Map(updatedElements.map(el => [el.id, el]));
    syncElements(elements.map(el => updatedMap.has(el.id) ? updatedMap.get(el.id) : el));
  };

  const deleteSelectedElement = () => {
    if (selectedIds.length === 0) return;
    syncElements(elements.filter(el => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  };

  const moveElement = (direction: 'up' | 'down') => {
    if (selectedIds.length !== 1) return;
    const index = elements.findIndex(el => el.id === selectedIds[0]);
    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    else if (direction === 'down' && index > 0) [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
    syncElements(newElements);
  };

  const handleLayerDragStart = (e: React.DragEvent, index: number) => {
    setDraggedLayerIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleLayerDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) setDragOverIdx(index);
  };

  const handleLayerDragLeave = (e: React.DragEvent, index: number) => {
    if (dragOverIdx === index) setDragOverIdx(null);
  };

  const handleLayerDragEnd = () => {
    setDraggedLayerIdx(null);
    setDragOverIdx(null);
  };

  const handleLayerDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIdx(null);

    if (draggedLayerIdx !== null && draggedLayerIdx !== dropIndex) {
      const reversedElements = [...elements].reverse();
      const [draggedItem] = reversedElements.splice(draggedLayerIdx, 1);
      reversedElements.splice(dropIndex, 0, draggedItem);

      const newElements = reversedElements.reverse().map((el, idx) => ({
        ...el, z_index: idx
      }));

      setElements(newElements);
      setPages(pages.map(p => p.id === currentPageId ? { ...p, elements: newElements } : p));
    }
    setDraggedLayerIdx(null);
  };

  // --- 6. Assets & Search ---
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`/api/assets/search?q=${encodeURIComponent(searchQuery)}&type=sticker`);
      const data = await res.json();
      setSearchResults(data.assets || []);
      setActiveTab('search_results');
    } catch (error) { console.error(error); }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const fontName = file.name.split('.')[0];
    try {
      const formData = new FormData();
      formData.append('font', file);
      const res = await fetch('/api/assets/upload-font', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Lỗi upload font: ${err.error || 'Unknown error'}`);
        return;
      }
      const data = await res.json();
      const fontUrl: string = data.url;
      const savedName: string = data.name || fontName;

      const buffer = await (await fetch(fontUrl)).arrayBuffer();
      const fontFace = new FontFace(savedName, buffer);
      const loadedFace = await fontFace.load();
      (document.fonts as any).add(loadedFace);

      setCustomFonts(prev => prev.includes(savedName) ? prev : [...prev, savedName]);
      alert(`Font "${savedName}" đã được nạp và lưu thành công!`);
    } catch (err) {
      console.error('Font upload error:', err);
      alert('Lỗi khi upload font!');
    }
  };

  const handleRemoveBackground = async (element: any) => {
    if (!element || !element.src) return;

    setIsProcessingBg(true);
    try {
      const res = await fetch(element.src);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append('image', blob, 'image.png');

      const uploadRes = await fetch('http://localhost:3000/api/assets/remove-bg', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadRes.ok) {
        throw new Error('Lỗi từ server tách nền');
      }

      const data = await uploadRes.json();

      const backendUrl = `http://localhost:3000${data.url}`;
      updateElement({ ...element, src: backendUrl });

    } catch (err) {
      console.error('Lỗi khi xóa nền:', err);
      alert('Đã xảy ra lỗi khi xóa nền. Vui lòng kiểm tra lại AI service.');
    } finally {
      setIsProcessingBg(false);
    }
  };

  const isReadOnly = currentRole === 'viewer' || currentRole === 'commenter';
  const canEdit = currentRole === 'owner' || currentRole === 'editor';

  // Khóa phím tắt cho viewer/commenter
  useEffect(() => {
    if (!isReadOnly) return;
    const blockShortcuts = (e: KeyboardEvent) => {
      const blocked = [
        e.key === 'Delete', e.key === 'Backspace',
        e.ctrlKey && ['z', 'y', 'c', 'v', 'a'].includes(e.key.toLowerCase())
      ];
      if (blocked.some(Boolean)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', blockShortcuts, true);
    return () => window.removeEventListener('keydown', blockShortcuts, true);
  }, [isReadOnly]);

  // Trong file EditorPage.tsx -> hàm handleSave
  const handleSave = async (isSilent = false) => {
    // Guard: viewer và commenter không được lưu
    if (isReadOnly) return;
    setSaveStatus('saving');
    setIsSaving(true);
    try {
      let currentThumb = '';
      if (stageRef.current && currentPageType === 'canvas') {
        currentThumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });
      }

      const finalPages = pages.map(p =>
        p.id === currentPageId ? { ...p, elements: elements, thumbnail: currentThumb } : p
      );

      const projectThumbnail = finalPages.length > 0 ? finalPages[0].thumbnail : '';

      const payload = {
        title: design?.title || 'Untitled Design',
        thumbnail_url: projectThumbnail,
        pages: finalPages.map((page, index) => ({
          id: page.id,
          page_order: index,
          thumbnail: page.thumbnail,
          type: page.type || 'canvas',
          width: page.width || 1920,
          height: page.height || 1080,
          content: page.content || '',
          transition: page.transition || null,
          duration: page.duration || 5,
          elements: (page.type === 'canvas') ? page.elements.map((el: any, idx: number) => {
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
          }) : []
        }))
      };

      await updateDesignFull(id!, payload);
      setSaveStatus('saved');
      if (!isSilent) alert("Đã lưu thành công! ");
    } catch (error) {
      setSaveStatus('unsaved');
      console.error("Lỗi khi lưu:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    setExportSelectedPages(pages.map(p => p.id));
    setShowExportModal(true);
  };

  const executeExport = async () => {
    if (exportStatus !== 'idle') return;

    if (exportSelectedPages.length === 0) return alert("Vui lòng chọn ít nhất 1 trang!");

    setExportStatus('rendering');
    setExportProgress(5);
    setShowExportPopover(false);

    try {
      if (exportConfig.format === 'mp4') {
        const stage = stageRef.current;
        const canvas = stage.container().querySelector('canvas');
        if (!canvas) throw new Error("Canvas not found");

        const selectedTimings = pageTimings.filter((pt: any) => exportSelectedPages.includes(pt.id));
        if (selectedTimings.length === 0) return;

        const startExportTime = selectedTimings[0].start;
        const endExportTime = selectedTimings[selectedTimings.length - 1].end;
        const exportDuration = endExportTime - startExportTime;

        setIsPlaying(false);
        setCurrentTime(startExportTime);
        setSelectedIds([]);

        setTimeout(() => {
          const stream = canvas.captureStream(60);
          const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';

          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 5000000
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };

          const forceRedrawAnim = new Konva.Animation(() => {
            if (layerRef.current) layerRef.current.draw();
          });

          recorder.onstop = async () => {
            forceRedrawAnim.stop();

            setExportStatus('uploading');
            setExportProgress(90);

            const videoBlob = new Blob(chunks, { type: 'video/webm' });

            try {
              const mp4Blob = await uploadVideoForExport(videoBlob);
              saveAs(mp4Blob, `${design?.title || 'Video'}.mp4`);
              setExportProgress(100);
              setExportStatus('completed');
              setTimeout(() => setExportStatus('idle'), 3000);
            } catch (err) {
              alert("Lỗi tải video từ Server!");
              setExportStatus('idle');
            }
          };

          forceRedrawAnim.start();
          recorder.start();
          setIsPlaying(true);

          const progressInterval = setInterval(() => {
            const currentT = currentTimeRef.current;
            const p = Math.min(85, ((currentT - startExportTime) / exportDuration) * 90);
            setExportProgress(Math.max(0, Math.floor(p)));

            if (currentT >= endExportTime || !isPlayingRef.current) {
              clearInterval(progressInterval);
              setIsPlaying(false);
              if (recorder.state === 'recording') recorder.stop();
            }
          }, 100);

        }, 300);

      } else {
        setExportProgress(30);
        const pagesToExport = pages.filter(p => exportSelectedPages.includes(p.id));

        if (exportConfig.format === 'pptx') {
          const pptx = new pptxgen();
          pptx.layout = 'LAYOUT_16x9';

          pagesToExport.forEach(p => {
            const slide = pptx.addSlide();

            if (p.background_color) {
              slide.background = { color: p.background_color.replace('#', '') };
            }

            const pageElements = p.id === currentPageId ? elements : (p.elements || []);

            pageElements.forEach((el: any) => {

              const pptxWidth = 10;
              const pptxHeight = 5.625;

              const x = (el.x / stageWidth) * pptxWidth;
              const y = (el.y / stageHeight) * pptxHeight;
              const w = (el.width / stageWidth) * pptxWidth;
              const h = (el.height / stageHeight) * pptxHeight;

              const colorHex = el.fill ? el.fill.replace('#', '') : '000000';

              const transparency = el.opacity !== undefined ? (1 - el.opacity) * 100 : 0;
              const rotate = el.rotation || 0;

              if (el.type === 'text') {
                const ptSize = (el.fontSize / stageWidth) * 720;

                slide.addText(el.text || el.content || ' ', {
                  x, y, w, h,
                  fontSize: ptSize,
                  color: colorHex,
                  fontFace: el.fontFamily || 'Arial',
                  align: el.align || 'center',
                  valign: 'middle',
                  bold: el.fontStyle?.includes('bold'),
                  italic: el.fontStyle?.includes('italic'),
                  transparency,
                  rotate
                });
              } else if (el.type === 'rect' || el.type === 'shape') {
                slide.addShape(pptx.ShapeType.rect, {
                  x, y, w, h,
                  fill: { color: colorHex, transparency },
                  rotate
                });
              } else if (el.type === 'circle') {
                slide.addShape(pptx.ShapeType.ellipse, {
                  x, y, w, h,
                  fill: { color: colorHex, transparency },
                  rotate
                });
              } else if (el.type === 'image' || el.type === 'sticker') {
                if (!el.src) return;
                const isBase64 = el.src.startsWith('data:image');
                try {
                  slide.addImage({
                    x, y, w, h,
                    [isBase64 ? 'data' : 'path']: el.src,
                    sizing: { type: 'contain', w, h },
                    transparency,
                    rotate
                  });
                } catch (e) {
                  console.error("Lỗi khi thêm ảnh vào PPTX:", e);
                }
              }
            });
          });

          await pptx.writeFile({ fileName: `${design?.title || 'Kanva_Export'}.pptx` });
        } else {
          if (pagesToExport.length === 1) {
            const dataURL = stageRef.current.toDataURL({ pixelRatio: exportScale });
            saveAs(dataURL, `${design?.title}.${exportConfig.format}`);
          } else {
            const zip = new JSZip();
            pagesToExport.forEach((p, i) => {
              const dataURL = p.id === currentPageId ? stageRef.current.toDataURL({ pixelRatio: exportScale }) : p.thumbnail;
              if (dataURL) zip.file(`Page_${i + 1}.${exportConfig.format}`, dataURL.split(',')[1], { base64: true });
            });
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "export.zip");
          }
        }
        setExportProgress(100);
        setExportStatus('completed');
        setTimeout(() => setExportStatus('idle'), 3000);
      }
    } catch (error) {
      setExportStatus('idle');
      alert("Lỗi xuất file!");
    }
  };

  // --- 8. Side Effects ---
  useEffect(() => {
    if (isInitialMount.current) {
      if (elements.length > 0 || pages.length > 0) isInitialMount.current = false;
      return;
    }
    setSaveStatus('unsaved');
    const timer = setTimeout(() => { handleSave(true); }, 3000);
    return () => clearTimeout(timer);
  }, [elements, pages, design?.title]);

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      const nodes = selectedIds.map(id => layerRef.current.findOne(`#${id}`)).filter(Boolean);
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements]);

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
              addImageOriginal(base64Url, img.width, img.height);
              setUploadedImages(prev => [{ id: crypto.randomUUID(), url: base64Url, width: img.width, height: img.height }, ...prev]);

              setActiveTab('uploads');
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
  }, [stageWidth, stageHeight, elements]);

  // States cho Version History
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleOpenVersionHistory = async () => {
    setShowVersionModal(true);
    try {
      const data = await fetchDesignVersions(id!);
      setVersions(data.versions || []);
    } catch (error) { console.error(error); }
  };

  const handleRestore = async (versionId: string) => {
    if (!window.confirm("Bạn thiết kế hiện tại sẽ bị ghi đè. Bạn có chắc chắn muốn khôi phục?")) return;
    setIsRestoring(true);
    try {
      await restoreDesignVersion(id!, versionId);
      alert("Đã khôi phục thành công!");
      window.location.reload();
    } catch (error) {
      alert("Lỗi khi khôi phục");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveVersion = async () => {
    await handleSave(true);
    try {
      await createDesignVersion(id!);
      alert("Đã chụp và lưu thành 1 phiên bản lịch sử!");
    } catch (error) {
      alert("Lỗi khi lưu phiên bản");
    }
  };

  // --- 9. Render Giao DiÃ¡Â»â€¡n ---
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-sky-50 via-white to-pink-50 overflow-hidden font-sans">

      {/* 1. TOP BAR */}
      <EditorTopBar
        design={design}
        saveStatus={saveStatus}
        isSaving={isSaving}
        isEditingTitle={isEditingTitle}
        tempTitle={tempTitle}
        setTempTitle={setTempTitle}
        setIsEditingTitle={setIsEditingTitle}
        setDesign={setDesign}
        showExportPopover={showExportPopover}
        setShowExportPopover={setShowExportPopover}
        exportConfig={exportConfig}
        setExportConfig={setExportConfig}
        exportScale={exportScale}
        setExportScale={setExportScale}
        exportSelectedPages={exportSelectedPages}
        setExportSelectedPages={setExportSelectedPages}
        pages={pages}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        executeExport={executeExport}
        handleSave={handleSave}
        handleSaveVersion={handleSaveVersion}
        handleOpenVersionHistory={handleOpenVersionHistory}
        currentRole={currentRole}
        onOpenShare={() => setShowShareModal(true)}
        activeUsers={activeUsers}
        isConnected={isConnected}
        currentUserId={user?.id}
      />

      {/* 2. MAIN AREA */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Icon Rail */}
        {canEdit && (
          <EditorSidebar
            activeTab={activeTab}
            setActiveTab={(tab: any) => {
              setActiveTab(tab);
              if (tab) { setShowPositionBox(false); setShowAnimateBox(false); }
            }}
            currentPageType={currentPageType}
            handleFontUpload={handleFontUpload}
          />
        )}

        {/* Sidebar Drawer */}
        {canEdit && (
          <SidebarDrawer
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            showPositionBox={showPositionBox}
            setShowPositionBox={setShowPositionBox}
            showAnimateBox={showAnimateBox}
            setShowAnimateBox={setShowAnimateBox}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={handleSearch}
            searchResults={searchResults}
            addRectangle={addRectangle}
            addImage={addImage}
            recentStickers={recentStickers}
            uploadedImages={uploadedImages}
            uploadProgress={uploadProgress}
            handleImageUpload={handleImageUpload}
            addImageOriginal={addImageOriginal}
            addText={addText}
            customFonts={customFonts}
            handleFontUpload={handleFontUpload}
            elements={elements}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            draggedLayerIdx={draggedLayerIdx}
            dragOverIdx={dragOverIdx}
            handleLayerDragStart={handleLayerDragStart}
            handleLayerDragOver={handleLayerDragOver}
            handleLayerDragLeave={handleLayerDragLeave}
            handleLayerDrop={handleLayerDrop}
            handleLayerDragEnd={handleLayerDragEnd}
            selectedElement={selectedElement}
            updateElement={updateElement}
            updateElements={updateElements}
          />
        )}

        {/* 3. KHU VÃ¡Â»Â°C LÃƒâ‚¬M VIÃ¡Â»â€ C CHÃƒ NH */}
        <div className="flex-1 bg-white/40 flex flex-col relative overflow-hidden">

          <div className={`flex-1 flex relative ${currentPageType === 'canvas' ? 'overflow-hidden' : 'overflow-auto items-center justify-center p-8'}`}>

            {/* Floating element toolbar */}
            {isProcessingBg && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[70] flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="mt-4 text-indigo-800 font-bold text-sm bg-white/80 px-4 py-2 rounded-full shadow-sm">AI is removing background...</p>
              </div>
            )}

            <AnimatePresence>
              {selectedIds.length > 0 && currentPageType === 'canvas' && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute top-6 left-1/2 -translate-x-1/2 z-[60]"
                >
                  {selectedIds.length === 1 && selectedElement ? (
                    <ElementToolbar
                      element={selectedElement}
                      onUpdate={updateElement}
                      onDelete={deleteSelectedElement}
                      onMove={moveElement}
                      fontList={customFonts}
                      onTogglePosition={() => { setShowPositionBox(!showPositionBox); setShowAnimateBox(false); }}
                      onToggleAnimate={() => { setShowAnimateBox(!showAnimateBox); setShowPositionBox(false); }}
                      onRemoveBackground={handleRemoveBackground}
                    />
                  ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 px-3 py-2 flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-600 px-2 border-r border-slate-200">{selectedIds.length} elements</span>
                      <button
                        onClick={() => { setShowAnimateBox(!showAnimateBox); setShowPositionBox(false); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition ${showAnimateBox ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        <Zap size={16} /> Animate
                      </button>
                      <button
                        onClick={deleteSelectedElement}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Delete all"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Transition Box */}
            {showTransitionBox && transitionTargetId && (
              <TransitionBox
                pages={pages}
                transitionTargetId={transitionTargetId}
                setPages={setPages}
                onClose={() => setShowTransitionBox(false)}
              />
            )}

            {/* Core editors */}
            {currentPageType === 'canvas' && (
              <CanvasEditor
                stageRef={stageRef} layerRef={layerRef} trRef={trRef} selectionRectRef={selectionRectRef}
                stageWidth={stageWidth} stageHeight={stageHeight} currentPage={currentPage}
                elements={elements} selectedIds={selectedIds} editingId={editingId} setEditingId={setEditingId}
                updateElement={updateElement} selectionRect={selectionRect}
                handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove} handleMouseUp={handleMouseUp}
                isPlaying={isPlaying}
                currentTime={localTime}
              />
            )}
            {currentPageType === 'doc' && (
              <DocEditor page={currentPage} onChange={(id: string, data: any) => setPages(pages.map(p => p.id === id ? { ...p, ...data } : p))} />
            )}
            {currentPageType === 'sheet' && (
              <SheetEditor page={currentPage} />
            )}
          </div>

          {/* 4. TIMELINE / PAGE SELECTOR */}
          <div className="relative">
            {exportStatus === 'rendering' && exportConfig.format === 'mp4' && (
              <div className="absolute inset-0 bg-slate-900/90 z-[100] flex items-center justify-center pointer-events-none">
                <span className="text-white text-xs font-bold uppercase tracking-widest animate-pulse flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> Exporting Video...
                </span>
              </div>
            )}

            <BottomTimeline
              currentPageId={currentPageId}
              elements={elements}
              handlePageChange={handlePageChange}
              handleAddPage={handleAddPage}
              deletePage={(id: string) => {
                if (window.confirm('XÃƒÂ³a trang nÃƒÂ y?')) {
                  const newPages = pages.filter((p: any) => p.id !== id);
                  setPages(newPages);
                  if (currentPageId === id) {
                    setCurrentPageId(newPages[0].id);
                    setElements(newPages[0].elements || []);
                  }
                }
              }}
              reorderPages={reorderPages}
              updateElement={updateElement}
              updatePage={(id: string, updates: any) => {
                setPages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
              }}
              designType={design?.design_type || 'presentation'}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              pages={pages}
              pageTimings={pageTimings}
              totalDuration={totalDuration}
              onOpenTransition={(targetPageId: string) => {
                setTransitionTargetId(targetPageId);
                setShowTransitionBox(true);
                setShowAnimateBox(false);
                setShowPositionBox(false);
                setActiveTab(null);
              }}
            />
          </div>

          {/* 5. INFO BAR */}
          <div className="h-8 bg-white/60 backdrop-blur-md border-t border-white flex items-center justify-between px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
            <div className="flex gap-4">
              <span>Type: <strong className="text-indigo-600">{currentPageType}</strong></span>
              {currentPageType === 'canvas' && <span>Stage: {stageWidth}x{stageHeight}</span>}
            </div>
            {currentPageType === 'canvas' && (
              <div className="flex gap-4">
                <span>Selected: {selectedIds.length === 0 ? 'None' : selectedIds.length === 1 ? selectedIds[0].slice(0, 8) : `${selectedIds.length} items`}</span>
                <span>Elements: {elements.length}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* VERSION HISTORY MODAL */}
      {showVersionModal && (
        <VersionHistoryModal
          versions={versions}
          isRestoring={isRestoring}
          onClose={() => setShowVersionModal(false)}
          onRestore={handleRestore}
        />
      )}

      {/* SHARE MODAL */}
      {showShareModal && id && (
        <ShareModal
          designId={id}
          currentRole={currentRole}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* EXPORT PROGRESS TOAST */}
      <ExportProgressToast
        exportStatus={exportStatus}
        exportProgress={exportProgress}
        exportFormat={exportConfig.format}
      />

      {/* READ-ONLY OVERLAY (viewer/commenter): Khóa toàn bộ tương tác trên Canvas */}
      {isReadOnly && (
        <div
          className="fixed inset-0 z-[15] pointer-events-auto"
          style={{ background: 'transparent', cursor: currentRole === 'commenter' ? 'crosshair' : 'not-allowed' }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        />
      )}
    </div>
  );
}
