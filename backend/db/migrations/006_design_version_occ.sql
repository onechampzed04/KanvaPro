-- Migration 006: Strict OCC + Soft Delete
-- 1. Thêm cột version (integer) cho Optimistic Concurrency Control nghiêm ngặt
ALTER TABLE designs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 2. Soft delete cho design_pages (tránh DELETE bạo lực)
ALTER TABLE design_pages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE design_pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Soft delete cho design_elements
ALTER TABLE design_elements ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE design_elements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. Index để filter nhanh khi truy vấn
CREATE INDEX IF NOT EXISTS idx_design_pages_not_deleted ON design_pages(design_id, page_order) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_design_elements_not_deleted ON design_elements(page_id, z_index) WHERE is_deleted = false;
