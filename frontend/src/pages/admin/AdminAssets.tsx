import { useState, useEffect, useCallback, useRef } from 'react';
import AdminSelect from './AdminSelect';
import {
  fetchAdminAssets, bulkUploadAssets, updateAsset, toggleAssetActive
} from '../../api/adminApi';
import {
  Search, Upload, Crown, Edit3, X,
  Image, Type, Sticker, CheckCircle, CheckSquare, Square, EyeOff, Eye
} from 'lucide-react';

type Asset = {
  id: string; name: string; type: string; url: string;
  is_premium: boolean; is_active: boolean; tags: string[];
  file_size: number; created_at: string;
};
type Toast = { msg: string; type: 'success' | 'error' } | null;

const TYPE_ICONS: Record<string, any> = { image: Image, font: Type, sticker: Sticker };

export default function AdminAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [premiumFilter, setPremiumFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState({ name: '', is_premium: false });

  // ── Multi-select state ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // Drag-select refs
  const isDragging = useRef(false);
  const dragSelectMode = useRef<'add' | 'remove'>('add');
  const lastDragRow = useRef<string | null>(null);

  // Upload form
  const [uploadForm, setUploadForm] = useState({
    type: 'image', is_premium: false
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fontPreviews, setFontPreviews] = useState<Record<string, string>>({});  // assetId -> objectURL
  const LIMIT = 30;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminAssets({ page, limit: LIMIT, type: typeFilter, search, is_premium: premiumFilter, is_active: activeFilter });
      setAssets(data.assets || []);
      setTotal(data.total || 0);
    } catch { showToast('Failed to load assets', 'error'); }
    finally { setLoading(false); }
  }, [page, search, typeFilter, premiumFilter, activeFilter]);

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      await toggleAssetActive(id);
      showToast(currentState ? '🔕 Asset đã bị ẩn khỏi editor' : '✅ Asset đã được kích hoạt lại');
      load();
    } catch { showToast('Toggle failed', 'error'); }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, typeFilter, premiumFilter, activeFilter]);

  // Load @font-face cho font assets để preview được tên thật
  useEffect(() => {
    assets.forEach(a => {
      if (a.type !== 'font') return;
      if (fontPreviews[a.id]) return; // đã load rồi
      const url = a.url.startsWith('http') ? a.url : `http://localhost:3000${a.url}`;
      const style = document.createElement('style');
      style.textContent = `@font-face { font-family: "font-${a.id}"; src: url("${url}"); }`;
      document.head.appendChild(style);
      setFontPreviews(prev => ({ ...prev, [a.id]: `font-${a.id}` }));
    });
  }, [assets]);

  /* ── Upload ── */
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    
    // Lọc file theo Asset Type đang chọn
    const isFontMode = uploadForm.type === 'font';
    const validFiles = fileArray.filter(file => {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      const isFontFile = ['.ttf', '.otf', '.woff', '.woff2'].includes(ext);
      
      if (isFontMode) return isFontFile; // Đang chọn Font -> phải là font file
      else return !isFontFile && file.type.startsWith('image/'); // Ảnh/Sticker -> phải là ảnh, ko phải font
    });

    if (validFiles.length < fileArray.length) {
      showToast(`Có ${fileArray.length - validFiles.length} file không hợp lệ với loại "${uploadForm.type}" đã bị loại bỏ!`, 'error');
    }

    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      pendingFiles.forEach(f => fd.append('files', f));
      fd.append('type', uploadForm.type);
      fd.append('is_premium', String(uploadForm.is_premium));
      const result = await bulkUploadAssets(fd);
      showToast(`✅ Uploaded ${result.inserted} assets!`);
      setPendingFiles([]);
      load();
    } catch { showToast('Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  /* ── Edit ── */
  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setEditForm({
      name: a.name,
      is_premium: a.is_premium
    });
  };

  const handleSaveEdit = async () => {
    if (!editAsset) return;
    try {
      await updateAsset(editAsset.id, {
        name: editForm.name,
        is_premium: editForm.is_premium,
      });
      showToast('Asset updated!');
      setEditAsset(null);
      load();
    } catch { showToast('Update failed', 'error'); }
  };


  /* ── Multi-select helpers ── */
  const allIds = assets.map(a => a.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  // ── Drag-select handlers ──────────────────────────────────────────────────
  const handleCheckboxMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // prevent text selection while dragging
    isDragging.current = true;
    lastDragRow.current = id;
    // Determine mode: if already selected → drag to remove; else → drag to add
    dragSelectMode.current = selectedIds.has(id) ? 'remove' : 'add';
    toggleOne(id);
  };

  const handleRowMouseEnter = (id: string) => {
    if (!isDragging.current || lastDragRow.current === id) return;
    lastDragRow.current = id;
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (dragSelectMode.current === 'add') s.add(id);
      else s.delete(id);
      return s;
    });
  };

  useEffect(() => {
    const stop = () => { isDragging.current = false; lastDragRow.current = null; };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  /* ── Bulk actions ── */
  const bulkSetPremium = async (value: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => updateAsset(id, { is_premium: value }))
      );
      showToast(`✅ Set ${selectedIds.size} asset(s) to ${value ? 'Pro' : 'Free'}`);
      setSelectedIds(new Set());
      load();
    } catch { showToast('Bulk update failed', 'error'); }
    finally { setBulkLoading(false); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Asset Library</h1>
          <p className="admin-page-subtitle">{total.toLocaleString()} system assets</p>
        </div>
      </div>

      {/* ── Upload Zone ── */}
      <div className="admin-table-card" style={{ marginBottom: 20 }}>
        <div className="admin-table-toolbar">
          <span className="admin-table-title">📦 Bulk Upload Assets</span>
          {pendingFiles.length > 0 && (
            <button className="admin-btn admin-btn-primary" onClick={handleUpload} disabled={uploading}>
              <Upload size={14} />
              {uploading ? `Uploading…` : `Upload ${pendingFiles.length} file(s)`}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '16px 20px 16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 180px' }}>
            <label className="admin-label">Asset Type</label>
            <AdminSelect
              value={uploadForm.type}
              onChange={v => setUploadForm(f => ({ ...f, type: v }))}
              options={[
                { value: 'image', label: '🖼 Image' },
                { value: 'sticker', label: '🎨 Sticker' },
                { value: 'font', label: '🔤 Font' },
              ]}
            />
          </div>
          <div style={{ paddingBottom: 8 }}>
            <label className="admin-toggle">
              <input type="checkbox" checked={uploadForm.is_premium}
                onChange={e => setUploadForm(f => ({ ...f, is_premium: e.target.checked }))} />
              <div className="admin-toggle-track" />
              <span style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Crown size={14} style={{ color: '#f59e0b' }} />
                Pro Only
              </span>
            </label>
          </div>
        </div>
        <div
          className={`admin-upload-zone ${dragOver ? 'dragover' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="admin-upload-icon">🗂️</div>
          <div className="admin-upload-text">Drop files here or click to browse</div>
          <div className="admin-upload-hint">
            {uploadForm.type === 'font' 
              ? 'Supports TTF, OTF, WOFF, WOFF2 • Max 50MB each' 
              : 'Supports PNG, JPG, SVG, WEBP, GIF • Max 50MB each'}
          </div>
          <input ref={fileInputRef} type="file" multiple 
            accept={uploadForm.type === 'font' ? '.ttf,.otf,.woff,.woff2' : 'image/*'}
            style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        </div>
        {pendingFiles.length > 0 && (
          <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pendingFiles.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--bg-hover)', borderRadius: 6, padding: '4px 10px',
                fontSize: 12, color: 'var(--text-secondary)'
              }}>
                <CheckCircle size={12} color="var(--accent-green)" />
                {f.name}
                <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Assets Table ── */}
      <div className="admin-table-card">
        <div className="admin-table-toolbar">
          <span className="admin-table-title">System Assets</span>
          <div className="admin-search">
            <Search size={14} color="var(--text-muted)" />
            <input placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <AdminSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: 'All Types' },
              { value: 'image', label: 'Image' },
              { value: 'sticker', label: 'Sticker' },
              { value: 'font', label: 'Font' },
            ]}
          />
          <AdminSelect
            value={premiumFilter}
            onChange={setPremiumFilter}
            options={[
              { value: '', label: 'All Tiers' },
              { value: 'true', label: 'Pro Only' },
              { value: 'false', label: 'Free' },
            ]}
          />
          <AdminSelect
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { value: '', label: 'All Status' },
              { value: 'true', label: '✅ Active' },
              { value: 'false', label: '🔕 Deactivated' },
            ]}
          />
        </div>

        {/* ── Bulk Action Bar (animated) ── */}
        {someSelected && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
            borderBottom: '1px solid rgba(99,102,241,0.2)',
            animation: 'bulkBarIn 0.2s ease',
          }}>
            <style>{`
              @keyframes bulkBarIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
            `}</style>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => bulkSetPremium(true)}
              disabled={bulkLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                color: 'white', fontSize: 12, fontWeight: 700,
                opacity: bulkLoading ? 0.6 : 1,
              }}
            >
              <Crown size={12} /> Set Pro
            </button>
            <button
              onClick={() => bulkSetPremium(false)}
              disabled={bulkLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card)', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
                opacity: bulkLoading ? 0.6 : 1,
              }}
            >
              Set Free
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-muted)',
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ userSelect: 'none' }}>
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th style={{ width: 40 }}>
                  <button
                    onClick={toggleAll}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                    title={allSelected ? 'Deselect all' : 'Select all'}
                  >
                    {allSelected
                      ? <CheckSquare size={16} color="var(--accent)" />
                      : someSelected
                        ? <CheckSquare size={16} color="var(--accent)" style={{ opacity: 0.5 }} />
                        : <Square size={16} />
                    }
                  </button>
                </th>
                <th>Preview</th>
                <th>Name</th>
                <th>Type</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                  <div className="admin-spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="admin-empty">
                    <span className="admin-empty-icon">🖼️</span>
                    <span className="admin-empty-text">No assets found</span>
                  </div>
                </td></tr>
              ) : assets.map(a => {
                const TypeIcon = TYPE_ICONS[a.type] || Image;
                const isSelected = selectedIds.has(a.id);
                return (
                  <tr
                    key={a.id}
                    onMouseEnter={() => handleRowMouseEnter(a.id)}
                    style={{
                      background: isSelected
                        ? 'rgba(99,102,241,0.08)'
                        : !a.is_active
                          ? 'rgba(239,68,68,0.04)'
                          : undefined,
                      cursor: 'default',
                      transition: 'background 0.1s',
                      opacity: a.is_active ? 1 : 0.55,
                    }}
                  >
                    {/* Checkbox cell — drag starts here */}
                    <td>
                      <button
                        onMouseDown={e => handleCheckboxMouseDown(e, a.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                          display: 'flex', padding: 0,
                        }}
                      >
                        {isSelected
                          ? <CheckSquare size={16} color="var(--accent)" />
                          : <Square size={16} />
                        }
                      </button>
                    </td>
                    <td>
                      {a.type === 'image' || a.type === 'sticker' ? (
                        <img src={a.url} alt={a.name}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, background: 'var(--bg-hover)' }}
                          onError={e => { (e.target as any).style.display = 'none'; }} />
                      ) : a.type === 'font' ? (
                        <div style={{
                          width: 48, height: 48, borderRadius: 6,
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: fontPreviews[a.id] || 'serif',
                          fontSize: 22, color: 'white', fontWeight: 700, letterSpacing: -1,
                        }}>Aa</div>
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 6,
                          background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <TypeIcon size={20} color="var(--text-muted)" />
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {a.type === 'font' && fontPreviews[a.id] ? (
                        <span>
                          <span style={{ display: 'block', fontSize: 13 }}>{a.name}</span>
                          <span style={{ fontFamily: fontPreviews[a.id], fontSize: 16, color: 'var(--text-secondary)' }}>AaBbCc 123</span>
                        </span>
                      ) : a.name}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      <div className="badge badge-free" style={{ gap: 4, padding: '4px 8px' }}>
                        <TypeIcon size={12} /> {a.type}
                      </div>
                    </td>
                    <td>
                      {a.is_premium
                        ? <span className="badge badge-premium"><Crown size={10} /> Pro</span>
                        : <span className="badge badge-free">Free</span>
                      }
                    </td>
                    <td>
                      {a.is_active
                        ? <span className="badge badge-free" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)' }}>
                            <Eye size={10} /> Active
                          </span>
                        : <span className="badge badge-free" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }}>
                            <EyeOff size={10} /> Deactivated
                          </span>
                      }
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {a.file_size ? `${(a.file_size / 1024).toFixed(0)} KB` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          onClick={() => handleToggleActive(a.id, a.is_active)}
                          title={a.is_active ? 'Deactivate (ẩn khỏi editor)' : 'Activate (hiện lại)'}
                          style={{ color: a.is_active ? '#f59e0b' : '#10b981' }}
                        >
                          {a.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(a)}>
                          <Edit3 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="admin-pagination">
          <span className="admin-pagination-info">
            Showing {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total}
          </span>
          <div className="admin-pagination-btns">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editAsset && (
        <div className="admin-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditAsset(null); }}>
          <div className="admin-modal">
            <h2 className="admin-modal-title">✏️ Edit Asset</h2>
            <div className="admin-form-group">
              <label className="admin-label">Name</label>
              <input className="admin-input" value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-toggle">
                <input type="checkbox" checked={editForm.is_premium}
                  onChange={e => setEditForm(f => ({ ...f, is_premium: e.target.checked }))} />
                <div className="admin-toggle-track" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Crown size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                  Requires Pro Plan
                </span>
              </label>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setEditAsset(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSaveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
