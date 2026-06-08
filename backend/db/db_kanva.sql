--
-- PostgreSQL database dump
--

\restrict Rvu6QG6RhK8Xt7of01rN6onDg6bhK9cXxbUMTdrBNbCe3LbdlxKdmJmmzymkIRE

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-05-07 23:28:45

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16389)
-- Name: btree_gin; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;


--
-- TOC entry 5366 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION btree_gin; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION btree_gin IS 'support for indexing common datatypes in GIN';


--
-- TOC entry 3 (class 3079 OID 16825)
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- TOC entry 5367 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- TOC entry 4 (class 3079 OID 16906)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 5368 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 1004 (class 1247 OID 16918)
-- Name: asset_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.asset_type AS ENUM (
    'image',
    'icon',
    'video',
    'audio',
    'illustration',
    'font',
    'template',
    'background',
    'sticker'
);


ALTER TYPE public.asset_type OWNER TO postgres;

--
-- TOC entry 1007 (class 1247 OID 16936)
-- Name: design_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.design_type AS ENUM (
    'presentation',
    'social_media',
    'poster',
    'video',
    'infographic',
    'document',
    'website',
    'whiteboard',
    'print',
    'other'
);


ALTER TYPE public.design_type OWNER TO postgres;

--
-- TOC entry 1010 (class 1247 OID 16952)
-- Name: element_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.element_type AS ENUM (
    'text',
    'image',
    'shape',
    'video_clip',
    'audio_clip',
    'line',
    'sticker',
    'frame',
    'group',
    'embed'
);


ALTER TYPE public.element_type OWNER TO postgres;

--
-- TOC entry 1082 (class 1247 OID 17524)
-- Name: page_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.page_type AS ENUM (
    'canvas',
    'doc',
    'sheet'
);


ALTER TYPE public.page_type OWNER TO postgres;

--
-- TOC entry 1013 (class 1247 OID 16974)
-- Name: payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'succeeded',
    'failed',
    'refunded'
);


ALTER TYPE public.payment_status OWNER TO postgres;

--
-- TOC entry 1016 (class 1247 OID 16984)
-- Name: share_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.share_role AS ENUM (
    'owner',
    'editor',
    'commenter',
    'viewer'
);


ALTER TYPE public.share_role OWNER TO postgres;

--
-- TOC entry 1019 (class 1247 OID 16994)
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired'
);


ALTER TYPE public.subscription_status OWNER TO postgres;

--
-- TOC entry 1022 (class 1247 OID 17006)
-- Name: team_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.team_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
);


ALTER TYPE public.team_role OWNER TO postgres;

--
-- TOC entry 1025 (class 1247 OID 17016)
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'admin',
    'moderator'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- TOC entry 340 (class 1255 OID 17023)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 17024)
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asset_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    parent_id uuid,
    icon_url text
);


ALTER TABLE public.asset_categories OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 17032)
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    type public.asset_type NOT NULL,
    url text NOT NULL,
    thumbnail_url text,
    file_size bigint,
    width integer,
    height integer,
    duration numeric,
    is_premium boolean DEFAULT false,
    category_id uuid,
    tags text[],
    license text,
    uploaded_by uuid,
    team_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.assets OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 17043)
-- Name: design_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.design_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid,
    user_id uuid,
    page_id uuid,
    element_id uuid,
    content text NOT NULL,
    "position" jsonb,
    resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.design_comments OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17053)
-- Name: design_elements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.design_elements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid,
    element_type public.element_type NOT NULL,
    z_index integer DEFAULT 0 NOT NULL,
    locked boolean DEFAULT false,
    visible boolean DEFAULT true,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.design_elements OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 17069)
-- Name: design_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.design_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid,
    page_order integer NOT NULL,
    title text,
    background_color text,
    background_asset_id uuid,
    duration numeric,
    transition jsonb,
    created_at timestamp with time zone DEFAULT now(),
    thumbnail text,
    type public.page_type DEFAULT 'canvas'::public.page_type,
    width integer,
    height integer,
    content jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.design_pages OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17078)
-- Name: design_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.design_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid,
    user_id uuid,
    role public.share_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.design_shares OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 17085)
-- Name: design_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.design_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid,
    version_number integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.design_versions OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17095)
-- Name: designs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.designs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    team_id uuid,
    folder_id uuid,
    title text NOT NULL,
    description text,
    design_type public.design_type NOT NULL,
    width integer,
    height integer,
    thumbnail_url text,
    is_public boolean DEFAULT false,
    is_template boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    total_duration numeric DEFAULT 0,
    last_edited_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.designs OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 17113)
-- Name: folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    team_id uuid,
    name text NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.folders OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17123)
