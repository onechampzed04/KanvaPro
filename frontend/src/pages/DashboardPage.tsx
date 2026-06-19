import { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, isSubscriptionActive } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  Plus, LogOut, Layout, Image as ImageIcon, Video,
  FileText, Monitor, Table, UploadCloud, Crown, Receipt, Shield,
  MoreVertical, Trash2, Camera, AlertTriangle, Users, HardDrive,
  Home, Folder, Settings, Search, Menu, X, UserCircle2,
  Filter, ArrowUpDown, Layers, FileSliders, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CustomSelect from '../components/dashboard/CustomSelect';
import { fetchDesigns, createDesign, bulkDeleteDesigns, fetchTemplates, useTemplate } from '../api/api';
import { useSubscription } from '../hooks/useSubscription';
import StoragePanel from '../components/dashboard/StoragePanel';
import TrashPanel from '../components/dashboard/TrashPanel';
import TeamsPanel from '../components/dashboard/TeamsPanel';
import BillingPanel from '../components/dashboard/BillingPanel';
import PricingPanel from '../components/dashboard/PricingPanel';
import ProfilePanel from '../components/dashboard/ProfilePanel';
import ImportPptxModal from '../components/dashboard/ImportPptxModal';
import { Copy, Edit3 } from 'lucide-react';

type ActivePage = 'home' | 'teams' | 'storage' | 'trash' | 'billing' | 'pricing' | 'profile';


const DESIGN_TEMPLATES = [
  { id: 'presentation', type: 'presentation', page_type: 'canvas', icon: Layout, label: 'Presentation', color: 'bg-[#FF7A00]', w: 1920, h: 1080 },
  { id: 'social', type: 'social_media', page_type: 'canvas', icon: ImageIcon, label: 'Logo', color: 'bg-[#FF2E54]', w: 1080, h: 1080 },
  { id: 'whiteboard', type: 'whiteboard', page_type: 'canvas', icon: Monitor, label: 'Whiteboard', color: 'bg-[#00D084]', w: 5000, h: 5000 },
];

const OWNER_OPTIONS = [
  { value: 'any', label: 'Bất kỳ ai' },
  { value: 'me', label: 'Chỉ mình tôi' },
  { value: 'shared', label: 'Được chia sẻ' },
  { value: 'email', label: 'Nhập email...' }
];

const TYPE_OPTIONS = [
  { value: 'any', label: 'Tất cả loại' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'whiteboard', label: 'Whiteboard' }
];

const DATE_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Mới nhất' },
  { value: 'date_asc', label: 'Cũ nhất' }
];

const NAME_SORT_OPTIONS = [
  { value: 'alpha_asc', label: 'Tên A-Z' },
  { value: 'alpha_desc', label: 'Tên Z-A' }
];

