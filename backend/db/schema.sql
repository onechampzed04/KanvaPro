-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- 2. Enums (Types)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE asset_type AS ENUM ('image', 'icon', 'video', 'audio', 'illustration', 'font', 'template', 'background');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE design_type AS ENUM ('presentation', 'social_media', 'poster', 'video', 'infographic', 'document', 'website');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE element_type AS ENUM ('text', 'image', 'shape', 'video_clip', 'audio_clip', 'line', 'sticker', 'frame', 'group', 'embed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE share_role AS ENUM ('owner', 'editor', 'commenter', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tables

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             TEXT UNIQUE NOT NULL,
    password_hash     TEXT,
    name              TEXT,
    avatar_url        TEXT,
    role              user_role DEFAULT 'user',
    is_verified       BOOLEAN DEFAULT false,
    last_login_at     TIMESTAMPTZ,
    storage_used_bytes BIGINT DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    slug              TEXT UNIQUE NOT NULL,
    monthly_price     NUMERIC NOT NULL,
    yearly_price      NUMERIC NOT NULL,
    max_storage_gb    INT,
    max_team_members  INT DEFAULT NULL,
    features          JSONB NOT NULL DEFAULT '[]',
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- USER SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id                UUID REFERENCES subscription_plans(id),
    status                 subscription_status NOT NULL,
    current_period_start   TIMESTAMPTZ NOT NULL,
    current_period_end     TIMESTAMPTZ NOT NULL,
    cancel_at              TIMESTAMPTZ,
    stripe_subscription_id TEXT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id),
    subscription_id   UUID REFERENCES user_subscriptions(id),
    amount            NUMERIC NOT NULL,
    currency          TEXT DEFAULT 'VND',
    status            payment_status NOT NULL,
    gateway           TEXT,
    transaction_id    TEXT,
    metadata          JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- TEAMS
CREATE TABLE IF NOT EXISTS teams (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    avatar_url        TEXT,
    owner_id          UUID REFERENCES users(id),
    max_members       INT DEFAULT 10,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- TEAM MEMBERS
CREATE TABLE IF NOT EXISTS team_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id           UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    role              team_role NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- ASSET CATEGORIES
CREATE TABLE IF NOT EXISTS asset_categories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    slug              TEXT UNIQUE,
    parent_id         UUID REFERENCES asset_categories(id),
    icon_url          TEXT
);

-- ASSETS
CREATE TABLE IF NOT EXISTS assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT,
    type              asset_type NOT NULL,
    url               TEXT NOT NULL,
    thumbnail_url     TEXT,
    file_size         BIGINT,
    width             INT,
    height            INT,
    duration          NUMERIC,
    is_premium        BOOLEAN DEFAULT false,
    category_id       UUID REFERENCES asset_categories(id),
    tags              TEXT[],
    license           TEXT,
    uploaded_by       UUID REFERENCES users(id),
    metadata          JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDERS
CREATE TABLE IF NOT EXISTS folders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id),
    team_id           UUID REFERENCES teams(id),
    name              TEXT NOT NULL,
    parent_id         UUID REFERENCES folders(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGNS
CREATE TABLE IF NOT EXISTS designs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id),
    team_id           UUID REFERENCES teams(id),
    folder_id         UUID REFERENCES folders(id),
    title             TEXT NOT NULL,
    description       TEXT,
    design_type       design_type NOT NULL,
    width             INT NOT NULL,
    height            INT NOT NULL,
    thumbnail_url     TEXT,
    is_public         BOOLEAN DEFAULT false,
    is_template       BOOLEAN DEFAULT false,
    is_deleted        BOOLEAN DEFAULT false,
    total_duration    NUMERIC DEFAULT 0,
    last_edited_at    TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGN PAGES
CREATE TABLE IF NOT EXISTS design_pages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id         UUID REFERENCES designs(id) ON DELETE CASCADE,
    page_order        INT NOT NULL,
    title             TEXT,
    background_color  TEXT,
    background_asset_id UUID REFERENCES assets(id),
    duration          NUMERIC,
    transition        JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGN ELEMENTS
CREATE TABLE IF NOT EXISTS design_elements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id           UUID REFERENCES design_pages(id) ON DELETE CASCADE,
    element_type      element_type NOT NULL,
    z_index           INT NOT NULL DEFAULT 0,
    locked            BOOLEAN DEFAULT false,
    visible           BOOLEAN DEFAULT true,
    properties        JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGN SHARES
CREATE TABLE IF NOT EXISTS design_shares (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id         UUID REFERENCES designs(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id),
    role              share_role NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGN COMMENTS
CREATE TABLE IF NOT EXISTS design_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id         UUID REFERENCES designs(id),
    user_id           UUID REFERENCES users(id),
    page_id           UUID REFERENCES design_pages(id),
    element_id        UUID REFERENCES design_elements(id),
    content           TEXT NOT NULL,
    position          JSONB,
    resolved          BOOLEAN DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- OTPS
CREATE TABLE IF NOT EXISTS otps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    code              TEXT NOT NULL,
    type              TEXT NOT NULL, -- 'registration', 'login'
    expires_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- DESIGN VERSIONS
CREATE TABLE IF NOT EXISTS design_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id         UUID REFERENCES designs(id) ON DELETE CASCADE,
    version_number    INT NOT NULL,
    snapshot          JSONB NOT NULL,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- TEMPLATE CATEGORIES
CREATE TABLE IF NOT EXISTS template_categories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    slug              TEXT UNIQUE
);

-- PUBLIC TEMPLATES
CREATE TABLE IF NOT EXISTS public_templates (
    design_id         UUID PRIMARY KEY REFERENCES designs(id),
    category_id       UUID REFERENCES template_categories(id),
    likes             INT DEFAULT 0,
    uses              INT DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON designs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_design_elements_updated_at BEFORE UPDATE ON design_elements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_designs_user_team ON designs(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_design_elements_page ON design_elements(page_id);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_assets_type_premium ON assets(type, is_premium);
CREATE INDEX IF NOT EXISTS idx_design_elements_properties_gin ON design_elements USING GIN(properties);
CREATE INDEX IF NOT EXISTS idx_design_versions_design ON design_versions(design_id);
