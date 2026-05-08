import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Konva from 'konva';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import pptxgen from 'pptxgenjs';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDesignVersions, restoreDesignVersion, updateDesignFull, createDesignVersion, uploadVideoForExport } from '../api/api';

// Components Ã„â€˜ÃƒÂ£ tÃƒÂ¡ch sÃ¡ÂºÂµn
import EditorSidebar from '../components/editor/EditorSidebar';
import DocEditor from '../components/editor/DocEditor';
import SheetEditor from '../components/editor/SheetEditor';
import CanvasEditor from '../components/editor/CanvasEditor';
import BottomTimeline from '../components/editor/BottomTimeline';
import ElementToolbar from '../components/ElementToolbar';

// Components mÃ¡Â»â€ºi tÃƒÂ¡ch
import EditorTopBar from '../components/editor/EditorTopBar';
import SidebarDrawer from '../components/editor/SidebarDrawer';
import TransitionBox from '../components/editor/TransitionBox';
import AnimateBox from '../components/editor/AnimateBox';
import VersionHistoryModal from '../components/editor/VersionHistoryModal';
import ExportProgressToast from '../components/editor/ExportProgressToast';


export default function EditorPage() {
  // --- 1. Component State & Refs ---
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

  // KHAI BÃƒÂO THÃƒÅ M 2 DÃƒâ€™NG NÃƒâ‚¬Y Ã„ÂÃ¡Â»â€š THEO DÃƒâ€¢I VIDEO
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // --- NEW EXPORT STATES ---
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [exportProgress, setExportProgress] = useState(0); // 0 - 100
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'uploading' | 'completed'>('idle');
  const [exportScale, setExportScale] = useState(1); // Cho PNG/JPG

  // --- LOGIC TÃƒÂNH TOÃƒÂN THÃ¡Â»Å“I GIAN TOÃƒâ‚¬N CÃ¡Â»Â¤C (GLOBAL TIMELINE) ---
  const PAGE_DURATION = 5; // MÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh mÃ¡Â»â€”i slide dÃƒÂ i 5s

  // TÃƒÂ­nh mÃ¡Â»â€˜c bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u vÃƒÂ  kÃ¡ÂºÂ¿t thÃƒÂºc cÃ¡Â»Â§a tÃ¡Â»Â«ng trang
  const pageTimings = pages.reduce((acc, page, index) => {
    const start = index === 0 ? 0 : acc[index - 1].end;
    // Ãƒâ€°p kiÃ¡Â»Æ’u vÃ¡Â»Â number Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh string concatenation khi DB trÃ¡ÂºÂ£ vÃ¡Â»Â string
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
      setSelectedIds([]); // XÃƒÂ³a vÃƒÂ¹ng chÃ¡Â»Ân khi qua trang mÃ¡Â»â€ºi
    }
  }, [currentTime, pageTimings, currentPageId, pages]);

  // Quy Ã„â€˜Ã¡Â»â€¢i thÃ¡Â»Âi gian toÃƒÂ n cÃ¡Â»Â¥c vÃ¡Â»Â thÃ¡Â»Âi gian cÃ¡Â»Â§a trang hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i (Ã„â€˜Ã¡Â»Æ’ Canvas chÃ¡ÂºÂ¡y Ã„â€˜ÃƒÂºng hiÃ¡Â»â€¡u Ã¡Â»Â©ng)
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

  // Ã°Å¸â€Â¥ STATE CHO TRANSITION PAGE
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

  // Ã°Å¸â€Â¥ STATE CHO QUÃ¡ÂºÂ¢N LÃƒÂ UPLOAD VÃƒâ‚¬ TIÃ¡ÂºÂ¾N TRÃƒÅ’NH
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, percent: number }>({ visible: false, percent: 0 });
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  // Ã°Å¸â€Â¥ HÃƒâ‚¬M THÃƒÅ M Ã¡ÂºÂ¢NH VÃƒâ‚¬O CANVAS (GIÃ¡Â»Â® CHUÃ¡ÂºÂ¨N KÃƒÂCH THÃ†Â¯Ã¡Â»Å¡C GÃ¡Â»ÂC)
  const addImageOriginal = (src: string, originalWidth: number, originalHeight: number) => {
    let finalW = originalWidth;
    let finalH = originalHeight;

    // An toÃƒÂ n UX: NÃ¡ÂºÂ¿u Ã¡ÂºÂ£nh to hÃ†Â¡n khung Stage thÃƒÂ¬ mÃ¡Â»â€ºi bÃƒÂ³p lÃ¡ÂºÂ¡i cho vÃ¡Â»Â«a, cÃƒÂ²n nhÃ¡Â»Â hÃ†Â¡n thÃƒÂ¬ giÃ¡Â»Â¯ nguyÃƒÂªn gÃ¡Â»â€˜c 100%
    if (finalW > stageWidth) { const r = stageWidth / finalW; finalW = stageWidth; finalH *= r; }
    if (finalH > stageHeight) { const r = stageHeight / finalH; finalH = stageHeight; finalW *= r; }

    syncElements([...elements, {
      id: crypto.randomUUID(), type: 'image',
      x: stageWidth / 2 - finalW / 2, y: stageHeight / 2 - finalH / 2,
      width: finalW, height: finalH, src,
      timeline: { start: 0, duration: 5, lane: elements.length % 4 }, animation: { in: 'none' }
    }]);
  };

  // Ã°Å¸â€Â¥ HÃƒâ‚¬M XÃ¡Â»Â¬ LÃƒÂ UPLOAD (CÃƒâ€œ HIÃ¡Â»â€ U Ã¡Â»Â¨NG LOADING MÃ†Â¯Ã¡Â»Â¢T MÃƒâ‚¬)
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return alert("Vui lÃƒÂ²ng chÃ¡Â»Ân file hÃƒÂ¬nh Ã¡ÂºÂ£nh!");

    // BÃ¡ÂºÂ­t hiÃ¡Â»â€¡u Ã¡Â»Â©ng TiÃ¡ÂºÂ¿n trÃƒÂ¬nh
    setUploadProgress({ visible: true, percent: 0 });
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10;
      if (progress >= 90) progress = 90; // GiÃ¡Â»Â¯ Ã¡Â»Å¸ 90% Ã„â€˜Ã¡Â»Â£i Ã„â€˜Ã¡Â»Âc file xong
      setUploadProgress({ visible: true, percent: progress });
    }, 150);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      const img = new window.Image();
      img.src = base64Url;
      img.onload = () => {
        clearInterval(interval);
        setUploadProgress({ visible: true, percent: 100 }); // CÃƒÂ¡n Ã„â€˜ÃƒÂ­ch 100%

        // Ã„ÂÃ†Â°a vÃƒÂ o thÃ†Â° viÃ¡Â»â€¡n Uploads
        setUploadedImages(prev => [{ id: crypto.randomUUID(), url: base64Url, width: img.width, height: img.height }, ...prev]);

        // TrÃ¡Â»â€¦ 0.5s cho UI mÃ†Â°Ã¡Â»Â£t rÃ¡Â»â€œi Ã¡ÂºÂ©n thanh Loading
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
      .then(res => res.json())
      .then(data => {
        setDesign(data);
        if (data.pages && data.pages.length > 0) {
          const loadedPages = data.pages.map((p: any) => ({
            ...p,
            // Ãƒâ€°p kiÃ¡Â»Æ’u duration vÃ¡Â»Â number ngay khi load Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh string concatenation
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

  // --- Náº¡p láº¡i font Ä‘Ã£ upload tá»« DB khi má»Ÿ editor ---
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
        } catch { /* Bá» qua font bá»‹ lá»—i */ }
      }
    } catch (error) { console.error('Load user fonts error:', error); }
  };

  useEffect(() => { loadUserFonts(); }, []);

  // --- 3. Core Interaction ---
  const handleMouseDown = (e: any) => {
    const isTransformer = e.target.getParent()?.className === 'Transformer';
    if (isTransformer) return;
    const isBackground = e.target === e.target.getStage() || e.target.id() === 'bg';

    const stage = e.target.getStage();
    // CÃƒâ€NG THÃ¡Â»Â¨C CHUÃ¡ÂºÂ¨N: Quy Ã„â€˜Ã¡Â»â€¢i tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ mÃƒÂ n hÃƒÂ¬nh sang tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ bÃƒÂªn trong Canvas (Ã„â€˜ÃƒÂ£ tÃƒÂ­nh Zoom/Pan)
    const pointerPosition = stage.getPointerPosition();
    const pos = {
      x: (pointerPosition.x - stage.x()) / stage.scaleX(),
      y: (pointerPosition.y - stage.y()) / stage.scaleY()
    };

    if (isBackground) {
      if (selectedIds.length > 1 && trRef.current) {
        // Khung bÃ¡Â»Âc cÃ¡Â»Â§a Transformer tÃƒÂ­nh bÃ¡ÂºÂ±ng tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ tuyÃ¡Â»â€¡t Ã„â€˜Ã¡Â»â€˜i mÃƒÂ n hÃƒÂ¬nh
        const box = trRef.current.getClientRect();
        if (pointerPosition.x >= box.x && pointerPosition.x <= box.x + box.width && pointerPosition.y >= box.y && pointerPosition.y <= box.y + box.height) {
          const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
          nodes.forEach(node => { node.setAttr('dragStartX', node.x()); node.setAttr('dragStartY', node.y()); });
          setGroupDrag({ isDragging: true, startX: pos.x, startY: pos.y }); // DÃƒÂ¹ng tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ tÃ†Â°Ã†Â¡ng Ã„â€˜Ã¡Â»â€˜i Ã„â€˜Ã¡Â»Æ’ kÃƒÂ©o
          return;
        }
      }
      e.evt.preventDefault();
      // BÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u vÃ¡ÂºÂ½ khung chÃ¡Â»Ân (bÃ¡ÂºÂ±ng tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ tÃ†Â°Ã†Â¡ng Ã„â€˜Ã¡Â»â€˜i)
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

      // SÃ¡Â»Â¬ DÃ¡Â»Â¤NG SYNCELEMENTS Ã¡Â»Å¾ Ã„ÂÃƒâ€šY
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

    // TÃƒÂ­nh toÃƒÂ¡n va chÃ¡ÂºÂ¡m (DÃƒÂ¹ng tÃ¡Â»Âa Ã„â€˜Ã¡Â»â„¢ tuyÃ¡Â»â€¡t Ã„â€˜Ã¡Â»â€˜i cÃ¡Â»Â§a mÃƒÂ n hÃƒÂ¬nh Ã„â€˜Ã¡Â»Æ’ so sÃƒÂ¡nh cho chuÃ¡ÂºÂ©n)
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

    // FIX: CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t kim thÃ¡Â»Âi gian (Scrubber) nhÃ¡ÂºÂ£y Ã„â€˜Ã¡ÂºÂ¿n Ã„â€˜Ã¡ÂºÂ§u cÃ¡Â»Â§a Trang vÃ¡Â»Â«a chÃ¡Â»Ân
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
      type: currentPageType, width: stageWidth, height: stageHeight, // KÃ¡ÂºÂ¿ thÃ¡Â»Â«a thuÃ¡Â»â„¢c tÃƒÂ­nh trang
      elements: [], content: '', thumbnail: ''
    };
    setPages([...updatedPages, newPage]);
    setElements([]);
    setCurrentPageId(newPageId);

    // FIX: Khi thÃƒÂªm trang mÃ¡Â»â€ºi Ã¡Â»Å¸ cuÃ¡Â»â€˜i, Ã„â€˜Ã¡ÂºÂ©y kim thÃ¡Â»Âi gian chÃ¡ÂºÂ¡y kÃ¡Â»â€¹ch kim Ã„â€˜Ã¡ÂºÂ¿n cuÃ¡Â»â€˜i luÃƒÂ´n
    setCurrentTime(totalDuration);
  };

  const reorderPages = (dragIndex: number, dropIndex: number) => {
    const newPages = [...pages];
    const draggedItem = newPages.splice(dragIndex, 1)[0];
    newPages.splice(dropIndex, 0, draggedItem);

    // CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t lÃ¡ÂºÂ¡i page_order cho chuÃ¡ÂºÂ©n vÃ¡Â»â€ºi Database
    const updatedOrderPages = newPages.map((p, idx) => ({ ...p, page_order: idx }));
    setPages(updatedOrderPages);
  };

  // --- 5. Element CRUD & Ã„ÂÃ¡Â»â€™NG BÃ¡Â»Ëœ STATE (SYNC) ---

  // HÃƒâ‚¬M QUAN TRÃ¡Â»Å’NG NHÃ¡ÂºÂ¤T: Ã„ÂÃ¡ÂºÂ£m bÃ¡ÂºÂ£o mÃ¡Â»Âi thay Ã„â€˜Ã¡Â»â€¢i trÃƒÂªn Canvas Ã„â€˜Ã¡Â»Âu Ã„â€˜Ã†Â°Ã¡Â»Â£c lÃ†Â°u ngay lÃ¡ÂºÂ­p tÃ¡Â»Â©c vÃƒÂ o `pages`
  const syncElements = (newElements: any[]) => {
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));
  };

  const addText = () => syncElements([...elements, { id: crypto.randomUUID(), type: 'text', x: stageWidth / 2 - 150, y: stageHeight / 2 - 25, text: 'Double click to edit', fontSize: 32, fontFamily: 'Arial', fill: '#000000', width: 300, fontStyle: 'normal', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'fadeIn' } }]);
  const addRectangle = () => syncElements([...elements, { id: crypto.randomUUID(), type: 'rect', x: stageWidth / 2 - 100, y: stageHeight / 2 - 100, width: 200, height: 200, fill: '#6366f1', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]);
  const addImage = (src: string) => syncElements([...elements, { id: crypto.randomUUID(), type: 'image', x: stageWidth / 2 - 100, y: stageHeight / 2 - 100, width: 200, height: 200, src, timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]);

  const updateElement = (newAttrs: any) => {
    syncElements(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
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

  // --- LOGIC KÃƒâ€°O THÃ¡ÂºÂ¢ Ã„ÂÃ¡Â»â€I VÃ¡Â»Å  TRÃƒÂ LAYER ---
  const handleLayerDragStart = (e: React.DragEvent, index: number) => {
    setDraggedLayerIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleLayerDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) setDragOverIdx(index); // HiÃ¡Â»â€¡n thanh ngang tÃ¡ÂºÂ¡i vÃ¡Â»â€¹ trÃƒÂ­ hover
  };

  const handleLayerDragLeave = (e: React.DragEvent, index: number) => {
    if (dragOverIdx === index) setDragOverIdx(null); // TÃ¡ÂºÂ¯t thanh ngang khi chuÃ¡Â»â„¢t rÃ¡Â»Âi Ã„â€˜i
  };

  const handleLayerDragEnd = () => {
    setDraggedLayerIdx(null);
    setDragOverIdx(null); // TÃ¡ÂºÂ¯t mÃ¡Â»Âi trÃ¡ÂºÂ¡ng thÃƒÂ¡i khi thÃ¡ÂºÂ£ chuÃ¡Â»â„¢t
  };

  const handleLayerDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIdx(null); // TÃ¡ÂºÂ¯t thanh ngang ngay lÃ¡ÂºÂ­p tÃ¡Â»Â©c

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
    e.target.value = ''; // Reset Ä‘á»ƒ upload láº¡i cÃ¹ng file

    const fontName = file.name.split('.')[0];
    try {
      // BÆ°á»›c 1: Upload lÃªn server
      const formData = new FormData();
      formData.append('font', file);
      const res = await fetch('/api/assets/upload-font', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Lá»—i upload font: ${err.error || 'Unknown error'}`);
        return;
      }
      const data = await res.json();
      const fontUrl: string = data.url;
      const savedName: string = data.name || fontName;

      // BÆ°á»›c 2: Náº¡p font vÃ o trÃ¬nh duyá»‡t ngay láº­p tá»©c
      const buffer = await (await fetch(fontUrl)).arrayBuffer();
      const fontFace = new FontFace(savedName, buffer);
      const loadedFace = await fontFace.load();
      (document.fonts as any).add(loadedFace);

      // BÆ°á»›c 3: ThÃªm vÃ o danh sÃ¡ch font dropdown
      setCustomFonts(prev => prev.includes(savedName) ? prev : [...prev, savedName]);
      alert(`Font "${savedName}" Ä‘Ã£ Ä‘Æ°á»£c náº¡p vÃ  lÆ°u thÃ nh cÃ´ng!`);
    } catch (err) {
      console.error('Font upload error:', err);
      alert('Lá»—i khi upload font!');
    }
  };
  // --- TÁCH NỀN BẰNG AI ---
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

  // Trong file EditorPage.tsx -> hÃƒÂ m handleSave
  const handleSave = async (isSilent = false) => {
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
          // BÃ¡Â»â€ SUNG CÃƒÂC TRÃ†Â¯Ã¡Â»Å“NG DÃ†Â¯Ã¡Â»Å¡I Ã„ÂÃƒâ€šY:
          type: page.type || 'canvas',
          width: page.width || 1920,
          height: page.height || 1080,
          content: page.content || '', // NÃ¡Â»â„¢i dung text cho Doc
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
          }) : [] // NÃ¡ÂºÂ¿u khÃƒÂ´ng phÃ¡ÂºÂ£i canvas thÃƒÂ¬ gÃ¡Â»Â­i mÃ¡ÂºÂ£ng rÃ¡Â»â€”ng
        }))
      };

      await updateDesignFull(id!, payload);
      setSaveStatus('saved');
      if (!isSilent) alert("Ã„ÂÃƒÂ£ lÃ†Â°u thÃƒÂ nh cÃƒÂ´ng!");
    } catch (error) {
      setSaveStatus('unsaved');
      console.error("LÃ¡Â»â€”i khi lÃ†Â°u:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // KÃƒÂ­ch hoÃ¡ÂºÂ¡t Modal xuÃ¡ÂºÂ¥t file
  const handleExport = () => {
    setExportSelectedPages(pages.map(p => p.id)); // MÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh chÃ¡Â»Ân tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ cÃƒÂ¡c trang
    setShowExportModal(true);
  };

  // Logic xuÃ¡ÂºÂ¥t file thÃ¡Â»Â±c tÃ¡ÂºÂ¿ (Ã„ÂÃƒÆ’ TÃƒÂCH HÃ¡Â»Â¢P ZIP & PPTX VÃƒâ‚¬ SÃ¡Â»Â¬A LÃ¡Â»â€“I CHÃ¡Â»Å’N PAGE MP4)
  // Logic xuÃ¡ÂºÂ¥t file thÃ¡Â»Â±c tÃ¡ÂºÂ¿ (BÃ¡ÂºÂ¢N FINAL - Ãƒâ€°P XUNG FPS Ã„ÂÃ¡Â»â€š ANIMATION SIÃƒÅ U MÃ†Â¯Ã¡Â»Â¢T)
  const executeExport = async () => {
    if (exportStatus !== 'idle') return;

    if (exportSelectedPages.length === 0) return alert("Vui lÃƒÂ²ng chÃ¡Â»Ân ÃƒÂ­t nhÃ¡ÂºÂ¥t 1 trang!");

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

        // 1. TUA VÃ¡Â»â‚¬ Ã„ÂÃ¡ÂºÂ¦U VÃƒâ‚¬ DÃ¡Â»Å’N DÃ¡ÂºÂ¸P
        setIsPlaying(false);
        setCurrentTime(startExportTime);
        setSelectedIds([]);

        // 2. CHÃ¡Â»Å“ 300ms Ã„ÂÃ¡Â»â€š RENDER XONG TRÃ¡ÂºÂ NG THÃƒÂI 0s
        setTimeout(() => {
          // Ã°Å¸â€Â¥ NÃƒâ€šNG FPS LÃƒÅ N 60 Ã„ÂÃ¡Â»â€š BÃ¡ÂºÂ®T CHUYÃ¡Â»â€šN Ã„ÂÃ¡Â»ËœNG MÃ†Â¯Ã¡Â»Â¢T NHÃ¡ÂºÂ¤T
          const stream = canvas.captureStream(60);
          const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';

          // Ãƒâ€°p chÃ¡ÂºÂ¥t lÃ†Â°Ã¡Â»Â£ng bitrate lÃƒÂªn 5Mbps cho video nÃƒÂ©t cÃ„Æ’ng
          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 5000000
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };

          // Ã°Å¸â€Â¥ BÃ¡ÂºÂ¬T MÃƒÂY BÃ†Â M FPS: Ãƒâ€°p Konva phÃ¡ÂºÂ£i vÃ¡ÂºÂ½ lÃ¡ÂºÂ¡i Ã„â€˜Ã¡Â»â€œ hÃ¡Â»Âa liÃƒÂªn tÃ¡Â»Â¥c Ã„â€˜Ã¡Â»Æ’ feed cho Camera
          const forceRedrawAnim = new Konva.Animation(() => {
            if (layerRef.current) layerRef.current.draw();
          });

          recorder.onstop = async () => {
            forceRedrawAnim.stop(); // Quay xong thÃƒÂ¬ tÃ¡ÂºÂ¯t ÃƒÂ©p xung ngay lÃ¡ÂºÂ­p tÃ¡Â»Â©c

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
              alert("LÃ¡Â»â€”i tÃ¡ÂºÂ£i video tÃ¡Â»Â« Server!");
              setExportStatus('idle');
            }
          };

          // 3. ACTION! BÃ¡ÂºÂ¬T MÃƒÂY QUAY VÃƒâ‚¬ CHÃ¡ÂºÂ Y HIÃ¡Â»â€ U Ã¡Â»Â¨NG
          forceRedrawAnim.start(); // KÃƒÂ­ch hoÃ¡ÂºÂ¡t mÃƒÂ¡y bÃ†Â¡m FPS trÃ†Â°Ã¡Â»â€ºc
          recorder.start();
          setIsPlaying(true);

          // TiÃ¡ÂºÂ¿n trÃƒÂ¬nh %
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

        }, 300); // TrÃ¡Â»â€¦ 300ms

      } else {
        // ... (PhÃ¡ÂºÂ§n xuÃ¡ÂºÂ¥t Ã¡ÂºÂ£nh PNG/JPG giÃ¡Â»Â¯ nguyÃƒÂªn) {
        // XÃ¡Â»Â­ lÃƒÂ½ Ã¡ÂºÂ£nh PNG/JPG/PPTX
        setExportProgress(30);
        const pagesToExport = pages.filter(p => exportSelectedPages.includes(p.id));

        if (exportConfig.format === 'pptx') {
          const pptx = new pptxgen();
          // Set layout chuÃ¡ÂºÂ©n 16:9 (tÃ†Â°Ã†Â¡ng Ã„â€˜Ã†Â°Ã†Â¡ng 10 x 5.625 inches)
          pptx.layout = 'LAYOUT_16x9';

          pagesToExport.forEach(p => {
            const slide = pptx.addSlide();

            // 1. Ã„ÂÃ¡Â»â€¢ mÃƒÂ u nÃ¡Â»Ân nÃ¡ÂºÂ¿u cÃƒÂ³
            if (p.background_color) {
              slide.background = { color: p.background_color.replace('#', '') };
            }

            // 2. LÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u mÃ¡ÂºÂ£ng elements chuÃ¡ÂºÂ©n 
            const pageElements = p.id === currentPageId ? elements : (p.elements || []);

            // 3. DuyÃ¡Â»â€¡t qua tÃ¡Â»Â«ng layer vÃƒÂ  "vÃ¡ÂºÂ½" lÃ¡ÂºÂ¡i chÃƒÂºng
            // Ã°Å¸â€Â¥ FIX 1: Khai bÃƒÂ¡o rÃƒÂµ (el: any) Ã„â€˜Ã¡Â»Æ’ hÃ¡ÂºÂ¿t bÃƒÂ¡o Ã„â€˜Ã¡Â»Â
            pageElements.forEach((el: any) => {

              // Ã°Å¸â€Â¥ FIX 2: DÃƒÂ¹ng sÃ¡Â»â€˜ Inch thay vÃƒÂ¬ % Ã„â€˜Ã¡Â»Æ’ TypeScript vÃƒÂ  PPTX cÃƒÂ¹ng vui vÃ¡ÂºÂ»
              const pptxWidth = 10; // KÃƒÂ­ch thÃ†Â°Ã¡Â»â€ºc chuÃ¡ÂºÂ©n 10 inches
              const pptxHeight = 5.625; // KÃƒÂ­ch thÃ†Â°Ã¡Â»â€ºc chuÃ¡ÂºÂ©n 5.625 inches

              const x = (el.x / stageWidth) * pptxWidth;
              const y = (el.y / stageHeight) * pptxHeight;
              const w = (el.width / stageWidth) * pptxWidth;
              const h = (el.height / stageHeight) * pptxHeight;

              const colorHex = el.fill ? el.fill.replace('#', '') : '000000';

              // Quy Ã„â€˜Ã¡Â»â€¢i Ã„â€˜Ã¡Â»â„¢ mÃ¡Â»Â opacity sang transparency cÃ¡Â»Â§a PowerPoint (0 - 100%)
              const transparency = el.opacity !== undefined ? (1 - el.opacity) * 100 : 0;
              const rotate = el.rotation || 0;

              if (el.type === 'text') {
                // ChuyÃ¡Â»Æ’n Ã„â€˜Ã¡Â»â€¢i px sang Point cÃ¡Â»Â§a PPTX (Slide 16:9 dÃƒÂ i 10 inch, 1 inch = 72 point => mÃƒÂ n hÃƒÂ¬nh dÃƒÂ i 720 point)
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
                  console.error("LÃ¡Â»â€”i khi thÃƒÂªm Ã¡ÂºÂ£nh vÃƒÂ o PPTX:", e);
                }
              }
            });
          });

          await pptx.writeFile({ fileName: `${design?.title || 'Kanva_Export'}.pptx` });
        } else {
          // PNG/JPG vÃ¡Â»â€ºi Scaling
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
      alert("LÃ¡Â»â€”i xuÃ¡ÂºÂ¥t file!");
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
              // 1. ThÃƒÂªm vÃƒÂ o Canvas vÃ¡Â»â€ºi kÃƒÂ­ch thÃ†Â°Ã¡Â»â€ºc chuÃ¡ÂºÂ©n gÃ¡Â»â€˜c
              addImageOriginal(base64Url, img.width, img.height);

              // 2. GÃ¡Â»Â­i bÃ¡ÂºÂ£n sao cÃ¡Â»Â§a Ã¡ÂºÂ£nh vÃƒÂ o Tab Uploads Ã„â€˜Ã¡Â»Æ’ quÃ¡ÂºÂ£n lÃƒÂ½ tÃ¡ÂºÂ­p trung
              setUploadedImages(prev => [{ id: crypto.randomUUID(), url: base64Url, width: img.width, height: img.height }, ...prev]);

              // 3. TÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng bÃ¡ÂºÂ­t Tab Uploads ra cho ngÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng dÃ¡Â»â€¦ nhÃƒÂ¬n thÃ¡ÂºÂ¥y
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
  }, [stageWidth, stageHeight]);

  // States cho Version History
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  // GÃ¡Â»Âi khi bÃ¡ÂºÂ¥m nÃƒÂºt "Version History"
  const handleOpenVersionHistory = async () => {
    setShowVersionModal(true);
    try {
      const data = await fetchDesignVersions(id!);
      setVersions(data.versions || []);
    } catch (error) { console.error(error); }
  };

  // KhÃƒÂ´i phÃ¡Â»Â¥c bÃ¡ÂºÂ£n cÃ…Â©
  const handleRestore = async (versionId: string) => {
    if (!window.confirm("BÃ¡ÂºÂ£n thiÃ¡ÂºÂ¿t kÃ¡ÂºÂ¿ hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i sÃ¡ÂºÂ½ bÃ¡Â»â€¹ ghi Ã„â€˜ÃƒÂ¨. BÃ¡ÂºÂ¡n cÃƒÂ³ chÃ¡ÂºÂ¯c chÃ¡ÂºÂ¯n muÃ¡Â»â€˜n khÃƒÂ´i phÃ¡Â»Â¥c?")) return;
    setIsRestoring(true);
    try {
      await restoreDesignVersion(id!, versionId);
      alert("Ã„ÂÃƒÂ£ khÃƒÂ´i phÃ¡Â»Â¥c thÃƒÂ nh cÃƒÂ´ng!");
      window.location.reload(); // CÃƒÂ¡ch sÃ¡ÂºÂ¡ch nhÃ¡ÂºÂ¥t lÃƒÂ  F5 lÃ¡ÂºÂ¡i trang Ã„â€˜Ã¡Â»Æ’ nÃ¡ÂºÂ¡p lÃ¡ÂºÂ¡i dÃ¡Â»Â¯ liÃ¡Â»â€¡u mÃ¡Â»â€ºi tÃ¡Â»Â« DB
    } catch (error) {
      alert("LÃ¡Â»â€”i khi khÃƒÂ´i phÃ¡Â»Â¥c");
    } finally {
      setIsRestoring(false);
    }
  };

  // ChÃ¡Â»Â¥p mÃ¡Â»â„¢t phiÃƒÂªn bÃ¡ÂºÂ£n thÃ¡Â»Â§ cÃƒÂ´ng
  const handleSaveVersion = async () => {
    await handleSave(true); // NhÃ¡Â»â€º lÃ†Â°u DB hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i trÃ†Â°Ã¡Â»â€ºc
    try {
      await createDesignVersion(id!);
      alert("Ã„ÂÃƒÂ£ chÃ¡Â»Â¥p vÃƒÂ  lÃ†Â°u thÃƒÂ nh 1 phiÃƒÂªn bÃ¡ÂºÂ£n lÃ¡Â»â€¹ch sÃ¡Â»Â­!");
    } catch (error) {
      alert("LÃ¡Â»â€”i khi lÃ†Â°u phiÃƒÂªn bÃ¡ÂºÂ£n");
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
      />

      {/* 2. MAIN AREA */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Icon Rail */}
        <EditorSidebar
          activeTab={activeTab}
          setActiveTab={(tab: any) => {
            setActiveTab(tab);
            if (tab) { setShowPositionBox(false); setShowAnimateBox(false); }
          }}
          currentPageType={currentPageType}
          handleFontUpload={handleFontUpload}
        />

        {/* Sidebar Drawer (panel trÆ°á»£t tá»« trÃ¡i) */}
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
        />

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
              {selectedElement && currentPageType === 'canvas' && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute top-6 left-1/2 -translate-x-1/2 z-[60]"
                >
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

            {/* Animate Box Ä‘Ã£ Ä‘Æ°á»£c Ä‘Æ°a vÃ o SidebarDrawer */}

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

      {/* EXPORT PROGRESS TOAST */}
      <ExportProgressToast
        exportStatus={exportStatus}
        exportProgress={exportProgress}
        exportFormat={exportConfig.format}
      />
    </div>
  );
}
