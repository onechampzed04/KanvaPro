import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Zap, MousePointer2, PenTool, Shapes, Minus, StickyNote, Type } from 'lucide-react';
import ShareModal from '../components/editor/ShareModal';
import Konva from 'konva';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import pptxgen from 'pptxgenjs';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDesignVersions, restoreDesignVersion, updateDesignFull, createDesignVersion, uploadVideoForExport, uploadImageFile, uploadPageThumbnail, fetchDesignVersionSnapshot } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { useCollaboration } from '../hooks/useCollaboration';
import { useToast } from '../context/ToastContext';

// Components đã tách sẵn
import EditorSidebar from '../components/editor/EditorSidebar';
import DocEditor, { DocEditorHandle } from '../components/editor/DocEditor';
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
import PresentationPlayer from '../components/editor/PresentationPlayer';
import BrushEraserModal from '../components/editor/BrushEraserModal';
import CropOverlay from '../components/editor/CropOverlay';
import ProUpgradeModal from '../components/editor/ProUpgradeModal';
import ExportProBlockModal, { type ProElement } from '../components/editor/ExportProBlockModal';
import AnimationPanel from '../components/editor/AnimationPanel';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useLazyPageLoader } from '../hooks/useLazyPageLoader';
import { useAutoThumbnail, renderPageToBlob } from '../hooks/useAutoThumbnail';
import { useCollabStore } from '../store/useCollabStore';
import { useWorkspace } from '../context/WorkspaceContext';