-- Name: otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    code text NOT NULL,
    type text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.otps OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 17134)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subscription_id uuid,
    amount numeric NOT NULL,
    currency text DEFAULT 'VND'::text,
    status public.payment_status NOT NULL,
    gateway text,
    transaction_id text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 17145)
-- Name: public_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.public_templates (
    design_id uuid NOT NULL,
    category_id uuid,
    likes integer DEFAULT 0,
    uses integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.public_templates OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 17532)
-- Name: sheet_cells; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sheet_cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid,
    row_index integer NOT NULL,
    col_index integer NOT NULL,
    raw_value text,
    display_value text,
    format jsonb
);


ALTER TABLE public.sheet_cells OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 17152)
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    monthly_price numeric NOT NULL,
    yearly_price numeric NOT NULL,
    max_storage_gb integer,
    max_team_members integer,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.subscription_plans OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 17167)
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    user_id uuid,
    role public.team_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 17174)
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    avatar_url text,
    owner_id uuid,
    max_members integer DEFAULT 10,
    used_storage_bytes bigint DEFAULT 0,
    max_storage_gb numeric(5,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17185)
-- Name: template_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text
);


ALTER TABLE public.template_categories OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 17193)
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    team_id uuid,
    plan_id uuid,
    status public.subscription_status NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancel_at timestamp with time zone,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_subscriptions OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17205)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    name text,
    avatar_url text,
    role public.user_role DEFAULT 'user'::public.user_role,
    is_verified boolean DEFAULT false,
    last_login_at timestamp with time zone,
    storage_used_bytes bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 5122 (class 2606 OID 17219)
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 5124 (class 2606 OID 17221)
-- Name: asset_categories asset_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_slug_key UNIQUE (slug);


--
-- TOC entry 5126 (class 2606 OID 17223)
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- TOC entry 5130 (class 2606 OID 17225)
-- Name: design_comments design_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_pkey PRIMARY KEY (id);


--
-- TOC entry 5132 (class 2606 OID 17227)
-- Name: design_elements design_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_elements
    ADD CONSTRAINT design_elements_pkey PRIMARY KEY (id);


--
-- TOC entry 5136 (class 2606 OID 17229)
-- Name: design_pages design_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_pages
    ADD CONSTRAINT design_pages_pkey PRIMARY KEY (id);


--
-- TOC entry 5138 (class 2606 OID 17231)
-- Name: design_shares design_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_shares
    ADD CONSTRAINT design_shares_pkey PRIMARY KEY (id);


--
-- TOC entry 5140 (class 2606 OID 17233)
-- Name: design_versions design_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_versions
    ADD CONSTRAINT design_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 5143 (class 2606 OID 17235)
-- Name: designs designs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_pkey PRIMARY KEY (id);


--
-- TOC entry 5146 (class 2606 OID 17237)
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- TOC entry 5148 (class 2606 OID 17239)
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (id);


--
-- TOC entry 5150 (class 2606 OID 17241)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5152 (class 2606 OID 17243)
-- Name: public_templates public_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_templates
    ADD CONSTRAINT public_templates_pkey PRIMARY KEY (design_id);


--
-- TOC entry 5176 (class 2606 OID 17542)
-- Name: sheet_cells sheet_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sheet_cells
    ADD CONSTRAINT sheet_cells_pkey PRIMARY KEY (id);


--
-- TOC entry 5154 (class 2606 OID 17245)
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- TOC entry 5156 (class 2606 OID 17247)
-- Name: subscription_plans subscription_plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_slug_key UNIQUE (slug);


--
-- TOC entry 5158 (class 2606 OID 17249)
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- TOC entry 5160 (class 2606 OID 17251)
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- TOC entry 5162 (class 2606 OID 17253)
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- TOC entry 5164 (class 2606 OID 17255)
-- Name: template_categories template_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_categories
    ADD CONSTRAINT template_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 5166 (class 2606 OID 17257)
-- Name: template_categories template_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_categories
    ADD CONSTRAINT template_categories_slug_key UNIQUE (slug);


--
-- TOC entry 5168 (class 2606 OID 17259)
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 5171 (class 2606 OID 17261)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5173 (class 2606 OID 17263)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5127 (class 1259 OID 17264)
-- Name: idx_assets_tags; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_tags ON public.assets USING gin (tags);


--
-- TOC entry 5128 (class 1259 OID 17265)
-- Name: idx_assets_type_premium; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_type_premium ON public.assets USING btree (type, is_premium);


--
-- TOC entry 5133 (class 1259 OID 17266)
-- Name: idx_design_elements_page; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_design_elements_page ON public.design_elements USING btree (page_id);


--
-- TOC entry 5134 (class 1259 OID 17267)
-- Name: idx_design_elements_properties_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_design_elements_properties_gin ON public.design_elements USING gin (properties);


--
-- TOC entry 5141 (class 1259 OID 17268)
-- Name: idx_design_versions_design; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_design_versions_design ON public.design_versions USING btree (design_id);


