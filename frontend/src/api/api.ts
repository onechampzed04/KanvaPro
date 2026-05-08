// frontend/src/api/api.ts

const BASE_URL = '/api'; // Sử dụng Proxy của Vite

// API design

// Hàm helper để lấy header có kèm Token
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// 1. Lấy danh sách thiết kế
export const fetchDesigns = async () => {
  const response = await fetch(`${BASE_URL}/designs/my`, {
    headers: getHeaders()
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
  height: number | null 
}) => {
  const response = await fetch(`${BASE_URL}/designs`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(designData),
  });

  if (!response.ok) throw new Error('Failed to create design');
  return response.json();
};

export const saveDesign = async (designId: string, payload: any) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/designs/${designId}/save`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return response.json();
};

export const updateDesignFull = async (designId: string, data: { title: string, pages: any[] }) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/designs/${designId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) throw new Error('Failed to save design');
  return response.json();
};

export const createDesignVersion = async (designId: string) => {
  const res = await fetch(`/api/designs/${designId}/versions`, { method: 'POST', headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to create version');
  return res.json();
};

export const fetchDesignVersions = async (designId: string) => {
  const res = await fetch(`/api/designs/${designId}/versions`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch versions');
  return res.json();
};

export const restoreDesignVersion = async (designId: string, versionId: string) => {
  const res = await fetch(`/api/designs/${designId}/versions/${versionId}/restore`, { method: 'POST', headers: getHeaders() });
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

        const response = await fetch('/api/designs/export/video', {
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
  const res = await fetch('/api/subscriptions', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (!res.ok) throw new Error('Lỗi lấy danh sách Subscriptions admin');
  return res.json();
};

// Tạo gói mới
export const createSubscription = async (subscriptionData: any) => {
  const res = await fetch('/api/subscriptions', {
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
  const res = await fetch(`/api/subscriptions/${id}`, {
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

// Ẩn/Xóa mềm gói cước
export const deleteSubscription = async (id: string) => {
  const res = await fetch(`/api/subscriptions/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (!res.ok) throw new Error('Lỗi xóa gói cước');
  return res.json();
};

export const fetchActiveSubscriptions = async () => {
  const res = await fetch('/api/subscriptions'); // Thay bằng endpoint public tương ứng của bạn
  if (!res.ok) throw new Error('Lỗi lấy danh sách gói cước');
  return res.json();
};

// Gọi Backend tạo link thanh toán PayOS
export const createCheckoutSession = async (data: { planId: string, amount: number, planName: string }) => {
  const res = await fetch('/api/payments/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}` // Bắt buộc truyền token để biết user nào mua
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Lỗi khởi tạo thanh toán');
  return res.json();
};

// Lấy thông tin user hiện tại kèm subscription (dùng trong AuthContext.refreshUser)
export const fetchCurrentUser = async () => {
  const res = await fetch('/api/auth/me', {
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
  const res = await fetch(`/api/payments/verify?orderCode=${orderCode}`, {
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