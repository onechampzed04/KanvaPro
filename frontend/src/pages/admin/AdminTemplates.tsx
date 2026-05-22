import { useState, useEffect, useCallback } from 'react';
import { fetchAdminDesigns, publishTemplate, unpublishTemplate } from '../../api/adminApi';
import { Search, Globe, GlobeLock, RefreshCw, Eye, CheckCircle2 } from 'lucide-react';

type Design = {
  id: string; title: string; design_type: string; width: number; height: number;
  user_name: string; user_email: string; updated_at: string; is_published: boolean;
  thumbnail_url: string;
};
type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function AdminTemplates() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmDesign, setConfirmDesign] = useState<Design | null>(null);
  const LIMIT = 20;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDesigns({ page, limit: LIMIT, search });
      setDesigns(data.designs || []);
    } catch { showToast('Failed to load designs', 'error'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const handlePublish = async (design: Design) => {
    try {
      await publishTemplate(design.id);
      showToast(`✅ "${design.title}" published as template!`);
      load();
    } catch { showToast('Publish failed', 'error'); }
    setConfirmDesign(null);
  };

  const handleUnpublish = async (design: Design) => {
    try {
      await unpublishTemplate(design.id);
      showToast(`Template "${design.title}" unpublished`);
      load();
    } catch { showToast('Unpublish failed', 'error'); }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Template Management</h1>
          <p className="admin-page-subtitle">Review designs and publish them as public templates</p>
        </div>
        <button className="admin-btn admin-btn-ghost" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-toolbar">
          <span className="admin-table-title">All Designs</span>
          <div className="admin-search">
            <Search size={14} color="var(--text-muted)" />
            <input
              placeholder="Search by title or author…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thumbnail</th>
                <th>Title</th>
                <th>Type</th>
                <th>Dimensions</th>
                <th>Author</th>
                <th>Last Modified</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                  <div className="admin-spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : designs.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="admin-empty">
                    <span className="admin-empty-icon">🎨</span>
                    <span className="admin-empty-text">No designs found</span>
                  </div>
                </td></tr>
              ) : designs.map(d => (
                <tr key={d.id}>
                  <td>
                    {d.thumbnail_url ? (
                      <img src={d.thumbnail_url} alt={d.title}
                        style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6, background: 'var(--bg-hover)' }} />
                    ) : (
                      <div style={{
                        width: 64, height: 44, borderRadius: 6, background: 'var(--bg-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                      }}>🎨</div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600, maxWidth: 200 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.title}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-free" style={{ textTransform: 'capitalize' }}>
                      {d.design_type || 'design'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {d.width && d.height ? `${d.width} × ${d.height}` : '—'}
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{d.user_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.user_email}</div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(d.updated_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td>
                    {d.is_published
                      ? <span className="badge badge-active">
                          <CheckCircle2 size={10} /> Published
                        </span>
                      : <span className="badge badge-free">Draft</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {d.is_published ? (
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => handleUnpublish(d)}
                          title="Remove from public templates"
                        >
                          <GlobeLock size={13} /> Unpublish
                        </button>
                      ) : (
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => setConfirmDesign(d)}
                          title="Publish as public template"
                        >
                          <Globe size={13} /> Publish
                        </button>
                      )}
                      <a
                        href={`/design/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        title="Preview design"
                      >
                        <Eye size={13} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin-pagination">
          <span className="admin-pagination-info">Page {page}</span>
          <div className="admin-pagination-btns">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button
              disabled={designs.length < LIMIT}
              onClick={() => setPage(p => p + 1)}
            >Next →</button>
          </div>
        </div>
      </div>

      {/* Confirm Publish Modal */}
      {confirmDesign && (
        <div className="admin-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDesign(null); }}>
          <div className="admin-modal">
            <h2 className="admin-modal-title">🚀 Publish Template</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              You're about to publish <strong style={{ color: 'var(--text-primary)' }}>"{confirmDesign.title}"</strong> as
              a public template. All users will be able to clone and use this design.
            </p>
            <div style={{
              marginTop: 16, padding: 12, background: 'var(--bg-hover)',
              borderRadius: 8, border: '1px solid var(--border)'
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Design by: {confirmDesign.user_name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Type: {confirmDesign.design_type} · {confirmDesign.width}×{confirmDesign.height}px
              </p>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirmDesign(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={() => handlePublish(confirmDesign)}>
                <Globe size={14} /> Publish Now
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