--
-- TOC entry 5144 (class 1259 OID 17269)
-- Name: idx_designs_user_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_designs_user_team ON public.designs USING btree (user_id, team_id);


--
-- TOC entry 5174 (class 1259 OID 17548)
-- Name: idx_sheet_cell; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_sheet_cell ON public.sheet_cells USING btree (page_id, row_index, col_index);


--
-- TOC entry 5169 (class 1259 OID 17270)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 5208 (class 2620 OID 17271)
-- Name: design_elements update_design_elements_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_design_elements_updated_at BEFORE UPDATE ON public.design_elements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5209 (class 2620 OID 17272)
-- Name: designs update_designs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5210 (class 2620 OID 17273)
-- Name: folders update_folders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5211 (class 2620 OID 17274)
-- Name: teams update_teams_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5212 (class 2620 OID 17275)
-- Name: user_subscriptions update_user_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5213 (class 2620 OID 17276)
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5177 (class 2606 OID 17277)
-- Name: asset_categories asset_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.asset_categories(id);


--
-- TOC entry 5178 (class 2606 OID 17282)
-- Name: assets assets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id);


--
-- TOC entry 5179 (class 2606 OID 17287)
-- Name: assets assets_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- TOC entry 5180 (class 2606 OID 17292)
-- Name: design_comments design_comments_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id);


--
-- TOC entry 5181 (class 2606 OID 17297)
-- Name: design_comments design_comments_element_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_element_id_fkey FOREIGN KEY (element_id) REFERENCES public.design_elements(id);


--
-- TOC entry 5182 (class 2606 OID 17302)
-- Name: design_comments design_comments_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.design_pages(id);


--
-- TOC entry 5183 (class 2606 OID 17307)
-- Name: design_comments design_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5184 (class 2606 OID 17312)
-- Name: design_elements design_elements_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_elements
    ADD CONSTRAINT design_elements_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.design_pages(id) ON DELETE CASCADE;


--
-- TOC entry 5185 (class 2606 OID 17317)
-- Name: design_pages design_pages_background_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_pages
    ADD CONSTRAINT design_pages_background_asset_id_fkey FOREIGN KEY (background_asset_id) REFERENCES public.assets(id);


--
-- TOC entry 5186 (class 2606 OID 17322)
-- Name: design_pages design_pages_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_pages
    ADD CONSTRAINT design_pages_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- TOC entry 5187 (class 2606 OID 17327)
-- Name: design_shares design_shares_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_shares
    ADD CONSTRAINT design_shares_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- TOC entry 5188 (class 2606 OID 17332)
-- Name: design_shares design_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_shares
    ADD CONSTRAINT design_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5189 (class 2606 OID 17337)
-- Name: design_versions design_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_versions
    ADD CONSTRAINT design_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5190 (class 2606 OID 17342)
-- Name: design_versions design_versions_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.design_versions
    ADD CONSTRAINT design_versions_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- TOC entry 5191 (class 2606 OID 17347)
-- Name: designs designs_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id);


--
-- TOC entry 5192 (class 2606 OID 17352)
-- Name: designs designs_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- TOC entry 5193 (class 2606 OID 17357)
-- Name: designs designs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5194 (class 2606 OID 17362)
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id);


--
-- TOC entry 5195 (class 2606 OID 17367)
-- Name: folders folders_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- TOC entry 5196 (class 2606 OID 17372)
-- Name: folders folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5197 (class 2606 OID 17377)
-- Name: otps otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5198 (class 2606 OID 17382)
-- Name: payments payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.user_subscriptions(id);


--
-- TOC entry 5199 (class 2606 OID 17387)
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5200 (class 2606 OID 17392)
-- Name: public_templates public_templates_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_templates
    ADD CONSTRAINT public_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.template_categories(id);


--
-- TOC entry 5201 (class 2606 OID 17397)
-- Name: public_templates public_templates_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_templates
    ADD CONSTRAINT public_templates_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id);


--
-- TOC entry 5207 (class 2606 OID 17543)
-- Name: sheet_cells sheet_cells_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sheet_cells
    ADD CONSTRAINT sheet_cells_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.design_pages(id) ON DELETE CASCADE;


--
-- TOC entry 5202 (class 2606 OID 17402)
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- TOC entry 5203 (class 2606 OID 17407)
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5204 (class 2606 OID 17412)
-- Name: teams teams_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- TOC entry 5205 (class 2606 OID 17417)
-- Name: user_subscriptions user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- TOC entry 5206 (class 2606 OID 17422)
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


-- Completed on 2026-05-07 23:28:45

--
-- PostgreSQL database dump complete
--

\unrestrict Rvu6QG6RhK8Xt7of01rN6onDg6bhK9cXxbUMTdrBNbCe3LbdlxKdmJmmzymkIRE

