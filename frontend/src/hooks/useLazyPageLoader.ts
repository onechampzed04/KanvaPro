// frontend/src/hooks/useLazyPageLoader.ts
// Tránh Memory Leak do Cache "Không Đáy" ===
// Thay vì lưu trữ elements của TẤT CẢ trang vào Map không giới hạn,
// hook này dùng thuật toán LRU (Least Recently Used) để chỉ giữ tối đa
// MAX_CACHED_PAGES trang gần nhất. Các trang cũ hơn sẽ bị "evict" (giải phóng)
// ra khỏi RAM khi cache đầy.
//
// Triển khai LRU bằng Map + doubly-linked list (O(1) get + O(1) put):
// - Map: key=pageId, value=node (data + prev + next)
// - Linked list: head=most recently used, tail=least recently used
// - Khi cache đầy và cần thêm entry mới: xóa node ở tail (LRU)
// - Khi access 1 entry: move node đó lên head (mark as recently used)

import { useRef, useCallback, useMemo } from 'react';

const BASE_URL = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { 'Authorization': `Bearer ${token}` };
}

// ─── LRU Node ─────────────────────────────────────────────────────────────────

interface LRUNode {
  pageId: string;
  elements: any[];
  loadedAt: number;
  prev: LRUNode | null;
  next: LRUNode | null;
}

// ─── LRU Cache Class ──────────────────────────────────────────────────────────

class LRUCache {
  private capacity: number;
  private map: Map<string, LRUNode>;
  private head: LRUNode; // sentinel (most recently used side)
  private tail: LRUNode; // sentinel (least recently used side)
  private ttlMs: number;

  constructor(capacity: number, ttlMs: number) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.map = new Map();

    // Sentinel nodes — không chứa data thật, chỉ dùng để tránh null checks
    this.head = { pageId: '__head__', elements: [], loadedAt: 0, prev: null, next: null };
    this.tail = { pageId: '__tail__', elements: [], loadedAt: 0, prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private insertAfterHead(node: LRUNode) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: LRUNode) {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToHead(node: LRUNode) {
    this.removeNode(node);
    this.insertAfterHead(node);
  }

  private evictLRU(): string | null {
    const lru = this.tail.prev!;
    if (lru === this.head) return null; // cache empty
    this.removeNode(lru);
    this.map.delete(lru.pageId);
    console.debug(`[LRU Cache] Evicted page: ${lru.pageId} (cache was full at ${this.capacity})`);
    return lru.pageId;
  }

  isValid(pageId: string): boolean {
    const node = this.map.get(pageId);
    if (!node) return false;
    if (Date.now() - node.loadedAt > this.ttlMs) {
      // TTL expired — xóa khỏi cache
      this.removeNode(node);
      this.map.delete(pageId);
      return false;
    }
    return true;
  }

  get(pageId: string): any[] | null {
    const node = this.map.get(pageId);
    if (!node) return null;
    // TTL check
    if (Date.now() - node.loadedAt > this.ttlMs) {
      this.removeNode(node);
      this.map.delete(pageId);
      return null;
    }
    // Mark as recently used
    this.moveToHead(node);
    return node.elements;
  }

  set(pageId: string, elements: any[]) {
    const existing = this.map.get(pageId);
    if (existing) {
      // Update existing entry
      existing.elements = elements;
      existing.loadedAt = Date.now();
      this.moveToHead(existing);
    } else {
      // Evict if at capacity
      if (this.map.size >= this.capacity) {
        this.evictLRU();
      }
      const node: LRUNode = {
        pageId,
        elements,
        loadedAt: Date.now(),
        prev: null,
        next: null,
      };
      this.map.set(pageId, node);
      this.insertAfterHead(node);
    }
  }

  delete(pageId: string) {
    const node = this.map.get(pageId);
    if (node) {
      this.removeNode(node);
      this.map.delete(pageId);
    }
  }

  has(pageId: string): boolean {
    return this.map.has(pageId);
  }

  clear() {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size(): number {
    return this.map.size;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// [FIX #7] Giới hạn tối đa 8 trang trong RAM.
// Với mỗi trang ~5-20 elements (JSON ~50KB), tổng bộ nhớ tối đa ~160KB-320KB RAM.
// Người dùng chỉ cần dùng page navigation liên tục để vô tình gây OOM — giờ không còn nữa.
const MAX_CACHED_PAGES = 8;
const CACHE_TTL_MS = 5 * 60 * 1000; // TTL 5 phút

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLazyPageLoader(designId: string | undefined) {
  // [FIX #7] Dùng LRUCache thay vì Map không giới hạn
  const cache = useRef<LRUCache>(new LRUCache(MAX_CACHED_PAGES, CACHE_TTL_MS));
  // Map: pageId → promise đang tải (tránh double-fetch)
  const pending = useRef<Map<string, Promise<any[]>>>(new Map());

  /**
   * Tải elements của 1 trang.
   * - Nếu đã có trong LRU cache và chưa hết TTL: trả về ngay (không gọi API).
   * - Nếu đang pending: trả về cùng 1 Promise (tránh race condition).
   * - Nếu chưa có: gọi API lazy load, sau đó lưu vào LRU cache.
   */
  const loadPageElements = useCallback(async (pageId: string): Promise<any[]> => {
    if (!designId || !pageId) return [];

    // 1. Trả về từ LRU cache nếu còn hợp lệ (tự động mark as recently used)
    const cached = cache.current.get(pageId);
    if (cached !== null) {
      return cached;
    }

    // 2. Nếu đang có request đang bay → trả về cùng promise (request dedup)
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

      // [FIX #7] Lưu vào LRU cache — tự động evict trang cũ nhất nếu đầy
      cache.current.set(pageId, elements);
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
    if (!cache.current.isValid(pageId) && !pending.current.has(pageId)) {
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
   * [FIX #7] LRU.set() tự động xử lý eviction nếu cache đầy.
   */
  const updateCache = useCallback((pageId: string, elements: any[]) => {
    cache.current.set(pageId, elements);
  }, []);

  /**
   * Xóa toàn bộ cache (dùng khi reload design).
   */
  const clearCache = useCallback(() => {
    cache.current.clear();
    pending.current.clear();
  }, []);

  /**
   * Kiểm tra xem trang đã được load/cache hay chưa.
   */
  const isPageLoaded = useCallback((pageId: string): boolean => {
    return cache.current.has(pageId);
  }, []);

  return useMemo(() => ({
    loadPageElements,
    prefetchPage,
    invalidatePage,
    updateCache,
    clearCache,
    isPageLoaded,
  }), [
    loadPageElements,
    prefetchPage,
    invalidatePage,
    updateCache,
    clearCache,
    isPageLoaded,
  ]);
}
