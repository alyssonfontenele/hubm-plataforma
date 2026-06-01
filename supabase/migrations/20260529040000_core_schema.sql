-- ---------------------------------------------------------------------------
-- Core schema — HubM Central (vtirfoafpmolffzgszhp)
-- Banco exclusivo do SuperAdmin: apenas companies e company_features.
-- Nenhuma outra tabela é criada aqui.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- auth_global_role — versão simplificada sem profiles
-- Quando chamado com service_role key → retorna 'superadmin'.
-- Quando chamado com JWT autenticado → lê app_metadata.global_role.
--
-- Guard: em dev local todas as migrations rodam no mesmo banco.
-- baseline_schema já criou auth_global_role() retornando public.global_role.
-- Pulamos aqui para não gerar conflito de tipo de retorno.
-- Em produção (banco core) a função não existe → cria normalmente.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_global_role'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.auth_global_role()
        RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $body$
        SELECT CASE
          WHEN auth.role() = 'service_role' THEN 'superadmin'
          ELSE coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'global_role'),
            ''
          )
        END;
        $body$;
    $f$;
  END IF;
END $$;

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

DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
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

DROP POLICY IF EXISTS "company_features_superadmin_all" ON public.company_features;
CREATE POLICY "company_features_superadmin_all"
  ON public.company_features FOR ALL TO public
  USING     (auth_global_role() = 'superadmin')
  WITH CHECK (auth_global_role() = 'superadmin');
