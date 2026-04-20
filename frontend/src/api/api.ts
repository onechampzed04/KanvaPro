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
  width: number, 
  height: number 
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