export default function DashboardPage() {
  const { user, logout, updateAvatar, refreshUser } = useAuth();
  const { currentWorkspace, workspaces, switchWorkspace, refreshWorkspaces } = useWorkspace();
  const { isPro, planName } = useSubscription();
  const [designs, setDesigns] = useState<any[]>([]);
  const [filterOwner, setFilterOwner] = useState<'any' | 'me' | 'shared' | 'email'>('any');
  const [filterEmail, setFilterEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('any');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'alpha_asc' | 'alpha_desc'>('date_desc');
  const [isCustomSizeOpen, setIsCustomSizeOpen] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showImportPptx, setShowImportPptx] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ loading: boolean; message: string }>({ loading: false, message: '' });

  // Marquee Selection State
  const [selectionRect, setSelectionRect] = useState({ visible: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 });
  const designCardsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const initialSelectedIdsRef = useRef<string[]>([]);
  const designsSectionRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const formatResourceSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1) return kb.toFixed(3) + ' KB';
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(3) + ' MB';
    return (mb / 1024).toFixed(2) + ' GB';
  };

  let maxGb = currentWorkspace?.is_pro 
    ? Number(currentWorkspace?.plan_storage_gb || 5) 
    : 5;
    
  if (!maxGb || isNaN(maxGb) || maxGb === 0) {
    maxGb = 5;
  }
  const maxStorageBytes = maxGb * 1024 * 1024 * 1024;
  const storageUsedBytes = currentWorkspace && currentWorkspace.workspace_type !== 'personal'
    ? Number(currentWorkspace.used_storage_bytes ?? 0) 
    : Number(user?.storage_used_bytes ?? 0);
  const storagePercentage = Math.min((storageUsedBytes / maxStorageBytes) * 100, 100);
  const isStorageWarning = storagePercentage > 90;

  const [deleteModalDesign, setDeleteModalDesign] = useState<any | null>(null);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

  // ── Template Gallery ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<any[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [templatePage, setTemplatePage] = useState(1);
  const templatesPerPage = 10;

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarToast, setAvatarToast] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        await refreshUser(); // Cập nhật lại workspace và storage mới nhất
        const data = await fetchDesigns('all');
        setDesigns(data.designs);
      } catch (err) {
        console.error('Lỗi khi load trang Dashboard:', err);
      }
    };
    loadData();
  }, [currentWorkspace?.id]);

  // Load templates một lần duy nhất khi mount
  useEffect(() => {
    fetchTemplates()
      .then(data => setTemplates(data.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  const handleUseTemplate = async (template: any) => {
    setUsingTemplateId(template.id);
    try {
      const data = await useTemplate(template.id);
      setPreviewTemplate(null);
      navigate(`/design/${data.designId}`);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setUsingTemplateId(null);
    }
  };

  const filteredDesigns = useMemo(() => {
    let result = [...designs];

    if (filterOwner === 'me') {
      result = result.filter(d => d.user_id === user?.id || d.owner_email === user?.email);
    } else if (filterOwner === 'shared') {
      result = result.filter(d => d.user_id !== user?.id && d.owner_email !== user?.email);
    } else if (filterOwner === 'email' && filterEmail.trim() !== '') {
      result = result.filter(d => d.owner_email?.toLowerCase().includes(filterEmail.toLowerCase()));
    }

    if (filterType !== 'any') {
      result = result.filter(d => d.design_type === filterType);
    }

    if (searchQuery.trim() !== '') {
      result = result.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    result.sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === 'date_asc') return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sortBy === 'alpha_asc') return a.title.localeCompare(b.title);
      if (sortBy === 'alpha_desc') return b.title.localeCompare(a.title);
      return 0;
    });

    return result;
  }, [designs, filterOwner, filterEmail, filterType, sortBy, user, searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setOpenMenuId(null);
      if (!(e.target as Element).closest('.workspace-dropdown')) {
        setIsWorkspaceDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Đảm bảo không bị kẹt ở tab Đội Nhóm nếu chuyển sang Team mà không phải Owner
  useEffect(() => {
    if (activePage === 'teams' && currentWorkspace && currentWorkspace.owner_id !== user?.id) {
      setActivePage('home');
    }
  }, [currentWorkspace, activePage, user]);

  // Cập nhật real-time dung lượng khi có thay đổi (vd: upload thành công)
  useEffect(() => {
    const handleStorageUpdate = () => {
      refreshUser();
      refreshWorkspaces();
    };
    window.addEventListener('storage:updated', handleStorageUpdate);
    return () => window.removeEventListener('storage:updated', handleStorageUpdate);
  }, [refreshUser, refreshWorkspaces]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activePage !== 'home') return;
    // Bỏ qua nếu nhấn vào nút, link, input, item trong group, hoặc nội dung có class no-marquee
    if ((e.target as HTMLElement).closest('button, a, input, .no-marquee, .group, [role="button"]')) return;
    if (e.button !== 0) return; // Chỉ chuột trái

    // Chỉ bắt đầu bôi đen nếu click từ phần chứa designs (dưới các tabs)
    if (designsSectionRef.current) {
      const sectionRect = designsSectionRef.current.getBoundingClientRect();
      if (e.clientY < sectionRect.top) return;
    }

    if (!mainRef.current) return;
    const mainRect = mainRef.current.getBoundingClientRect();
    const scrollLeft = mainRef.current.scrollLeft;
    const scrollTop = mainRef.current.scrollTop;

    // Tọa độ tương đối với nội dung (đã tính scroll)
    const contentX = e.clientX - mainRect.left + scrollLeft;
    const contentY = e.clientY - mainRect.top + scrollTop;

    // Click ra ngoài để bỏ chọn
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedIds([]);
      initialSelectedIdsRef.current = [];
    } else {
      initialSelectedIdsRef.current = [...selectedIds];
    }

    setSelectionRect({
      visible: true,
      startX: contentX,
      startY: contentY,
      x: contentX,
      y: contentY,
      width: 0,
      height: 0
    });

    // Chặn bôi đen text trình duyệt
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectionRect.visible || !mainRef.current) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();

      const mainRect = mainRef.current.getBoundingClientRect();
      const scrollLeft = mainRef.current.scrollLeft;
      const scrollTop = mainRef.current.scrollTop;

      const mouseContentX = e.clientX - mainRect.left + scrollLeft;
      const mouseContentY = e.clientY - mainRect.top + scrollTop;

      const x = Math.min(mouseContentX, selectionRect.startX);
      const y = Math.min(mouseContentY, selectionRect.startY);
      const width = Math.abs(mouseContentX - selectionRect.startX);
      const height = Math.abs(mouseContentY - selectionRect.startY);

      setSelectionRect(prev => ({ ...prev, x, y, width, height }));

      if (width > 5 || height > 5) {
        // Chuyển tọa độ content ngược lại viewport để check intersection
        const viewportLeft = x - scrollLeft + mainRect.left;
        const viewportTop = y - scrollTop + mainRect.top;
        const marqueeBoxViewport = {
          left: viewportLeft,
          right: viewportLeft + width,
          top: viewportTop,
          bottom: viewportTop + height
        };

        const baseSet = new Set(e.shiftKey || e.ctrlKey || e.metaKey ? initialSelectedIdsRef.current : []);

        designCardsRef.current.forEach((el, id) => {
          if (!el) return;
          const cardRect = el.getBoundingClientRect();
          const intersects = !(cardRect.right < marqueeBoxViewport.left ||
            cardRect.left > marqueeBoxViewport.right ||
            cardRect.bottom < marqueeBoxViewport.top ||
            cardRect.top > marqueeBoxViewport.bottom);
          if (intersects) {
            baseSet.add(id);
          }
        });

        setSelectedIds(Array.from(baseSet));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!selectionRect.visible) return;
      setSelectionRect(prev => ({ ...prev, visible: false }));
      document.body.style.userSelect = '';
    };

    if (selectionRect.visible) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [selectionRect.visible, selectionRect.startX, selectionRect.startY]);

  const handleCreateDesign = async (template: any, customWidth?: number, customHeight?: number) => {
    try {
      const payload = {
        title: `Untitled ${template.label}`,
        design_type: template.type,
        page_type: template.page_type,
        width: customWidth || template.w,
        height: customHeight || template.h,
      };
      const data = await createDesign(payload);
      if (data.id) navigate(`/design/${data.id}`);
    } catch {
      alert('Không thể tạo thiết kế mới, vui lòng thử lại.');
    }
  };

  /** Compress ảnh xuống max 2048px, quality 85% trước khi upload */
  const compressImage = (file: File, maxSize = 2048, quality = 0.85): Promise<{ blob: File; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (ev) => {
        const img = new window.Image();
        img.onerror = reject;
        img.onload = () => {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          // Chỉ scale-down nếu cần
          if (w > maxSize || h > maxSize) {
            const ratio = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          // Dùng JPEG cho ảnh thực tế, PNG cho ảnh có transparency
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
              const compressed = new File([blob], file.name, { type: mimeType });
              resolve({ blob: compressed, width: w, height: h });
            },
            mimeType,
            mimeType === 'image/jpeg' ? quality : undefined
          );
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file hình ảnh!'); return; }
    e.target.value = '';

    try {
      setUploadStatus({ loading: true, message: 'Đang xử lý ảnh...' });

      // 1. Đọc kích thước GỐC của ảnh (trước khi nén) để set canvas size đúng
      const originalDims = await new Promise<{ w: number; h: number }>((res) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new window.Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => res({ w: 1080, h: 1080 });
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
      const imgWidth = originalDims.w;
      const imgHeight = originalDims.h;

      // 2. Nén ảnh nếu > 1MB để upload nhẹ hơn (canvas vẫn dùng kích thước gốc)
      let uploadFile = file;
      if (file.size > 1 * 1024 * 1024) {
        setUploadStatus({ loading: true, message: `Đang nén ảnh (${(file.size / 1024 / 1024).toFixed(1)} MB)...` });
        const { blob } = await compressImage(file, 2048, 0.85);
        uploadFile = blob;
      }

      // 2. Upload ảnh đã nén lên server
      setUploadStatus({ loading: true, message: `Đang tải lên (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB)...` });
      const { uploadImageFile } = await import('../api/api');
      const uploaded = await uploadImageFile(uploadFile);
      const imageUrl = uploaded.url;

      // 3. Tạo design mới
      setUploadStatus({ loading: true, message: 'Đang tạo thiết kế...' });
      const design = await createDesign({
        title: file.name.replace(/\.[^.]+$/, '') || 'Photo Design',
        design_type: 'other',
        page_type: 'canvas',
        width: imgWidth,
        height: imgHeight,
      });

      // 4. Lưu URL vào sessionStorage (nhỏ gọn, không bao giờ vượt 5MB quota)
      sessionStorage.setItem(`pending_import_image_${design.id}`, imageUrl);

      setUploadStatus({ loading: false, message: '' });
      navigate(`/design/${design.id}`);
    } catch (err: any) {
      console.error('Upload image error:', err);
      setUploadStatus({ loading: false, message: '' });
      alert(`Không thể tải ảnh lên: ${err.message || 'Vui lòng thử lại.'}`);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file hình ảnh!'); return; }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/auth/update-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateAvatar(data.avatar_url);
      setAvatarToast('Cập nhật ảnh đại diện thành công!');
      setTimeout(() => setAvatarToast(''), 3000);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleDeleteDesign = async () => {
    if (!deleteModalDesign) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/designs/${deleteModalDesign.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Xóa thất bại');
      }
      setDesigns(prev => prev.filter(d => d.id !== deleteModalDesign.id));
      setDeleteModalDesign(null);
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Hàm sinh tên bản sao tự động tăng: "Tên dự án - Bản sao 1, 2, 3..."
  const generateCloneTitle = (originalTitle: string, allDesigns: any[]) => {
    // Tách phần tên gốc (nếu đang clone từ một bản sao khác)
    const baseTitleMatch = originalTitle.match(/^(.*?)( - Bản sao( \d+)?)?$/);
    const baseTitle = baseTitleMatch ? baseTitleMatch[1] : originalTitle;

    // Thoát các ký tự đặc biệt trong regex
    const escapedBaseTitle = baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedBaseTitle}( - Bản sao( (\\d+))?)?$`);

    let maxNum = 0;
    for (const d of allDesigns) {
      const match = d.title.match(regex);
      if (match) {
        if (match[3]) {
          maxNum = Math.max(maxNum, parseInt(match[3], 10));
        } else if (match[2] === '') {
           maxNum = Math.max(maxNum, 1); // " - Bản sao" ko có số thì là 1
        } else {
           maxNum = Math.max(maxNum, 0); // Chính nó
        }
      }
    }

    if (maxNum === 0) return `${baseTitle} - Bản sao`;
    return `${baseTitle} - Bản sao ${maxNum + 1}`;
  };

  const [renameModalDesign, setRenameModalDesign] = useState<any | null>(null);
  const [newDesignName, setNewDesignName] = useState('');

  const handleRenameSubmit = async () => {
    if (!renameModalDesign || !newDesignName.trim()) return;
    try {
      const res = await fetch(`/api/designs/${renameModalDesign.id}/rename`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newDesignName.trim() }),
      });
      if (!res.ok) throw new Error('Đổi tên thất bại');
      setDesigns(prev => prev.map(d => d.id === renameModalDesign.id ? { ...d, title: newDesignName.trim() } : d));
      setRenameModalDesign(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Clone design được share (shared design mà không phải của mình)
  // Canva behavior: clone vào workspace đang active (personal hoặc team)
  const handleCloneSharedDesign = async (design: any) => {
    setCloningId(design.id);
    try {
      const isInTeamWorkspace = currentWorkspace && currentWorkspace.workspace_type === 'team';
      const targetTeamId = isInTeamWorkspace ? currentWorkspace.id : null;
      const workspaceName = isInTeamWorkspace ? `nhóm "${currentWorkspace.name}"` : 'không gian cá nhân';
      const newTitle = generateCloneTitle(design.title, designs);

      const res = await fetch(`/api/teams/designs/${design.id}/clone-to-personal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetTeamId, newTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Không thể nhân bản');
      const updated = await fetchDesigns('all');
      setDesigns(updated.designs);
      alert(`Đã tạo: "${newTitle}" vào ${workspaceName}.`);
    } catch (err: any) {
      alert(`Lỗi nhân bản: ${err.message}`);
    } finally {
      setCloningId(null);
    }
  };

  // Duplicate (copy) design của chính mình (personal clone)
  const handleDuplicateMyDesign = async (design: any) => {
    setOpenMenuId(null);
    setCloningId(design.id);
    try {
      const isInTeamWorkspace = currentWorkspace && currentWorkspace.workspace_type === 'team';
      const targetTeamId = isInTeamWorkspace ? currentWorkspace.id : null;
      const newTitle = generateCloneTitle(design.title, designs);

      const res = await fetch(`/api/teams/designs/${design.id}/clone-to-personal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetTeamId, newTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Không thể sao chép');
      
      // Navigate vào design mới luôn
      navigate(`/design/${data.designId}`);
    } catch (err: any) {
      alert(`Lỗi sao chép: ${err.message}`);
    } finally {
      setCloningId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setBulkDeleteModalOpen(false);
      const result = await bulkDeleteDesigns(selectedIds);
      const deletedIds = result.deletedIds || selectedIds;
      setDesigns(prev => prev.filter(d => !deletedIds.includes(d.id)));
      setSelectedIds([]);
      if (deletedIds.length < selectedIds.length) {
        alert('Có ' + (selectedIds.length - deletedIds.length) + ' bản thiết kế không thể xóa vì bạn không phải là chủ sở hữu.');
      }
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:3000${user.avatar_url}`)
    : null;

  const NavItem = ({ icon: Icon, label, to, active, onClick }: { icon: any; label: string; to?: string; active?: boolean; onClick?: () => void }) => {
    const collapsed = isSidebarCollapsed;
    const cls = `relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 cursor-pointer group ${active ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      } ${collapsed ? 'justify-center' : ''}`;
    const inner = (
      <>
        <Icon size={20} strokeWidth={2.5} className={`shrink-0 ${active ? 'text-sky-600' : 'text-slate-500'}`} />
        {!collapsed && <span className="font-semibold text-sm truncate">{label}</span>}
        {/* Tooltip khi collapsed */}
        {collapsed && (
          <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
            {label}
          </span>
        )}
      </>
    );
    if (to) return <Link to={to} className={`w-full ${cls}`} onClick={() => setIsMobileMenuOpen(false)}>{inner}</Link>;
    return <button onClick={() => { onClick?.(); setIsMobileMenuOpen(false); }} className={`w-full ${cls}`}>{inner}</button>;
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Mobile Menu Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-pink-400 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-md">K</div>
          <h1 className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900">Kanva Pro</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* SIDEBAR */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        ${isSidebarCollapsed ? 'w-[68px]' : 'w-72'}
        bg-white border-r border-slate-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
        flex flex-col transition-all duration-300 ease-in-out overflow-hidden
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand + Toggle */}
        <div className={`h-20 flex items-center pt-4 md:pt-0 shrink-0 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-4 gap-3'}`}>
          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-md shrink-0">K</div>
          {!isSidebarCollapsed && <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 tracking-tight flex-1 truncate">Kanva Pro</h1>}
          {!isSidebarCollapsed && (
            <button onClick={() => setIsSidebarCollapsed(true)} title="Thu nhỏ sidebar"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0">
              <Menu size={18} />
            </button>
          )}
        </div>

        {/* Expand button khi collapsed */}
        {isSidebarCollapsed && (
          <button onClick={() => setIsSidebarCollapsed(false)} title="Mở rộng sidebar"
            className="mx-auto mb-2 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <Menu size={18} />
          </button>
        )}

        {/* User Avatar & Workspace Switcher */}
        <div className={`py-3 shrink-0 relative workspace-dropdown ${isSidebarCollapsed ? 'px-2 flex justify-center' : 'px-6'}`}>
          <div
            className={`relative group cursor-pointer ${isSidebarCollapsed
              ? 'w-10 h-10'
              : 'flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-sky-200 transition-colors'
              }`}
            onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
            title="Chuyển đổi Workspace"
          >
            <div className="relative shrink-0">
              {avatarSrc
                ? <img src={avatarSrc} alt="avatar" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                : <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-300 to-sky-300 flex items-center justify-center text-white font-bold shadow-sm">{user?.name?.[0]?.toUpperCase() || 'U'}</div>}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800 truncate">{currentWorkspace ? currentWorkspace.name : 'Không gian Cá nhân'}</h3>
                <p className="text-xs font-medium text-slate-500 truncate">
                  {currentWorkspace 
                    ? (currentWorkspace.is_pro ? 'Team Workspace (Pro)' : 'Team Workspace (Free)') 
                    : (isSubscriptionActive(user) ? 'Personal Workspace (Pro)' : 'Personal Workspace (Free)')}
                </p>
              </div>
            )}
            {!isSidebarCollapsed && (
               <div className="text-slate-400">▼</div>
            )}
          </div>

          <AnimatePresence>
            {isWorkspaceDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute left-6 right-6 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50"
              >
                <div className="p-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 py-1">Đổi Workspace</p>
                  <button
                    onClick={() => { switchWorkspace(null); setIsWorkspaceDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between ${!currentWorkspace ? 'bg-indigo-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span>Cá nhân {isSubscriptionActive(user) ? '(Pro)' : '(Free)'}</span>
                    {!currentWorkspace && <span className="text-indigo-600">✓</span>}
                  </button>
                  {workspaces.filter((w: any) => w.workspace_type !== 'personal').map((w: any) => (
                    <button
                      key={w.id}
                      onClick={() => { switchWorkspace(w.id); setIsWorkspaceDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between mt-1 ${currentWorkspace?.id === w.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="truncate">{w.name} {w.is_pro ? '(Pro)' : '(Free)'}</span>
                      {currentWorkspace?.id === w.id && <span className="text-indigo-600">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="p-2">
                   <button
                    onClick={() => { avatarInputRef.current?.click(); setIsWorkspaceDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Camera size={14} className="text-slate-400" />
                    Đổi ảnh đại diện
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>

        {/* Create Button */}
        <div className={`pb-4 shrink-0 ${isSidebarCollapsed ? 'px-2' : 'px-6'}`}>
          <button onClick={() => setIsCustomSizeOpen(true)}
            className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white py-3 rounded-2xl font-bold shadow-lg shadow-sky-500/30 transition-all hover:-translate-y-0.5 ${isSidebarCollapsed ? 'px-2' : 'px-4'
              }`}
            title={isSidebarCollapsed ? 'Tạo thiết kế mới' : ''}>
            <Plus size={20} strokeWidth={3} />
            {!isSidebarCollapsed && 'Tạo thiết kế mới'}
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto py-2 space-y-1 custom-scrollbar ${isSidebarCollapsed ? 'px-2' : 'px-4'}`}>
          <NavItem icon={Home} label="Trang chủ" active={activePage === 'home'} onClick={() => setActivePage('home')} />
          {(!currentWorkspace || currentWorkspace?.owner_id === user?.id) && (
            <NavItem icon={Users} label="Đội Nhóm" active={activePage === 'teams'} onClick={() => setActivePage('teams')} />
          )}
          <NavItem icon={HardDrive} label="Lưu trữ" active={activePage === 'storage'} onClick={() => setActivePage('storage')} />
          <NavItem icon={Trash2} label="Thùng rác" active={activePage === 'trash'} onClick={() => setActivePage('trash')} />
          <div className="my-3 border-t border-slate-100" />
          <NavItem icon={UserCircle2} label="Hồ sơ cá nhân" active={activePage === 'profile'} onClick={() => setActivePage('profile')} />
          {(!currentWorkspace || currentWorkspace?.owner_id === user?.id) && (
            <>
              <NavItem icon={Receipt} label="Hóa đơn & Lịch sử" active={activePage === 'billing'} onClick={() => setActivePage('billing')} />
              <NavItem icon={Crown} label="Nâng cấp tài khoản" active={activePage === 'pricing'} onClick={() => setActivePage('pricing')} />
            </>
          )}
          {(user?.role === 'admin' || user?.role === 'moderator') && (
            <NavItem icon={Shield} label="Quản trị viên" to="/admin" />
          )}

        </nav>

        {/* Footer: Plan + Storage + Logout */}
        {!isSidebarCollapsed ? (
          <div className="p-6 border-t border-slate-200 bg-slate-50/50 shrink-0">
            {!isPro ? (
              (!currentWorkspace || currentWorkspace?.owner_id === user?.id) && (

              <div className="mb-4 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-2xl border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Crown size={18} className="text-purple-600" strokeWidth={2.5} />
                  <span className="font-bold text-sm text-purple-900">
                    {currentWorkspace && currentWorkspace.workspace_type !== 'personal' ? 'Kanva Team (Free)' : 'KanvaPro Free'}
                  </span>
                </div>
                <button 
                  onClick={() => setActivePage(currentWorkspace && currentWorkspace.workspace_type !== 'personal' ? 'teams' : 'pricing')} 
                  className="block w-full text-center bg-white text-purple-600 text-xs font-bold py-2 rounded-xl border border-purple-200 hover:bg-purple-600 hover:text-white transition-colors"
                >
                  {currentWorkspace && currentWorkspace.workspace_type !== 'personal' ? 'Gia hạn nhóm' : 'Nâng cấp ngay'}
                </button>
              </div>
              )
            ) : (
              <div className="mb-4 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-2">
                <Crown size={18} className="text-emerald-600" strokeWidth={2.5} />
                <span className="font-bold text-sm text-emerald-900">{planName}</span>
              </div>
            )}
            {user && (
              <div className="mb-4" title={`Đã dùng ${formatResourceSize(storageUsedBytes)} / ${maxStorageBytes / (1024 ** 3)} GB`}>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold text-slate-500">Lưu trữ cá nhân</span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {formatResourceSize(storageUsedBytes)} / {maxStorageBytes / (1024 ** 3)}GB 
                    (DB: {user?.storage_used_bytes || '0'}, Team: {currentWorkspace?.used_storage_bytes || '0'}, CW: {currentWorkspace ? 'yes' : 'no'})
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isStorageWarning ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-400 to-indigo-500'}`} style={{ width: `${storagePercentage}%` }} />
                </div>
                {isStorageWarning && <p className="text-[10px] text-rose-500 font-medium mt-1">Sắp hết dung lượng!</p>}
              </div>
            )}
            <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-rose-500 font-bold text-sm py-2 transition-colors">
              <LogOut size={16} strokeWidth={2.5} /> Đăng xuất
            </button>
          </div>
        ) : (
          /* Collapsed footer: chỉ icon logout */
          <div className="py-4 px-2 border-t border-slate-200 flex flex-col items-center gap-3 shrink-0">
            {!isPro && (!currentWorkspace || currentWorkspace?.owner_id === user?.id) && (
              <button 
                onClick={() => setActivePage(currentWorkspace && currentWorkspace.workspace_type !== 'personal' ? 'teams' : 'pricing')} 
                title={currentWorkspace && currentWorkspace.workspace_type !== 'personal' ? "Gia hạn nhóm" : "Nâng cấp gói"}
                className="p-2 text-purple-500 hover:bg-purple-50 rounded-xl transition"
              >
                <Crown size={20} strokeWidth={2.5} />
              </button>
            )}
            <button onClick={logout} title="Đăng xuất"
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition">
              <LogOut size={20} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </aside>

      {/* OVERLAY FOR MOBILE */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* MAIN CONTENT */}
      <main
        ref={mainRef}
        className={`flex-1 flex flex-col h-screen overflow-y-auto pt-16 md:pt-0 relative custom-scrollbar bg-white ${selectionRect.visible ? 'select-none *:pointer-events-none' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-r from-[#d1f4ff] via-[#ebdfff] to-[#ffe5f1] opacity-60 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)' }} />

        {/* Marquee Selection Rectangle */}
        {selectionRect.visible && (
          <div
            style={{
              position: 'absolute',
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.8)',
              zIndex: 9999,
              pointerEvents: 'none'
            }}
          />
        )}

        <div className="relative z-10 flex-1 flex flex-col">
          {activePage === 'teams' && <TeamsPanel />}
          {activePage === 'storage' && <StoragePanel />}
          {activePage === 'trash' && <TrashPanel />}
          {activePage === 'billing' && <BillingPanel />}
          {activePage === 'pricing' && <PricingPanel />}
          {activePage === 'profile' && <ProfilePanel />}
        </div>


        {/* Chỉ hiện home content khi activePage === 'home' */}
        {activePage !== 'home' ? null : <>
          {/* Avatar toast */}
          <AnimatePresence>
            {avatarToast && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="fixed top-6 right-8 z-50 bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm">
                ✓ {avatarToast}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-[1400px] w-full mx-auto px-6 md:px-10 py-8">

            {/* Header Banner / Greeting */}
            <section className="mt-6 mb-12 relative flex flex-col items-center text-center">
              <div className="relative z-10 max-w-3xl w-full mx-auto">
                <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="text-4xl md:text-[44px] font-medium tracking-tight text-[#4c1d95] mb-8">
                  What will you design today?
                </motion.h2>
              </div>
              {/* Search bar */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
                className="relative max-w-3xl w-full mx-auto group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-[#4c1d95] transition-colors" size={20} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm thiết kế của bạn..." 
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 text-slate-800 placeholder:text-slate-400 rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-[#5E2EE1] focus:ring-4 focus:ring-[#5E2EE1]/10 transition-all font-medium text-[15px] shadow-sm" 
                />
              </motion.div>
            </section>

            <section className="mb-14 relative z-10">
              <div className="flex overflow-x-auto pt-4 pb-6 -mx-6 px-6 gap-6 md:gap-8 justify-start md:justify-center custom-scrollbar">

                {DESIGN_TEMPLATES.map((item, index) => (
                  <motion.button key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.4, ease: 'easeOut' }}
                    onClick={() => handleCreateDesign(item)}
                    className="flex flex-col items-center gap-2 group shrink-0 w-[72px]">
                    <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center ${item.color} shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1`}>
                      <item.icon size={22} className="text-white" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-600 text-center leading-tight group-hover:text-slate-900 transition-colors whitespace-nowrap">{item.label}</span>
                  </motion.button>
                ))}

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex flex-col items-center gap-2 group shrink-0 w-[72px]">
                  <button onClick={() => setIsCustomSizeOpen(!isCustomSizeOpen)}
                    className="w-[52px] h-[52px] rounded-full flex items-center justify-center bg-white border border-slate-200 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                    <Plus size={22} className="text-slate-500 group-hover:text-slate-700" />
                  </button>
                  <span className="text-[11px] font-medium text-slate-600 text-center leading-tight group-hover:text-slate-900 transition-colors whitespace-nowrap">Custom size</span>
                </motion.div>

                <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 group shrink-0 w-[72px]">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center bg-white border border-slate-200 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                    <UploadCloud size={22} className="text-slate-500 group-hover:text-slate-700" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 text-center leading-tight group-hover:text-slate-900 transition-colors whitespace-nowrap">Upload</span>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,.pdf" onChange={handleFileUpload} />
                </motion.button>

                {/* Import PPTX */}
                <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                  onClick={() => setShowImportPptx(true)}
                  className="flex flex-col items-center gap-2 group shrink-0 w-[72px]">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-rose-100 border border-orange-200 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                    <FileSliders size={22} className="text-orange-500 group-hover:text-rose-600" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 text-center leading-tight group-hover:text-slate-900 transition-colors whitespace-nowrap">Import PPTX</span>
                </motion.button>

                {/* Use template */}
                <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                  onClick={() => { setShowTemplateGallery(true); setTemplatePage(1); }}
                  className="flex flex-col items-center gap-2 group shrink-0 w-[72px]">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-fuchsia-100 border border-violet-200 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                    <Sparkles size={22} className="text-violet-500 group-hover:text-fuchsia-600" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 text-center leading-tight group-hover:text-slate-900 transition-colors whitespace-nowrap">Use template</span>
                </motion.button>
              </div>

              {/* Custom Size Dropdown */}
              <AnimatePresence>
                {isCustomSizeOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="w-full max-w-sm mt-4 bg-white shadow-xl rounded-2xl p-6 border border-slate-100">
                      <h4 className="font-bold text-slate-800 mb-4 text-sm">Tạo với kích thước tùy chỉnh</h4>
                      <div className="flex gap-4 mb-5">
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Chiều rộng (px)</label>
                          <input type="number" value={customW} onChange={e => setCustomW(Number(e.target.value))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Chiều cao (px)</label>
                          <input type="number" value={customH} onChange={e => setCustomH(Number(e.target.value))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                        </div>
                      </div>
                      <button onClick={() => { handleCreateDesign({ label: 'Custom', type: 'other', page_type: 'canvas' }, customW, customH); setIsCustomSizeOpen(false); }}
                        className="w-full bg-slate-900 text-white text-sm font-bold py-3.5 rounded-xl hover:bg-indigo-600 transition-colors shadow-md">
                        Tạo thiết kế mới
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Thiết kế gần đây */}
            <section ref={designsSectionRef} className="relative">
              <div className="flex flex-col gap-4 mb-8 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-xl md:text-2xl font-extrabold text-slate-800">Tất cả thiết kế</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 font-medium bg-white px-4 py-2 rounded-xl border border-slate-200">
                    <span>Hiển thị: </span>
                    <span className="font-bold text-indigo-600">{filteredDesigns.length} bản thiết kế</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Filter Owner */}
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      value={filterOwner}
                      onChange={(val) => { setFilterOwner(val as any); setFilterEmail(''); }}
                      options={OWNER_OPTIONS}
                      icon={<Users size={16} />}
                      className="w-[200px]"
                    />

                    {filterOwner === 'email' && (
                      <input
                        type="email"
                        placeholder="Nhập email..."
                        value={filterEmail}
                        onChange={e => setFilterEmail(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-2xl px-4 py-2.5 outline-none focus:border-indigo-500 hover:border-indigo-300 transition-colors shadow-sm w-48"
                      />
                    )}
                  </div>

                  {/* Filter Type */}
                  <CustomSelect
                    value={filterType}
                    onChange={setFilterType}
                    options={TYPE_OPTIONS}
                    icon={<Layers size={16} />}
                    className="w-[180px]"
                  />

                  {/* Sort By Date */}
                  <div className="sm:ml-auto flex items-center gap-2">
                    <CustomSelect
                      value={sortBy}
                      onChange={(val) => setSortBy(val as any)}
                      options={DATE_SORT_OPTIONS}
                      icon={<ArrowUpDown size={16} />}
                      className={`w-[150px] transition-opacity ${['date_desc', 'date_asc'].includes(sortBy) ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                    />

                    {/* Sort By Name */}
                    <CustomSelect
                      value={sortBy}
                      onChange={(val) => setSortBy(val as any)}
                      options={NAME_SORT_OPTIONS}
                      icon={<Filter size={16} />}
                      className={`w-[150px] transition-opacity ${['alpha_asc', 'alpha_desc'].includes(sortBy) ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                    />
                  </div>
                </div>
              </div>

              {filteredDesigns.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Layout size={40} className="text-slate-300" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700 mb-2">Chưa có thiết kế nào</h3>
                  <p className="text-slate-500 max-w-md mx-auto">Không tìm thấy thiết kế nào phù hợp với bộ lọc hiện tại.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {filteredDesigns.map((design, index) => (
                    <motion.div key={design.id}
                      ref={(el: HTMLDivElement | null) => {
                        if (el) designCardsRef.current.set(design.id, el);
                        else designCardsRef.current.delete(design.id);
                      }}
                      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.5, ease: 'easeOut' }}
                      className="relative group h-full">

                      {user?.id === design.user_id && (
                        <div className={`absolute top-3 left-3 z-20 transition-opacity duration-200 ${selectedIds.includes(design.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <div className="bg-white/90 backdrop-blur rounded p-1 shadow-sm">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(design.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds(prev => [...prev, design.id]);
                                else setSelectedIds(prev => prev.filter(id => id !== design.id));
                              }}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer border-slate-300"
                            />
                          </div>
                        </div>
                      )}

                      <Link to={`/design/${design.id}`}
                        className={`block bg-white rounded-[24px] overflow-hidden transition-all duration-300 ease-out border-2 h-full flex flex-col transform hover:-translate-y-1 ${selectedIds.includes(design.id)
                          ? 'border-indigo-500 shadow-md shadow-indigo-200/50'
                          : 'border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10'
                          }`}>

                        <div className="aspect-[4/3] bg-slate-50 relative flex items-center justify-center overflow-hidden border-b border-slate-100">
                          {design.thumbnail_url ? (
                            <img 
                              src={design.thumbnail_url} 
                              alt={design.title} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                              onError={(e) => {
                                // [FIX 404] Ảnh thumbnail bị xóa → hiển thị fallback icon thay vì broken image
                                (e.target as HTMLImageElement).style.display = 'none';
                                const parent = (e.target as HTMLImageElement).parentElement;
                                if (parent && !parent.querySelector('.thumb-fallback')) {
                                  const fallback = document.createElement('div');
                                  fallback.className = 'thumb-fallback absolute inset-0 flex items-center justify-center text-slate-300';
                                  fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <div className="text-slate-300 group-hover:scale-110 group-hover:text-indigo-400 transition-all duration-500">
                              {design.design_type === 'document' ? <FileText size={40} strokeWidth={1.5} /> : <Layout size={40} strokeWidth={1.5} />}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>

                        <div className="p-4 bg-white flex-1 flex flex-col justify-between">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-[14px] text-slate-800 truncate group-hover:text-indigo-600 transition-colors leading-tight flex-1">
                              {design.title}
                            </h4>
                            {user?.id !== design.user_id && (
                              design.owner_avatar ? (
                                <img
                                  src={design.owner_avatar.startsWith('http') ? design.owner_avatar : `http://localhost:3000${design.owner_avatar}`}
                                  alt="Owner avatar"
                                  title={`Sở hữu bởi: ${design.owner_email}`}
                                  className="w-6 h-6 rounded-full border border-slate-200 object-cover shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0"
                                  title={`Sở hữu bởi: ${design.owner_email}`}
                                >
                                  <UserCircle2 size={16} className="text-slate-400" />
                                </div>
                              )
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <p className="text-[11px] font-semibold text-slate-400 capitalize tracking-wide">{design.design_type.replace('_', ' ')} • {new Date(design.updated_at).toLocaleDateString()}</p>
                            {user?.id !== design.user_id && design.my_permission && (
                              <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${design.my_permission === 'editor' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {design.my_permission}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>

                      {/* 3-dot menu cho design của CHÍNH MÌNH */}
                      {user?.id === design.user_id && (
                        <div className="absolute top-3 right-3 z-10">
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(openMenuId === design.id ? null : design.id); }}
                            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:shadow-md border border-slate-100 text-slate-500 hover:text-slate-800">
                            <MoreVertical size={16} />
                          </button>

                          <AnimatePresence>
                            {openMenuId === design.id && (
                              <motion.div initial={{ opacity: 0, scale: 0.95, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute right-0 top-10 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 min-w-[170px] z-20 origin-top-right"
                                onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDuplicateMyDesign(design)}
                                  disabled={cloningId === design.id}
                                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                                  <Copy size={15} />
                                  {cloningId === design.id ? 'Đang sao chép...' : 'Sao chép thiết kế'}
                                </button>
                                <button
                                  onClick={() => { setRenameModalDesign(design); setNewDesignName(design.title); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                  <Edit3 size={15} />
                                  Đổi tên
                                </button>
                                <div className="mx-3 my-1 border-t border-slate-100" />
                                <button
                                  onClick={() => { setDeleteModalDesign(design); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 transition-colors">
                                  <Trash2 size={16} />
                                  Xóa thiết kế
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Nút Clone cho design được SHARE (không phải của mình) */}
                      {user?.id !== design.user_id && (
                        <div className="absolute top-3 right-3 z-10">
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); handleCloneSharedDesign(design); }}
                            disabled={cloningId === design.id}
                            title="Nhân bản vào không gian cá nhân"
                            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-50 hover:shadow-md border border-slate-100 text-slate-500 hover:text-indigo-600 disabled:opacity-40">
                            {cloningId === design.id
                              ? <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Spacing at bottom to ensure content isn't hidden behind floating toolbar */}
            <div className="h-24"></div>

          </div>
        </>}
      </main>

      {/* ── TEMPLATE GALLERY MODAL ──────────────────────────────────────── */}
      <AnimatePresence>
        {showTemplateGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 md:p-8"
            onClick={() => setShowTemplateGallery(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-[1000px] max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Sparkles size={20} className="text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Template Sẵn Có</h3>
                    <p className="text-sm text-slate-500 font-medium">Chọn một mẫu thiết kế để bắt đầu</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTemplateGallery(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                {templates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                    <Layout size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                    <p className="font-medium">Chưa có template nào.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {templates.slice((templatePage - 1) * templatesPerPage, templatePage * templatesPerPage).map((tpl) => (
                      <div
                        key={tpl.id}
                        onClick={() => { setPreviewTemplate(tpl); setShowTemplateGallery(false); }}
                        className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-violet-400 shadow-sm hover:shadow-xl hover:shadow-violet-500/10 transition-all duration-300 hover:-translate-y-1"
                      >
                        <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden relative">
                          {tpl.thumbnail_url ? (
                            <img
                              src={tpl.thumbnail_url}
                              alt={tpl.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                              <Layout size={24} strokeWidth={1.5} />
                              <span className="text-[10px] font-semibold uppercase tracking-widest">Template</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-violet-900/0 group-hover:bg-violet-900/10 transition-colors duration-300" />
                          {tpl.uses > 0 && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {tpl.uses} dùng
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-[13px] font-bold text-slate-700 truncate group-hover:text-violet-600 transition-colors">{tpl.title}</p>
                          <p className="text-[11px] font-semibold text-slate-400 capitalize mt-0.5">{tpl.design_type?.replace('_', ' ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {templates.length > templatesPerPage && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-center gap-2 bg-white shrink-0">
                  {Array.from({ length: Math.ceil(templates.length / templatesPerPage) }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTemplatePage(idx + 1)}
                      className={`w-8 h-8 rounded-full text-sm font-bold transition-all ${
                        templatePage === idx + 1
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TEMPLATE PREVIEW MODAL ──────────────────────────────────────── */}
      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4"
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header gradient strip */}
              <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />

              {/* Thumbnail preview */}
              <div className="relative bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center" style={{ minHeight: 220 }}>
                {previewTemplate.thumbnail_url ? (
                  <img
                    src={previewTemplate.thumbnail_url}
                    alt={previewTemplate.title}
                    className="w-full object-contain max-h-64"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-slate-300">
                    <Layout size={52} strokeWidth={1.2} />
                    <span className="text-sm font-semibold text-slate-400">Không có ảnh xem trước</span>
                  </div>
                )}
                {/* Close button */}
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="absolute top-3 right-3 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition border border-slate-100"
                >
                  <X size={16} className="text-slate-500" />
                </button>
                {/* Uses badge */}
                {previewTemplate.uses > 0 && (
                  <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Users size={10} />
                    {previewTemplate.uses} lượt sử dụng
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Sparkle badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-600 text-[11px] font-bold px-3 py-1 rounded-full border border-violet-100">
                    <Sparkles size={11} /> Template Chính Thức
                  </span>
                  {previewTemplate.category_name && (
                    <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-500 text-[11px] font-bold px-3 py-1 rounded-full border border-slate-100">
                      {previewTemplate.category_name}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-extrabold text-slate-800 leading-tight mb-1">
                  {previewTemplate.title}
                </h2>
                <p className="text-sm text-slate-500 font-medium mb-1 capitalize">
                  {previewTemplate.design_type?.replace('_', ' ')}
                  {previewTemplate.width && previewTemplate.height ? ` · ${previewTemplate.width} × ${previewTemplate.height}px` : ''}
                </p>
                {previewTemplate.description && (
                  <p className="text-sm text-slate-400 mt-2 mb-4 leading-relaxed">{previewTemplate.description}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                  >
                    Đóng
                  </button>
                  <button
                    onClick={() => handleUseTemplate(previewTemplate)}
                    disabled={usingTemplateId === previewTemplate.id}
                    className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0 flex items-center justify-center gap-2"
                  >
                    {usingTemplateId === previewTemplate.id ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang tạo bản sao...</>
                    ) : (
                      <><Sparkles size={15} /> Sử dụng Template này</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING TOOLBAR for Bulk Selection */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-[calc(50%+9rem)] -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 md:left-1/2">
            <span className="text-sm font-bold bg-white/10 px-3 py-1 rounded-lg">{selectedIds.length} đã chọn</span>
            <div className="w-px h-6 bg-slate-700"></div>
            <button onClick={handleBulkDelete} className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold text-sm transition-colors">
              <Trash2 size={18} /> Chuyển vào thùng rác
            </button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-200 text-sm font-bold ml-2 hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
              Hủy
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteModalDesign && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setDeleteModalDesign(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={28} className="text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Xóa thiết kế?</h3>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Bản thiết kế này sẽ được chuyển vào Thùng rác.</p>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-8">
                <p className="font-bold text-slate-700 truncate">"{deleteModalDesign.title}"</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteModalDesign(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">
                  Hủy
                </button>
                <button onClick={handleDeleteDesign} disabled={isDeleting}
                  className="flex-1 py-3.5 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-60 flex justify-center items-center">
                  {isDeleting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Xóa thiết kế'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BULK DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {bulkDeleteModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setBulkDeleteModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={28} className="text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Xóa {selectedIds.length} thiết kế?</h3>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Các bản thiết kế này sẽ được chuyển vào Thùng rác.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setBulkDeleteModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">
                  Hủy
                </button>
                <button onClick={confirmBulkDelete}
                  className="flex-1 py-3.5 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex justify-center items-center">
                  Xóa {selectedIds.length} mục
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RENAME MODAL */}
      <AnimatePresence>
        {renameModalDesign && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setRenameModalDesign(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] shadow-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Edit3 size={28} className="text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Đổi tên thiết kế</h3>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Nhập tên mới cho thiết kế của bạn.</p>
                </div>
              </div>
              <div className="mb-8">
                <input
                  type="text"
                  autoFocus
                  value={newDesignName}
                  onChange={e => setNewDesignName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  placeholder="Nhập tên thiết kế..."
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRenameModalDesign(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">
                  Hủy
                </button>
                <button onClick={handleRenameSubmit} disabled={!newDesignName.trim()}
                  className="flex-1 py-3.5 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60">
                  Lưu thay đổi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* IMPORT PPTX MODAL */}
      {showImportPptx && (
        <ImportPptxModal
          onClose={() => setShowImportPptx(false)}
          onSuccess={(designId) => {
            setShowImportPptx(false);
            navigate(`/design/${designId}`);
          }}
        />
      )}

      {/* UPLOAD LOADING OVERLAY */}
      <AnimatePresence>
        {uploadStatus.loading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-5"
            >
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                <div className="absolute inset-0 rounded-full border-4 border-t-sky-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <UploadCloud size={22} className="text-sky-500" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-800">Đang xử lý ảnh</p>
                <p className="text-sm text-slate-500 mt-1 font-medium">{uploadStatus.message}</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full"
                  animate={{ width: ['20%', '85%', '95%'] }}
                  transition={{ duration: 8, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

  );
}
