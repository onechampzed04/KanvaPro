// frontend/src/api/adminApi.ts

const getHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

// ── Metrics ────────────────────────────────────────────────────────────────
export const fetchAdminMetrics = async () => {
  const res = await fetch('/api/admin/metrics', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
};

// ── Users (V2) ─────────────────────────────────────────────────────────────
export const fetchAdminUsersV2 = async (params: {
  page?: number; limit?: number; search?: string; role?: string; status?: string;
}) => {
  const q = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/users-v2?${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
};



export const banUserV2 = async (userId: string, status: string, reason: string) => {
  const res = await fetch(`/api/admin/users-v2/${userId}/ban`, {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to ban user');
  }
  return res.json();
};

// ── Assets ─────────────────────────────────────────────────────────────────
export const fetchAdminAssets = async (params: {
  page?: number; limit?: number; type?: string; search?: string;
  is_premium?: string; is_active?: string;
}) => {
  const q = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/assets?${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch assets');
  return res.json();
};

export const bulkUploadAssets = async (formData: FormData) => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/admin/assets/bulk', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }, // No Content-Type for multipart
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload assets');
  return res.json();
};

export interface UpdateAssetData {
  name?: string; is_premium?: boolean; tags?: string;
}

export const updateAsset = async (id: string, data: UpdateAssetData) => {
  const res = await fetch(`/api/admin/assets/${id}`, {
    method: 'PATCH', headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update asset');
  return res.json();
};



// Toggle is_active cho asset (Admin deactivate/reactivate)
export const toggleAssetActive = async (id: string) => {
  const res = await fetch(`/api/admin/assets/${id}/toggle-active`, {
    method: 'PUT', headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to toggle asset active state');
  return res.json(); // { success: true, is_active: boolean }
};

// ── Designs & Templates ────────────────────────────────────────────────────
export const fetchAdminDesigns = async (params: {
  page?: number; limit?: number; search?: string;
}) => {
  const q = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/designs?${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch designs');
  return res.json();
};

export const publishTemplate = async (design_id: string) => {
  const res = await fetch('/api/admin/templates/publish', {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ design_id }),
  });
  if (!res.ok) throw new Error('Failed to publish template');
  return res.json();
};

export const unpublishTemplate = async (design_id: string) => {
  const res = await fetch(`/api/admin/templates/${design_id}`, {
    method: 'DELETE', headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to unpublish template');
  return res.json();
};

// ── Subscriptions ──────────────────────────────────────────────────────────
export const fetchAdminSubscriptions = async (params: {
  page?: number; limit?: number; search?: string; status?: string;
}) => {
  const q = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/subscriptions?${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch subscriptions');
  return res.json();
};

export const createManualSubscription = async (data: {
  user_id: string; plan_id: string; days?: number;
}) => {
  const res = await fetch('/api/admin/subscriptions/manual', {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create subscription');
  return res.json();
};

export const updateAdminSubscription = async (id: string, data: {
  status?: string; plan_id?: string; extend_days?: number;
}) => {
  const res = await fetch(`/api/admin/subscriptions/${id}`, {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update subscription');
  return res.json();
};

export const terminateSubscription = async (id: string) => {
  const res = await fetch(`/api/admin/subscriptions/${id}`, {
    method: 'DELETE', headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to terminate subscription');
  return res.json();
};

// ── Plans ──────────────────────────────────────────────────────────────────
export const fetchAdminPlans = async () => {
  const res = await fetch('/api/admin/plans', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
};

export const createPlan = async (data: any) => {
  const res = await fetch('/api/admin/plans', {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create plan');
  return res.json();
};

export const updatePlan = async (id: string, data: any) => {
  const res = await fetch(`/api/admin/plans/${id}`, {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update plan');
  return res.json();
};

export const deletePlan = async (id: string) => {
  const res = await fetch(`/api/admin/plans/${id}`, {
    method: 'DELETE', headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete plan');
  return res.json();
};

// ── Payments ───────────────────────────────────────────────────────────────
export const fetchAdminPayments = async (params: {
  page?: number; limit?: number; status?: string; gateway?: string; search?: string;
}) => {
  const q = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/payments?${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch payments');
  return res.json();
};

// [MỚI] Admin duyệt tay giao dịch Pending (PayOS webhook bị miss)
export const adminForceSuccessPayment = async (paymentId: string) => {
  const res = await fetch(`/api/admin/payments/${paymentId}/force-success`, {
    method: 'POST', headers: getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to force payment success');
  return data;
};

// [MỚI] Admin ngắt dịch vụ ngay lập tức (thay cho terminateSubscription cũ - có audit log)
export const adminRevokeSubscription = async (subscriptionId: string) => {
  const res = await fetch(`/api/admin/subscriptions/${subscriptionId}/revoke`, {
    method: 'POST', headers: getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to revoke subscription');
  return data;
};
