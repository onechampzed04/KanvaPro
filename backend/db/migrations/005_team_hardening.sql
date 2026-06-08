-- ============================================================
-- Migration 005: Team Hardening
-- - Tạo bảng team_audit_logs để ghi lại lịch sử hành động
-- - Thêm index is_deleted trên bảng teams (hỗ trợ soft-delete đã thêm trước đó)
-- - Thêm index hỗ trợ tra cứu owner quota (DDoS prevention)
-- ============================================================

-- 1. Bảng Audit Log cho Team
CREATE TABLE IF NOT EXISTS public.team_audit_logs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- Người thực hiện
    action      VARCHAR(64) NOT NULL,   -- Ví dụ: 'INVITE_MEMBER', 'REMOVE_MEMBER', 'DELETE_TEAM', ...
    target_id   UUID,                  -- ID của đối tượng bị tác động (user, design...)
    details     JSONB,                 -- Payload JSON tuỳ ý (role cũ/mới, email, ...)
    ip_address  TEXT,                  -- IP của request (để forensics)
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index để query nhanh log theo team (cho trang xem lịch sử)
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_team_id ON public.team_audit_logs(team_id, created_at DESC);
-- Index để query nhanh log theo actor
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_actor_id ON public.team_audit_logs(actor_id);

-- 2. Index hỗ trợ filter teams chưa bị soft-delete (WHERE is_deleted = false)
CREATE INDEX IF NOT EXISTS idx_teams_is_deleted ON public.teams(is_deleted) WHERE is_deleted = false;

-- 3. Index hỗ trợ kiểm tra số Team mà 1 owner đang sở hữu (DDoS prevention)
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id) WHERE is_deleted = false;
