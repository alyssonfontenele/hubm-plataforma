-- ---------------------------------------------------------------------------
-- Plugin system — Phase 0
-- ---------------------------------------------------------------------------

-- Table: stores which features/plugins are enabled per company
CREATE TABLE public.company_features (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_slug TEXT        NOT NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT false,
  config       JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_slug)
);

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

-- Superadmin: full CRUD
CREATE POLICY "company_features_superadmin_all"
  ON public.company_features FOR ALL TO public
  USING     (auth_global_role() = 'superadmin'::public.global_role)
  WITH CHECK (auth_global_role() = 'superadmin'::public.global_role);

-- All authenticated company members: read their own company's features
-- (needed for useHasFeature hook used in sidebar / route guards)
CREATE POLICY "company_features_member_select"
  ON public.company_features FOR SELECT TO public
  USING (company_id = auth_company_id());

-- ---------------------------------------------------------------------------
-- cargos: add plugin_slug for future cargo-level feature scoping
-- ---------------------------------------------------------------------------
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS plugin_slug TEXT DEFAULT NULL;
