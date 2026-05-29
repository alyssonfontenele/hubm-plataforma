-- ---------------------------------------------------------------------------
-- Core schema — HubM Central (vtirfoafpmolffzgszhp)
-- Banco exclusivo do SuperAdmin: apenas companies e company_features.
-- Nenhuma outra tabela é criada aqui.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- auth_global_role — versão simplificada sem profiles
-- Quando chamado com service_role key → retorna 'superadmin'.
-- Quando chamado com JWT autenticado → lê app_metadata.global_role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_global_role()
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN 'superadmin'
    ELSE coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'global_role'),
      ''
    )
  END;
$$;

-- ---------------------------------------------------------------------------
-- TABLE: companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  slug            text        NOT NULL,
  name            text        NOT NULL,
  domain          text,
  logo_url        text,
  favicon_url     text,
  primary_color   text                 DEFAULT '#C4622D',
  email_sender    text,
  allowed_domains text[]      NOT NULL DEFAULT '{}'::text[],
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_slug_key UNIQUE (slug)
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_superadmin_all"
  ON public.companies FOR ALL TO public
  USING     (auth_global_role() = 'superadmin')
  WITH CHECK (auth_global_role() = 'superadmin');

-- ---------------------------------------------------------------------------
-- TABLE: company_features
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_features (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_slug text        NOT NULL,
  enabled      boolean     NOT NULL DEFAULT false,
  config       jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_features_pkey PRIMARY KEY (id),
  CONSTRAINT company_features_company_id_feature_slug_key UNIQUE (company_id, feature_slug)
);

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_features_superadmin_all"
  ON public.company_features FOR ALL TO public
  USING     (auth_global_role() = 'superadmin')
  WITH CHECK (auth_global_role() = 'superadmin');
