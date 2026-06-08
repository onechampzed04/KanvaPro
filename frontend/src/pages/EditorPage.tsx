import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Zap, MousePointer2, PenTool, Shapes, Minus, StickyNote, Type } from 'lucide-react';
import ShareModal from '../components/editor/ShareModal';
import Konva from 'konva';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import pptxgen from 'pptxgenjs';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDesignVersions, restoreDesignVersion, updateDesignFull, createDesignVersion, uploadVideoForExport, uploadImageFile, uploadPageThumbnail, cloneAssetForDesign } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useCollaboration } from '../hooks/useCollaboration';

// Components Ä‘Ã£ tÃ¡ch sáºµn
import EditorSidebar from '../components/editor/EditorSidebar';
import DocEditor, { DocEditorHandle } from '../components/editor/DocEditor';
import SheetEditor from '../components/editor/SheetEditor';
import CanvasEditor from '../components/editor/CanvasEditor';
import BottomTimeline from '../components/editor/BottomTimeline';
import ElementToolbar from '../components/ElementToolbar';

// Components má»›i tÃ¡ch
import EditorTopBar from '../components/editor/EditorTopBar';
import SidebarDrawer from '../components/editor/SidebarDrawer';
import TransitionBox from '../components/editor/TransitionBox';
import AnimateBox from '../components/editor/AnimateBox';
import VersionHistoryModal from '../components/editor/VersionHistoryModal';
import ExportProgressToast from '../components/editor/ExportProgressToast';
import PresentationPlayer from '../components/editor/PresentationPlayer';
import BrushEraserModal from '../components/editor/BrushEraserModal';
import CropOverlay from '../components/editor/CropOverlay';
import ProUpgradeModal from '../components/editor/ProUpgradeModal';
import ExportProBlockModal, { type ProElement } from '../components/editor/ExportProBlockModal';
import { isSubscriptionActive } from '../context/AuthContext';
import AnimationPanel from '../components/editor/AnimationPanel';
import LayerPanel from '../components/editor/LayerPanel';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useLazyPageLoader } from '../hooks/useLazyPageLoader';
import { useCollabStore } from '../store/useCollabStore';

