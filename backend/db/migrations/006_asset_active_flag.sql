-- ============================================================
-- Migration 006: Asset Active Flag
-- Thêm cột is_active vào bảng assets để admin có thể
-- vô hiệu hóa asset mà không xóa khỏi DB.
-- Asset bị deactive sẽ không hiển thị ở phía user,
-- nhưng vẫn render bình thường trong các design đã dùng chúng.
-- ============================================================

ALTER TABLE public.assets
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Index để tăng tốc query lọc is_active = true ở user-facing API
CREATE INDEX IF NOT EXISTS idx_assets_is_active ON public.assets(is_active);

-- Đảm bảo tất cả asset cũ mặc định là active
UPDATE public.assets SET is_active = TRUE WHERE is_active IS NULL;
