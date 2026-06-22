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
          <h1 className="admin-page-title">Quản lý Mẫu thiết kế</h1>
          <p className="admin-page-subtitle">Duyệt và xuất bản các thiết kế thành mẫu công khai</p>
        </div>
        <button className="admin-btn admin-btn-ghost" onClick={load}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-toolbar">
          <span className="admin-table-title">Tất cả thiết kế</span>
          <div className="admin-search">
            <Search size={14} color="var(--text-muted)" />
            <input
              placeholder="Tìm kiếm theo tiêu đề hoặc tác giả…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ảnh thu nhỏ</th>
                <th>Tiêu đề</th>
                <th>Loại</th>
                <th>Kích thước</th>
                <th>Tác giả</th>
                <th>Cập nhật lần cuối</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
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
                    <span className="admin-empty-text">Không tìm thấy thiết kế nào</span>
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
                          <CheckCircle2 size={10} /> Đã xuất bản
                        </span>
                      : <span className="badge badge-free">Bản nháp</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {d.is_published ? (
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => handleUnpublish(d)}
                          title="Gỡ khỏi mẫu công khai"
                        >
                          <GlobeLock size={13} /> Gỡ xuống
                        </button>
                      ) : (
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => setConfirmDesign(d)}
                          title="Xuất bản làm mẫu công khai"
                        >
                          <Globe size={13} /> Xuất bản
                        </button>
                      )}
                      <a
                        href={`/design/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        title="Xem trước thiết kế"
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
          <span className="admin-pagination-info">Trang {page}</span>
          <div className="admin-pagination-btns">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
            <button
              disabled={designs.length < LIMIT}
              onClick={() => setPage(p => p + 1)}
            >Sau →</button>
          </div>
        </div>
      </div>

      {/* Confirm Publish Modal */}
      {confirmDesign && (
        <div className="admin-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDesign(null); }}>
          <div className="admin-modal">
            <h2 className="admin-modal-title">🚀 Xuất bản Mẫu</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Bạn sắp xuất bản <strong style={{ color: 'var(--text-primary)' }}>"{confirmDesign.title}"</strong> thành
              một mẫu công khai. Tất cả người dùng sẽ có thể sao chép và sử dụng thiết kế này.
            </p>
            <div style={{
              marginTop: 16, padding: 12, background: 'var(--bg-hover)',
              borderRadius: 8, border: '1px solid var(--border)'
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Thiết kế bởi: {confirmDesign.user_name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Loại: {confirmDesign.design_type} · {confirmDesign.width}×{confirmDesign.height}px
              </p>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirmDesign(null)}>Hủy</button>
              <button className="admin-btn admin-btn-primary" onClick={() => handlePublish(confirmDesign)}>
                <Globe size={14} /> Xuất bản ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
