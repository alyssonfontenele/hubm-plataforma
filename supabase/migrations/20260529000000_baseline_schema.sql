-- =============================================================================
-- BASELINE SCHEMA — HubMowig
-- Extraído em 2026-05-29 do projeto xpoqiclaqkudznmshzal
--
-- Este arquivo representa o estado completo do schema public.
-- Destinado a: setup de banco zerado, documentação e referência.
-- Em banco já existente, marque como aplicado sem executar:
--   npx supabase migration repair --status applied 20260529000000 --linked
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.auth_type        AS ENUM ('google', 'cpf'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.global_role      AS ENUM ('admin', 'manager', 'member', 'viewer', 'operational', 'superadmin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.integration_type AS ENUM ('google_drive', 'mcp', 'api', 'webhook'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.log_action       AS ENUM ('view', 'download', 'open_external', 'login', 'logout'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.permission_level AS ENUM ('view', 'edit', 'none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.resource_type    AS ENUM ('link', 'spreadsheet', 'document', 'pdf', 'slides', 'system', 'file'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.sector_role      AS ENUM ('manager', 'member', 'viewer', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.companies (
  id              uuid        NOT NULL DEFAULT uuid_generate_v4(),
  slug            text        NOT NULL,
  name            text        NOT NULL,
  domain          text,
  logo_url        text,
  primary_color   text                 DEFAULT '#C4622D'::text,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  allowed_domains text[]      NOT NULL DEFAULT '{}'::text[],
  email_sender    text,
  favicon_url     text
);

CREATE TABLE IF NOT EXISTS public.sectors (
  id            uuid        NOT NULL DEFAULT uuid_generate_v4(),
  company_id    uuid        NOT NULL,
  name          text        NOT NULL,
  slug          text        NOT NULL,
  icon          text,
  description   text,
  sort_order    integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  group_name    text,
  layout_config jsonb       NOT NULL DEFAULT '{"mode":"grid","columns":3}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid                    NOT NULL,
  company_id           uuid                    NOT NULL,
  full_name            text                    NOT NULL,
  display_name         text,
  auth_type            public.auth_type        NOT NULL DEFAULT 'google'::public.auth_type,
  cpf_hash             text,
  recovery_email       text,
  avatar_url           text,
  global_role          public.global_role      NOT NULL DEFAULT 'member'::public.global_role,
  active               boolean                 NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  consent_at           timestamptz,
  created_at           timestamptz             NOT NULL DEFAULT now(),
  updated_at           timestamptz             NOT NULL DEFAULT now(),
  must_change_password boolean                 NOT NULL DEFAULT false,
  cellphone            text,
  deleted_at           timestamptz
);

CREATE TABLE IF NOT EXISTS public.cargos (
  id          uuid        NOT NULL DEFAULT uuid_generate_v4(),
  name        text        NOT NULL,
  description text,
  company_id  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cargo_sectors (
  cargo_id  uuid NOT NULL,
  sector_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cargo_permissions (
  id          uuid                    NOT NULL DEFAULT uuid_generate_v4(),
  cargo_id    uuid                    NOT NULL,
  resource_id uuid                    NOT NULL,
  permission  public.permission_level NOT NULL DEFAULT 'view'::public.permission_level
);

CREATE TABLE IF NOT EXISTS public.folders (
  id          uuid        NOT NULL DEFAULT uuid_generate_v4(),
  sector_id   uuid        NOT NULL,
  parent_id   uuid,
  name        text        NOT NULL,
  description text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  is_page     boolean     NOT NULL DEFAULT false,
  icon        text,
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.resources (
  id              uuid                    NOT NULL DEFAULT uuid_generate_v4(),
  folder_id       uuid,
  type            public.resource_type    NOT NULL,
  name            text                    NOT NULL,
  description     text,
  url             text,
  drive_file_id   text,
  drive_mime_type text,
  storage_path    text,
  file_size_bytes bigint,
  mime_type       text,
  thumbnail_url   text,
  sort_order      integer                 NOT NULL DEFAULT 0,
  is_public       boolean                 NOT NULL DEFAULT false,
  created_by      uuid,
  deleted_at      timestamptz,
  created_at      timestamptz             NOT NULL DEFAULT now(),
  updated_at      timestamptz             NOT NULL DEFAULT now(),
  icon            text,
  sector_id       uuid
);

CREATE TABLE IF NOT EXISTS public.resource_permissions (
  id          uuid                    NOT NULL DEFAULT uuid_generate_v4(),
  resource_id uuid                    NOT NULL,
  profile_id  uuid,
  sector_id   uuid,
  permission  public.permission_level NOT NULL DEFAULT 'view'::public.permission_level,
  created_by  uuid,
  created_at  timestamptz             NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sector_members (
  id         uuid                NOT NULL DEFAULT uuid_generate_v4(),
  profile_id uuid                NOT NULL,
  sector_id  uuid                NOT NULL,
  role       public.sector_role  NOT NULL DEFAULT 'member'::public.sector_role,
  created_at timestamptz         NOT NULL DEFAULT now(),
  updated_at timestamptz         NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id         uuid        NOT NULL DEFAULT uuid_generate_v4(),
  company_id uuid        NOT NULL,
  sector_id  uuid,
  title      text        NOT NULL,
  body       text,
  pinned     boolean     NOT NULL DEFAULT false,
  active     boolean     NOT NULL DEFAULT true,
  created_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id         uuid                       NOT NULL DEFAULT uuid_generate_v4(),
  company_id uuid                       NOT NULL,
  type       public.integration_type    NOT NULL,
  name       text                       NOT NULL,
  config     jsonb                      NOT NULL DEFAULT '{}'::jsonb,
  active     boolean                    NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz                NOT NULL DEFAULT now(),
  updated_at timestamptz                NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_cargos (
  id         uuid        NOT NULL DEFAULT uuid_generate_v4(),
  profile_id uuid        NOT NULL,
  cargo_id   uuid        NOT NULL,
  sector_id  uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_sector_requests (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid        NOT NULL,
  sector_id  uuid,
  status     text        NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  cargo_id   uuid
);

CREATE TABLE IF NOT EXISTS public.access_logs (
  id         uuid                 NOT NULL DEFAULT uuid_generate_v4(),
  profile_id uuid,
  resource_id uuid,
  action     public.log_action    NOT NULL,
  ip_address inet,
  user_agent text,
  metadata   jsonb,
  created_at timestamptz          NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id          uuid        NOT NULL DEFAULT uuid_generate_v4(),
  admin_id    uuid,
  action      text        NOT NULL,
  target_type text        NOT NULL,
  target_id   uuid,
  target_name text,
  details     jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PRIMARY KEYS
-- ---------------------------------------------------------------------------
ALTER TABLE public.access_logs             ADD CONSTRAINT IF NOT EXISTS access_logs_pkey             PRIMARY KEY (id);
ALTER TABLE public.admin_logs              ADD CONSTRAINT IF NOT EXISTS admin_logs_pkey              PRIMARY KEY (id);
ALTER TABLE public.announcements           ADD CONSTRAINT IF NOT EXISTS announcements_pkey           PRIMARY KEY (id);
ALTER TABLE public.cargo_permissions       ADD CONSTRAINT IF NOT EXISTS cargo_permissions_pkey       PRIMARY KEY (id);
ALTER TABLE public.cargo_sectors           ADD CONSTRAINT IF NOT EXISTS cargo_sectors_pkey           PRIMARY KEY (cargo_id, sector_id);
ALTER TABLE public.cargos                  ADD CONSTRAINT IF NOT EXISTS cargos_pkey                 PRIMARY KEY (id);
ALTER TABLE public.companies               ADD CONSTRAINT IF NOT EXISTS companies_pkey              PRIMARY KEY (id);
ALTER TABLE public.folders                 ADD CONSTRAINT IF NOT EXISTS folders_pkey                PRIMARY KEY (id);
ALTER TABLE public.integrations            ADD CONSTRAINT IF NOT EXISTS integrations_pkey           PRIMARY KEY (id);
ALTER TABLE public.profile_cargos          ADD CONSTRAINT IF NOT EXISTS profile_cargos_pkey         PRIMARY KEY (id);
ALTER TABLE public.profile_sector_requests ADD CONSTRAINT IF NOT EXISTS profile_sector_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles                ADD CONSTRAINT IF NOT EXISTS profiles_pkey               PRIMARY KEY (id);
ALTER TABLE public.resource_permissions    ADD CONSTRAINT IF NOT EXISTS resource_permissions_pkey   PRIMARY KEY (id);
ALTER TABLE public.resources               ADD CONSTRAINT IF NOT EXISTS resources_pkey              PRIMARY KEY (id);
ALTER TABLE public.sector_members          ADD CONSTRAINT IF NOT EXISTS sector_members_pkey         PRIMARY KEY (id);
ALTER TABLE public.sectors                 ADD CONSTRAINT IF NOT EXISTS sectors_pkey                PRIMARY KEY (id);

-- ---------------------------------------------------------------------------
-- UNIQUE CONSTRAINTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.cargo_permissions       ADD CONSTRAINT IF NOT EXISTS cargo_permissions_cargo_id_resource_id_key        UNIQUE (cargo_id, resource_id);
ALTER TABLE public.companies               ADD CONSTRAINT IF NOT EXISTS companies_slug_key                                 UNIQUE (slug);
ALTER TABLE public.profile_cargos          ADD CONSTRAINT IF NOT EXISTS profile_cargos_profile_id_key                     UNIQUE (profile_id);
ALTER TABLE public.profile_sector_requests ADD CONSTRAINT IF NOT EXISTS profile_sector_requests_profile_id_sector_id_key  UNIQUE (profile_id, sector_id);
ALTER TABLE public.sector_members          ADD CONSTRAINT IF NOT EXISTS sector_members_profile_id_sector_id_key            UNIQUE (profile_id, sector_id);
ALTER TABLE public.sectors                 ADD CONSTRAINT IF NOT EXISTS sectors_company_id_slug_key                        UNIQUE (company_id, slug);

-- ---------------------------------------------------------------------------
-- CHECK CONSTRAINTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD CONSTRAINT IF NOT EXISTS cpf_required_for_cpf_auth
  CHECK ((auth_type = 'google'::public.auth_type) OR (cpf_hash IS NOT NULL));
ALTER TABLE public.profiles ADD CONSTRAINT IF NOT EXISTS recovery_email_required_for_cpf
  CHECK ((auth_type = 'google'::public.auth_type) OR (recovery_email IS NOT NULL));
ALTER TABLE public.resource_permissions ADD CONSTRAINT IF NOT EXISTS one_grantee
  CHECK ((profile_id IS NULL) <> (sector_id IS NULL));

-- ---------------------------------------------------------------------------
-- FOREIGN KEYS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD CONSTRAINT IF NOT EXISTS profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT IF NOT EXISTS profiles_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE public.sectors ADD CONSTRAINT IF NOT EXISTS sectors_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE public.cargos ADD CONSTRAINT IF NOT EXISTS cargos_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE public.cargo_sectors ADD CONSTRAINT IF NOT EXISTS cargo_sectors_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;
ALTER TABLE public.cargo_sectors ADD CONSTRAINT IF NOT EXISTS cargo_sectors_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;

ALTER TABLE public.cargo_permissions ADD CONSTRAINT IF NOT EXISTS cargo_permissions_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;
ALTER TABLE public.cargo_permissions ADD CONSTRAINT IF NOT EXISTS cargo_permissions_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

ALTER TABLE public.folders ADD CONSTRAINT IF NOT EXISTS folders_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD CONSTRAINT IF NOT EXISTS folders_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD CONSTRAINT IF NOT EXISTS folders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.resources ADD CONSTRAINT IF NOT EXISTS resources_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
ALTER TABLE public.resources ADD CONSTRAINT IF NOT EXISTS resources_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.resources ADD CONSTRAINT IF NOT EXISTS resources_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.resource_permissions ADD CONSTRAINT IF NOT EXISTS resource_permissions_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;
ALTER TABLE public.resource_permissions ADD CONSTRAINT IF NOT EXISTS resource_permissions_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.resource_permissions ADD CONSTRAINT IF NOT EXISTS resource_permissions_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.resource_permissions ADD CONSTRAINT IF NOT EXISTS resource_permissions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.sector_members ADD CONSTRAINT IF NOT EXISTS sector_members_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.sector_members ADD CONSTRAINT IF NOT EXISTS sector_members_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;

ALTER TABLE public.announcements ADD CONSTRAINT IF NOT EXISTS announcements_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE public.announcements ADD CONSTRAINT IF NOT EXISTS announcements_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT IF NOT EXISTS announcements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.integrations ADD CONSTRAINT IF NOT EXISTS integrations_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE public.integrations ADD CONSTRAINT IF NOT EXISTS integrations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.profile_cargos ADD CONSTRAINT IF NOT EXISTS profile_cargos_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.profile_cargos ADD CONSTRAINT IF NOT EXISTS profile_cargos_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;
ALTER TABLE public.profile_cargos ADD CONSTRAINT IF NOT EXISTS profile_cargos_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;

ALTER TABLE public.profile_sector_requests ADD CONSTRAINT IF NOT EXISTS profile_sector_requests_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.profile_sector_requests ADD CONSTRAINT IF NOT EXISTS profile_sector_requests_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.profile_sector_requests ADD CONSTRAINT IF NOT EXISTS profile_sector_requests_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;

ALTER TABLE public.access_logs ADD CONSTRAINT IF NOT EXISTS access_logs_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.access_logs ADD CONSTRAINT IF NOT EXISTS access_logs_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE SET NULL;

ALTER TABLE public.admin_logs ADD CONSTRAINT IF NOT EXISTS admin_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_access_logs_created    ON public.access_logs        USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_profile    ON public.access_logs        USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_resource   ON public.access_logs        USING btree (resource_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active   ON public.announcements      USING btree (company_id) WHERE (active = true);
CREATE INDEX IF NOT EXISTS idx_announcements_company  ON public.announcements      USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_announcements_sector   ON public.announcements      USING btree (sector_id) WHERE (sector_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_folders_parent         ON public.folders            USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_folders_sector         ON public.folders            USING btree (sector_id);
CREATE INDEX IF NOT EXISTS idx_integrations_company   ON public.integrations       USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_type     ON public.profiles           USING btree (auth_type);
CREATE INDEX IF NOT EXISTS idx_profiles_company       ON public.profiles           USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_cpf_hash      ON public.profiles           USING btree (cpf_hash) WHERE (cpf_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_res_perm_profile       ON public.resource_permissions USING btree (profile_id) WHERE (profile_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_res_perm_resource      ON public.resource_permissions USING btree (resource_id);
CREATE INDEX IF NOT EXISTS idx_res_perm_sector        ON public.resource_permissions USING btree (sector_id) WHERE (sector_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_resources_active       ON public.resources          USING btree (folder_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_resources_drive        ON public.resources          USING btree (drive_file_id) WHERE (drive_file_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_resources_folder       ON public.resources          USING btree (folder_id);
CREATE INDEX IF NOT EXISTS idx_resources_type         ON public.resources          USING btree (type);
CREATE INDEX IF NOT EXISTS idx_sector_members_profile ON public.sector_members     USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_sector  ON public.sector_members     USING btree (sector_id);
CREATE INDEX IF NOT EXISTS idx_sectors_company        ON public.sectors            USING btree (company_id);

-- ---------------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_company_id()
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_global_role()
  RETURNS public.global_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT global_role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_is_active()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND active = true AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_sector_role(p_sector_id uuid)
  RETURNS public.sector_role LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public' AS $$
  SELECT role FROM sector_members
  WHERE sector_id = p_sector_id AND profile_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_sector_member(p_sector_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM sector_members
    WHERE profile_id = auth.uid() AND sector_id = p_sector_id
  );
$$;

CREATE OR REPLACE FUNCTION public.hash_cpf(cpf_input text)
  RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT crypt(cpf_input, gen_salt('bf', 10));
$$;

CREATE OR REPLACE FUNCTION public.verify_cpf(cpf_input text, cpf_hash text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT cpf_hash = crypt(cpf_input, cpf_hash);
$$;

CREATE OR REPLACE FUNCTION public.find_profile_by_cpf(cpf_digits text)
  RETURNS TABLE(full_name text, recovery_email text, company_id uuid)
  LANGUAGE sql SECURITY DEFINER AS $$
  SELECT full_name, recovery_email, company_id
  FROM profiles
  WHERE auth_type = 'cpf'
    AND active = true
    AND deleted_at IS NULL
    AND cpf_hash = crypt(cpf_digits, cpf_hash)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_log_modification()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.profile_id IS NOT NULL AND NEW.profile_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.resource_id IS NOT NULL AND NEW.resource_id IS NULL THEN
    NEW.id         = OLD.id;
    NEW.profile_id = OLD.profile_id;
    NEW.action     = OLD.action;
    NEW.created_at = OLD.created_at;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Logs de auditoria são imutáveis. Operação negada.';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_resource_permission(p_resource_id uuid)
  RETURNS public.permission_level LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public' AS $$
DECLARE
  v_global_role text;
  v_sector_id   uuid;
  v_sector_role sector_role;
  v_perm        permission_level;
BEGIN
  IF NOT auth_is_active() THEN RETURN 'none'; END IF;

  v_global_role := auth_global_role();
  IF v_global_role IN ('admin', 'manager') THEN RETURN 'edit'; END IF;

  SELECT r.sector_id INTO v_sector_id FROM resources r WHERE r.id = p_resource_id;

  IF v_sector_id IS NOT NULL THEN
    SELECT sm.role INTO v_sector_role
    FROM sector_members sm
    WHERE sm.sector_id = v_sector_id AND sm.profile_id = auth.uid()
    LIMIT 1;
    IF v_sector_role IN ('admin', 'manager') THEN RETURN 'edit'; END IF;
  END IF;

  SELECT rp.permission INTO v_perm
  FROM resource_permissions rp
  WHERE rp.resource_id = p_resource_id AND rp.profile_id = auth.uid()
  LIMIT 1;
  IF v_perm IS NOT NULL THEN RETURN v_perm; END IF;

  SELECT cp.permission INTO v_perm
  FROM profile_cargos pc
  JOIN cargo_permissions cp ON cp.cargo_id = pc.cargo_id
  WHERE pc.profile_id = auth.uid() AND cp.resource_id = p_resource_id
  LIMIT 1;
  IF v_perm IS NOT NULL THEN RETURN v_perm; END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_google_domain_dynamic()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_email     text;
  user_domain    text;
  company_record record;
BEGIN
  user_email  := NEW.email;
  user_domain := '@' || split_part(user_email, '@', 2);
  SELECT * INTO company_record
  FROM companies
  WHERE user_domain = ANY(allowed_domains) AND active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domínio de e-mail não autorizado: %', user_domain;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'pg_catalog' AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IN ('public') THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TRIGGER trg_access_logs_immutable_delete  BEFORE DELETE ON public.access_logs    FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_access_logs_immutable_update  BEFORE UPDATE ON public.access_logs    FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_admin_logs_immutable_delete   BEFORE DELETE ON public.admin_logs     FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_admin_logs_immutable_update   BEFORE UPDATE ON public.admin_logs     FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_companies_updated_at     BEFORE UPDATE ON public.companies      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_folders_updated_at       BEFORE UPDATE ON public.folders        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_integrations_updated_at  BEFORE UPDATE ON public.integrations   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON public.profiles       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_resources_updated_at     BEFORE UPDATE ON public.resources      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sector_members_updated_at BEFORE UPDATE ON public.sector_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sectors_updated_at       BEFORE UPDATE ON public.sectors        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- RLS — ENABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.access_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_sectors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_cargos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_sector_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors                 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS — POLICIES
-- ---------------------------------------------------------------------------

-- access_logs
CREATE POLICY IF NOT EXISTS "access_logs: apenas insert"
  ON public.access_logs FOR INSERT TO public WITH CHECK (auth_is_active());
CREATE POLICY IF NOT EXISTS "access_logs: qualquer autenticado insere"
  ON public.access_logs FOR INSERT TO public WITH CHECK ((profile_id = auth.uid()));
CREATE POLICY IF NOT EXISTS "access_logs: usuário vê os próprios; admin vê todos"
  ON public.access_logs FOR SELECT TO public
  USING (((profile_id = auth.uid()) OR (auth_global_role() = 'admin'::public.global_role)));

-- admin_logs
CREATE POLICY IF NOT EXISTS "admin_logs: apenas admin visualiza"
  ON public.admin_logs FOR SELECT TO public
  USING ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "admin_logs: insert autenticado"
  ON public.admin_logs FOR INSERT TO public WITH CHECK (auth_is_active());

-- announcements
CREATE POLICY IF NOT EXISTS "announcements: admin e manager criam"
  ON public.announcements FOR INSERT TO public
  WITH CHECK ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])));
CREATE POLICY IF NOT EXISTS "announcements: admin e manager editam"
  ON public.announcements FOR UPDATE TO public
  USING ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])));
CREATE POLICY IF NOT EXISTS "announcements: ver da empresa, ativos e não expirados"
  ON public.announcements FOR SELECT TO public
  USING ((company_id = auth_company_id()) AND auth_is_active() AND (active = true)
    AND ((expires_at IS NULL) OR (expires_at > now()))
    AND ((sector_id IS NULL) OR is_sector_member(sector_id)));

-- cargo_permissions
CREATE POLICY IF NOT EXISTS "cargo_permissions: admin gerencia"
  ON public.cargo_permissions FOR ALL TO authenticated
  USING ((auth_global_role() = 'admin'::public.global_role))
  WITH CHECK ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "cargo_permissions: leitura"
  ON public.cargo_permissions FOR SELECT TO authenticated
  USING (auth_is_active() AND EXISTS (
    SELECT 1 FROM cargos c WHERE c.id = cargo_permissions.cargo_id AND c.company_id = auth_company_id()
  ));

-- cargo_sectors
CREATE POLICY IF NOT EXISTS admin_manages_cargo_sectors
  ON public.cargo_sectors FOR ALL TO authenticated
  USING ((auth_global_role() = 'admin'::public.global_role))
  WITH CHECK ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS authenticated_reads_cargo_sectors
  ON public.cargo_sectors FOR SELECT TO authenticated USING (true);

-- cargos
CREATE POLICY IF NOT EXISTS "cargos: admin gerencia"
  ON public.cargos FOR ALL TO authenticated
  USING ((auth_global_role() = 'admin'::public.global_role))
  WITH CHECK ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "cargos: leitura da empresa"
  ON public.cargos FOR SELECT TO authenticated
  USING ((company_id = auth_company_id()) OR (auth_company_id() IS NULL));

-- companies
CREATE POLICY IF NOT EXISTS "companies: apenas admin edita"
  ON public.companies FOR UPDATE TO public
  USING ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "companies: ver apenas a própria empresa"
  ON public.companies FOR SELECT TO public USING ((id = auth_company_id()));
CREATE POLICY IF NOT EXISTS authenticated_can_read_active_companies
  ON public.companies FOR SELECT TO authenticated USING ((active = true));

-- folders
CREATE POLICY IF NOT EXISTS "folders: manager do setor e admin gerenciam"
  ON public.folders FOR ALL TO public
  USING ((auth_global_role() = 'admin'::public.global_role) OR EXISTS (
    SELECT 1 FROM sector_members sm
    WHERE sm.profile_id = auth.uid() AND sm.sector_id = folders.sector_id AND sm.role = 'manager'::public.sector_role
  ));
CREATE POLICY IF NOT EXISTS "folders: ver se é membro do setor"
  ON public.folders FOR SELECT TO public
  USING ((is_sector_member(sector_id) AND auth_is_active()));
CREATE POLICY IF NOT EXISTS admin_manager_can_read_all_folders
  ON public.folders FOR SELECT TO authenticated
  USING ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])));

-- integrations
CREATE POLICY IF NOT EXISTS "integrations: apenas admin gerencia"
  ON public.integrations FOR ALL TO public
  USING ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "integrations: ver da própria empresa"
  ON public.integrations FOR SELECT TO public
  USING ((company_id = auth_company_id()) AND auth_is_active());

-- profile_cargos
CREATE POLICY IF NOT EXISTS "profile_cargos: admin gerencia"
  ON public.profile_cargos FOR ALL TO authenticated
  USING ((auth_global_role() = 'admin'::public.global_role))
  WITH CHECK ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "profile_cargos: usuário vê os próprios"
  ON public.profile_cargos FOR SELECT TO authenticated USING ((profile_id = auth.uid()));

-- profile_sector_requests
CREATE POLICY IF NOT EXISTS "Admins can manage sector requests"
  ON public.profile_sector_requests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.global_role = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "Users and admins can view sector requests"
  ON public.profile_sector_requests FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()) OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.global_role = 'admin'::public.global_role
  ));
CREATE POLICY IF NOT EXISTS "Users can insert own sector requests"
  ON public.profile_sector_requests FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

-- profiles
CREATE POLICY IF NOT EXISTS "Google: auto-registro pendente"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()) AND (auth_type = 'google'::public.auth_type) AND (active = false) AND (global_role = 'member'::public.global_role));
CREATE POLICY IF NOT EXISTS "profiles: admin insere novos usuários"
  ON public.profiles FOR INSERT TO public WITH CHECK ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "profiles: atualizar o próprio perfil"
  ON public.profiles FOR UPDATE TO public
  USING ((id = auth.uid()) OR (auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "profiles: ver perfis da própria empresa"
  ON public.profiles FOR SELECT TO public USING ((company_id = auth_company_id()));

-- resource_permissions
CREATE POLICY IF NOT EXISTS "resource_permissions: admin manager gerencia"
  ON public.resource_permissions FOR ALL TO authenticated
  USING ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])))
  WITH CHECK ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])));
