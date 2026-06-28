// frontend/src/api/api.ts

const BASE_URL = '/api'; // Sử dụng Proxy của Vite

// ─── Refresh Token Interceptor ────────────────────────────────────────────────
//
// Cơ chế:
//   1. Mọi fetch đi qua apiFetch()
//   2. Nếu response trả về 401 → tự động gọi POST /api/auth/refresh-token
//      (cookie refreshToken được gửi kèm nhờ credentials: 'include')
//   3. Nếu refresh OK → lưu access token mới → retry request gốc 1 lần
//   4. Nếu refresh fail (cookie hết hạn) → xóa localStorage → redirect /login
//
// isRefreshing + pendingQueue: tránh race condition khi nhiều request
// đồng thời bị 401 (chỉ gọi refresh 1 lần, queue các request còn lại)

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

const processQueue = (error: any, token: string | null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  pendingQueue = [];
};

/**
 * Gọi endpoint refresh-token, lấy Access Token mới.
 * refreshToken nằm trong HttpOnly Cookie → tự động gửi kèm qua credentials: 'include'
 */
const callRefreshToken = async (): Promise<string> => {
  const res = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    credentials: 'include', // Gửi kèm HttpOnly Cookie
  });
  if (!res.ok) throw new Error('REFRESH_FAILED');
  const data = await res.json();
  return data.token as string;
};

/**
 * apiFetch — wrapper thay thế fetch() có tích hợp interceptor 401.
 * Dùng thay cho fetch() trong toàn bộ api.ts
 */
export const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  // Lần gọi đầu tiên
  let response = await fetch(input, {
    ...init,
    credentials: 'include', // Đảm bảo cookie refreshToken luôn được gửi
  });

  // Chỉ intercept 401, bỏ qua các lỗi khác
  if (response.status !== 401) return response;

  // Nếu đang có refresh đang chạy → đưa vào queue chờ
  if (isRefreshing) {
    return new Promise<Response>((resolve, reject) => {
      pendingQueue.push({
        resolve: async (newToken) => {
          const retryInit = injectToken(init, newToken);
          resolve(fetch(input, { ...retryInit, credentials: 'include' }));
        },
        reject,
      });
    });
  }

  // Bắt đầu quá trình refresh
  isRefreshing = true;

  try {
    const newToken = await callRefreshToken();
    localStorage.setItem('token', newToken); // Lưu Access Token mới
    processQueue(null, newToken);

    // Retry request gốc với token mới
    const retryInit = injectToken(init, newToken);
    return fetch(input, { ...retryInit, credentials: 'include' });
  } catch (err) {
    // Refresh Token hết hạn → force logout
    processQueue(err, null);
    localStorage.removeItem('token');
    localStorage.removeItem('kanva_workspaces');
    localStorage.removeItem('kanva_current_workspace_id');
    // Phát sự kiện để AuthContext bắt và cập nhật state (không reload ngay)
    window.dispatchEvent(new CustomEvent('auth:session_expired'));
    // Sau đó mới redirect về login
    setTimeout(() => { window.location.href = '/login'; }, 100);
    throw err;
  } finally {
    isRefreshing = false;
  }
};

/** Thêm / thay thế Authorization header trong init */
const injectToken = (init: RequestInit | undefined, token: string): RequestInit => {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
};

// ─── Helpers dùng token từ localStorage ───────────────────────────────────────
// getHeaders / getWorkspaceHeaders vẫn giữ để backward-compatible
// (dùng trong apiFetch → header được truyền vào init)

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// ─── [WORKSPACE] Helper tự động đính kèm X-Workspace-Id ─────────────────────
// Mọi API gọi trong ngữ cảnh Workspace phải dùng hàm này thay vì getHeaders()
export const getWorkspaceHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  const workspaceId = localStorage.getItem('kanva_current_workspace_id');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };
};

// ==========================================
// HÀM MỚI: UPLOAD ẢNH LÊN SERVER (thay thế Base64)
// ==========================================
/**
 * Upload file ảnh lên server, nhận về URL tĩnh để gán vào element.src.
 * Sử dụng thay cho FileReader.readAsDataURL() để tránh lưu Base64 trong DB.
 */
