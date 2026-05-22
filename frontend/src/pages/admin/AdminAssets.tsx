import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAdminAssets, bulkUploadAssets, updateAsset, deleteAsset
} from '../../api/adminApi';
import {
  Search, Upload, Crown, Trash2, Edit3, X,
  Image, Type, Sticker, CheckCircle
} from 'lucide-react';

type Asset = {
  id: string; name: string; type: string; url: string;
  is_premium: boolean; tags: string[]; category_id: string;
  category_name: string; file_size: number; created_at: string;
};
type Category = { id: string; name: string };
type Toast = { msg: string; type: 'success' | 'error' } | null;

const TYPE_ICONS: Record<string, any> = { image: Image, font: Type, sticker: Sticker };

export default function AdminAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [premiumFilter, setPremiumFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState({ name: '', tags: '', is_premium: false, category_id: '' });
  // Upload form
  const [uploadForm, setUploadForm] = useState({
    type: 'image', tags: '', is_premium: false, category_id: ''
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const LIMIT = 30;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminAssets({ page, limit: LIMIT, type: typeFilter, search, is_premium: premiumFilter });
      setAssets(data.assets || []);
      setTotal(data.total || 0);
      setCategories(data.categories || []);
    } catch { showToast('Failed to load assets', 'error'); }
    finally { setLoading(false); }
  }, [page, search, typeFilter, premiumFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, typeFilter, premiumFilter]);

  /* ── Upload ── */
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setPendingFiles(prev => [...prev, ...Array.from(files)]);
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      pendingFiles.forEach(f => fd.append('files', f));
      fd.append('type', uploadForm.type);
      fd.append('tags', uploadForm.tags);
      fd.append('is_premium', String(uploadForm.is_premium));
      if (uploadForm.category_id) fd.append('category_id', uploadForm.category_id);

      const result = await bulkUploadAssets(fd);
      showToast(`✅ Uploaded ${result.inserted} assets!`);
      setPendingFiles([]);
      load();
    } catch { showToast('Upload failed', 'error'); }
    finally { setUploading(false); setUploadProgress(100); }
  };

  /* ── Edit ── */
  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setEditForm({
      name: a.name, tags: (a.tags || []).join(', '),
      is_premium: a.is_premium, category_id: a.category_id || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editAsset) return;
    try {
      await updateAsset(editAsset.id, {
        name: editForm.name,
        tags: editForm.tags,
        is_premium: editForm.is_premium,
        category_id: editForm.category_id || undefined,
      });
      showToast('Asset updated!');
      setEditAsset(null);
      load();
    } catch { showToast('Update failed', 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset permanently?')) return;
    try {
      await deleteAsset(id);
      showToast('Asset deleted');
      load();
    } catch { showToast('Delete failed', 'error'); }
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

        {/* Upload config */}
        <div style={{ display: 'flex', gap: 12, padding: '0 20px 16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 160px' }}>
            <label className="admin-label">Asset Type</label>
            <select className="admin-form-select" value={uploadForm.type}
              onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}>
              <option value="image">🖼 Image</option>
              <option value="sticker">🎨 Sticker</option>
              <option value="font">🔤 Font</option>
            </select>
          </div>
          <div style={{ flex: '0 0 200px' }}>
            <label className="admin-label">Tags (comma separated)</label>
            <input className="admin-input" placeholder="nature, summer, blue…"
              value={uploadForm.tags}
              onChange={e => setUploadForm(f => ({ ...f, tags: e.target.value }))} />
          </div>
          <div style={{ flex: '0 0 180px' }}>
            <label className="admin-label">Category</label>
            <select className="admin-form-select" value={uploadForm.category_id}
              onChange={e => setUploadForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <label className="admin-toggle">
              <input type="checkbox" checked={uploadForm.is_premium}
                onChange={e => setUploadForm(f => ({ ...f, is_premium: e.target.checked }))} />
              <div className="admin-toggle-track" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <Crown size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                Pro Only
              </span>
            </label>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`admin-upload-zone ${dragOver ? 'dragover' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="admin-upload-icon">🗂️</div>
          <div className="admin-upload-text">Drop files here or click to browse</div>
          <div className="admin-upload-hint">Supports PNG, JPG, SVG, WEBP, TTF, OTF • Max 50MB each</div>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.ttf,.otf,.woff"
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
          <select className="admin-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="image">Image</option>
            <option value="sticker">Sticker</option>
            <option value="font">Font</option>
          </select>
          <select className="admin-select" value={premiumFilter} onChange={e => setPremiumFilter(e.target.value)}>
            <option value="">All Tiers</option>
            <option value="true">Pro Only</option>
            <option value="false">Free</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Tags</th>
                <th>Tier</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                  <div className="admin-spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="admin-empty">
                    <span className="admin-empty-icon">🖼️</span>
                    <span className="admin-empty-text">No assets found</span>
                  </div>
                </td></tr>
              ) : assets.map(a => {
                const TypeIcon = TYPE_ICONS[a.type] || Image;
                return (
                  <tr key={a.id}>
                    <td>
                      {a.type === 'image' || a.type === 'sticker' ? (
                        <img src={a.url} alt={a.name}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, background: 'var(--bg-hover)' }}
                          onError={e => { (e.target as any).style.display = 'none'; }} />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 6,
                          background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <TypeIcon size={20} color="var(--text-muted)" />
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.name}</td>
                    <td>
                      <span className="badge badge-free" style={{ textTransform: 'capitalize' }}>
                        <TypeIcon size={10} /> {a.type}
                      </span>
                    </td>
                    <td>{a.category_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(a.tags || []).slice(0, 3).map(t => (
                          <span key={t} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--bg-hover)', color: 'var(--text-muted)'
                          }}>{t}</span>
                        ))}
                        {(a.tags || []).length > 3 && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{a.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {a.is_premium
                        ? <span className="badge badge-premium"><Crown size={10} /> Pro</span>
                        : <span className="badge badge-free">Free</span>
                      }
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {a.file_size ? `${(a.file_size / 1024).toFixed(0)} KB` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(a)}>
                          <Edit3 size={13} />
                        </button>
                        <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleDelete(a.id)}>
                          <Trash2 size={13} />
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
              <label className="admin-label">Tags (comma separated)</label>
              <input className="admin-input" value={editForm.tags}
                onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Category</label>
              <select className="admin-form-select" value={editForm.category_id}
                onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