export default function EditorPage() {
  const activeUsers = useCollabStore((state) => state.activeUsers);
  const isConnected = useCollabStore((state) => state.isConnected);

  // --- 1. Component State & Refs ---
  const isRemoteUpdateRef = useRef(false);
  const { id } = useParams();
  const lazyPageLoader = useLazyPageLoader(id);
  const navigate = useNavigate(); // === FIX #6: DÃ¹ng navigate thay vÃ¬ tháº» <a> ===
  const { user, refreshUser } = useAuth(); // Láº¥y current user Ä‘á»ƒ truyá»n cho collaboration
  const [design, setDesign] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  // === FIX #6: Ref Ä‘á»ƒ beforeunload khÃ´ng bá»‹ stale closure ===
  const saveStatusRef = useRef<'saved' | 'saving' | 'unsaved'>('saved');
  useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
  // Overlay state khi Ä‘ang force-save trÆ°á»›c khi navigate vá» Dashboard
  const [isSavingBeforeNav, setIsSavingBeforeNav] = useState(false);
  const [collabNotification, setCollabNotification] = useState<string>('');
  const isInitialMount = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // === FIX #2 PATCH: Ref lÆ°u version má»›i nháº¥t tá»« server â€” tuyá»‡t Ä‘á»‘i khÃ´ng bá»‹ stale closure ===
  // KhÃ¡c vá»›i design state (cÃ³ thá»ƒ cÅ©), ref nÃ y luÃ´n ghi ngay sau má»—i save thÃ nh cÃ´ng
  const designVersionRef = useRef<string | null>(null);


  // â”€â”€ UNDO / REDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // === FIX #3: DÃ¹ng Command Diff Pattern â€” khÃ´ng cÃ²n JSON.parse(JSON.stringify) ===
  const commandHistory = useCommandHistory();
  const syncElementsImmediateRef = useRef<(els: any[], skipEmit?: boolean) => void>(() => { });

  // Wrapper tuong thich nguoc: pushUndoSnapshot(elements) -> commandHistory REORDER
  // Giai quyet 16 cho code cu con goi ham nay ma khong can refactor toan bo.
  const pushUndoSnapshot = useCallback((snapshot: any[]) => {
    if (commandHistory.isApplyingRef.current) return;
    commandHistory.pushCommand({ type: 'REORDER', before: snapshot, after: snapshot });
  }, [commandHistory]);

  // LÆ°u snapshot BEFORE cá»§a element trÆ°á»›c khi báº¯t Ä‘áº§u phÃªn chá»‰nh sá»­a text
  const originalElementsBeforeTextEditRef = useRef<any[] | null>(null);

  // Callback khi báº¯t Ä‘áº§u báº¥t ká»³ hÃ nh Ä‘á»™ng nÃ o â€” push ADD command cho element má»›i
  // (cÃ¡c UPDATE/DELETE Ä‘Æ°á»£c push tá»«ng nÆ¡i tÆ°Æ¡ng á»©ng)
  const handleActionStart = useCallback((beforeElements?: any[]) => {
    // Náº¿u cÃ³ beforeElements thÃ¬ Ä‘Ã¢y lÃ  snapshot trÆ°á»›c khi drag/resize: push BATCH UPDATE
    // Logic chi tiáº¿t Ä‘Æ°á»£c xá»­ lÃ½ táº¡i nÆ¡i push cá»¥ thá»ƒ (CanvasEditor, toolbar)
  }, []);

  // Callback khi káº¿t thÃºc phÃªn edit text
  const handleTextEditEnd = useCallback((_finalText: string, _elementId: string) => {
    // Text Ä‘Ã£ Ä‘Æ°á»£c push UPDATE command táº¡i Ä‘Ãºng Ä‘iá»ƒm thay Ä‘á»•i trong CanvasEditor
    originalElementsBeforeTextEditRef.current = null;
  }, []);

  // Undo Handler: láº¥y command cuá»‘i tá»« stack, Ã¡p dá»¥ng ngÆ°á»£c láº¡i lÃªn elements
  const handleUndo = useCallback(() => {
    const newElements = commandHistory.undo(elements);
    if (newElements !== null) {
      commandHistory.isApplyingRef.current = true;
      syncElementsImmediateRef.current(newElements, true);
      commandHistory.isApplyingRef.current = false;
    }
  }, [elements, commandHistory]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    const newElements = commandHistory.redo(elements);
    if (newElements !== null) {
      commandHistory.isApplyingRef.current = true;
      syncElementsImmediateRef.current(newElements, true);
      commandHistory.isApplyingRef.current = false;
    }
  }, [elements, commandHistory]);

  // â”€â”€ SIDEBAR VISIBLE TOGGLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // â”€â”€ LINK POPUP (Ctrl+K) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // â”€â”€ GRID VIEW (inline, replaces canvas area) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showGridView, setShowGridView] = useState(false);
  const [gridDragIdx, setGridDragIdx] = useState<number | null>(null);
  const [copiedPageData, setCopiedPageData] = useState<any | null>(null);
  const [gridSelectedPages, setGridSelectedPages] = useState<Set<string>>(new Set());

  // â”€â”€ DEBOUNCED AUTOSAVE (2.5s sau khi ngÆ°á»i dÃ¹ng ngá»«ng thao tÃ¡c hoÃ n toÃ n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      // handleSave Ä‘Æ°á»£c Ä‘á»‹nh nghÄ©a sau, dÃ¹ng ref Ä‘á»ƒ trÃ¡nh stale closure
      handleSaveRef.current?.(true);
    }, 2500); // 2.5 giÃ¢y debounce
  }, []);
  // Ref Ä‘á»ƒ gá»i handleSave mÃ  khÃ´ng cáº§n nÃ³ trong dependency array
  const handleSaveRef = useRef<((silent: boolean) => void) | null>(null);

  // RBAC States
  const [currentRole, setCurrentRole] = useState<'owner' | 'editor' | 'commenter' | 'viewer'>('viewer');
  const [showShareModal, setShowShareModal] = useState(false);

  // Presentation Mode
  const [showPresentationMode, setShowPresentationMode] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({ format: 'png' });
  const [exportSelectedPages, setExportSelectedPages] = useState<string[]>([]);

  // Infinite Canvas Toolbox
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'shape' | 'line' | 'sticky' | 'text'>('select');
  const [showShapePopover, setShowShapePopover] = useState(false);

  const [showPositionBox, setShowPositionBox] = useState(false);
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showAnimateBox, setShowAnimateBox] = useState(false);
  const [animTab, setAnimTab] = useState<'in' | 'out'>('in');
  // NEW: Right-side Animation Panel + Layer Panel
  const [showAnimPanel, setShowAnimPanel] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [highlightedAnimId, setHighlightedAnimId] = useState<string | null>(null);
  // Preview animation: -1 = not previewing; >0 = current step being shown
  const [animPreviewStep, setAnimPreviewStep] = useState(-1);
  // Which step is CURRENTLY animating in (to apply the correct effect)
  const [animPreviewCurrentStep, setAnimPreviewCurrentStep] = useState(-1);
  // Progress 0â†’1 of current step's entry animation
  const [animPreviewProgress, setAnimPreviewProgress] = useState(1);
  const animPreviewRafRef = useRef<number | null>(null);
  const animPreviewStartTimeRef = useRef<number>(0);
  const ANIM_PREVIEW_DURATION = 600; // ms per step animation

  const handlePreviewStepChange = useCallback((step: number) => {
    setAnimPreviewStep(step);
    if (step >= 0) {
      setAnimPreviewCurrentStep(step);
      setAnimPreviewProgress(0);
      animPreviewStartTimeRef.current = performance.now();
      if (animPreviewRafRef.current) cancelAnimationFrame(animPreviewRafRef.current);
      const animate = (now: number) => {
        const elapsed = now - animPreviewStartTimeRef.current;
        const progress = Math.min(1, elapsed / ANIM_PREVIEW_DURATION);
        setAnimPreviewProgress(progress);
        if (progress < 1) {
          animPreviewRafRef.current = requestAnimationFrame(animate);
        } else {
          animPreviewRafRef.current = null;
        }
      };
      animPreviewRafRef.current = requestAnimationFrame(animate);
    } else {
      setAnimPreviewCurrentStep(-1);
      setAnimPreviewProgress(1);
      if (animPreviewRafRef.current) { cancelAnimationFrame(animPreviewRafRef.current); animPreviewRafRef.current = null; }
    }
  }, []);

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
  const [exportQuality, setExportQuality] = useState(0.9); // 0.1–1.0, JPEG only
  // Export Pro block modal
  const [exportBlockElements, setExportBlockElements] = useState<ProElement[]>([]);

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
  const docEditorRef = useRef<DocEditorHandle | null>(null);

  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, percent: number }>({ visible: false, percent: 0 });
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  // ── CROP MODE ─────────────────────────────────────────────────────────────
  const [cropElementId, setCropElementId] = useState<string | null>(null);
  const cropElement = cropElementId ? elements.find(el => el.id === cropElementId) : null;

  // ── PRO UPGRADE MODAL ────────────────────────────────────────────────────
  const [showProModal, setShowProModal] = useState<{ feature: string; desc?: string } | null>(null);

  // â”€â”€â”€ REAL-TIME COLLABORATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Ref lÆ°u currentPageId Ä‘á»ƒ trÃ¡nh stale closure trong socket callbacks
  const currentPageIdRef = useRef<string | null>(null);
  useEffect(() => { currentPageIdRef.current = currentPageId; }, [currentPageId]);

  // Ref theo dÃµi elementId nÃ o Ä‘ang bá»‹ ngÆ°á»i dÃ¹ng NÃ€Y kÃ©o (khÃ´ng bá»‹ remote overwrite)
  const draggingElementIdsRef = useRef<Set<string>>(new Set());

  // State con trá» chuá»™t cá»§a cÃ¡c collaborator khÃ¡c
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { name: string; color: string; x: number; y: number }>>(new Map());

  const handleRemoteElementsUpdate = useCallback((pageId: string, remoteElements: any[]) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    lazyPageLoader.updateCache(pageId, remoteElements);
    // LuÃ´n cáº­p nháº­t pages store
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, elements: remoteElements } : p
    ));
    // Chá»‰ cáº­p nháº­t elements state náº¿u Ä‘ang á»Ÿ Ä‘Ãºng trang
    if (currentPageIdRef.current === pageId) {
      setElements(prev => {
        // Náº¿u khÃ´ng cÃ³ element nÃ o Ä‘ang bá»‹ kÃ©o: thay toÃ n bá»™
        if (draggingElementIdsRef.current.size === 0) {
          return remoteElements;
        }
        // Náº¿u cÃ³ element Ä‘ang kÃ©o: báº£o vá»‡ local version cá»§a chÃºng
        return remoteElements.map(remoteEl => {
          if (draggingElementIdsRef.current.has(remoteEl.id)) {
            const localEl = prev.find(el => el.id === remoteEl.id);
            return localEl ?? remoteEl;
          }
          return remoteEl;
        });
      });
    }
  }, [lazyPageLoader]);

  const handleRemotePageAdded = useCallback((newPage: any, addedByName: string) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    setPages(prev => {
      if (prev.some(p => p.id === newPage.id)) return prev;
      const updated = [...prev, { ...newPage, elements: newPage.elements || [], thumbnail: newPage.thumbnail || '' }];
      return updated.sort((a: any, b: any) => a.page_order - b.page_order);
    });
    setCollabNotification(`${addedByName} Ä‘Ã£ thÃªm má»™t trang má»›i`);
    setTimeout(() => setCollabNotification(''), 3000);
  }, []);

  const handleRemotePageDeleted = useCallback((pageId: string, deletedByName: string) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    setPages(prev => {
      const updated = prev.filter(p => p.id !== pageId).map((p, i) => ({ ...p, page_order: i }));
      return updated;
    });
    setCurrentPageId(prev => {
      if (prev !== pageId) return prev;
      setPages(current => {
        const remaining = current.filter(p => p.id !== pageId);
        if (remaining.length > 0) setElements(remaining[0].elements || []);
        return current;
      });
      return null;
    });
    setCollabNotification(`${deletedByName} Ä‘Ã£ xÃ³a má»™t trang`);
    setTimeout(() => setCollabNotification(''), 3000);
  }, []);

  const handleRemoteCursorMove = useCallback((userId: string, name: string, color: string, x: number, y: number) => {
    setRemoteCursors(prev => {
      const next = new Map(prev);
      next.set(userId, { name, color, x, y });
      return next;
    });
  }, []);

  const [collaboratorResizing, setCollaboratorResizing] = useState<{ userName: string; targetPageId: string } | null>(null);

  const handleRemotePageResized = useCallback((pageId: string, width: number, height: number, isLive: boolean, userName: string) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, width, height } : p));
    if (isLive) {
      setCollaboratorResizing({ userName, targetPageId: pageId });
    } else {
      setCollaboratorResizing(null);
    }
  }, []);

  // â”€â”€ Xá»­ lÃ½ Delta Update tá»« remote â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ─── Xử lý Delta Update từ remote ──────────────────────────────────────────
  const handleRemoteDelta = useCallback((delta: { pageId: string; elementId: string; action: string; changes?: any }) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    if (delta.action === 'update' && delta.changes) {
      setElements(prev => prev.map(el =>
        el.id === delta.elementId ? { ...el, ...delta.changes } : el
      ));
      setPages(prev => {
        const updated = prev.map(p =>
          p.id === delta.pageId
            ? { ...p, elements: p.elements.map((el: any) => el.id === delta.elementId ? { ...el, ...delta.changes } : el) }
            : p
        );
        const updatedPage = updated.find(p => p.id === delta.pageId);
        if (updatedPage) {
          lazyPageLoader.updateCache(delta.pageId, updatedPage.elements);
        }
        return updated;
      });
    }
  }, [lazyPageLoader]);

  const handleRemotePageThumbnailUpdated = useCallback((pageId: string, thumbUrl: string) => {
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, thumbnail: thumbUrl } : p));
  }, []);

  const {
    emitElementsUpdate,
    emitElementsUpdateImmediate,
    emitElementDelta,
    emitPageChanged,
    emitPageAdded,
    emitPageDeleted,
    emitCursorMove,
    emitPageResize,
    emitPageThumbnailUpdated,
    emitElementLock,
    emitElementUnlock,
  } = useCollaboration({
    designId: id,
    onRemoteUpdate: handleRemoteElementsUpdate,
    onRemotePageAdded: handleRemotePageAdded,
    onRemotePageDeleted: handleRemotePageDeleted,
    onRemoteCursorMove: handleRemoteCursorMove,
    onRemotePageResized: handleRemotePageResized,
    onRemoteDelta: handleRemoteDelta,
    onRemotePageThumbnailUpdated: handleRemotePageThumbnailUpdated,
  });

  const addImageOriginal = (src: string, originalWidth: number, originalHeight: number, flags?: { createdByAi?: boolean; isPro?: boolean }) => {
    let finalW = originalWidth;
    let finalH = originalHeight;

    if (finalW > stageWidth) { const r = stageWidth / finalW; finalW = stageWidth; finalH *= r; }
    if (finalH > stageHeight) { const r = stageHeight / finalH; finalH = stageHeight; finalW *= r; }

    syncElements([...elements, {
      id: crypto.randomUUID(), type: 'image',
      x: stageWidth / 2 - finalW / 2, y: stageHeight / 2 - finalH / 2,
      width: finalW, height: finalH, src,
      ...(flags?.createdByAi && { createdByAi: true }),
      ...(flags?.isPro && { is_premium: true }),
      timeline: { start: 0, duration: 5, lane: elements.length % 4 }, animation: { in: 'none' }
    }]);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return alert('Vui lòng chọn file hình ảnh!');

    setUploadProgress({ visible: true, percent: 10 });
    try {
      const data = await uploadImageFile(file);
      setUploadProgress({ visible: true, percent: 80 });
      refreshUser().catch(console.error);

      // Đọc kích thước ảnh từ URL vừa nhận
      const img = new window.Image();
      img.src = data.url;
      img.onload = () => {
        setUploadProgress({ visible: true, percent: 100 });
        setUploadedImages(prev => [{ id: data.assetId ?? crypto.randomUUID(), url: data.url, width: img.width, height: img.height }, ...prev]);
        setTimeout(() => setUploadProgress({ visible: false, percent: 0 }), 500);
      };
      img.onerror = () => {
        // Nếu img lỗi load, vẫn thêm vào danh sách với kích thước mặc định
        setUploadedImages(prev => [{ id: data.assetId ?? crypto.randomUUID(), url: data.url, width: 800, height: 600 }, ...prev]);
        setUploadProgress({ visible: false, percent: 0 });
      };
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(err.message || 'Lỗi khi tải ảnh lên. Vui lòng thử lại!');
      setUploadProgress({ visible: false, percent: 0 });
    }
  };

  /**
   * [NEW] Thêm ảnh từ sidebar Uploads vào Canvas + tạo Bản ghi B ngầm.
   * Đảm bảo xóa ảnh khỏi Uploads (Bản ghi A) không làm mất ảnh trên canvas.
   */
  const addUploadedImageToCanvas = useCallback((imgItem: { id: string; url: string; width?: number; height?: number }) => {
    addImageOriginal(imgItem.url, imgItem.width || 800, imgItem.height || 600);
    if (imgItem.id && id) {
      cloneAssetForDesign(imgItem.id, id).catch((err: any) => {
        console.warn('[CloneAsset] Background clone failed (non-critical):', err?.message);
      });
    }
  }, [id, addImageOriginal]);

  // --- 2. Data Fetching ---
  useEffect(() => {
    if (design?.title) setTempTitle(design.title);
  }, [design?.title]);

  // === FIX #4: Khá»Ÿi táº¡o Lazy Page Loader ===
  // lazyPageLoader hoisted to top

  // Cập nhật LRU cache khi elements của trang hiện tại thay đổi để tránh stale cache khi chuyển trang
  useEffect(() => {
    if (currentPageId && elements.length > 0) {
      lazyPageLoader.updateCache(currentPageId, elements);
    }
  }, [currentPageId, elements, lazyPageLoader]);

  // HÃ m load elements khi ngÆ°á»i dÃ¹ng chuyá»ƒn trang (hoáº·c láº§n Ä‘áº§u)
  const loadPageElements = useCallback(async (pageId: string, pagesState?: any[]) => {
    const elements = await lazyPageLoader.loadPageElements(pageId);
    setElements(elements);
    setPages(prev => {
      const base = pagesState || prev;
      return base.map(p => p.id === pageId ? { ...p, elements } : p);
    });
  }, [lazyPageLoader]);

  // === FIX #4: DÃ¹ng Shallow API /meta Ä‘á»ƒ load nhanh, lazy load elements theo trang ===
  useEffect(() => {
    fetch(`/api/designs/${id}/meta`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (res.status === 403) {
          alert('Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p báº£n váº½ nÃ y.');
          window.location.href = '/';
          throw new Error('403 Forbidden');
        }
        return res.json();
      })
      .then(data => {
        setDesign(data);
        // === FIX #2 PATCH: Ghi version ngay khi fetch, khÃ´ng dá»±a vÃ o state cycle ===
        if (data.updated_at) {
          designVersionRef.current = data.updated_at;
        }
        if (data.current_user_role) {
          setCurrentRole(data.current_user_role);
        }
        if (data.pages && data.pages.length > 0) {
          // Shallow API tráº£ vá» pages KHÃ”NG cÃ³ elements (chá»‰ cÃ³ metadata)
          const loadedPages = data.pages.map((p: any) => {
            let parsedContent = p.content || '';
            if (typeof parsedContent === 'string' && parsedContent.startsWith('"')) {
              try { parsedContent = JSON.parse(parsedContent); } catch { /* giá»¯ nguyÃªn */ }
            }
            return {
              ...p,
              content: parsedContent,
              duration: Number(p.duration) || 5,
              elements: p.elements || [],
              thumbnail: p.thumbnail || ''
            };
          });
          setPages(loadedPages);
          setCurrentPageId(loadedPages[0].id);
          // === FIX #4: Lazy load elements trang Ä‘áº§u, prefetch trang 2 Ã¢m tháº§m ===
          // === FIX #4: Lazy load elements trang đầu, prefetch trang 2 âm thầm ===
          // Pending image is handled AFTER loadPageElements completes to avoid race condition:
          // loadPageElements sets elements from DB; .then() appends the pending image on top.
          const _firstPage = loadedPages[0];
          const _pendingKey = `pending_import_image_${id}`;
          const _pendingUrl = sessionStorage.getItem(_pendingKey);
          if (_pendingUrl) sessionStorage.removeItem(_pendingKey);
          loadPageElements(_firstPage.id, loadedPages).then(() => {
            if (_pendingUrl) {
              const _w = _firstPage.width || 1920;
              const _h = _firstPage.height || 1080;
              const _el = {
                id: crypto.randomUUID(), type: 'image',
                x: 0, y: 0, width: _w, height: _h, src: _pendingUrl,
                timeline: { start: 0, duration: 5, lane: 0 }, animation: { in: 'none' }
              };
              setElements((prev: any[]) => [...prev, _el]);
              setPages((prev: any[]) => prev.map((p: any) =>
                p.id === _firstPage.id ? { ...p, elements: [...(p.elements || []), _el] } : p
              ));
            }
          });
          if (loadedPages[1]) lazyPageLoader.prefetchPage(loadedPages[1].id);
        } else {
          const initPageId = crypto.randomUUID();
          setPages([{ id: initPageId, page_order: 0, elements: [], thumbnail: '' }]);
          setCurrentPageId(initPageId);
          setElements([]);
        }
      })
      .catch(err => console.error(err));
  }, [id]);

  // pending_import_image: được xử lý trong loadPageElements để tránh race condition
  // (Không dùng useEffect riêng nữa)

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

  const getStagePointerPos = useCallback((e: any) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };

    // Try standard coordinates from clientX / clientY
    const clientX = e.clientX !== undefined ? e.clientX : (e.evt?.clientX !== undefined ? e.evt.clientX : null);
    const clientY = e.clientY !== undefined ? e.clientY : (e.evt?.clientY !== undefined ? e.evt.clientY : null);

    if (clientX !== null && clientY !== null) {
      const rect = stage.container().getBoundingClientRect();
      const transform = stage.getAbsoluteTransform().copy().invert();
      return transform.point({ x: clientX - rect.left, y: clientY - rect.top });
    }

    // Fallback to stage pointer position
    const pointerPosition = stage.getPointerPosition();
    if (pointerPosition) {
      return {
        x: (pointerPosition.x - stage.x()) / stage.scaleX(),
        y: (pointerPosition.y - stage.y()) / stage.scaleY()
      };
    }
    return { x: 0, y: 0 };
  }, []);

  const handleMouseDown = (e: any) => {
    const isTransformer = e.target.getParent()?.className === 'Transformer';
    if (isTransformer) return;
    const isBackground = e.target === e.target.getStage() || e.target.id() === 'bg';

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const pos = getStagePointerPos(e);

    if (isBackground) {
      if (selectedIds.length > 1 && trRef.current && pointerPosition) {
        const box = trRef.current.getClientRect();
        if (pointerPosition.x >= box.x && pointerPosition.x <= box.x + box.width && pointerPosition.y >= box.y && pointerPosition.y <= box.y + box.height) {
          const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
          nodes.forEach(node => { node.setAttr('dragStartX', node.x()); node.setAttr('dragStartY', node.y()); });
          setGroupDrag({ isDragging: true, startX: pos.x, startY: pos.y });
          return;
        }
      }
      if (e.evt) e.evt.preventDefault();
      setSelectionRect({ visible: true, startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, width: 0, height: 0 });
      setSelectedIds([]);
      return;
    }

    const clickedOnId = e.target.id();
    if (!clickedOnId) return;
    if (!e.evt?.shiftKey) {
      if (!selectedIds.includes(clickedOnId)) setSelectedIds([clickedOnId]);
    } else {
      if (selectedIds.includes(clickedOnId)) setSelectedIds(selectedIds.filter(id => id !== clickedOnId));
      else setSelectedIds([...selectedIds, clickedOnId]);
    }
  };

  const handleMouseMove = (e: any) => {
    const pos = getStagePointerPos(e);

    if (groupDrag.isDragging) {
      if (e.evt) e.evt.preventDefault();
      else if (typeof e.preventDefault === 'function') e.preventDefault();
      const dx = pos.x - groupDrag.startX;
      const dy = pos.y - groupDrag.startY;
      const nodes = selectedIds.map(sid => layerRef.current.findOne(`#${sid}`)).filter(Boolean);
      nodes.forEach(node => { node.x(node.getAttr('dragStartX') + dx); node.y(node.getAttr('dragStartY') + dy); });
      trRef.current?.getLayer().batchDraw();
      return;
    }

    if (!selectionRect.visible) return;
    if (e.evt) e.evt.preventDefault();
    else if (typeof e.preventDefault === 'function') e.preventDefault();
    setSelectionRect(prev => ({
      ...prev,
      x: Math.min(pos.x, prev.startX),
      y: Math.min(pos.y, prev.startY),
      width: Math.abs(pos.x - prev.startX),
      height: Math.abs(pos.y - prev.startY),
    }));
  };

  const handleMouseUp = (e: any) => {
    const pos = getStagePointerPos(e);

    if (groupDrag.isDragging) {
      if (e.evt) e.evt.preventDefault();
      else if (typeof e.preventDefault === 'function') e.preventDefault();
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
    if (e.evt) e.evt.preventDefault();
    else if (typeof e.preventDefault === 'function') e.preventDefault();
    setTimeout(() => { setSelectionRect(prev => ({ ...prev, visible: false })); });

    // Chá»‰ thá»±c hiá»‡n quÃ©t chá»n nhiá»u váº­t thá»ƒ náº¿u ngÆ°á»i dÃ¹ng kÃ©o rÃª chuá»™t táº¡o vÃ¹ng chá»n rÃµ rá»‡t (> 5px)
    if (selectionRect.width > 5 && selectionRect.height > 5) {
      const selBox = selectionRectRef.current.getClientRect();
      const newSelectedIds = elements.filter(el => {
        const node = layerRef.current.findOne(`#${el.id}`);
        if (!node) return false;
        const nodeBox = node.getClientRect();
        return Konva.Util.haveIntersection(selBox, nodeBox);
      }).map(el => el.id);

      setSelectedIds(newSelectedIds);
    }
  };

  const handleMouseMoveRef = useRef(handleMouseMove);
  const handleMouseUpRef = useRef(handleMouseUp);

  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
  });

  // â”€â”€ GLOBAL WINDOW MOUSE LISTENERS FOR SELECTION AND GROUP DRAG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!selectionRect.visible && !groupDrag.isDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      handleMouseMoveRef.current(e);
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      handleMouseUpRef.current(e);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [selectionRect.visible, groupDrag.isDragging]);

  // --- 4. Page Management ---
  const handlePageChange = (newPageId: string) => {
    if (newPageId === currentPageId) return;

    // === FIX #1: DÃ¹ng toBlob() upload thumbnail Ã¢m tháº§m thay vÃ¬ nhá»“i base64 vÃ o state ===
    if (stageRef.current && currentPageType === 'canvas' && currentPageId) {
      setSelectedIds([]);
      const capturedPageId = currentPageId;
      stageRef.current.toBlob({ pixelRatio: 0.25 }, (blob: Blob | null) => {
        if (blob) {
          uploadPageThumbnail(blob, capturedPageId).then(thumbUrl => {
            if (thumbUrl) {
              const cacheBustedUrl = !thumbUrl.startsWith('data:') ? thumbUrl.split('?')[0] + '?t=' + Date.now() : thumbUrl;
              setPages(prev => prev.map(p => p.id === capturedPageId ? { ...p, thumbnail: cacheBustedUrl } : p));
              emitPageThumbnailUpdated(capturedPageId, cacheBustedUrl);
            }
          });

        }
      });
    }

    const updatedPages = pages.map(p =>
      p.id === currentPageId ? { ...p, elements: elements } : p
    );
    setPages(updatedPages);
    if (currentPageId) {
      lazyPageLoader.updateCache(currentPageId, elements);
    }
    setCurrentPageId(newPageId);

    // === FIX #4: Lazy load elements của trang mới (cache hoặc fetch) ===
    loadPageElements(newPageId, updatedPages);

    // Prefetch trang kế tiếp âm thầm
    const newPageIdx = updatedPages.findIndex(p => p.id === newPageId);
    const nextPage = updatedPages[newPageIdx + 1];
    if (nextPage) lazyPageLoader.prefetchPage(nextPage.id);

    const targetTiming = pageTimings.find((pt: any) => pt.id === newPageId);
    if (targetTiming) {
      setCurrentTime(targetTiming.start);
    }
  };

  const handleAddPage = () => {
    let thumb = '';
    if (stageRef.current && currentPageType === 'canvas') {
      setSelectedIds([]);

      const transformers = stageRef.current.find('Transformer');
      transformers.forEach(tr => tr.hide());
      const guidelines = stageRef.current.find(node => node.name() === 'guideline');
      guidelines.forEach(g => g.hide());
      stageRef.current.batchDraw();

      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2 });

      transformers.forEach(tr => tr.show());
      guidelines.forEach(g => g.show());
      stageRef.current.batchDraw();
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
    // PhÃ¡t sá»± kiá»‡n real-time cho cÃ¡c collaborator
    emitPageAdded(newPage);
  };

  // XÃ³a trang: lá»c khá»i máº£ng + chuyá»ƒn sang trang lÃ¢n cáº­n
  const handleDeletePage = (pageIdToDelete: string) => {
    if (pages.length <= 1) return; // Giá»¯ láº¡i Ã­t nháº¥t 1 trang
    const idx = pages.findIndex(p => p.id === pageIdToDelete);
    const newPages = pages
      .filter(p => p.id !== pageIdToDelete)
      .map((p, i) => ({ ...p, page_order: i }));
    setPages(newPages);
    if (pageIdToDelete === currentPageId) {
      const nextPage = newPages[Math.max(0, idx - 1)];
      if (nextPage) {
        setCurrentPageId(nextPage.id);
        setElements(nextPage.elements || []);
      }
    }
    // PhÃ¡t sá»± kiá»‡n real-time cho cÃ¡c collaborator
    emitPageDeleted(pageIdToDelete);
  };

  // Insert a new doc page immediately after `afterPageId` (used by DocEditor auto-split)
  const handleInsertDocPage = useCallback((afterPageId: string, content: string = '') => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === afterPageId);
      if (idx === -1) return prev;
      const ref = prev[idx];
      const newPage = {
        id: crypto.randomUUID(),
        page_order: idx + 1,
        type: 'doc',
        width: ref.width || 794,
        height: ref.height || 1123,
        elements: [],
        content,
        thumbnail: '',
      };
      return [
        ...prev.slice(0, idx + 1),
        newPage,
        ...prev.slice(idx + 1).map((p, i) => ({ ...p, page_order: idx + 2 + i })),
      ];
    });
  }, []);


  const reorderPages = (dragIndex: number, dropIndex: number) => {
    const newPages = [...pages];
    const draggedItem = newPages.splice(dragIndex, 1)[0];
    newPages.splice(dropIndex, 0, draggedItem);

    const updatedOrderPages = newPages.map((p, idx) => ({ ...p, page_order: idx }));
    setPages(updatedOrderPages);
  };

  // Called from PageThumbnailBar drag-and-drop
  const handlePageReorder = useCallback((newPagesOrdered: any[]) => {
    setPages(newPagesOrdered);
    // Auto-save to sync order to backend
    // Use a short timeout to allow state to settle first
    setTimeout(() => handleSave(true), 500);
  }, []);

  const handleResizeCanvas = useCallback((newWidth: number, newHeight: number) => {
    if (!currentPageId) return;
    setPages(prev => prev.map(p =>
      p.id === currentPageId ? { ...p, width: newWidth, height: newHeight } : p
    ));
    setTimeout(() => handleSave(true), 500);
  }, [currentPageId]);

  const handleResizeCanvasLive = useCallback((newWidth: number, newHeight: number) => {
    if (!currentPageId) return;
    setPages(prev => prev.map(p =>
      p.id === currentPageId ? { ...p, width: newWidth, height: newHeight } : p
    ));
    emitPageResize(currentPageId, newWidth, newHeight, true);
  }, [currentPageId, emitPageResize]);

  const handleResizeCanvasFinal = useCallback((newWidth: number, newHeight: number, dx: number, dy: number) => {
    if (!currentPageId) return;
    setPages(prev => prev.map(p =>
      p.id === currentPageId ? { ...p, width: newWidth, height: newHeight } : p
    ));

    if (dx !== 0 || dy !== 0) {
      setElements(prev => {
        const updated = prev.map(el => ({ ...el, x: el.x - dx, y: el.y - dy }));
        emitElementsUpdateImmediate(currentPageId, updated);
        return updated;
      });
    }

    emitPageResize(currentPageId, newWidth, newHeight, false);
    setTimeout(() => handleSave(true), 500);
  }, [currentPageId, emitPageResize, emitElementsUpdateImmediate]);

  // --- 5. Element CRUD ---

  // Throttled: dÃ¹ng cho sá»± kiá»‡n liÃªn tá»¥c (DragMove, live typing)
  const syncElements = useCallback((newElements: any[], _skipEmit = false) => {
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));
    if (!_skipEmit && currentPageId) {
      emitElementsUpdate(currentPageId, newElements);
    }
    scheduleAutosave(); // Äáº·t láº¡i bá»™ Ä‘áº¿m 2.5s má»—i khi cÃ³ thay Ä‘á»•i
  }, [currentPageId, emitElementsUpdate, scheduleAutosave]);

  // Immediate: dÃ¹ng cho DragEnd/TransformEnd Ä‘á»ƒ Ä‘áº£m báº£o state cuá»‘i cÃ¹ng luÃ´n Ä‘Æ°á»£c gá»­i
  const syncElementsImmediate = useCallback((newElements: any[], _skipEmit = false) => {
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));
    if (!_skipEmit && currentPageId) {
      emitElementsUpdateImmediate(currentPageId, newElements);
    }
    scheduleAutosave(); // Äáº·t láº¡i bá»™ Ä‘áº¿m 2.5s sau má»—i DragEnd/TransformEnd
  }, [currentPageId, emitElementsUpdateImmediate, scheduleAutosave]);

  // GÃ¡n ref Ä‘á»ƒ handleUndo/handleRedo dÃ¹ng mÃ  khÃ´ng bá»‹ stale/hoisting
  syncElementsImmediateRef.current = syncElementsImmediate;

  const addText = () => { pushUndoSnapshot(elements); syncElementsImmediate([...elements, { id: crypto.randomUUID(), type: 'text', x: stageWidth / 2 - 150, y: stageHeight / 2 - 25, text: 'Double click to edit', fontSize: 32, fontFamily: 'Arial', fill: '#000000', width: 300, fontStyle: 'normal', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'fadeIn' } }]); };
  const addRectangle = () => { pushUndoSnapshot(elements); syncElementsImmediate([...elements, { id: crypto.randomUUID(), type: 'rect', x: stageWidth / 2 - 100, y: stageHeight / 2 - 100, width: 200, height: 200, fill: '#6366f1', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]); };
  const addCircle = () => { pushUndoSnapshot(elements); syncElementsImmediate([...elements, { id: crypto.randomUUID(), type: 'circle', x: stageWidth / 2, y: stageHeight / 2, width: 100, height: 100, fill: '#f97316', timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]); };
  const addLine = () => { pushUndoSnapshot(elements); syncElementsImmediate([...elements, { id: crypto.randomUUID(), type: 'line', tool: 'line', points: [stageWidth / 2 - 100, stageHeight / 2, stageWidth / 2 + 100, stageHeight / 2], stroke: '#334155', strokeWidth: 2, tension: 0, lineCap: 'round', lineJoin: 'round', x: 0, y: 0, timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'none' } }]); };
  const addImage = (src: string, flags?: { isPro?: boolean; createdByAi?: boolean }) => {
    // Load image to get natural dimensions — preserve aspect ratio, max 400px
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MAX = 400;
      const ratio = img.naturalWidth / img.naturalHeight;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (ratio >= 1) { w = MAX; h = Math.round(MAX / ratio); }
        else             { h = MAX; w = Math.round(MAX * ratio); }
      }
      pushUndoSnapshot(elements);
      syncElementsImmediate([...elements, {
        id: crypto.randomUUID(), type: 'image',
        x: stageWidth / 2 - w / 2, y: stageHeight / 2 - h / 2,
        width: w, height: h, src,
        // Pro flags for export gate
        ...(flags?.isPro     && { is_premium: true }),
        ...(flags?.createdByAi && { createdByAi: true }),
        timeline: { start: 0, duration: 5, lane: elements.length },
        animation: { in: 'none' },
      }]);
      setRecentStickers(prev => {
        if (prev.some(s => s.url === src)) return prev;
        return [{ url: src, last_used: new Date().toISOString() }, ...prev].slice(0, 10);
      });
    };
    img.onerror = () => {
      pushUndoSnapshot(elements);
      syncElementsImmediate([...elements, {
        id: crypto.randomUUID(), type: 'image',
        x: stageWidth / 2 - 100, y: stageHeight / 2 - 100,
        width: 200, height: 200, src,
        ...(flags?.isPro     && { is_premium: true }),
        ...(flags?.createdByAi && { createdByAi: true }),
        timeline: { start: 0, duration: 5, lane: elements.length },
        animation: { in: 'none' },
      }]);
    };
    img.src = src;
  };

  const addElement = useCallback((newEl: any) => {
    // Push undo trÆ°á»›c khi thÃªm element má»›i (tá»« toolbox draw/shape/text)
    pushUndoSnapshot(elements);
    syncElementsImmediate([...elements, newEl]);
  }, [elements, syncElementsImmediate, pushUndoSnapshot]);

  // updateElement: throttled, Ä‘Ã¡nh dáº¥u element Ä‘ang bá»‹ kÃ©o Ä‘á»ƒ trÃ¡nh remote overwrite
  const updateElement = (newAttrs: any) => {
    draggingElementIdsRef.current.add(newAttrs.id);
    syncElements(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  // updateElementImmediate: gá»­i ngay, bá» lock sau DragEnd/TransformEnd
  const updateElementImmediate = (newAttrs: any) => {
    draggingElementIdsRef.current.delete(newAttrs.id);
    syncElementsImmediate(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  const updateElements = (updatedElements: any[]) => {
    const updatedMap = new Map(updatedElements.map(el => [el.id, el]));
    syncElementsImmediate(elements.map(el => updatedMap.has(el.id) ? updatedMap.get(el.id) : el));
  };


  const deleteSelectedElement = () => {
    if (selectedIds.length === 0) return;
    // Push undo TRÆ¯á»šC khi xÃ³a Ä‘á»ƒ cÃ³ thá»ƒ khÃ´i phá»¥c
    pushUndoSnapshot(elements);
    syncElements(elements.filter(el => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  };

  const moveElement = (direction: 'up' | 'down') => {
    if (selectedIds.length !== 1) return;
    pushUndoSnapshot(elements); // Push undo trÆ°á»›c khi Ä‘á»•i z-index
    const index = elements.findIndex(el => el.id === selectedIds[0]);
    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    else if (direction === 'down' && index > 0) [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
    syncElements(newElements);
  };

  // updateElement dÃ¹ng cho Toolbar (mÃ u, font, style) â€” cáº§n undo trÆ°á»›c khi Ä‘á»•i
  const updateElementWithUndo = useCallback((newAttrs: any) => {
    pushUndoSnapshot(elements);
    syncElementsImmediate(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  }, [elements, pushUndoSnapshot, syncElementsImmediate]);

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
      pushUndoSnapshot(elements); // Push undo trÆ°á»›c khi thay Ä‘á»•i thá»© tá»± layer
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
        alert(`Lá»—i upload font: ${err.error || 'Unknown error'}`);
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
      alert(`Font "${savedName}" Ä‘Ã£ Ä‘Æ°á»£c náº¡p vÃ  lÆ°u thÃ nh cÃ´ng!`);
    } catch (err) {
      console.error('Font upload error:', err);
      alert('Lá»—i khi upload font!');
    }
  };

  const handleRemoveBackground = async (element: any) => {
    if (!element || !element.src) return;
    // ── PRO GATE ──
    if (!isSubscriptionActive(user)) {
      setShowProModal({ feature: 'Auto Remove Background', desc: 'Tự động xóa nền bằng AI chỉ dành cho tài khoản Pro!' });
      return;
    }
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
        throw new Error('Lá»—i tá»« server tÃ¡ch ná»n');
      }

      const data = await uploadRes.json();

      const backendUrl = `http://localhost:3000${data.url}`;
      updateElement({ ...element, src: backendUrl, hasRemovedBg: true });

    } catch (err) {
      console.error('Lá»—i khi xÃ³a ná»n:', err);
      alert('ÄÃ£ xáº£y ra lá»—i khi xÃ³a ná»n. Vui lÃ²ng kiá»ƒm tra láº¡i AI service.');
    } finally {
      setIsProcessingBg(false);
    }
  };

  // â”€â”€â”€ Brush Background Eraser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [brushEraserElement, setBrushEraserElement] = useState<any>(null);

  const handleBrushErase = (element: any) => {
    setBrushEraserElement(element);
  };

  const handleBrushEraseResult = (newSrc: string) => {
    if (!brushEraserElement) return;
    // Push undo trÆ°á»›c khi Ã¡p dá»¥ng káº¿t quáº£ xÃ³a ná»n báº±ng cá»
    pushUndoSnapshot(elements);
    updateElementImmediate({ ...brushEraserElement, src: newSrc });
    setBrushEraserElement(null);
  };

  const isReadOnly = currentRole === 'viewer' || currentRole === 'commenter';

  const canEdit = currentRole === 'owner' || currentRole === 'editor';

  // KhÃ³a phÃ­m táº¯t cho viewer/commenter
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

  // Trong file EditorPage.tsx -> hÃ m handleSave
  const handleSave = async (isSilent = false) => {
    if (isReadOnly) return;

    // Helper chuyển dataURL thành Blob
    const dataURLtoBlob = (dataurl: string): Blob => {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    };

    // Flush DocEditor DOM → get latest content map (bypasses React state timing)
    const docContentMap: Map<string, string> = docEditorRef.current?.flushAll
      ? docEditorRef.current.flushAll()
      : new Map();

    setSaveStatus('saving');
    setIsSaving(true);
    try {
      let uploadedThumbnailUrl = '';
      // === FIX #1: Dùng toDataURL() rồi convert sang blob upload thumbnail đồng bộ ===
      if (stageRef.current && currentPageType === 'canvas' && currentPageId) {
        const capturedPageId = currentPageId;
        try {
          // Ẩn tất cả Transformer (boundary box lựa chọn) và đường dóng căn chỉnh trước khi chụp ảnh để thumbnail sạch đẹp
          const transformers = stageRef.current.find('Transformer');
          transformers.forEach(tr => tr.hide());
          const guidelines = stageRef.current.find(node => node.name() === 'guideline');
          guidelines.forEach(g => g.hide());
          stageRef.current.batchDraw();

          const dataUrl = stageRef.current.toDataURL({ pixelRatio: 0.25 });

          // Hiện lại tất cả sau khi chụp xong
          transformers.forEach(tr => tr.show());
          guidelines.forEach(g => g.show());
          stageRef.current.batchDraw();
          if (dataUrl) {
            const blob = dataURLtoBlob(dataUrl);
            const thumbUrl = await uploadPageThumbnail(blob, capturedPageId);
            if (thumbUrl) {
              const cacheBustedUrl = !thumbUrl.startsWith('data:') ? thumbUrl.split('?')[0] + '?t=' + Date.now() : thumbUrl;
              uploadedThumbnailUrl = cacheBustedUrl;
              setPages(prev => prev.map(p => p.id === capturedPageId ? { ...p, thumbnail: cacheBustedUrl } : p));
              emitPageThumbnailUpdated(capturedPageId, cacheBustedUrl);
            }

          }
        } catch (err) {
          console.error("Lỗi tạo/tải lên thumbnail canvas:", err);
        }
      }

      const finalPages = pages.map(p => {
        const base = p.id === currentPageId
          ? { ...p, elements, thumbnail: uploadedThumbnailUrl || p.thumbnail }
          : { ...p };
        // Override doc page content with live DOM content if available
        if (p.type === 'doc' && docContentMap.has(p.id)) {
          base.content = docContentMap.get(p.id)!;
        }
        return base;
      });

      const payload = {
        title: design?.title || 'Untitled Design',
        thumbnail_url: uploadedThumbnailUrl || design?.thumbnail_url || '', // đồng bộ thumbnail tông thể của thiết kế
        // === FIX #2 PATCH: Đọc từ REF thay vì state — luôn là giá trị mới nhất, không stale ===
        version: (activeUsers && activeUsers.length > 1) ? undefined : designVersionRef.current,
        pages: finalPages.map((page, index) => ({
          id: page.id,
          page_order: index,
          thumbnail: page.thumbnail || '', // DÃ¹ng URL tá»« DB, khÃ´ng pháº£i base64
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

      const result = await updateDesignFull(id!, payload);

      // === FIX #2 PATCH: Ghi version má»›i ngay láº­p tá»©c vÃ o ref (khÃ´ng chá»  React re-render) ===
      if (result?.updated_at) {
        designVersionRef.current = result.updated_at; // GHI VÃ€O REF TRÆ¯á»œC
        setDesign((prev: any) => prev ? { ...prev, updated_at: result.updated_at } : prev);
      }

      setSaveStatus('saved');
      if (!isSilent) alert('Ä Ã£ lÆ°u thÃ nh cÃ´ng! ');
    } catch (error: any) {
      // === FIX #2: OCC - Xá»­ lÃ½ 409 Conflict ===
      if (error?.status === 409 || (error?.message && error.message.includes('409'))) {
        setSaveStatus('unsaved');
        const shouldReload = window.confirm(
          'âš ï¸ Xung Ä‘á»™t dá»¯ liá»‡u! NgÆ°á»i dÃ¹ng khÃ¡c Ä‘Ã£ lÆ°u thay Ä‘á»•i má»›i hÆ¡n.\n\n' +
          'Nháº¥n OK Ä‘á»ƒ táº£i láº¡i phiÃªn báº£n má»›i nháº¥t (máº¥t thay Ä‘á»•i hiá»‡n táº¡i).\n' +
          'Nháº¥n Cancel Ä‘á»ƒ tiáº¿p tá»¥c lÃ m viá»‡c (cÃ³ thá»ƒ ghi Ä‘Ã¨ lÃªn thay Ä‘á»•i cá»§a ngÆ°á»i khÃ¡c).'
        );
        if (shouldReload) window.location.reload();
      } else {
        setSaveStatus('unsaved');
        console.error('Lá»—i khi lÆ°u:', error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Gáº¯n handleSave vÃ o ref Ä‘á»ƒ scheduleAutosave dÃ¹ng mÃ  khÃ´ng bá»‹ stale closure
  handleSaveRef.current = handleSave;

  // Cleanup autosave timer khi unmount
  useEffect(() => {
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, []);

  // === FIX #6: beforeunload - Cháº·n Ä‘Ã³ng tab khi cÃ³ unsaved changes ===
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // DÃ¹ng saveStatusRef Ä‘á»ƒ trÃ¡nh stale closure (khÃ´ng pháº£i saveStatus state)
      if (saveStatusRef.current === 'unsaved' || saveStatusRef.current === 'saving') {
        e.preventDefault();
        // Popup cáº£nh bÃ¡o tiÃªu chuáº©n cá»§a trÃ¬nh duyá»‡t
        e.returnValue = 'Báº¡n cÃ³ nhá»¯ng thay Ä‘á»•i chÆ°a Ä‘Æ°á»£c lÆ°u. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n thoÃ¡t?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); // Chá»‰ mount 1 láº§n nhá» dÃ¹ng saveStatusRef thay vÃ¬ saveStatus

  // === FIX #6: Force save trÆ°á»›c khi navigate vá» Dashboard ===
  // Thay vÃ¬ dÃ¹ng tháº» <a href="/"> (bá» qua unsaved), dÃ¹ng hÃ m nÃ y Ä‘á»ƒ:
  // 1. Kiá»ƒm tra saveStatus, náº¿u unsaved â†’ hiá»‡n overlay "Äang lÆ°u..."
  // 2. Await handleSave() thÃ nh cÃ´ng â†’ navigate vá» "/"
  const handleGoBackToDashboard = useCallback(async () => {
    if (saveStatusRef.current === 'saved') {
      navigate('/');
      return;
    }
    // CÃ³ unsaved changes: force save trÆ°á»›c
    setIsSavingBeforeNav(true);
    try {
      await handleSaveRef.current?.(true); // isSilent = true
      navigate('/');
    } catch {
      // Náº¿u save tháº¥t báº¡i, váº«n cho phÃ©p thoÃ¡t sau khi xÃ¡c nháº­n
      const forceLeave = window.confirm(
        'KhÃ´ng thá»ƒ lÆ°u tá»± Ä‘á»™ng. Báº¡n cÃ³ muá»‘n thoÃ¡t mÃ  khÃ´ng lÆ°u khÃ´ng?'
      );
      if (forceLeave) navigate('/');
    } finally {
      setIsSavingBeforeNav(false);
    }
  }, [navigate]);

  const handleExport = () => {
    setExportSelectedPages(pages.map(p => p.id));
    setShowExportModal(true);
  };

  const executeExport = async () => {
    if (exportStatus !== 'idle') return;
    if (exportSelectedPages.length === 0) return alert("Vui lÃ²ng chá»n Ã­t nháº¥t 1 trang!");

    // â”€â”€ DOCX export (doc pages) â”€â”€
    // ── PRO ELEMENTS GATE ─────────────────────────────────────────────────────
    if (!isSubscriptionActive(user)) {
      const pagesToCheck = pages.filter((p: any) => exportSelectedPages.includes(p.id));
      const allEls: any[] = pagesToCheck.flatMap((p: any) =>
        p.id === currentPageId ? elements : (p.elements || [])
      );
      const proEls: ProElement[] = allEls
        .filter((el: any) => el.is_premium || el.createdByAi || el.hasRemovedBg)
        .map((el: any) => ({
          id: el.id,
          name: el.name || (el.type === 'image' ? 'Hinh anh' : 'Element'),
          reason: el.is_premium ? 'is_premium' : el.createdByAi ? 'ai' : 'remove_bg',
        }));
      if (proEls.length > 0) {
        setExportBlockElements(proEls);
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (exportConfig.format === 'docx') {
      if (docEditorRef.current) {
        await docEditorRef.current.exportDocx();
      }
      setShowExportPopover(false);
      return;
    }


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
              alert("Lá»—i táº£i video tá»« Server!");
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
                  console.error("Lá»—i khi thÃªm áº£nh vÃ o PPTX:", e);
                }
              }
            });
          });

          await pptx.writeFile({ fileName: `${design?.title || 'Kanva_Export'}.pptx` });
        } else {
          // Ẩn tất cả Transformer và đường dóng căn chỉnh trước khi export để có file xuất sạch đẹp
          const transformers = stageRef.current ? stageRef.current.find('Transformer') : [];
          transformers.forEach(tr => tr.hide());
          const guidelines = stageRef.current ? stageRef.current.find(node => node.name() === 'guideline') : [];
          guidelines.forEach(g => g.hide());
          if (stageRef.current) stageRef.current.batchDraw();

          if (pagesToExport.length === 1) {
            const mimeType = exportConfig.format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const dataURL = stageRef.current.toDataURL({ pixelRatio: exportScale, mimeType, quality: exportQuality });
            saveAs(dataURL, `${design?.title}.${exportConfig.format}`);
          } else {
            const zip = new JSZip();
            pagesToExport.forEach((p, i) => {
              const mimeType = exportConfig.format === 'jpeg' ? 'image/jpeg' : 'image/png';
              const dataURL = p.id === currentPageId
                ? stageRef.current.toDataURL({ pixelRatio: exportScale, mimeType, quality: exportQuality })
                : p.thumbnail;
              if (dataURL) zip.file(`Page_${i + 1}.${exportConfig.format}`, dataURL.split(',')[1], { base64: true });
            });
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "export.zip");
          }

          // Hiện lại sau khi export xong
          transformers.forEach(tr => tr.show());
          guidelines.forEach(g => g.show());
          if (stageRef.current) stageRef.current.batchDraw();
        }
        setExportProgress(100);
        setExportStatus('completed');
        setTimeout(() => setExportStatus('idle'), 3000);
      }
    } catch (error) {
      setExportStatus('idle');
      alert("Lá»—i xuáº¥t file!");
    }
  };

  // --- 8. Side Effects ---
  useEffect(() => {
    if (isInitialMount.current) {
      if (elements.length > 0 || pages.length > 0) isInitialMount.current = false;
      return;
    }
    if (isRemoteUpdateRef.current) {
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

  // â”€â”€ COMPREHENSIVE KEYBOARD SHORTCUTS (Canva-style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      // â”€â”€ Ctrl + S: Save (luÃ´n cháº·n máº·c Ä‘á»‹nh) â”€â”€
      if (ctrl && key === 's') {
        e.preventDefault();
        handleSave(false);
        return;
      }

      // â”€â”€ Náº¿u Ä‘ang á»Ÿ Ã´ input/textarea/contentEditable â†’ chá»‰ cho Ctrl+S, bá» qua phÃ­m táº¯t khÃ¡c â”€â”€
      if (isTextInput) return;

      // â”€â”€ GRID VIEW SPECIFIC SHORTCUTS â”€â”€
      if (showGridView) {
        // Ctrl+C: Copy current page or selected pages
        if (ctrl && key === 'c') {
          e.preventDefault();
          const pagesToCopy = gridSelectedPages.size > 0
            ? pages.filter(p => gridSelectedPages.has(p.id))
            : (currentPageId ? [pages.find(p => p.id === currentPageId)].filter(Boolean) : []);
          if (pagesToCopy.length > 0) {
            setCopiedPageData(pagesToCopy.map(p => JSON.parse(JSON.stringify(p))));
          }
          return;
        }
        // Ctrl+V: Paste copied page(s)
        if (ctrl && key === 'v') {
          e.preventDefault();
          if (copiedPageData && Array.isArray(copiedPageData)) {
            const newPages = copiedPageData.map((p: any, index: number) => {
              const newPageId = crypto.randomUUID();
              const newPage = {
                ...p,
                id: newPageId,
                page_order: pages.length + index,
                elements: (p.elements || []).map((el: any) => ({ ...el, id: crypto.randomUUID() })),
              };
              emitPageAdded(newPage);
              return newPage;
            });
            setPages(prev => [...prev, ...newPages]);
          }
          return;
        }
        // Delete/Backspace: Delete selected pages
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (gridSelectedPages.size > 0 && pages.length > gridSelectedPages.size) {
            const remaining = pages.filter(p => !gridSelectedPages.has(p.id));
            if (remaining.length > 0) {
              gridSelectedPages.forEach(pid => {
                emitPageDeleted(pid);
              });
              const updatedPages = remaining.map((p, i) => ({ ...p, page_order: i }));
              setPages(updatedPages);
              if (gridSelectedPages.has(currentPageId!)) {
                const firstRemaining = updatedPages[0];
                setCurrentPageId(firstRemaining.id);
                setElements(firstRemaining.elements || []);
              }
              setGridSelectedPages(new Set());
            }
          }
          return;
        }
        // Ctrl+A: Select all pages in grid
        if (ctrl && key === 'a') {
          e.preventDefault();
          setGridSelectedPages(new Set(pages.map(p => p.id)));
          return;
        }
        // Escape: Close grid view
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowGridView(false);
          return;
        }
        return; // Block other shortcuts in grid view
      }

      // â”€â”€ Ctrl + Z: Undo â”€â”€
      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // â”€â”€ Ctrl + Y: Redo â”€â”€
      if (ctrl && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // â”€â”€ Ctrl + A: Select All elements â”€â”€
      if (ctrl && key === 'a') {
        e.preventDefault();
        if (currentPageType === 'canvas' && elements.length > 0) {
          setSelectedIds(elements.map(el => el.id));
        }
        return;
      }

      // â”€â”€ Ctrl + /: Toggle Sidebar â”€â”€
      if (ctrl && e.key === '/') {
        e.preventDefault();
        setSidebarVisible(prev => !prev);
        return;
      }

      // â”€â”€ Ctrl + K: Add Link â”€â”€
      if (ctrl && key === 'k') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setShowLinkPopup(true);
          setLinkUrl('');
        }
        return;
      }

      // â”€â”€ Ctrl + Enter: Add empty page â”€â”€
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        handleAddPage();
        return;
      }

      // â”€â”€ Ctrl + Backspace: Delete empty page â”€â”€
      if (ctrl && e.key === 'Backspace') {
        e.preventDefault();
        if (currentPageId && pages.length > 1) {
          const curPage = pages.find(p => p.id === currentPageId);
          const pageElements = curPage?.elements || elements;
          if (pageElements.length === 0) {
            handleDeletePage(currentPageId);
          }
        }
        return;
      }

      // â”€â”€ Ctrl + F1: Focus to toolbar â”€â”€
      if (ctrl && e.key === 'F1') {
        e.preventDefault();
        const toolbar = document.querySelector('[data-toolbar="top"]') as HTMLElement;
        if (toolbar) toolbar.focus();
        return;
      }

      // â”€â”€ Ctrl + F2: Focus to canvas â”€â”€
      if (ctrl && e.key === 'F2') {
        e.preventDefault();
        const canvas = document.querySelector('.konvajs-content canvas') as HTMLElement;
        if (canvas) canvas.focus();
        return;
      }

      // â”€â”€ Delete / Backspace: Delete selected elements â”€â”€
      if ((e.key === 'Delete' || e.key === 'Backspace') && !editingId && selectedIds.length > 0) {
        e.preventDefault();
        pushUndoSnapshot(elements);
        deleteSelectedElement();
        return;
      }

      // â”€â”€ PhÃ­m táº¯t thÃªm pháº§n tá»­ (chá»‰ 1 phÃ­m, chá»‰ khi á»Ÿ canvas mode) â”€â”€
      if (currentPageType !== 'canvas') return;

      // T: Add Text
      if (key === 't' && !ctrl) {
        e.preventDefault();
        addText();
        return;
      }

      // R: Add Rectangle
      if (key === 'r' && !ctrl) {
        e.preventDefault();
        addRectangle();
        return;
      }

      // L: Add Line
      if (key === 'l' && !ctrl) {
        e.preventDefault();
        addLine();
        return;
      }

      // C: Add Circle
      if (key === 'c' && !ctrl) {
        e.preventDefault();
        addCircle();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, elements, editingId, currentPageType, currentPageId, pages, handleUndo, handleRedo, sidebarVisible, showGridView, gridSelectedPages, copiedPageData]);

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
    if (!window.confirm("Báº¡n thiáº¿t káº¿ hiá»‡n táº¡i sáº½ bá»‹ ghi Ä‘Ã¨. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n khÃ´i phá»¥c?")) return;
    setIsRestoring(true);
    try {
      await restoreDesignVersion(id!, versionId);
      alert("ÄÃ£ khÃ´i phá»¥c thÃ nh cÃ´ng!");
      window.location.reload();
    } catch (error) {
      alert("Lá»—i khi khÃ´i phá»¥c");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveVersion = async () => {
    await handleSave(true);
    try {
      await createDesignVersion(id!);
      alert("ÄÃ£ chá»¥p vÃ  lÆ°u thÃ nh 1 phiÃªn báº£n lá»‹ch sá»­!");
    } catch (error) {
      alert("Lá»—i khi lÆ°u phiÃªn báº£n");
    }
  };

  // --- 9. Render Giao Dien ---
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-sky-50 via-white to-pink-50 overflow-hidden font-sans">

      {/* === FIX #6: Overlay Force-Save khi navigate vá» Dashboard === */}
      {isSavingBeforeNav && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-bold text-lg tracking-wide">Äang lÆ°u dá»¯ liá»‡u cuá»‘i cÃ¹ng...</p>
          <p className="text-white/60 text-sm">Vui lÃ²ng khÃ´ng Ä‘Ã³ng cá»­a sá»• nÃ y</p>
        </div>
      )}

      {/* COLLAB NOTIFICATION TOAST */}
      {collabNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[999] bg-indigo-600 text-white px-5 py-2.5 rounded-full shadow-xl font-bold text-sm flex items-center gap-2"
        >
          <span>ðŸ”„</span> {collabNotification}
        </motion.div>
      )}

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
        exportQuality={exportQuality}
        setExportQuality={setExportQuality}
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
        currentPageType={currentPageType}
        designType={design?.design_type}
        onPresent={design?.design_type === 'presentation' ? () => setShowPresentationMode(true) : undefined}
        onResizeCanvas={handleResizeCanvas}
        onGoBack={handleGoBackToDashboard}
      />

      {/* 2. MAIN AREA */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Icon Rail â€” hidden for doc pages, sidebar toggle off, or grid view */}
        {canEdit && currentPageType !== 'doc' && sidebarVisible && !showGridView && (
          <EditorSidebar
            activeTab={activeTab}
            setActiveTab={(tab: any) => {
              setActiveTab(tab);
              if (tab) { setShowPositionBox(false); setShowAnimateBox(false); }
            }}
            currentPageType={currentPageType}
            handleFontUpload={handleFontUpload}
            showLayerPanel={showLayerPanel}
            onToggleLayerPanel={() => { setShowLayerPanel(v => !v); setShowAnimPanel(false); }}
          />
        )}

        {/* Sidebar Drawer â€” hidden for doc pages, sidebar toggle off, or grid view */}
        {canEdit && currentPageType !== 'doc' && sidebarVisible && !showGridView && (
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
            addUploadedImageToCanvas={addUploadedImageToCanvas}
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
            showLayerPanel={showLayerPanel}
            onLayerReorder={(newEls: any[]) => {
              pushUndoSnapshot(elements);
              syncElementsImmediate(newEls);
            }}
            onLayerUpdateElement={updateElementWithUndo}
            user={user}
          />
        )}

        {/* RIGHT PANEL: Animation Panel */}
        <AnimatePresence>
          {showAnimPanel && canEdit && currentPageType === 'canvas' && (
            <AnimationPanel
              elements={elements}
              selectedIds={selectedIds}
              onUpdateElement={updateElementWithUndo}
              onUpdateElements={(updater) => {
                const newEls = updater(elements);
                pushUndoSnapshot(elements);
                syncElementsImmediate(newEls);
              }}
              onClose={() => { setShowAnimPanel(false); handlePreviewStepChange(-1); }}
              onSelectElement={(ids) => setSelectedIds(ids)}
              highlightedId={highlightedAnimId}
              onPreviewStepChange={handlePreviewStepChange}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col relative overflow-hidden">

          <div className={`flex-1 flex relative ${currentPageType === 'canvas' ? 'overflow-hidden' : currentPageType === 'doc' ? 'overflow-hidden' : currentPageType === 'sheet' ? 'overflow-hidden' : 'overflow-auto items-center justify-center p-8'}`}>

            {/* â”€â”€ GRID VIEW OVERLAY WITH PREMIUM ANIMATION â”€â”€ */}
            <AnimatePresence>
              {showGridView && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 30 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 z-[60] flex flex-col bg-[#f1f5f9] overflow-y-auto"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {/* Grid header bar */}
                  <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-2.5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-medium text-slate-500">
                        {pages.length} trang
                      </span>
                      <button
                        onClick={() => {
                          if (gridSelectedPages.size === pages.length) {
                            setGridSelectedPages(new Set());
                          } else {
                            setGridSelectedPages(new Set(pages.map(p => p.id)));
                          }
                        }}
                        className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition cursor-pointer"
                      >
                        {gridSelectedPages.size === pages.length ? 'Bá» chá»n táº¥t cáº£' : 'Chá»n táº¥t cáº£'}
                      </button>
                    </div>

                    {/* Premium Back Button */}
                    <button
                      onClick={() => setShowGridView(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-[12px] font-semibold text-slate-700 shadow-sm transition active:scale-[0.98] cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                      </svg>
                      Quay láº¡i thiáº¿t káº¿
                    </button>
                  </div>

                  {/* Grid body */}
                  <div className="p-5 pb-12">
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {pages.map((page: any, index: number) => {
                        const isActive = currentPageId === page.id;
                        return (
                          <div
                            key={page.id}
                            draggable
                            onDragStart={() => setGridDragIdx(index)}
                            onDragOver={e => { e.preventDefault(); }}
                            onDrop={() => {
                              if (gridDragIdx !== null && gridDragIdx !== index) {
                                reorderPages(gridDragIdx, index);
                                handlePageReorder(
                                  (() => { const np = [...pages]; const [m] = np.splice(gridDragIdx, 1); np.splice(index, 0, m); return np.map((p: any, i: number) => ({ ...p, page_order: i })); })()
                                );
                              }
                              setGridDragIdx(null);
                            }}
                            onDragEnd={() => setGridDragIdx(null)}
                            className="flex flex-col items-center gap-1 group"
                          >
                            {/* Thumbnail card */}
                            <div
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  // Multi-select with Ctrl+Click
                                  setGridSelectedPages(prev => {
                                    const next = new Set(prev);
                                    if (next.has(page.id)) next.delete(page.id);
                                    else next.add(page.id);
                                    return next;
                                  });
                                } else {
                                  handlePageChange(page.id); setShowGridView(false);
                                }
                              }}
                              className={`relative w-full cursor-pointer rounded-md overflow-hidden transition-all duration-150 bg-white
                              ${gridDragIdx === index ? 'opacity-40 scale-90' : 'hover:shadow-md hover:scale-[1.01]'}
                              ${isActive ? 'ring-2 ring-indigo-500 shadow-md' : gridSelectedPages.has(page.id) ? 'ring-2 ring-blue-400 shadow-sm' : 'ring-1 ring-slate-200/80 hover:ring-slate-300'}
                            `}
                              style={{ aspectRatio: '16 / 9' }}
                            >
                              {page.thumbnail ? (
                                <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-white text-slate-300 text-xs font-medium">
                                  Empty
                                </div>
                              )}

                              {/* Hover overlay with delete */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                              {pages.length > 1 && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeletePage(page.id); }}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/90 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px] shadow-sm"
                                >
                                  Ã—
                                </button>
                              )}
                            </div>

                            {/* Page label */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                              </svg>
                              {index + 1}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add page tile */}
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          onClick={handleAddPage}
                          className="relative w-full cursor-pointer rounded-lg border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white/60 hover:bg-indigo-50 flex items-center justify-center transition-all"
                          style={{ aspectRatio: '16 / 9' }}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">Add page</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                      onUpdate={updateElementWithUndo}
                      onDelete={deleteSelectedElement}
                      onMove={moveElement}
                      fontList={customFonts}
                      onTogglePosition={() => { setShowPositionBox(!showPositionBox); setShowAnimateBox(false); }}
                      onToggleAnimate={() => {
                        setShowAnimPanel(prev => !prev);
                        setShowLayerPanel(false);
                        setHighlightedAnimId(selectedElement?.id || null);
                      }}
                      onRemoveBackground={handleRemoveBackground}
                      onBrushErase={handleBrushErase}
                      onCrop={(el) => {
                        setSelectedIds([]);
                        setCropElementId(el.id);
                      }}
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

            {/* ── CROP MODAL PANEL ──────────────────────────────── */}
            {cropElement && currentPageType === 'canvas' && (
              <CropOverlay
                element={cropElement}
                onApply={(cropRect) => {
                  updateElementWithUndo({ ...cropElement, cropRect });
                  setCropElementId(null);
                  setSelectedIds([cropElement.id]);
                }}
                onCancel={() => {
                  setCropElementId(null);
                  setSelectedIds([cropElement.id]);
                }}
                onReset={() => {
                  const { cropRect: _r, ...rest } = cropElement;
                  updateElementWithUndo(rest);
                  setCropElementId(null);
                  setSelectedIds([cropElement.id]);
                }}
              />
            )}

            {/* Core editors */}
            {currentPageType === 'canvas' && (
              <div
                className="absolute inset-0"
                onMouseMove={(e) => {
                  // Emit cursor position (throttled trong useCollaboration)
                  if (id) emitCursorMove(id, e.clientX, e.clientY);
                }}
              >
                <CanvasEditor
                  stageRef={stageRef} layerRef={layerRef} trRef={trRef} selectionRectRef={selectionRectRef}
                  stageWidth={stageWidth} stageHeight={stageHeight} currentPage={currentPage}
                  elements={elements} selectedIds={selectedIds} editingId={editingId} setEditingId={(id) => {
                    // Khi báº¯t Ä‘áº§u edit text: lÆ°u snapshot elements vÃ o ref Ä‘á»ƒ push undo sau khi blur
                    if (id !== null) {
                      originalElementsBeforeTextEditRef.current = JSON.parse(JSON.stringify(elements));
                    }
                    setEditingId(id);
                  }}
                  updateElement={updateElement}
                  updateElementImmediate={updateElementImmediate}
                  selectionRect={selectionRect}
                  handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove} handleMouseUp={handleMouseUp}
                  isPlaying={isPlaying}
                  currentTime={localTime}
                  canEdit={canEdit}
                  onResizeLive={handleResizeCanvasLive}
                  onResizeFinal={handleResizeCanvasFinal}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                  addElement={addElement}
                  isWhiteboard={design?.design_type === 'whiteboard'}
                  onActionStart={handleActionStart}
                  onTextEditEnd={handleTextEditEnd}
                  animPreviewHiddenIds={animPreviewStep >= 0
                    ? new Set(
                      elements
                        .filter(el => el.animation?.in && el.animation.in !== 'none'
                          && (el.animationOrder ?? 999) > animPreviewStep)
                        .map(el => el.id)
                    )
                    : undefined
                  }
                  animPreviewCurrentStep={animPreviewCurrentStep}
                  animPreviewProgress={animPreviewProgress}
                  isFreeUser={!isSubscriptionActive(user)}
                />




                {/* FLOATING TOOLBOX (Infinite Canvas) */}
                {canEdit && !isPlaying && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center floating-toolbar rounded-full border border-white/50 p-1.5 gap-1 transition-all">
                    {[
                      { id: 'select', icon: <MousePointer2 size={18} />, title: 'Chuá»™t (Select)' },
                      { id: 'draw', icon: <PenTool size={18} />, title: 'BÃºt váº½' },
                      { id: 'shape', icon: <Shapes size={18} />, title: 'Váº­t thá»ƒ' },
                      { id: 'line', icon: <Minus size={18} className="rotate-45" />, title: 'ÄÆ°á»ng káº»' },
                      { id: 'sticky', icon: <StickyNote size={18} />, title: 'Ghi chÃº' },
                      { id: 'text', icon: <Type size={18} />, title: 'VÄƒn báº£n' },
                    ].map((tool) => (
                      <div key={tool.id} className="relative">
                        <button
                          onClick={() => {
                            setActiveTool(tool.id as any);
                            if (tool.id === 'shape') setShowShapePopover(!showShapePopover);
                            else setShowShapePopover(false);
                          }}
                          title={tool.title}
                          className={`editor-tool-btn p-3 rounded-full transition-all duration-200 ${activeTool === tool.id
                            ? 'bg-indigo-100 text-indigo-600 shadow-inner active'
                            : 'text-slate-600 hover:bg-white/80 hover:text-indigo-500'
                            }`}
                        >
                          {tool.icon}
                        </button>

                        {/* Shape Popover */}
                        {tool.id === 'shape' && showShapePopover && activeTool === 'shape' && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-white rounded-xl shadow-xl border border-slate-100 flex gap-2">
                            {['rect', 'circle', 'triangle'].map((type) => (
                              <button
                                key={type}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Xá»­ lÃ½ thÃªm váº­t thá»ƒ sáº½ Ä‘Æ°á»£c trigger qua prop hoáº·c xá»­ lÃ½ trá»±c tiáº¿p (táº¡m thá»i Ä‘áº·t icon má»“i)
                                  // Trong thá»±c táº¿, EditorPage cáº§n cÃ³ hÃ m `addElement` 
                                  // Äá»ƒ gá»n, CanvasEditor sáº½ láº¯ng nghe sá»± kiá»‡n onClick/Drag
                                  setShowShapePopover(false);
                                }}
                                className="w-10 h-10 flex justify-center items-center rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition"
                              >
                                {type === 'rect' && <div className="w-5 h-5 border-2 border-current rounded-sm"></div>}
                                {type === 'circle' && <div className="w-5 h-5 border-2 border-current rounded-full"></div>}
                                {type === 'triangle' && (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2 21h20L12 3z" /></svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Resize Badge Indicator */}
                {collaboratorResizing && collaboratorResizing.targetPageId === currentPageId && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
                    <span>âœï¸</span> {collaboratorResizing.userName} Ä‘ang Ä‘á»•i kÃ­ch cá»¡ trang...
                  </div>
                )}
                {/* Remote Cursors Overlay */}
                {Array.from(remoteCursors.entries()).map(([userId, cursor]) => (
                  <div
                    key={userId}
                    className="pointer-events-none absolute z-50 flex items-center gap-1"
                    style={{ left: cursor.x, top: cursor.y, transform: 'translate(8px, 8px)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill={cursor.color}>
                      <path d="M0 0L0 14L4 10L7 16L9 15L6 9L12 9Z" />
                    </svg>
                    <span
                      className="text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-md"
                      style={{ backgroundColor: cursor.color }}
                    >
                      {cursor.name}
                    </span>
                  </div>
                ))}

                {/* â”€â”€ ANIMATION ORDER BADGES â”€â”€ visible only when AnimationPanel is open */}
                {showAnimPanel && (() => {
                  const stageEl = stageRef.current;
                  if (!stageEl) return null;
                  const stageContainer = stageEl.container();
                  const containerRect = stageContainer?.getBoundingClientRect?.();
                  const stageX = stageEl.x?.() ?? 0;
                  const stageY = stageEl.y?.() ?? 0;
                  const scaleX = stageEl.scaleX?.() ?? 1;
                  const scaleY = stageEl.scaleY?.() ?? 1;

                  const animEls = elements
                    .filter(el => el.animation?.in && el.animation.in !== 'none')
                    .sort((a, b) => (a.animationOrder ?? 999) - (b.animationOrder ?? 999));

                  return animEls.map((el, idx) => {
                    // Position badge at top-left of element on canvas
                    const px = (el.x ?? 0) * scaleX + stageX;
                    const py = (el.y ?? 0) * scaleY + stageY;
                    const isHighlighted = selectedIds.includes(el.id);

                    return (
                      <div
                        key={el.id + '_badge'}
                        className={`absolute z-[55] pointer-events-auto cursor-pointer select-none transition-all ${isHighlighted ? 'scale-125' : 'hover:scale-110'}`}
                        style={{ left: px, top: py, transform: 'translate(-8px, -8px)' }}
                        onClick={() => {
                          setSelectedIds([el.id]);
                          setHighlightedAnimId(el.id);
                        }}
                        title={`Animation ${idx + 1}: ${el.animation?.in}`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border-2 transition-all ${isHighlighted
                          ? 'bg-violet-600 border-white text-white shadow-violet-300'
                          : 'bg-violet-500 border-white text-white shadow-violet-200'
                          }`}>
                          {idx + 1}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {currentPageType === 'doc' && (
              <DocEditor
                ref={docEditorRef as any}
                pages={pages.filter((p: any) => p.type === 'doc')}
                currentPageId={currentPageId}
                onChange={(id: string, data: any) => setPages(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))}
                onInsertPage={handleInsertDocPage}
              />
            )}
            {currentPageType === 'sheet' && (
              <SheetEditor
                page={currentPage}
                onChange={(pageId: string, data: any) => {
                  setPages(prev => prev.map(p => p.id === pageId ? { ...p, ...data } : p));
                  scheduleAutosave();
                }}
              />
            )}
          </div>

          {/* 4. TIMELINE / PAGE SELECTOR â€” hidden for doc pages and grid view */}
          {currentPageType !== 'doc' && !showGridView && (
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
                deletePage={handleDeletePage}
                reorderPages={reorderPages}
                onReorder={handlePageReorder}
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
                showGridView={showGridView}
                setShowGridView={setShowGridView}
                onOpenTransition={(targetPageId: string) => {
                  setTransitionTargetId(targetPageId);
                  setShowTransitionBox(true);
                  setShowAnimateBox(false);
                  setShowPositionBox(false);
                  setActiveTab(null);
                }}
              />
            </div>
          )}

          {/* 5. INFO BAR â€” hidden for doc pages and grid view */}
          {currentPageType !== 'doc' && !showGridView && (
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
          )}
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

      {/* READ-ONLY OVERLAY (viewer/commenter): KhÃ³a toÃ n bá»™ tÆ°Æ¡ng tÃ¡c trÃªn Canvas */}
      {isReadOnly && (
        <div
          className="fixed inset-0 z-[15] pointer-events-auto"
          style={{ background: 'transparent', cursor: currentRole === 'commenter' ? 'crosshair' : 'not-allowed' }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        />
      )}

      {/* LINK POPUP (Ctrl+K) */}
      {showLinkPopup && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onClick={() => setShowLinkPopup(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-5 w-96"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-800 mb-3">Add Link</h3>
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 mb-3"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && linkUrl.trim()) {
                  // Ãp dá»¥ng link lÃªn element Ä‘Æ°á»£c chá»n
                  const updatedEls = elements.map(el =>
                    selectedIds.includes(el.id) ? { ...el, link: linkUrl.trim() } : el
                  );
                  syncElementsImmediate(updatedEls);
                  setShowLinkPopup(false);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLinkPopup(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition"
              >Cancel</button>
              <button
                onClick={() => {
                  if (linkUrl.trim()) {
                    const updatedEls = elements.map(el =>
                      selectedIds.includes(el.id) ? { ...el, link: linkUrl.trim() } : el
                    );
                    syncElementsImmediate(updatedEls);
                    setShowLinkPopup(false);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* PRESENTATION PLAYER */}
      {showPresentationMode && pages.length > 0 && (
        <PresentationPlayer
          pages={pages}
          startPageId={currentPageId ?? undefined}
          onClose={() => setShowPresentationMode(false)}
        />
      )}

      {/* BRUSH ERASER MODAL */}
      {brushEraserElement && (
        <BrushEraserModal
          element={brushEraserElement}
          onClose={() => setBrushEraserElement(null)}
          onResult={handleBrushEraseResult}
        />
      )}

      {/* PRO UPGRADE MODAL */}
      {showProModal && (
        <ProUpgradeModal
          featureName={showProModal.feature}
          featureDescription={showProModal.desc}
          onClose={() => setShowProModal(null)}
        />
      )}

      {/* EXPORT PRO BLOCK MODAL */}
      {exportBlockElements.length > 0 && (
        <ExportProBlockModal
          proElements={exportBlockElements}
          onClose={() => setExportBlockElements([])}
          onRemoveElements={(ids) => {
            pushUndoSnapshot(elements);
            syncElementsImmediate(elements.filter(el => !ids.includes(el.id)));
            setExportBlockElements([]);
          }}
        />
      )}
    </div>

  );
}
// helo chÃ o cÃ¡c con vá»£
// helo chÃ o cÃ¡c con vá»£