export const uploadImageFile = async (file: File): Promise<{ url: string; assetId?: string; width?: number; height?: number }> => {
  const token = localStorage.getItem('token');
  const workspaceId = localStorage.getItem('kanva_current_workspace_id');
  const formData = new FormData();
  formData.append('image', file);

  const response = await apiFetch('/api/assets/upload-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // ─── [WORKSPACE] Đính kèm Workspace hiện tại để Backend biết trừ quota đúng chỗ
      ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to upload image');
  }

  // Phát sự kiện để cập nhật thanh dung lượng ở frontend (real-time không cần F5)
  window.dispatchEvent(new Event('storage:updated'));

  return response.json(); // Trả về { url, assetId, name, width, height }
};


/**
 * Upload blob thumbnail (từ stage.toBlob()) lên server cho 1 page.
 * Gọi âm thầm sau mỗi lần chuyển trang - không nhồi vào payload JSON lưu design.
 */
export const uploadPageThumbnail = async (blob: Blob, pageId: string): Promise<string> => {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('thumbnail', blob, `thumb_${pageId}.png`);
  formData.append('pageId', pageId);

  const response = await apiFetch('/api/assets/upload-thumbnail', {
    method: 'POST',
    headers: {
      // [FIX] Thêm Authorization header — endpoint yêu cầu authenticate middleware
      // Thiếu header này dẫn đến 401 Unauthorized, upload luôn fail silently
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) return ''; // Thất bại âm thầm, không làm hỏng luồng chính
  const data = await response.json();
  return data.url || '';
};

// 1. Lấy danh sách thiết kế
export const fetchDesigns = async (tab: string = 'my_designs') => {
  const response = await apiFetch(`${BASE_URL}/designs/my?tab=${tab}`, {
    headers: getWorkspaceHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch designs');
  return response.json();
};

// 2. Tạo thiết kế mới (API mới)
export const createDesign = async (designData: {
  title: string,
  design_type: string,
  page_type: string,
  width: number | null,
  height: number | null,
  team_id?: string | null
}) => {
  const response = await apiFetch(`${BASE_URL}/designs`, {
    method: 'POST',
    headers: getWorkspaceHeaders(),
    body: JSON.stringify(designData),
  });

  if (!response.ok) throw new Error('Failed to create design');
  return response.json();
};

export const saveDesign = async (designId: string, payload: any) => {
  const token = localStorage.getItem('token');
  const response = await apiFetch(`/api/designs/${designId}/save`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return response.json();
};

export const updateDesignFull = async (designId: string, data: { title: string, pages: any[], version?: string | number | null, thumbnail_url?: string }) => {
  const token = localStorage.getItem('token');
  const response = await apiFetch(`/api/designs/${designId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    // === FIX: N\u00e9m l\u1ed7i c\u00f3 status \u0111\u1ec3 catch block ph\u00e2n bi\u1ec7t 409 Conflict ===
    const errBody = await response.json().catch(() => ({}));
    const err: any = new Error(errBody.error || `Failed to save design (HTTP ${response.status})`);
    err.status = response.status;
    err.body = errBody;
    throw err;
  }
  return response.json();
};

export const createDesignVersion = async (designId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/versions`, { method: 'POST', headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to create version');
  return res.json();
};

export const fetchDesignVersions = async (designId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/versions`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch versions');
  return res.json();
};

export const fetchDesignVersionSnapshot = async (designId: string, versionId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/versions/${versionId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch version snapshot');
  return res.json();
};

export const restoreDesignVersion = async (designId: string, versionId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/versions/${versionId}/restore`, { method: 'POST', headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to restore version');
  return res.json();
};

// ==========================================
// HÀM MỚI: UPLOAD VIDEO ĐỂ XUẤT FILE MP4
// ==========================================
// ==========================================
// HÀM MỚI: UPLOAD VIDEO ĐỂ XUẤT FILE MP4 (GIẢI MÃ BASE64)
// ==========================================
export const uploadVideoForExport = async (videoBlob: Blob): Promise<Blob> => {
  const formData = new FormData();
  formData.append('video', videoBlob, 'export.webm');

  try {
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiFetch('/api/designs/export/video', {
      method: 'POST',
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    // 🔥 CHỐNG VITE PROXY: Nhận JSON thay vì Blob để không bị đứt đường truyền
    const json = await response.json();
    if (!json.success || !json.data) {
      throw new Error('Dữ liệu trả về không hợp lệ');
    }

    // Giải mã chuỗi Base64 dài loằng ngoằng về lại thành File MP4
    const binaryString = window.atob(json.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: 'video/mp4' });

  } catch (error) {
    console.error('Failed to upload and convert video:', error);
    throw error;
  }
};

// ==========================================
// ADMIN: SUBSCRIPTION Subscriptions CRUD
// ==========================================

// Lấy toàn bộ gói cước (Dành cho trang Admin)
export const fetchAllAdminSubscriptions = async () => {
  const res = await apiFetch('/api/subscriptions', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (!res.ok) throw new Error('Lỗi lấy danh sách Subscriptions admin');
  return res.json();
};

// Tạo gói mới
export const createSubscription = async (subscriptionData: any) => {
  const res = await apiFetch('/api/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(subscriptionData)
  });
  if (!res.ok) throw new Error('Lỗi tạo gói cước');
  return res.json();
};

// Cập nhật gói
export const updateSubscription = async (id: string, subscriptionData: any) => {
  const res = await apiFetch(`/api/subscriptions/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(subscriptionData)
  });
  if (!res.ok) throw new Error('Lỗi cập nhật gói cước');
  return res.json();
};

export const deleteSubscription = async (id: string) => {
  const res = await apiFetch(`/api/subscriptions/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (!res.ok) throw new Error('Lỗi xóa gói cước');
  return res.json();
};

export const fetchActiveSubscriptions = async () => {
  const res = await apiFetch('/api/subscriptions');
  if (!res.ok) throw new Error('Lỗi lấy danh sách gói cước');
  return res.json();
};

// [FIX Vấn đề 3] Bỏ `amount` khỏi request — backend tự tính 100% từ DB.
// Không gửi giá từ client để tránh price tampering.
export const createCheckoutSession = async (data: { planId: string, planName: string, membersCount?: number }) => {
  const res = await apiFetch('/api/payments/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Lỗi khởi tạo thanh toán');
  return res.json();
};

// Lấy thông tin user hiện tại kèm subscription (dùng trong AuthContext.refreshUser)
export const fetchCurrentUser = async () => {
  const res = await apiFetch('/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (!res.ok) throw new Error('Không thể lấy thông tin người dùng');
  return res.json();
};

// Xác minh giao dịch với PayOS và kích hoạt subscription trong DB
// Frontend gọi sau khi PayOS redirect về /payment/success?orderCode=xxx
export const verifyPayment = async (orderCode: string) => {
  const res = await apiFetch(`/api/payments/verify?orderCode=${orderCode}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Lỗi xác minh thanh toán');
  }
  return res.json();
};

// [MỚI] User tự bấm "Tôi đã chuyển khoản - Kiểm tra lại"
// Gọi cho các giao dịch Pending trong Billing History
export const verifyOrderByCode = async (orderCode: string) => {
  const res = await apiFetch(`/api/payments/verify-order?orderCode=${orderCode}`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi kiểm tra giao dịch');
  return data;
};

// [MỚI] Preview cấn trừ (tạm tính) trước khi xác nhận mua gói mới
// Dùng để hiện Modal Checkout Preview trước khi redirect PayOS
export const previewUpgrade = async (planId: string, membersCount?: number) => {
  let url = `/api/payments/preview-upgrade?planId=${planId}`;
  if (membersCount) url += `&membersCount=${membersCount}`;
  const res = await apiFetch(url, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi tính toán cấn trừ');
  return data;
};



// ==========================================
// SHARE MANAGEMENT APIs
// ==========================================

export const fetchDesignShares = async (designId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/shares`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy danh sách chia sẻ');
  return res.json();
};

export const shareDesign = async (designId: string, email: string, role: string) => {
  const res = await apiFetch(`/api/designs/${designId}/share`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi chia sẻ');
  return data;
};

export const updateShareRole = async (designId: string, userId: string, role: string) => {
  const res = await apiFetch(`/api/designs/${designId}/share/${userId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật quyền');
  return data;
};

export const removeShare = async (designId: string, userId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/share/${userId}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi gỡ quyền');
  return data;
};

export const togglePublicLink = async (designId: string, isPublic: boolean) => {
  const res = await apiFetch(`/api/designs/${designId}/public`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ is_public: isPublic })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật public link');
  return data;
};

export const fetchShareLink = async (designId: string) => {
  const res = await apiFetch(`/api/designs/${designId}/share-link`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy link chia sẻ');
  return res.json();
};

// ==========================================
// TRASH BIN APIs
// ==========================================
export const fetchTrashDesigns = async () => {
  const res = await apiFetch(`${BASE_URL}/designs/trash`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy thùng rác');
  return res.json();
};

export const restoreDesign = async (designId: string) => {
  const res = await apiFetch(`${BASE_URL}/designs/trash/${designId}/restore`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Khôi phục thất bại');
  return data;
};

export const permanentlyDeleteDesign = async (designId: string) => {
  const res = await apiFetch(`${BASE_URL}/designs/trash/${designId}/permanent`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Xóa thất bại');
  return data;
};

export const bulkDeleteDesigns = async (designIds: string[]) => {
  const res = await apiFetch(`${BASE_URL}/designs/bulk-delete`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ designIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Xóa hàng loạt thất bại');
  return data;
};

export const emptyTrash = async () => {
  const res = await apiFetch(`${BASE_URL}/designs/trash/empty`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dọn rác thất bại');
  return data;
};

// ==========================================
// TEAM APIs
// ==========================================
export const fetchMyTeams = async () => {
  const res = await apiFetch(`${BASE_URL}/teams/my-teams`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy danh sách nhóm');
  return res.json();
};

export const createTeam = async (data: { name: string; max_members?: number }) => {
  const res = await apiFetch(`${BASE_URL}/teams`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Tạo nhóm thất bại');
  return json;
};

export const fetchTeamById = async (teamId: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy thông tin nhóm');
  return res.json();
};

export const updateTeam = async (teamId: string, name: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Cập nhật nhóm thất bại');
  return data;
};

export const updateTeamAvatar = async (teamId: string, file: File) => {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('avatar', file);

  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/update-avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Cập nhật ảnh nhóm thất bại');
  return data;
};

export const inviteTeamMember = async (teamId: string, email: string, role: string = 'member') => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/members`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Mời thành viên thất bại');
  return data;
};

export const removeTeamMember = async (teamId: string, memberId: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/members/${memberId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Xóa thành viên thất bại');
  return data;
};

export const updateTeamMemberRole = async (teamId: string, memberId: string, role: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/members/${memberId}/role`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Thay đổi vai trò thất bại');
  return data;
};

export const previewTransferOwnership = async (teamId: string, newOwnerId: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/preview-transfer?newOwnerId=${newOwnerId}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi preview chuyển nhượng');
  return data;
};

export const transferTeamOwnership = async (teamId: string, newOwnerId: string) => {
  const res = await apiFetch(`${BASE_URL}/teams/${teamId}/transfer-ownership`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ newOwnerId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Chuyển nhượng thất bại');
  return data;
};

// ─── ASSET VIRTUAL REFERENCING APIs ──────────────────────────────────────────

/**
 * Xóa Bản ghi A (ảnh khỏi thư viện Uploads).
 * Ảnh đã kéo vào design (Bản ghi B) vẫn tồn tại — Canvas không mất ảnh.
 */
export const deleteUserAsset = async (assetId: string) => {
  const token = localStorage.getItem('token');
  const res = await apiFetch(`/api/assets/${assetId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Không thể xóa tài nguyên');
  return data;
};

// ─── TEAM PLAN APIs ───────────────────────────────────────────────────────────

/**
 * Lấy thông tin gói Team từ Database.
 * Tìm gói có số lượng thành viên > 1 đang active, không phụ thuộc vào tên slug.
 */
export const fetchTeamPlan = async () => {
  const res = await apiFetch('/api/subscriptions');
  const data = await res.json();
  if (!res.ok) throw new Error('Không thể lấy thông tin gói Team');
  // Tìm gói đầu tiên có max_team_members > 1 (Gói Đội nhóm)
  const plans: any[] = data.plans || data.subscriptions || data || [];
  return plans.find((p: any) => p.max_team_members > 1) || null;
};

// [FIX Vấn đề 3] Bỏ `amount` — backend tự tính giá × số thành viên từ DB.
export const createTeamCheckout = async (data: {
  planId: string;
  planName: string;
  inviteEmails: string[];
  membersCount: number;
}) => {
  const res = await apiFetch('/api/payments/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Lỗi khởi tạo thanh toán Team');
  return res.json();
};

// ==========================================
// TEMPLATE APIs
// ==========================================

/** Lấy danh sách tất cả template công khai đã được Admin publish */
export const fetchTemplates = async () => {
  const res = await apiFetch(`${BASE_URL}/designs/templates`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Lỗi lấy danh sách template');
  return res.json(); // { templates: [...] }
};

/** Clone template thành design của user hiện tại. Trả về { designId } */
export const useTemplate = async (templateId: string) => {
  const res = await apiFetch(`${BASE_URL}/designs/templates/${templateId}/use`, {
    method: 'POST',
    headers: getWorkspaceHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể sử dụng template');
  return data; // { success, designId, message }
};


