-- =============================================================================
-- MIGRATION: apps
-- Bancos   : empresa (Mowig/Moveria) — guardada por enum global_role, pulada
--            no Core (mesmo padrão de 20260531010000_company_rls_audit.sql).
--
-- Tabela public.apps: mini-apps embutidos por iframe (ex.: Google Apps Script)
-- listados na sidebar em "Apps" e renderizados em /app/apps/$slug.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'apps: banco core detectado (sem global_role enum) — migration pulada.';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.apps (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id),
    sector_id   uuid        NULL REFERENCES public.sectors(id) ON DELETE SET NULL,
    name        text        NOT NULL,
    slug        text        NOT NULL,
    url         text        NOT NULL,
    icon        text,
    sort_order  int         NOT NULL DEFAULT 0,
    active      boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT apps_pkey PRIMARY KEY (id),
    CONSTRAINT apps_company_slug_key UNIQUE (company_id, slug)
  );

  ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

  IF to_regproc('public.set_updated_at') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_apps_updated_at ON public.apps;
    CREATE TRIGGER trg_apps_updated_at BEFORE UPDATE ON public.apps
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  DROP POLICY IF EXISTS "apps: ver apps ativos da própria empresa" ON public.apps;
  CREATE POLICY "apps: ver apps ativos da própria empresa"
    ON public.apps FOR SELECT
    USING (
      company_id = auth_company_id()
      AND active
      AND auth_is_active()
    );

  DROP POLICY IF EXISTS "apps: admin gerencia os apps da própria empresa" ON public.apps;
  CREATE POLICY "apps: admin gerencia os apps da própria empresa"
    ON public.apps FOR ALL
    USING (
      auth_global_role() = 'admin'::global_role
      AND company_id = auth_company_id()
    )
    WITH CHECK (
      auth_global_role() = 'admin'::global_role
      AND company_id = auth_company_id()
    );

  INSERT INTO public.apps (company_id, name, slug, icon, url)
  VALUES (
    'd41d17e7-b1c2-4c2e-b886-d994a5eac81e',
    'Estoque de Chapas',
    'piloto',
    'layers',
    'https://script.google.com/macros/s/AKfycby4cClOECN53Z33cEw63M-cAvI29J-I5IeQvCQB6MxHVgSTeR0ujaQ44zppjYM6eBT8/exec'
  )
  ON CONFLICT (company_id, slug) DO NOTHING;
END
$$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260925010000_apps.sql')
ON CONFLICT (filename) DO NOTHING;
