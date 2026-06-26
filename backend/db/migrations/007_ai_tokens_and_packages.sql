-- Thêm cột ai_tokens vào bảng users nếu chưa có
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ai_tokens INTEGER DEFAULT 10;

-- Cập nhật cho các user cũ chưa có token
UPDATE public.users SET ai_tokens = 10 WHERE ai_tokens IS NULL;

-- Tạo bảng token_packages
CREATE TABLE IF NOT EXISTS public.token_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    token_amount INTEGER NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data: Tạo 2 gói cơ bản nếu chưa có
INSERT INTO public.token_packages (id, name, price, token_amount, description, is_active)
SELECT 
    gen_random_uuid(), 'Gói 50 Tokens', 50000, 50, 'Sử dụng để tạo 50 ảnh AI bằng Vertex AI Imagen 3.', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.token_packages WHERE token_amount = 50
);

INSERT INTO public.token_packages (id, name, price, token_amount, description, is_active)
SELECT 
    gen_random_uuid(), 'Gói 100 Tokens', 90000, 100, 'Sử dụng để tạo 100 ảnh AI bằng Vertex AI Imagen 3 (Tiết kiệm 10%).', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.token_packages WHERE token_amount = 100
);