CREATE POLICY IF NOT EXISTS "resource_permissions: usuário vê os próprios"
  ON public.resource_permissions FOR SELECT TO authenticated
  USING (auth_is_active() AND ((profile_id = auth.uid()) OR ((sector_id IS NOT NULL) AND is_sector_member(sector_id))));

-- resources
CREATE POLICY IF NOT EXISTS "resources: leitura com escopo"
  ON public.resources FOR SELECT TO authenticated
  USING ((deleted_at IS NULL) AND (resolve_resource_permission(id) <> 'none'::public.permission_level));
CREATE POLICY IF NOT EXISTS "resources: manager e admin gerenciam"
  ON public.resources FOR ALL TO public
  USING ((auth_global_role() = 'admin'::public.global_role) OR EXISTS (
    SELECT 1 FROM folders f
    JOIN sector_members sm ON sm.sector_id = f.sector_id
    WHERE f.id = resources.folder_id AND sm.profile_id = auth.uid() AND sm.role = 'manager'::public.sector_role
  ));

-- sector_members
CREATE POLICY IF NOT EXISTS "sector_members: admin gerencia membros"
  ON public.sector_members FOR ALL TO public
  USING ((auth_global_role() = 'admin'::public.global_role));
CREATE POLICY IF NOT EXISTS "sector_members: sector admin gerencia"
  ON public.sector_members FOR ALL TO authenticated
  USING ((auth_global_role() = 'admin'::public.global_role) OR (auth_sector_role(sector_id) = 'admin'::public.sector_role))
  WITH CHECK ((auth_global_role() = 'admin'::public.global_role) OR (auth_sector_role(sector_id) = 'admin'::public.sector_role));
CREATE POLICY IF NOT EXISTS "sector_members: ver da própria empresa"
  ON public.sector_members FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM sectors s WHERE s.id = sector_members.sector_id AND s.company_id = auth_company_id()));

-- sectors
CREATE POLICY IF NOT EXISTS "sectors: admin e manager gerenciam"
  ON public.sectors FOR ALL TO public
  USING ((auth_global_role() = ANY (ARRAY['admin'::public.global_role, 'manager'::public.global_role])));
CREATE POLICY IF NOT EXISTS "sectors: ver da própria empresa"
  ON public.sectors FOR SELECT TO public
  USING ((company_id = auth_company_id()) AND auth_is_active());
CREATE POLICY IF NOT EXISTS authenticated_can_read_active_sectors
  ON public.sectors FOR SELECT TO authenticated USING ((active = true));