export default function EditorPage() {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const activeUsers = useCollabStore((state) => state.activeUsers);
  const isConnected = useCollabStore((state) => state.isConnected);

  // --- 1. Component State & Refs ---
  const isRemoteUpdateRef = useRef(false);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const versionId = new URLSearchParams(location.search).get('versionId');
  const lazyPageLoader = useLazyPageLoader(id);
  const { generateAllPagesThumbnails } = useAutoThumbnail({
    lazyPageLoader,
    onThumbnailUpdated: (pageId, url) => {
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, thumbnail: url, _lastThumbAt: Date.now() } : p));
    },
    emitPageThumbnailUpdated: (pageId, url) => {
      // emitPageThumbnailUpdated được khai báo bên dưới qua useCollaboration
      // Dùng ref để tránh circular dependency
      emitThumbRef.current?.(pageId, url);
    },
  });
  const { user, refreshUser } = useAuth(); // Lấy current user để truyền cho collaboration
  const { currentWorkspace, switchWorkspace, workspaces } = useWorkspace();
  const { isPro } = useSubscription();
  const [design, setDesign] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const elementsRef = useRef<any[]>([]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  // === FIX #6: Ref để beforeunload không bị stale closure ===
  const saveStatusRef = useRef<'saved' | 'saving' | 'unsaved'>('saved');
  useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
  // Overlay state khi đang force-save trước khi navigate về Dashboard
  const [isSavingBeforeNav, setIsSavingBeforeNav] = useState(false);
  const [collabNotification, setCollabNotification] = useState<string>('');
  const isInitialMount = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // === FIX #2 PATCH: Ref lưu version mới nhất từ server — tuyệt đối không bị stale closure ===
  // Khác với design state (có thể cũ), ref này luôn ghi ngay sau mỗi save thành công
  const designVersionRef = useRef<string | null>(null);


  // ── UNDO / REDO ────────────────────────────────────────────────────
  // === FIX #3: Dùng Command Diff Pattern — không còn JSON.parse(JSON.stringify) ===
  const commandHistory = useCommandHistory();
  const syncElementsImmediateRef = useRef<(els: any[], skipEmit?: boolean) => void>(() => { });

  const pendingUndoSnapshotRef = useRef<any[] | null>(null);

  // Wrapper tuong thich nguoc: pushUndoSnapshot(elements)
  const pushUndoSnapshot = useCallback((snapshot: any[]) => {
    if (commandHistory.isApplyingRef.current) return;
    pendingUndoSnapshotRef.current = JSON.parse(JSON.stringify(snapshot));
  }, [commandHistory]);

  // Lưu snapshot BEFORE của element trước khi bắt đầu phên chỉnh sửa text
  const originalElementsBeforeTextEditRef = useRef<any[] | null>(null);

  const handleActionStart = useCallback((beforeElements?: any[]) => {
    if (commandHistory.isApplyingRef.current) return;
    if (!pendingUndoSnapshotRef.current) {
      // Capture the before state, falling back to current elements
      pendingUndoSnapshotRef.current = JSON.parse(JSON.stringify(beforeElements || elements));
    }
  }, [commandHistory, elements]);

  // Callback khi kết thúc phên edit text
  const handleTextEditEnd = useCallback((_finalText: string, _elementId: string) => {
    // Text đã được push UPDATE command tại đúng điểm thay đổi trong CanvasEditor
    originalElementsBeforeTextEditRef.current = null;
  }, []);

  // Undo Handler: lấy command cuối từ stack, áp dụng ngược lại lên elements
  const handleUndo = useCallback(() => {
    const newElements = commandHistory.undo(elements);
    if (newElements !== null) {
      commandHistory.isApplyingRef.current = true;
      syncElementsImmediateRef.current(newElements, false);
      commandHistory.isApplyingRef.current = false;
    }
  }, [elements, commandHistory]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    const newElements = commandHistory.redo(elements);
    if (newElements !== null) {
      commandHistory.isApplyingRef.current = true;
      syncElementsImmediateRef.current(newElements, false);
      commandHistory.isApplyingRef.current = false;
    }
  }, [elements, commandHistory]);

  // ── SIDEBAR VISIBLE TOGGLE ──────────────────────────────────────────────────
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // ── LINK POPUP (Ctrl+K) ────────────────────────────────────────────────────
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // ── GRID VIEW (inline, replaces canvas area) ─────────────────────────────
  const [showGridView, setShowGridView] = useState(false);
  const [gridDragIdx, setGridDragIdx] = useState<number | null>(null);
  const [copiedPageData, setCopiedPageData] = useState<any | null>(null);
  const [copiedElementsData, setCopiedElementsData] = useState<any[] | null>(null);
  const [gridSelectedPages, setGridSelectedPages] = useState<Set<string>>(new Set());

  // ── DEBOUNCED AUTOSAVE (1.0s sau khi người dùng ngừng thao tác hoàn toàn) ──────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (!!versionId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      // handleSave được định nghĩa sau, dùng ref để tránh stale closure
      handleSaveRef.current?.(true);
    }, 2500); // 2.5 giây debounce
  }, []);
  // Ref để gọi handleSave mà không cần nó trong dependency array
  const handleSaveRef = useRef<((silent: boolean) => void) | null>(null);

  // RBAC States
  const [currentRole, setCurrentRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const [isPublicAccess, setIsPublicAccess] = useState(false); // true nếu chỉ vào được nhờ public link
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
  // NEW: Right-side Animation Panel
  const [showAnimPanel, setShowAnimPanel] = useState(false);
  const [highlightedAnimId, setHighlightedAnimId] = useState<string | null>(null);
  // Preview animation: -1 = not previewing; >0 = current step being shown
  const [animPreviewStep, setAnimPreviewStep] = useState(-1);
  // Which step is CURRENTLY animating in (to apply the correct effect)
  const [animPreviewCurrentStep, setAnimPreviewCurrentStep] = useState(-1);
  // Progress 0→1 of current step's entry animation
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

  useEffect(() => {
    if (activeTab !== 'tools') {
      setActiveTool('select');
      setShowShapePopover(false);
    }
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [customFonts, setCustomFonts] = useState<{ id: string; name: string; url: string; is_premium: boolean }[]>([]);
  const [recentStickers, setRecentStickers] = useState<any[]>([]);
  const [defaultStickers, setDefaultStickers] = useState<any[]>([]);
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
  // Ref cho emitPageThumbnailUpdated để useAutoThumbnail dùng mà không bị stale
  const emitThumbRef = useRef<((pageId: string, url: string) => void) | null>(null);

  // Constants
  const currentPage = pages.find(p => p.id === currentPageId);
  const stageWidth = currentPage?.width || 1920;
  const stageHeight = currentPage?.height || 1080;
  const currentPageType = currentPage?.type || 'canvas';
  let selectedElement = selectedIds.length === 1 ? elements.find(el => el.id === selectedIds[0]) : null;
  if (selectedIds.length === 1 && selectedIds[0] === 'bg') {
    selectedElement = { id: 'bg', type: 'bg', fill: currentPage?.background_color || '#ffffff' };
  }
  const docEditorRef = useRef<DocEditorHandle | null>(null);

  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, percent: number }>({ visible: false, percent: 0 });
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  // ── CROP MODE ─────────────────────────────────────────────────────────────
  const [cropElementId, setCropElementId] = useState<string | null>(null);
  const cropElement = cropElementId ? elements.find(el => el.id === cropElementId) : null;

  // ── PRO UPGRADE MODAL ────────────────────────────────────────────────────
  const [showProModal, setShowProModal] = useState<{ feature: string; desc?: string } | null>(null);

  // ─── REAL-TIME COLLABORATION ──────────────────────────────────────────────

  // Ref lưu currentPageId để tránh stale closure trong socket callbacks
  const currentPageIdRef = useRef<string | null>(null);
  useEffect(() => { currentPageIdRef.current = currentPageId; }, [currentPageId]);

  // Sync export format when page type changes to prevent canvas export error on document pages
  useEffect(() => {
    if (currentPageType === 'doc') {
      setExportConfig(prev => ({ ...prev, format: 'docx' }));
    } else {
      setExportConfig(prev => ({ ...prev, format: 'png' }));
    }
  }, [currentPageType]);

  // Ref theo dõi elementId nào đang bị người dùng NÀY kéo (không bị remote overwrite)
  const draggingElementIdsRef = useRef<Set<string>>(new Set());

  // State con trỏ chuột của các collaborator khác
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { name: string; color: string; x: number; y: number }>>(new Map());

  const handleRemoteElementsUpdate = useCallback((pageId: string, remoteElements: any[]) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    lazyPageLoader.updateCache(pageId, remoteElements);
    // Luôn cập nhật pages store
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, elements: remoteElements } : p
    ));
    // Chỉ cập nhật elements state nếu đang ở đúng trang
    if (currentPageIdRef.current === pageId) {
      setElements(prev => {
        // Nếu không có element nào đang bị kéo: thay toàn bộ
        if (draggingElementIdsRef.current.size === 0) {
          return remoteElements;
        }
        // Nếu có element đang kéo: bảo vệ local version của chúng
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
    lazyPageLoader.updateCache(newPage.id, newPage.elements || []);
    setPages(prev => {
      if (prev.some(p => p.id === newPage.id)) return prev;
      const updated = [...prev, { ...newPage, elements: newPage.elements || [], thumbnail: newPage.thumbnail || '' }];
      return updated.sort((a: any, b: any) => a.page_order - b.page_order);
    });
    setCollabNotification(`${addedByName} đã thêm một trang mới`);
    setTimeout(() => setCollabNotification(''), 3000);
  }, []);

  const handleRemotePagesReordered = useCallback((pageIds: string[]) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    setPages(prev => {
      const orderMap = new Map(pageIds.map((id, index) => [id, index]));
      const updated = prev.map(p => ({ ...p, page_order: orderMap.has(p.id) ? orderMap.get(p.id)! : p.page_order }));
      return updated.sort((a: any, b: any) => a.page_order - b.page_order);
    });
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
    setCollabNotification(`${deletedByName} đã xóa một trang`);
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

  // ── Xử lý Delta Update từ remote ──────────────────────────────────────────
  // ─── Xử lý Delta Update từ remote ──────────────────────────────────────────
  const handleRemoteDelta = useCallback((delta: { pageId: string; elementId: string; action: string; changes?: any; userId?: string }) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    if (delta.action === 'update' && delta.changes) {
      if (delta.pageId === currentPageId) {
        setElements(prev => {
          const newElements = prev.map(el => el.id === delta.elementId ? { ...el, ...delta.changes } : el);
          lazyPageLoader.updateCache(delta.pageId, newElements);
          return newElements;
        });
      } else {
        lazyPageLoader.invalidatePage?.(delta.pageId);
      }
      setPages(prev => prev.map(p =>
        p.id === delta.pageId
          ? { ...p, elements: p.elements ? p.elements.map((el: any) => el.id === delta.elementId ? { ...el, ...delta.changes } : el) : undefined }
          : p
      ));
    } else if (delta.action === 'delete') {
      if (delta.pageId === currentPageId) {
        setElements(prev => {
          const newElements = prev.filter(el => el.id !== delta.elementId);
          lazyPageLoader.updateCache(delta.pageId, newElements);
          return newElements;
        });
      } else {
        lazyPageLoader.invalidatePage?.(delta.pageId);
      }

      setPages(prev => {
        const updated = prev.map(p =>
          p.id === delta.pageId
            ? { ...p, elements: p.elements ? p.elements.filter((el: any) => el.id !== delta.elementId) : undefined }
            : p
        );

        // --- Bắt buộc cập nhật thumbnail cho các thay đổi từ hệ thống (vd: xóa vĩnh viễn tài nguyên) ---
        if (delta.userId === 'system') {
          setTimeout(() => {
            generateAllPagesThumbnails(updated, currentPageId, [delta.pageId]);
          }, 500); // Thêm 1 chút delay cho mượt
        }

        return updated;
      });
    }
  }, [lazyPageLoader, generateAllPagesThumbnails, currentPageId]);

  const handleRemotePageThumbnailUpdated = useCallback((pageId: string, thumbUrl: string) => {
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, thumbnail: thumbUrl } : p));
  }, []);
  const handleRemotePageBackgroundUpdated = useCallback((pageId: string, background_color: string, userName: string) => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, background_color } : p));
  }, []);

  const handleRemoteRoleUpdated = useCallback(async (newRole: string) => {
    if (currentRole === 'editor' && newRole === 'viewer') {
      // User is being downgraded, force save their pending edits first!
      if (handleSaveRef.current) {
        await handleSaveRef.current(true);
      }
    }
    setCurrentRole(newRole as 'owner' | 'editor' | 'viewer');
    const roleLabels: Record<string, string> = { viewer: 'Xem', commenter: 'Bình luận', editor: 'Chỉnh sửa', owner: 'Chủ sở hữu' };
    showInfo(`Quyền của bạn đã được đổi thành: ${roleLabels[newRole] || newRole}`);
  }, [currentRole, showInfo]);

  const {
    emitElementsUpdate,
    emitElementsUpdateImmediate,
    emitElementDelta,
    emitPageChanged,
    emitPageAdded,
    emitPageDeleted,
    emitPagesReordered,
    emitCursorMove,
    emitPageResize,
    emitPageThumbnailUpdated,
    emitPageBackgroundUpdated,
    emitElementLock,
    emitElementUnlock,
  } = useCollaboration({
    designId: versionId ? undefined : id,
    onRemoteUpdate: handleRemoteElementsUpdate,
    onRemotePageAdded: handleRemotePageAdded,
    onRemotePageDeleted: handleRemotePageDeleted,
    onRemotePagesReordered: handleRemotePagesReordered,
    onRemoteCursorMove: handleRemoteCursorMove,
    onRemotePageResized: handleRemotePageResized,
    onRemoteDelta: handleRemoteDelta,
    onRemotePageThumbnailUpdated: handleRemotePageThumbnailUpdated,
    onRemotePageBackgroundUpdated: handleRemotePageBackgroundUpdated,
    onRemoteRoleUpdated: handleRemoteRoleUpdated,
  });

  // Gán vào ref để useAutoThumbnail emit realtime cho collaborators
  emitThumbRef.current = emitPageThumbnailUpdated;


  // Lấy danh sách trang hoạt động của từng user từ store
  const userPageMap = useCollabStore(state => state.userPageMap);

  // Phát event mỗi khi chuyển trang
  useEffect(() => {
    if (currentPageId) {
      emitPageChanged(currentPageId);
    }
  }, [currentPageId, emitPageChanged]);

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
    if (!file.type.startsWith('image/')) { showWarning('Vui lòng chọn file hình ảnh!'); return; }

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
      showError(err.message || 'Lỗi khi tải ảnh lên. Vui lòng thử lại!');
      setUploadProgress({ visible: false, percent: 0 });
    }
  };

  /**
   * Thêm ảnh từ sidebar Uploads vào Canvas
   */
  const addUploadedImageToCanvas = useCallback((imgItem: { id: string; url: string; width?: number; height?: number }) => {
    if (imgItem.width && imgItem.height) {
      addImageOriginal(imgItem.url, imgItem.width, imgItem.height);
    } else {
      // Fallback for old images without dimensions in DB
      const img = new window.Image();
      img.src = imgItem.url;
      img.onload = () => addImageOriginal(imgItem.url, img.width, img.height);
      img.onerror = () => addImageOriginal(imgItem.url, 800, 600);
    }
  }, [addImageOriginal]);

  // --- 2. Data Fetching ---
  useEffect(() => {
    if (design?.title) setTempTitle(design.title);
  }, [design?.title]);

  // === FIX #4: Khởi tạo Lazy Page Loader ===
  // lazyPageLoader hoisted to top

  // Cập nhật LRU cache khi elements của trang hiện tại thay đổi để tránh stale cache khi chuyển trang
  useEffect(() => {
    if (currentPageId && elements.length > 0) {
      lazyPageLoader.updateCache(currentPageId, elements);
    }
  }, [currentPageId, elements, lazyPageLoader]);

  // Hàm load elements khi người dùng chuyển trang (hoặc lần đầu)
  const loadPageElements = useCallback(async (pageId: string, pagesState?: any[]) => {
    const elements = await lazyPageLoader.loadPageElements(pageId);
    setElements(elements);
    setPages(prev => {
      const base = pagesState || prev;
      return base.map(p => p.id === pageId ? { ...p, elements } : p);
    });
  }, [lazyPageLoader]);

  // === FIX #4: Dùng Shallow API /meta để load nhanh, lazy load elements theo trang ===
  useEffect(() => {
    fetch(`/api/designs/${id}/meta`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (res.status === 403) {
          showError('Bạn không có quyền truy cập bản vẽ này.');
          window.location.href = '/';
          throw new Error('403 Forbidden');
        }
        return res.json();
      })
      .then(data => {
        setDesign(data);
        // === FIX #2 PATCH: Ghi version ngay khi fetch, không dựa vào state cycle ===
        if (data.updated_at) {
          designVersionRef.current = data.updated_at;
        }
        if (data.current_user_role) {
          setCurrentRole(versionId ? 'viewer' : data.current_user_role);
        }
        if (data.is_public_access) {
          setIsPublicAccess(true); // Đánh dấu: truy cập qua public link, không có share riêng
        }

        if (versionId) {
          // Preview mode: override pages & elements with snapshot data
          fetchDesignVersionSnapshot(id!, versionId).then(snapshotRes => {
            let snapshot = snapshotRes.snapshot;
            if (typeof snapshot === 'string') {
              try { snapshot = JSON.parse(snapshot); } catch (e) { console.error('Failed to parse snapshot', e); }
            }

            const snapPages = snapshot.pages || [];
            let snapElements = snapshot.elements || [];

            // Fallback cho snapshot định dạng cũ (elements nằm trong pages)
            if (snapElements.length === 0 && snapPages.length > 0 && snapPages[0].elements) {
              snapPages.forEach((p: any) => {
                let pElements = p.elements;
                if (typeof pElements === 'string') {
                  try { pElements = JSON.parse(pElements); } catch (e) { }
                }
                if (pElements && Array.isArray(pElements)) {
                  snapElements.push(...pElements.map((el: any) => ({
                    id: el.id, page_id: p.id, element_type: el.element_type || el.type || 'text',
                    z_index: el.z_index || 0, locked: el.locked || false, visible: el.visible !== false,
                    properties: el.properties || el // Gói lại properties nếu bị ép phẳng
                  })));
                }
              });
            }

            console.log('[Preview] Snapshot Pages:', snapPages);
            console.log('[Preview] Snapshot Elements:', snapElements);

            const loadedPages = snapPages.map((p: any) => {
              let parsedContent = p.content || '';
              if (typeof parsedContent === 'string' && parsedContent.startsWith('"')) {
                try { parsedContent = JSON.parse(parsedContent); } catch { /* giữ nguyên */ }
              }

              // Lọc và làm phẳng (flatten) properties giống như designElementService
              const pageElements = snapElements
                .filter((el: any) => el.page_id === p.id)
                .map((el: any) => {
                  const props = typeof el.properties === 'string' ? JSON.parse(el.properties) : (el.properties || {});
                  return { ...props, id: el.id, type: el.element_type || el.type || 'text' };
                });

              return {
                ...p,
                content: parsedContent,
                duration: Number(p.duration) || 5,
                elements: pageElements,
                thumbnail: '' // Khởi tạo rỗng, sẽ tạo cục bộ ngay bên dưới
              };
            });

            // Tạo thumbnail cục bộ (không lưu lên server) cho các trang preview
            Promise.all(loadedPages.map(async (p: any) => {
              try {
                const blob = await renderPageToBlob(p.elements, p.background_color, p.width, p.height);
                if (blob) p.thumbnail = URL.createObjectURL(blob);
              } catch (e) { console.error('Failed to gen local thumb', e); }
            })).then(() => {
              setPages([...loadedPages]); // Cập nhật lại state sau khi có thumbnail
            });

            setPages(loadedPages);
            if (loadedPages.length > 0) {
              setCurrentPageId(loadedPages[0].id);
              setElements(loadedPages[0].elements || []);
            } else {
              setElements([]);
            }
          });
          return; // Dừng luồng load lười nếu đang ở chế độ xem trước
        }

        // (Workspace switching logic moved to a separate useEffect to avoid stale closures)

        if (data.pages && data.pages.length > 0) {
          // Shallow API trả về pages KHÔNG có elements (chỉ có metadata)
          const loadedPages = data.pages.map((p: any) => {
            let parsedContent = p.content || '';
            if (typeof parsedContent === 'string' && parsedContent.startsWith('"')) {
              try { parsedContent = JSON.parse(parsedContent); } catch { /* giữ nguyên */ }
            }
            return {
              ...p,
              content: parsedContent,
              duration: Number(p.duration) || 5,
              elements: p.elements, // Không fallback về [] nếu chưa load
              thumbnail: p.thumbnail || ''
            };
          });
          setPages(loadedPages);
          setCurrentPageId(loadedPages[0].id);
          // === FIX #4: Lazy load elements trang đầu, prefetch trang 2 âm thầm ===
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

  // === FIX #7: Separate useEffect for workspace sync to avoid stale closures ===
  useEffect(() => {
    if (!design) return;
    if (design.team_id && currentWorkspace?.id !== design.team_id) {
      switchWorkspace(design.team_id);
    } else if (!design.team_id && currentWorkspace !== null) {
      switchWorkspace(null); // Switch to Personal workspace (represented by null)
    }
  }, [design?.team_id, currentWorkspace, switchWorkspace]);


  // Lắng nghe sự kiện team:banned để kick user ra khỏi Editor nếu đang mở project của team bị ban
  useEffect(() => {
    const handleTeamBanned = (e: Event) => {
      const bannedTeamId = (e as CustomEvent).detail;
      if (design?.team_id === bannedTeamId) {
        showError('Team này đã bị khóa bởi Quản trị viên. Bạn đang được chuyển về trang chủ...');
        setTimeout(() => navigate('/'), 1500);
      }
    };
    window.addEventListener('team:banned', handleTeamBanned);
    return () => window.removeEventListener('team:banned', handleTeamBanned);
  }, [design?.team_id, navigate, showError]);

  // pending_import_image: được xử lý trong loadPageElements để tránh race condition
  // (Không dùng useEffect riêng nữa)

  const fetchRecentStickers = async (page = 1, limit = 50) => {
    try {
      const res = await fetch(`/api/designs/recent-stickers?page=${page}&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        cache: 'no-store'
      });
      const data = await res.json();
      setRecentStickers(data.data || []);
      setTotalRecentPages(data.totalPages || 1);
      setRecentPage(page);
    } catch (error) { console.error(error); }
  };

  const fetchDefaultStickers = async () => {
    try {
      const res = await fetch(`/api/assets/search?type=sticker&limit=100`);
      const data = await res.json();
      setDefaultStickers(data.assets || []);
    } catch (error) { console.error(error); }
  };

  const fetchUserUploads = async () => {
    try {
      const res = await fetch(`/api/assets/user-images?ignoreWorkspace=true`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setUploadedImages(data.images || []);
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    fetchRecentStickers(1, 50);
    fetchDefaultStickers();
    fetchUserUploads();
  }, []);

  // Load system fonts (admin-uploaded) — không cần auth
  const loadSystemFonts = async () => {
    try {
      const res = await fetch('/api/assets/fonts');
      if (!res.ok) return;
      const data = await res.json();
      const fontList: { id: string; name: string; url: string; is_premium: boolean }[] = data.fonts || [];

      // Inject @font-face vào document để trình duyệt tự load
      for (const font of fontList) {
        try {
          const fontUrl = font.url.startsWith('http') ? font.url : `http://localhost:3000${font.url}`;
          const style = document.createElement('style');
          style.textContent = `@font-face { font-family: ${JSON.stringify(font.name)}; src: url(${JSON.stringify(fontUrl)}); }`;
          document.head.appendChild(style);
        } catch { /* lỗi tải 1 font không ảnh hưởng font khác */ }
      }
      setCustomFonts(fontList);
    } catch (error) { console.error('Load system fonts error:', error); }
  };

  useEffect(() => { loadSystemFonts(); }, []);

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
      setSelectedIds(['bg']);
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

    // Chỉ thực hiện quét chọn nhiều vật thể nếu người dùng kéo rê chuột tạo vùng chọn rõ rệt (> 5px)
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

  // ── GLOBAL WINDOW MOUSE LISTENERS FOR SELECTION AND GROUP DRAG ────────────────
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

    // === FIX #1: Dùng toBlob() upload thumbnail âm thầm thay vì nhồi base64 vào state ===
    if (stageRef.current && currentPageType !== 'doc' && currentPageType !== 'sheet' && currentPageId) {
      setSelectedIds([]);
      const capturedPageId = currentPageId;
      stageRef.current.toBlob({ pixelRatio: 0.25, mimeType: 'image/jpeg', quality: 0.5 }, (blob: Blob | null) => {
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
    if (stageRef.current && currentPageType !== 'doc' && currentPageType !== 'sheet') {
      setSelectedIds([]);

      const transformers = stageRef.current.find('Transformer');
      transformers.forEach(tr => tr.hide());
      const guidelines = stageRef.current.find(node => node.name() === 'guideline');
      guidelines.forEach(g => g.hide());
      stageRef.current.batchDraw();

      thumb = stageRef.current.toDataURL({ pixelRatio: 0.2, mimeType: 'image/jpeg', quality: 0.5 });

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
    lazyPageLoader.updateCache(newPageId, []);
    setPages([...updatedPages, newPage]);
    setElements([]);
    setCurrentPageId(newPageId);
    setCurrentTime(totalDuration);
    // Phát sự kiện real-time cho các collaborator
    emitPageAdded(newPage);
  };

  // Xóa trang: lọc khỏi mảng + chuyển sang trang lân cận
  const handleDeletePage = (pageIdToDelete: string) => {
    if (pages.length <= 1) return; // Giữ lại ít nhất 1 trang
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
    // Phát sự kiện real-time cho các collaborator
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
    emitPagesReordered(newPagesOrdered.map(p => p.id));
    // Auto-save to sync order to backend
    // Use a short timeout to allow state to settle first
    setTimeout(() => handleSave(true), 500);
  }, [emitPagesReordered]);

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
      const updated = elementsRef.current.map(el => ({ ...el, x: el.x - dx, y: el.y - dy }));
      elementsRef.current = updated;
      setElements(updated);
      emitElementsUpdateImmediate(currentPageId, updated);
    }

    emitPageResize(currentPageId, newWidth, newHeight, false);
    setTimeout(() => handleSave(true), 500);
  }, [currentPageId, emitPageResize, emitElementsUpdateImmediate]);

  // --- 5. Element CRUD ---

  // Throttled: dùng cho sự kiện liên tục (DragMove, live typing)
  const syncElements = useCallback((newElements: any[], _skipEmit = false) => {
    elementsRef.current = newElements;
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));
    if (!_skipEmit && currentPageId) {
      emitElementsUpdate(currentPageId, newElements);
    }
    scheduleAutosave(); // Đặt lại bộ đếm 2.5s mỗi khi có thay đổi
  }, [currentPageId, emitElementsUpdate, scheduleAutosave]);

  // Immediate: dùng cho DragEnd/TransformEnd để đảm bảo state cuối cùng luôn được gửi
  const syncElementsImmediate = useCallback((newElements: any[], _skipEmit = false) => {
    elementsRef.current = newElements;
    setElements(newElements);
    setPages(prevPages => prevPages.map(p =>
      p.id === currentPageId ? { ...p, elements: newElements } : p
    ));
    if (pendingUndoSnapshotRef.current && !commandHistory.isApplyingRef.current) {
      commandHistory.pushCommand({
        type: 'REORDER',
        before: pendingUndoSnapshotRef.current,
        after: JSON.parse(JSON.stringify(newElements))
      });
      pendingUndoSnapshotRef.current = null;
    }

    if (!_skipEmit && currentPageId) {
      emitElementsUpdateImmediate(currentPageId, newElements);
    }
    scheduleAutosave(); // Đặt lại bộ đếm 2.5s sau mỗi DragEnd/TransformEnd
  }, [currentPageId, emitElementsUpdateImmediate, scheduleAutosave, commandHistory]);

  // Gán ref để handleUndo/handleRedo dùng mà không bị stale/hoisting
  syncElementsImmediateRef.current = syncElementsImmediate;

  const addText = (textType: 'heading' | 'subheading' | 'body' = 'heading') => {
    pushUndoSnapshot(elements);
    let fontSize = 32;
    let text = 'Double click to edit';
    let fontStyle = 'normal';

    if (textType === 'heading') {
      fontSize = 56;
      fontStyle = 'bold';
      text = 'Add a heading';
    } else if (textType === 'subheading') {
      fontSize = 28;
      fontStyle = 'bold';
      text = 'Add a subheading';
    } else {
      fontSize = 18;
      fontStyle = 'normal';
      text = 'Add a little bit of body text';
    }

    syncElementsImmediate([...elements, {
      id: crypto.randomUUID(), type: 'text',
      x: stageWidth / 2 - 150, y: stageHeight / 2 - (fontSize / 2),
      text, fontSize, fontFamily: 'Arial', fill: '#000000',
      width: 300, fontStyle,
      timeline: { start: 0, duration: 5, lane: elements.length }, animation: { in: 'fadeIn' }
    }]);
  };
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
        else { h = MAX; w = Math.round(MAX * ratio); }
      }
      pushUndoSnapshot(elements);
      syncElementsImmediate([...elements, {
        id: crypto.randomUUID(), type: 'image',
        x: stageWidth / 2 - w / 2, y: stageHeight / 2 - h / 2,
        width: w, height: h, src,
        // Pro flags for export gate
        ...(flags?.isPro && { is_premium: true }),
        ...(flags?.createdByAi && { createdByAi: true }),
        timeline: { start: 0, duration: 5, lane: elements.length },
        animation: { in: 'none' },
      }]);
      setRecentStickers(prev => {
        if (prev.some(s => s.url === src)) return prev;
        return [{ url: src, is_premium: !!flags?.isPro, last_used: new Date().toISOString() }, ...prev].slice(0, 10);
      });
    };
    img.onerror = () => {
      pushUndoSnapshot(elements);
      syncElementsImmediate([...elements, {
        id: crypto.randomUUID(), type: 'image',
        x: stageWidth / 2 - 100, y: stageHeight / 2 - 100,
        width: 200, height: 200, src,
        ...(flags?.isPro && { is_premium: true }),
        ...(flags?.createdByAi && { createdByAi: true }),
        timeline: { start: 0, duration: 5, lane: elements.length },
        animation: { in: 'none' },
      }]);
    };
    img.src = src;
  };

  const addElement = useCallback((newEl: any) => {
    // Push undo trước khi thêm element mới (từ toolbox draw/shape/text)
    pushUndoSnapshot(elements);
    syncElementsImmediate([...elements, newEl]);
  }, [elements, syncElementsImmediate, pushUndoSnapshot]);

  // updateElement: throttled, đánh dấu element đang bị kéo để tránh remote overwrite
  const updateElement = (newAttrs: any) => {
    if (newAttrs.id === 'bg') {
      setPages(prev => prev.map(p => p.id === currentPageId ? { ...p, background_color: newAttrs.fill } : p));
      setSaveStatus('unsaved');
      return;
    }
    draggingElementIdsRef.current.add(newAttrs.id);
    syncElements(elementsRef.current.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  // updateElementImmediate: gửi ngay, bỏ lock sau DragEnd/TransformEnd
  const updateElementImmediate = (newAttrs: any) => {
    if (newAttrs.id === 'bg') {
      setPages(prev => prev.map(p => p.id === currentPageId ? { ...p, background_color: newAttrs.fill } : p));
      setSaveStatus('unsaved');
      return;
    }
    draggingElementIdsRef.current.delete(newAttrs.id);
    syncElementsImmediate(elementsRef.current.map(el => el.id === newAttrs.id ? newAttrs : el));
  };

  const updateElements = (updatedElements: any[]) => {
    const updatedMap = new Map(updatedElements.map(el => [el.id, el]));
    syncElementsImmediate(elementsRef.current.map(el => updatedMap.has(el.id) ? updatedMap.get(el.id) : el));
  };

  // Bulk realtime update (dùng cho onTransform đa vật thể): cập nhật nhiều el cùng lúc
  // trong 1 syncElements call — tránh stale closure khi lặp gọi updateElement nhiều lần.
  const updateElementsBatch = useCallback((updatedEls: any[]) => {
    const updatedMap = new Map(updatedEls.map(el => [el.id, el]));
    updatedEls.forEach(el => draggingElementIdsRef.current.add(el.id));
    syncElements(elementsRef.current.map(el => updatedMap.has(el.id) ? { ...updatedMap.get(el.id) } : el));
  }, [syncElements]);

  // Bulk immediate update (dùng cho onTransformEnd đa vật thể): commit và bỏ lock
  const updateElementsBatchImmediate = useCallback((updatedEls: any[]) => {
    const updatedMap = new Map(updatedEls.map(el => [el.id, el]));
    updatedEls.forEach(el => draggingElementIdsRef.current.delete(el.id));
    syncElementsImmediate(elementsRef.current.map(el => updatedMap.has(el.id) ? { ...updatedMap.get(el.id) } : el));
  }, [syncElementsImmediate]);


  const deleteSelectedElement = () => {
    if (selectedIds.length === 0) return;
    // Push undo TRƯỚC khi xóa để có thể khôi phục
    pushUndoSnapshot(elements);
    syncElementsImmediate(elements.filter(el => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  };

  const moveElement = (direction: 'up' | 'down') => {
    if (selectedIds.length !== 1) return;
    pushUndoSnapshot(elements); // Push undo trước khi đổi z-index
    const index = elements.findIndex(el => el.id === selectedIds[0]);
    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    else if (direction === 'down' && index > 0) [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
    syncElementsImmediate(newElements);
  };

  // updateElement dùng cho Toolbar (màu, font, style) — cần undo trước khi đổi
  const updateElementWithUndo = useCallback((newAttrs: any) => {
    if (newAttrs.id === 'bg') {
      setPages(prev => prev.map(p => p.id === currentPageId ? { ...p, background_color: newAttrs.fill } : p));
      setSaveStatus('unsaved');
      if (currentPageId) emitPageBackgroundUpdated(currentPageId, newAttrs.fill);
      return;
    }
    pushUndoSnapshot(elements);
    syncElementsImmediate(elements.map(el => el.id === newAttrs.id ? newAttrs : el));
  }, [elements, pushUndoSnapshot, syncElementsImmediate, currentPageId, emitPageBackgroundUpdated]);

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
      pushUndoSnapshot(elements); // Push undo trước khi thay đổi thứ tự layer
      const reversedElements = [...elements].reverse();
      const [draggedItem] = reversedElements.splice(draggedLayerIdx, 1);
      reversedElements.splice(dropIndex, 0, draggedItem);

      const newElements = reversedElements.reverse().map((el, idx) => ({
        ...el, z_index: idx
      }));

      syncElementsImmediate(newElements);
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

  // handleFontUpload removed — fonts are now managed by Admin only

  const handleRemoveBackground = async (element: any) => {
    if (!element || !element.src) return;
    // ── PRO GATE ──
    if (!isPro) {
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
        throw new Error('Lỗi từ server tách nền');
      }

      const data = await uploadRes.json();

      const backendUrl = `http://localhost:3000${data.url}`;
      updateElement({ ...element, src: backendUrl, hasRemovedBg: true });

    } catch (err) {
      console.error('Lỗi khi xóa nền:', err);
      showError('Đã xảy ra lỗi khi xóa nền. Vui lòng kiểm tra lại AI service.');
    } finally {
      setIsProcessingBg(false);
    }
  };

  // ─── Brush Background Eraser ──────────────────────────────────────────────
  const [brushEraserElement, setBrushEraserElement] = useState<any>(null);

  const handleBrushErase = (element: any) => {
    setBrushEraserElement(element);
  };

  const handleBrushEraseResult = (newSrc: string) => {
    if (!brushEraserElement) return;
    // Push undo trước khi áp dụng kết quả xóa nền bằng cọ
    pushUndoSnapshot(elements);
    updateElementImmediate({ ...brushEraserElement, src: newSrc });
    setBrushEraserElement(null);
  };

  const isReadOnly = currentRole === 'viewer' || !!versionId;

  const canEdit = !versionId && (currentRole === 'owner' || currentRole === 'editor');

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
      if (stageRef.current && currentPageType !== 'doc' && currentPageType !== 'sheet' && currentPageId) {
        const capturedPageId = currentPageId;
        try {
          // Ẩn tất cả Transformer (boundary box lựa chọn) và đường dóng căn chỉnh trước khi chụp ảnh để thumbnail sạch đẹp
          const transformers = stageRef.current.find('Transformer');
          transformers.forEach(tr => tr.hide());
          const guidelines = stageRef.current.find(node => node.name() === 'guideline');
          guidelines.forEach(g => g.hide());

          // Temporarily reset scale and position to capture exact design frame
          const oldScaleX = stageRef.current.scaleX();
          const oldScaleY = stageRef.current.scaleY();
          const oldX = stageRef.current.x();
          const oldY = stageRef.current.y();

          stageRef.current.scale({ x: 1, y: 1 });
          stageRef.current.position({ x: 0, y: 0 });
          stageRef.current.batchDraw();

          const dataUrl = stageRef.current.toDataURL({
            x: 0,
            y: 0,
            width: stageWidth,
            height: stageHeight,
            pixelRatio: 0.25,
            mimeType: 'image/jpeg',
            quality: 0.5
          });

          // Restore scale and position
          stageRef.current.scale({ x: oldScaleX, y: oldScaleY });
          stageRef.current.position({ x: oldX, y: oldY });

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
        thumbnail_url: (finalPages.length > 0 ? finalPages[0].thumbnail : '') || design?.thumbnail_url || '', // Luôn lấy thumbnail của trang đầu tiên
        // === FIX #2 PATCH: Đọc từ REF thay vì state — luôn là giá trị mới nhất, không stale ===
        version: (activeUsers && activeUsers.length > 1) ? undefined : designVersionRef.current,
        pages: finalPages.map((page, index) => ({
          id: page.id,
          page_order: index,
          thumbnail: page.thumbnail || '', // Dùng URL từ DB, không phải base64
          type: page.type || 'canvas',
          width: page.width || 1920,
          height: page.height || 1080,
          content: page.content || '',
          transition: page.transition || null,
          duration: page.duration || 5,
          background_color: page.background_color || null, // [FIX] Lưu background color của trang
          elements: (page.type === 'canvas')
            ? (page.elements ? page.elements.map((el: any, idx: number) => {
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
            }) : undefined)
            : undefined
        }))
      };

      const result = await updateDesignFull(id!, payload);

      // === FIX #2 PATCH: Ghi version mới ngay lập tức vào ref (không chá»  React re-render) ===
      if (result?.updated_at) {
        designVersionRef.current = result.updated_at; // GHI VÀO REF TRƯỜC
        setDesign((prev: any) => prev ? { ...prev, updated_at: result.updated_at } : prev);
      }

      setSaveStatus('saved');
      if (!isSilent) showSuccess('Đã lưu thành công!');

      // === AUTO THUMBNAIL: render offscreen cho các trang chưa có thumb sau khi save ===
      // Chạy bất đồng bộ ngầm — không ảnh hưởng UX
      setTimeout(() => {
        generateAllPagesThumbnails(pages, currentPageId);
      }, 500); // Delay nhỏ để tránh tranh tài nguyên với write-behind flush
    } catch (error: any) {
      // === FIX #2: OCC - Xử lý 409 Conflict ===
      if (error?.status === 409 || (error?.message && error.message.includes('409'))) {
        setSaveStatus('unsaved');
        const shouldReload = window.confirm(
          '⚠️ Xung đột dữ liệu! Người dùng khác đã lưu thay đổi mới hơn.\n\n' +
          'Nhấn OK để tải lại phiên bản mới nhất (mất thay đổi hiện tại).\n' +
          'Nhấn Cancel để tiếp tục làm việc (có thể ghi đè lên thay đổi của người khác).'
        );
        if (shouldReload) window.location.reload();
      } else {
        setSaveStatus('unsaved');
        console.error('Lỗi khi lưu:', error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Gắn handleSave vào ref để scheduleAutosave dùng mà không bị stale closure
  handleSaveRef.current = handleSave;

  // Cleanup autosave timer khi unmount
  useEffect(() => {
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, []);

  // === FIX #6: beforeunload - Chặn đóng tab khi có unsaved changes ===
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Dùng saveStatusRef để tránh stale closure (không phải saveStatus state)
      if (saveStatusRef.current === 'unsaved' || saveStatusRef.current === 'saving') {
        e.preventDefault();
        // Popup cảnh báo tiêu chuẩn của trình duyệt
        e.returnValue = 'Bạn có những thay đổi chưa được lưu. Bạn có chắc chắn muốn thoát?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); // Chỉ mount 1 lần nhờ dùng saveStatusRef thay vì saveStatus

  // === Lắng nghe sự kiện bị xóa hoàn toàn quyền truy cập (bị kick) ===
  // useCollaboration dispatch custom event thay vì navigate thẳng để tránh popup "Leave site?"
  useEffect(() => {
    const onAccessRevoked = async () => {
      // Đánh dấu đã lưu xong để beforeunload không chặn
      saveStatusRef.current = 'saved';
      setSaveStatus('saved');
      // Lưu âm thầm nếu đang là editor (có unsaved changes)
      try {
        await handleSaveRef.current?.(true);
      } catch {
        // bỏ qua lỗi save
      }
      showWarning('Quyền truy cập của bạn vào bản vẽ này đã bị thu hồi.');
      setTimeout(() => navigate('/'), 2000); // Delay nhỏ để người dùng đọc thông báo
    };
    window.addEventListener('design:access_revoked', onAccessRevoked);
    return () => window.removeEventListener('design:access_revoked', onAccessRevoked);
  }, [navigate, showWarning]);

  // === Lắng nghe sự kiện link public bị tắt ===
  useEffect(() => {
    const onPublicLinkRevoked = () => {
      // isPublicAccess = true: user vào nhờ public link, không có share riêng → bị kick
      // isPublicAccess = false: user có quyền riêng (owner/editor/shared viewer) → giữ nguyên
      if (!isPublicAccess) return;
      saveStatusRef.current = 'saved';
      setSaveStatus('saved');
      showWarning('Chủ sở hữu đã tắt tính năng chia sẻ công khai cho bản vẽ này.');
      setTimeout(() => navigate('/'), 2500);
    };
    window.addEventListener('design:public_link_revoked', onPublicLinkRevoked);
    return () => window.removeEventListener('design:public_link_revoked', onPublicLinkRevoked);
  }, [navigate, showWarning, isPublicAccess]);

  // === Lắng nghe sự kiện force reload khi có tài nguyên bị xóa vĩnh viễn ===
  useEffect(() => {
    const onForceReload = async (e: any) => {
      const message = e.detail?.message || 'Một thành phần trong thiết kế đã bị thay đổi, trang sẽ tự tải lại.';
      showWarning(message);

      // Force save current edits (if any) to prevent losing work not related to the deleted asset
      try {
        await handleSaveRef.current?.(true);
      } catch (err) {
        console.error('Lỗi khi auto-save trước reload:', err);
      }

      // Reload page sau khi báo cho user
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    };

    window.addEventListener('design:force_reload', onForceReload);
    return () => window.removeEventListener('design:force_reload', onForceReload);
  }, [showWarning]);


  // Thay vì dùng thẻ <a href="/"> (bỏ qua unsaved), dùng hàm này để:
  // 1. Kiểm tra saveStatus, nếu unsaved → hiện overlay "Đang lưu..."
  // 2. Await handleSave() thành công → navigate về "/"
  const handleGoBackToDashboard = useCallback(async () => {
    if (saveStatusRef.current === 'saved') {
      navigate('/');
      return;
    }
    // Có unsaved changes: force save trước
    setIsSavingBeforeNav(true);
    try {
      await handleSaveRef.current?.(true); // isSilent = true
      navigate('/');
    } catch {
      // Nếu save thất bại, vẫn cho phép thoát sau khi xác nhận
      const forceLeave = window.confirm(
        'Không thể lưu tự động. Bạn có muốn thoát mà không lưu không?'
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

    // ── DOCX / PDF export (bỏ qua check chọn trang và Pro gate vì đây là doc engine) ──
    if (exportConfig.format === 'docx') {
      if (docEditorRef.current) {
        await docEditorRef.current.exportDocx();
      }
      setShowExportPopover(false);
      return;
    }

    if (exportConfig.format === 'pdf' && currentPageType === 'doc') {
      if (docEditorRef.current) {
        docEditorRef.current.exportPdf();
      }
      setShowExportPopover(false);
      return;
    }

    if (exportSelectedPages.length === 0) { showWarning('Vui lòng chọn ít nhất 1 trang!'); return; }

    // ── PRO ELEMENTS GATE ─────────────────────────────────────────────────────
    if (!isPro) {
      const pagesToCheck = pages.filter((p: any) => exportSelectedPages.includes(p.id));
      const allEls: any[] = pagesToCheck.flatMap((p: any) =>
        p.id === currentPageId ? elements : (p.elements || [])
      );

      // Lấy tập hợp tên các font Pro để tra cứu nhanh O(1)
      const proFontNames = new Set(
        customFonts.filter(f => f.is_premium).map(f => f.name)
      );

      const proEls: ProElement[] = allEls
        .filter((el: any) => {
          if (el.is_premium || el.createdByAi || el.hasRemovedBg) return true;
          // Text dùng font Pro
          if (el.type === 'text' && el.fontFamily && proFontNames.has(el.fontFamily)) return true;
          return false;
        })
        .map((el: any) => ({
          id: el.id,
          name: el.name || (el.type === 'image' ? 'Hinh anh' : el.type === 'text' ? `Text (${el.fontFamily || 'font'})` : 'Element'),
          reason: el.is_premium ? 'is_premium'
            : el.createdByAi ? 'ai'
              : el.hasRemovedBg ? 'remove_bg'
                : 'pro_font',
        }));
      if (proEls.length > 0) {
        setExportBlockElements(proEls);
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

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
              showError('Lỗi tải video từ Server!');
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

          for (let i = 0; i < pagesToExport.length; i++) {
            const p = pagesToExport[i];
            const slide = pptx.addSlide();

            if (p.background_color) {
              slide.background = { color: p.background_color.replace('#', '') };
            }

            let pageElements = p.id === currentPageId ? elements : (p.elements || []);
            if (p.id !== currentPageId && pageElements.length === 0 && lazyPageLoader) {
              try {
                pageElements = await lazyPageLoader.loadPageElements(p.id) || [];
              } catch (e) {
                console.error("Lỗi lazy load PPTX elements", e);
              }
            }

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
          }

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

            let oldScaleX = 1, oldScaleY = 1, oldX = 0, oldY = 0;
            if (stageRef.current) {
              oldScaleX = stageRef.current.scaleX(); oldScaleY = stageRef.current.scaleY();
              oldX = stageRef.current.x(); oldY = stageRef.current.y();
              stageRef.current.scale({ x: 1, y: 1 }); stageRef.current.position({ x: 0, y: 0 });
              stageRef.current.batchDraw();
            }

            const dataURL = stageRef.current.toDataURL({ x: 0, y: 0, width: stageWidth, height: stageHeight, pixelRatio: exportScale, mimeType, quality: exportQuality });

            if (stageRef.current) {
              stageRef.current.scale({ x: oldScaleX, y: oldScaleY }); stageRef.current.position({ x: oldX, y: oldY });
              stageRef.current.batchDraw();
            }

            saveAs(dataURL, `${design?.title}.${exportConfig.format}`);
          } else {
            const zip = new JSZip();

            // Hàm load ảnh cho offscreen canvas
            const loadOffscreenImage = (url: string): Promise<HTMLImageElement> => {
              return new Promise((resolve, reject) => {
                const img = new window.Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = url;
              });
            };

            for (let i = 0; i < pagesToExport.length; i++) {
              const p = pagesToExport[i];
              const mimeType = exportConfig.format === 'jpeg' ? 'image/jpeg' : 'image/png';

              if (p.id === currentPageId) {
                let oldScaleX = 1, oldScaleY = 1, oldX = 0, oldY = 0;
                if (stageRef.current) {
                  oldScaleX = stageRef.current.scaleX(); oldScaleY = stageRef.current.scaleY();
                  oldX = stageRef.current.x(); oldY = stageRef.current.y();
                  stageRef.current.scale({ x: 1, y: 1 }); stageRef.current.position({ x: 0, y: 0 });
                  stageRef.current.batchDraw();
                }

                const dataURL = stageRef.current.toDataURL({ x: 0, y: 0, width: stageWidth, height: stageHeight, pixelRatio: exportScale, mimeType, quality: exportQuality });

                if (stageRef.current) {
                  stageRef.current.scale({ x: oldScaleX, y: oldScaleY }); stageRef.current.position({ x: oldX, y: oldY });
                  stageRef.current.batchDraw();
                }

                if (dataURL) zip.file(`Page_${i + 1}.${exportConfig.format}`, dataURL.split(',')[1], { base64: true });
              } else {
                // OFFSCREEN RENDERING FOR HIGH QUALITY MULTI-IMAGE EXPORT
                try {
                  const container = document.createElement('div');
                  const stage = new Konva.Stage({ container, width: p.width || stageWidth, height: p.height || stageHeight });
                  const layer = new Konva.Layer();
                  stage.add(layer);

                  const bgColor = p.background_color || '#ffffff';
                  layer.add(new Konva.Rect({
                    width: p.width || stageWidth,
                    height: p.height || stageHeight,
                    fill: bgColor
                  }));

                  let pageElements = p.elements || [];
                  if (pageElements.length === 0 && lazyPageLoader) {
                    try {
                      pageElements = await lazyPageLoader.loadPageElements(p.id) || [];
                    } catch (err) {
                      console.error("Failed to load elements for page", p.id, err);
                    }
                  }
                  const sortedElements = [...pageElements].sort((a: any, b: any) => (a.z_index || 0) - (b.z_index || 0));

                  for (const el of sortedElements) {
                    let node: any = null;
                    const commonProps = {
                      id: el.id,
                      x: el.x || 0,
                      y: el.y || 0,
                      width: el.width || 0,
                      height: el.height || 0,
                      rotation: el.rotation || 0,
                      opacity: el.opacity ?? 1,
                      scaleX: el.scaleX || 1,
                      scaleY: el.scaleY || 1,
                    };

                    if (el.type === 'text') {
                      node = new Konva.Text({
                        ...commonProps,
                        text: el.text || el.content || '',
                        fontSize: el.fontSize,
                        fontFamily: el.fontFamily || 'Arial',
                        fill: el.fill || '#000000',
                        align: el.align || 'center',
                        fontStyle: el.fontStyle || 'normal',
                      });
                    } else if (el.type === 'rect' || el.type === 'shape') {
                      node = new Konva.Rect({
                        ...commonProps,
                        fill: el.fill || '#000000',
                        cornerRadius: el.cornerRadius || 0,
                      });
                    } else if (el.type === 'circle') {
                      node = new Konva.Circle({
                        ...commonProps,
                        fill: el.fill || '#000000',
                        radius: el.radius || Math.min(el.width || 0, el.height || 0) / 2,
                      });
                    } else if (el.type === 'image' || el.type === 'sticker') {
                      if (el.src) {
                        try {
                          const imgObj = await loadOffscreenImage(el.src);
                          let cropProps = {};
                          if (el.cropRect && el.cropRect.width > 0 && el.cropRect.height > 0) {
                            const cr = el.cropRect;
                            const natW = imgObj.naturalWidth || el.width;
                            const natH = imgObj.naturalHeight || el.height;
                            const sx = el.width > 0 ? natW / el.width : 1;
                            const sy = el.height > 0 ? natH / el.height : 1;

                            commonProps.x = (el.x || 0) + cr.x;
                            commonProps.y = (el.y || 0) + cr.y;
                            commonProps.width = cr.width;
                            commonProps.height = cr.height;

                            cropProps = {
                              crop: {
                                x: cr.x * sx,
                                y: cr.y * sy,
                                width: cr.width * sx,
                                height: cr.height * sy,
                              }
                            };
                          }
                          node = new Konva.Image({
                            ...commonProps,
                            image: imgObj,
                            ...cropProps
                          });
                        } catch (err) {
                          console.error("Failed to load offscreen image for export", err);
                        }
                      }
                    }

                    if (node) {
                      layer.add(node);
                    }
                  }

                  layer.draw();
                  const dataURL = stage.toDataURL({ pixelRatio: exportScale, mimeType, quality: exportQuality });
                  if (dataURL) {
                    zip.file(`Page_${i + 1}.${exportConfig.format}`, dataURL.split(',')[1], { base64: true });
                  }
                  stage.destroy();
                  container.remove();
                } catch (e) {
                  console.error("Offscreen rendering failed for page", i + 1, e);
                  if (p.thumbnail) {
                    if (p.thumbnail.startsWith('data:')) {
                      zip.file(`Page_${i + 1}.${exportConfig.format}`, p.thumbnail.split(',')[1], { base64: true });
                    } else {
                      try {
                        const res = await fetch(p.thumbnail);
                        if (res.ok) {
                          const blob = await res.blob();
                          zip.file(`Page_${i + 1}.${exportConfig.format}`, blob);
                        }
                      } catch (err) { }
                    }
                  }
                }
              }
            }
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
      showError('Lỗi xuất file!');
    }
  };

  const contentHash = useMemo(() => {
    const pHash = pages.map(p => ({ ...p, thumbnail: undefined, _lastThumbAt: undefined }));
    return JSON.stringify({ elements, pages: pHash, title: design?.title });
  }, [elements, pages, design?.title]);

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
  }, [contentHash]);

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      const nodes = selectedIds.map(id => layerRef.current.findOne(`#${id}`)).filter(Boolean);
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements]);

  // ── COMPREHENSIVE KEYBOARD SHORTCUTS (Canva-style) ──────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      // ── Ctrl + S: Save (luôn chặn mặc định) ──
      if (ctrl && key === 's') {
        e.preventDefault();
        handleSave(false);
        return;
      }

      // ── Nếu đang ở ô input/textarea/contentEditable → chỉ cho Ctrl+S, bỏ qua phím tắt khác ──
      if (isTextInput) return;

      // ── GRID VIEW SPECIFIC SHORTCUTS ──
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

      // ── Ctrl + C: Copy elements or single page ──
      if (ctrl && key === 'c') {
        e.preventDefault();
        const activeIds = selectedIds.filter(id => id !== 'bg');
        if (activeIds.length > 0) {
          const elementsToCopy = elements.filter(el => activeIds.includes(el.id));
          setCopiedElementsData(JSON.parse(JSON.stringify(elementsToCopy)));
          setCopiedPageData(null);
          setCollabNotification(`Đã copy ${elementsToCopy.length} phần tử`);
          setTimeout(() => setCollabNotification(''), 3000);
        } else if (currentPageId) {
          const cur = pages.find(p => p.id === currentPageId);
          if (cur) {
            setCopiedPageData([JSON.parse(JSON.stringify(cur))]);
            setCopiedElementsData(null);
            setCollabNotification('Đã copy toàn bộ trang hiện tại');
            setTimeout(() => setCollabNotification(''), 3000);
          }
        }
        return;
      }

      // ── Ctrl + V: Paste elements or single page ──
      if (ctrl && key === 'v') {
        if (copiedElementsData && copiedElementsData.length > 0) {
          // Paste internal elements (Ctrl+C elements trong canvas)
          e.preventDefault();
          pushUndoSnapshot(elements);
          const newElements = copiedElementsData.map((el: any) => ({
            ...el,
            id: crypto.randomUUID(),
            x: el.x + 20,
            y: el.y + 20
          }));
          syncElementsImmediate([...elements, ...newElements]);
          setSelectedIds(newElements.map((el: any) => el.id));
          setCollabNotification(`Đã dán ${newElements.length} phần tử`);
          setTimeout(() => setCollabNotification(''), 3000);
        } else if (copiedPageData && copiedPageData.length > 0) {
          // Paste internal pages (Ctrl+C page trong grid view)
          e.preventDefault();
          const curIdx = pages.findIndex(p => p.id === currentPageId);
          const insertIdx = curIdx >= 0 ? curIdx + 1 : pages.length;
          const newPages = copiedPageData.map((p: any, index: number) => {
            const newPageId = crypto.randomUUID();
            const newPage = {
              ...p,
              id: newPageId,
              page_order: insertIdx + index,
              elements: (p.elements || []).map((el: any) => ({ ...el, id: crypto.randomUUID(), page_id: newPageId })),
            };
            emitPageAdded(newPage);
            return newPage;
          });
          setPages(prev => {
            const updated = [...prev];
            updated.splice(insertIdx, 0, ...newPages);
            const sorted = updated.map((p, i) => ({ ...p, page_order: i }));
            emitPagesReordered(sorted.map(p => p.id));
            return sorted;
          });
          lazyPageLoader.updateCache(newPages[0].id, newPages[0].elements);
          setElements(newPages[0].elements);
          setCurrentPageId(newPages[0].id);
          setCollabNotification('Đã dán trang mới');
          setTimeout(() => setCollabNotification(''), 3000);
        }
        // [FIX] Không e.preventDefault() khi không có nội dung internal để paste
        // → Để browser xử lý → paste event sẽ fire → handlePaste sẽ bắt ảnh từ clipboard
        return;
      }

      // ── Ctrl + Z: Undo ──
      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // ── Ctrl + Y: Redo ──
      if (ctrl && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // ── Ctrl + A: Select All elements ──
      if (ctrl && key === 'a') {
        e.preventDefault();
        if (currentPageType !== 'doc' && currentPageType !== 'sheet' && elements.length > 0) {
          setSelectedIds(elements.map(el => el.id));
        }
        return;
      }

      // ── Ctrl + /: Toggle Sidebar ──
      if (ctrl && e.key === '/') {
        e.preventDefault();
        setSidebarVisible(prev => !prev);
        return;
      }

      // ── Ctrl + K: Add Link ──
      if (ctrl && key === 'k') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setShowLinkPopup(true);
          setLinkUrl('');
        }
        return;
      }

      // ── Ctrl + Enter: Add empty page ──
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        handleAddPage();
        return;
      }

      // ── Ctrl + Backspace: Delete empty page ──
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

      // ── Ctrl + F1: Focus to toolbar ──
      if (ctrl && e.key === 'F1') {
        e.preventDefault();
        const toolbar = document.querySelector('[data-toolbar="top"]') as HTMLElement;
        if (toolbar) toolbar.focus();
        return;
      }

      // ── Ctrl + F2: Focus to canvas ──
      if (ctrl && e.key === 'F2') {
        e.preventDefault();
        const canvas = document.querySelector('.konvajs-content canvas') as HTMLElement;
        if (canvas) canvas.focus();
        return;
      }

      // ── Delete / Backspace: Delete selected elements ──
      if ((e.key === 'Delete' || e.key === 'Backspace') && !editingId && selectedIds.length > 0) {
        e.preventDefault();
        pushUndoSnapshot(elements);
        deleteSelectedElement();
        return;
      }

      // ── Phím tắt thêm phần tử (chỉ 1 phím, chỉ khi ở canvas mode) ──
      if (currentPageType === 'doc' || currentPageType === 'sheet') return;

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
  }, [selectedIds, elements, editingId, currentPageType, currentPageId, pages, handleUndo, handleRedo, sidebarVisible, showGridView, gridSelectedPages, copiedPageData, copiedElementsData]);

  // Dùng ref để tránh stale closure trong paste handler (addImageOriginal thay đổi mỗi render)
  const addImageRef = useRef<typeof addImageOriginal>(addImageOriginal);
  addImageRef.current = addImageOriginal;
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;
      if (isReadOnlyRef.current) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;
          e.preventDefault();

          // Upload lên server trước → nhận server URL → mới thêm vào canvas
          setUploadProgress({ visible: true, percent: 10 });
          try {
            const pastedFile = new File(
              [file],
              `clipboard_${Date.now()}.png`,
              { type: file.type || 'image/png' }
            );
            const data = await uploadImageFile(pastedFile);
            setUploadProgress({ visible: true, percent: 80 });

            // Tính quota
            refreshUser().catch(console.error);

            // Đọc kích thước ảnh từ server URL
            const img = new window.Image();
            img.src = data.url;
            img.onload = () => {
              // Thêm vào canvas với server URL (bền vững, Ctrl+C sang tab vẫn OK)
              addImageRef.current(data.url, img.width, img.height);
              // Thêm vào sidebar Uploads
              setUploadedImages(prev => [{
                id: data.assetId ?? crypto.randomUUID(),
                url: data.url,
                width: img.width,
                height: img.height
              }, ...prev]);
              setActiveTab('uploads');
              setUploadProgress({ visible: true, percent: 100 });
              setTimeout(() => setUploadProgress({ visible: false, percent: 0 }), 500);
            };
            img.onerror = () => {
              addImageRef.current(data.url, 800, 600);
              setUploadedImages(prev => [{
                id: data.assetId ?? crypto.randomUUID(),
                url: data.url, width: 800, height: 600
              }, ...prev]);
              setUploadProgress({ visible: false, percent: 0 });
            };
          } catch (err: any) {
            console.error('[Paste] Upload error:', err);
            setUploadProgress({ visible: false, percent: 0 });
            showError(err.message || 'Không thể tải ảnh lên. Vui lòng thử lại!');
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste as any);
    return () => window.removeEventListener('paste', handlePaste as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



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
      showSuccess('Đã khôi phục thành công!');
      window.location.reload();
    } catch (error) {
      showError('Lỗi khi khôi phục phiên bản.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveVersion = async () => {
    await handleSave(true);
    try {
      await createDesignVersion(id!);
      showSuccess('Đã chụp và lưu thành 1 phiên bản lịch sử!');
    } catch (error) {
      showError('Lỗi khi lưu phiên bản.');
    }
  };

  // --- 9. Render Giao Dien ---
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-sky-50 via-white to-pink-50 overflow-hidden font-sans">

      {/* === FIX #6: Overlay Force-Save khi navigate về Dashboard === */}
      {isSavingBeforeNav && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-bold text-lg tracking-wide">Đang lưu dữ liệu cuối cùng...</p>
          <p className="text-white/60 text-sm">Vui lòng không đóng cửa sổ này</p>
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
          <span>🔄</span> {collabNotification}
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
        onLimitReached={() => showWarning('Kích thước tối đa cho phép là 10000x10000 px.')}
      />

      {/* 2. MAIN AREA */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Icon Rail — hidden for doc pages, sidebar toggle off, or grid view */}
        {canEdit && currentPageType !== 'doc' && sidebarVisible && !showGridView && (
          <EditorSidebar
            activeTab={activeTab}
            setActiveTab={(tab: any) => {
              setActiveTab(tab);
              if (tab) { setShowPositionBox(false); setShowAnimateBox(false); }
            }}
            currentPageType={currentPageType}
            showPositionBox={showPositionBox}
            onTogglePositionBox={() => {
              setShowPositionBox(v => {
                const newVal = !v;
                if (newVal) {
                  setActiveTab(null);
                  setShowAnimateBox(false);
                }
                return newVal;
              });
              setShowAnimPanel(false);
            }}
          />
        )}

        {/* Sidebar Drawer — hidden for doc pages, sidebar toggle off, or grid view */}
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
            defaultStickers={defaultStickers}
            uploadedImages={uploadedImages}
            uploadProgress={uploadProgress}
            handleImageUpload={handleImageUpload}
            addImageOriginal={addImageOriginal}
            addUploadedImageToCanvas={addUploadedImageToCanvas}
            addText={addText}
            customFonts={customFonts}
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
            user={user}
          />
        )}


        {/* LEFT PANEL: Animation Panel */}
        <AnimatePresence>
          {showAnimPanel && canEdit && design?.design_type === 'presentation' && currentPageType !== 'doc' && currentPageType !== 'sheet' && (
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



          <div className="flex-1 flex relative overflow-hidden">

            {/* ── GRID VIEW OVERLAY WITH PREMIUM ANIMATION ── */}
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
                        {gridSelectedPages.size === pages.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
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
                      Quay lại thiết kế
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
                                  ×
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
              {selectedIds.length > 0 && currentPageType !== 'doc' && currentPageType !== 'sheet' && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute top-2 left-1/2 -translate-x-1/2 z-[60]"
                >
                  {selectedIds.length === 1 && selectedElement ? (
                    <ElementToolbar
                      element={selectedElement}
                      onUpdate={updateElementWithUndo}
                      onDelete={deleteSelectedElement}
                      onMove={moveElement}
                      fontList={Array.from(new Set(customFonts.map(f => f.name)))}
                      onTogglePosition={() => {
                        setShowPositionBox(!showPositionBox);
                        setShowAnimateBox(false);
                        setShowAnimPanel(false);
                      }}
                      onToggleAnimate={design?.design_type === 'presentation' ? () => {
                        setShowAnimPanel(prev => !prev);
                        setShowPositionBox(false);
                        setShowAnimateBox(false);
                        setHighlightedAnimId(selectedElement?.id || null);
                      } : undefined}
                      onAlign={(alignment) => {
                        let newX = selectedElement.x;
                        let newY = selectedElement.y;
                        const w = selectedElement.width || 0;
                        const h = selectedElement.height || 0;
                        const padding = 20;
                        switch (alignment) {
                          case 'left': newX = padding; break;
                          case 'center': newX = (stageWidth - w) / 2; break;
                          case 'right': newX = stageWidth - w - padding; break;
                          case 'top': newY = padding; break;
                          case 'middle': newY = (stageHeight - h) / 2; break;
                          case 'bottom': newY = stageHeight - h - padding; break;
                        }
                        updateElementWithUndo({ ...selectedElement, x: newX, y: newY });
                      }}
                      onRemoveBackground={handleRemoveBackground}
                      onBrushErase={handleBrushErase}
                      onCrop={(el) => {
                        setSelectedIds([]);
                        setCropElementId(el.id);
                      }}
                    />
                  ) : (
                    <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/80 px-3 py-2 flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-600 px-2 border-r border-slate-200">{selectedIds.length} elements</span>
                      {design?.design_type === 'presentation' && (
                        <button
                          onClick={() => {
                            setShowAnimPanel(!showAnimPanel);
                            setShowPositionBox(false);
                            setShowAnimateBox(false);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition ${showAnimPanel ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          <Zap size={16} /> Animate
                        </button>
                      )}
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
            {cropElement && currentPageType !== 'doc' && currentPageType !== 'sheet' && (
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
            {currentPageType !== 'doc' && currentPageType !== 'sheet' && (
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
                    // Khi bắt đầu edit text: lưu snapshot elements vào ref để push undo sau khi blur
                    if (id !== null) {
                      originalElementsBeforeTextEditRef.current = JSON.parse(JSON.stringify(elements));
                    }
                    setEditingId(id);
                  }}
                  updateElement={updateElement}
                  updateElementImmediate={updateElementImmediate}
                  updateElementsBatch={updateElementsBatch}
                  updateElementsBatchImmediate={updateElementsBatchImmediate}
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
                  isFreeUser={!isPro}
                  onLimitReached={() => showWarning('Đã đạt giới hạn kích thước bảng trắng (10000x10000).')}
                />




                {/* VERTICAL TOOLBAR (replaces Floating Toolbox) */}
                {canEdit && !isPlaying && activeTab === 'tools' && (
                  <div className="absolute top-20 left-[80px] z-[60] flex flex-col items-center floating-toolbar bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 p-2 gap-2 shadow-xl transition-all">
                    {[
                      { id: 'select', icon: <MousePointer2 size={18} />, title: 'Chuột (Select)' },
                      { id: 'draw', icon: <PenTool size={18} />, title: 'Bút vẽ' },
                      { id: 'line', icon: <Minus size={18} className="rotate-45" />, title: 'Đường kẻ' },
                      { id: 'text', icon: <Type size={18} />, title: 'Văn bản' },
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
                          <div className="absolute top-1/2 left-full -translate-y-1/2 ml-2 p-2 bg-white rounded-xl shadow-xl border border-slate-100 flex flex-col gap-2">
                            {['rect', 'circle', 'triangle'].map((type) => (
                              <button
                                key={type}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Xử lý thêm vật thể sẽ được trigger qua prop hoặc xử lý trực tiếp (tạm thời đặt icon mồi)
                                  // Trong thực tế, EditorPage cần có hàm `addElement` 
                                  // Để gọn, CanvasEditor sẽ lắng nghe sự kiện onClick/Drag
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
                    <span>✍️</span> {collaboratorResizing.userName} đang đổi kích cỡ trang...
                  </div>
                )}
                {/* Remote Cursors Overlay */}
                {Array.from(remoteCursors.entries())
                  .filter(([userId]) => {
                    const userPage = userPageMap.get(userId);
                    return !userPage || userPage === currentPageId; // Fallback: nếu chưa rõ page, vẫn hiện
                  })
                  .map(([userId, cursor]) => (
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

                {/* ── ANIMATION ORDER BADGES ── visible only when AnimationPanel is open */}
                {showAnimPanel && currentPageType !== 'doc' && currentPageType !== 'sheet' && (() => {
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
                designId={id}
                currentUserEmail={user?.email}
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

          {/* 4. TIMELINE / PAGE SELECTOR — hidden for doc pages and grid view */}
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
                canEdit={canEdit}
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
                activeUsers={activeUsers}
                userPageMap={userPageMap}
                onOpenTransition={(targetPageId: string) => {
                  setTransitionTargetId(targetPageId);
                  setShowTransitionBox(true);
                  setShowAnimateBox(false);
                  setShowPositionBox(false);
                  setShowAnimPanel(false);
                  setActiveTab(null);
                }}
              />
            </div>
          )}

          {/* 5. INFO BAR — hidden for doc pages and grid view */}
          {currentPageType !== 'doc' && !showGridView && (
            <div className="h-8 bg-white/60 backdrop-blur-md border-t border-white flex items-center justify-between px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
              <div className="flex gap-4">
                <span>Type: <strong className="text-indigo-600">{currentPageType}</strong></span>
                {currentPageType !== 'doc' && currentPageType !== 'sheet' && <span>Stage: {stageWidth}x{stageHeight}</span>}
              </div>
              {currentPageType !== 'doc' && currentPageType !== 'sheet' && (
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
          designId={id!}
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
                  // Áp dụng link lên element được chọn
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
// helo chào các con vợ
// helo chào các con vợ







