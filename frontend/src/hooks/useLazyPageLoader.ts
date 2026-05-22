// frontend/src/hooks/useLazyPageLoader.ts
// === FIX #4: Lazy Loading - Chỉ load elements khi cần ===
// Thay vì lấy toàn bộ trang + elements khi mở design,
// hook này cache và lazy-load elements từng trang theo yêu cầu.

import { useRef, useCallback } from 'react';

const BASE_URL = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { 'Authorization': `Bearer ${token}` };
}

interface PageCache {
  elements: any[];
  loadedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // Cache 5 phút

export function useLazyPageLoader(designId: string | undefined) {
  // Map: pageId → cached elements
  const cache = useRef<Map<string, PageCache>>(new Map());
  // Map: pageId → promise đang tải (tránh double-fetch)
  const pending = useRef<Map<string, Promise<any[]>>>(new Map());

  /**
   * Kiểm tra cache còn hợp lệ không (chưa quá TTL)
   */
  const isCacheValid = (pageId: string): boolean => {
    const entry = cache.current.get(pageId);
    if (!entry) return false;
    return Date.now() - entry.loadedAt < CACHE_TTL_MS;
  };

  /**
   * Tải elements của 1 trang.
   * - Nếu đã có trong cache: trả về ngay (không gọi API).
   * - Nếu đang pending: trả về cùng 1 Promise (tránh race condition).
   * - Nếu chưa có: gọi API lazy load.
   */
  const loadPageElements = useCallback(async (pageId: string): Promise<any[]> => {
    if (!designId || !pageId) return [];

    // 1. Trả về từ cache nếu còn mới
    if (isCacheValid(pageId)) {
      return cache.current.get(pageId)!.elements;
    }

    // 2. Nếu đang có request đang bay → trả về cùng promise
    if (pending.current.has(pageId)) {
      return pending.current.get(pageId)!;
    }

    // 3. Gọi API lazy load
    const fetchPromise = fetch(
      `${BASE_URL}/designs/${designId}/pages/${pageId}/elements`,
      { headers: getAuthHeaders() }
    ).then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      const elements = data.elements || [];

      // Lưu vào cache
      cache.current.set(pageId, { elements, loadedAt: Date.now() });
      return elements;
    }).catch(() => {
      return [];
    }).finally(() => {
      pending.current.delete(pageId);
    });

    pending.current.set(pageId, fetchPromise);
    return fetchPromise;
  }, [designId]);

  /**
   * Prefetch elements của trang tiếp theo (hoặc trang lân cận).
   * Gọi âm thầm để chuẩn bị sẵn trước khi user chuyển trang.
   */
  const prefetchPage = useCallback((pageId: string) => {
    if (!isCacheValid(pageId) && !pending.current.has(pageId)) {
      loadPageElements(pageId); // Không await, chạy ngầm
    }
  }, [loadPageElements]);

  /**
   * Xóa cache của 1 trang (dùng sau khi lưu, để lần sau fetch lại từ DB).
   */
  const invalidatePage = useCallback((pageId: string) => {
    cache.current.delete(pageId);
  }, []);

  /**
   * Cập nhật cache khi người dùng thao tác (không cần re-fetch từ server).
   */
  const updateCache = useCallback((pageId: string, elements: any[]) => {
    cache.current.set(pageId, { elements, loadedAt: Date.now() });
  }, []);

  /**
   * Xóa toàn bộ cache (dùng khi reload design).
   */
  const clearCache = useCallback(() => {
    cache.current.clear();
    pending.current.clear();
  }, []);

  return {
    loadPageElements,
    prefetchPage,
    invalidatePage,
    updateCache,
    clearCache,
  };
}
