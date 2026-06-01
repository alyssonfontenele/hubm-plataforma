-- =============================================================================
-- MIGRATION: core_rls_superadmin
-- Projeto  : hubm-core (vtirfoafpmolffzgszhp)
-- Objetivo : Substituir USING(true) por auth_is_superadmin() em todas as
--            tabelas do core, com policies granulares por operação.
--
-- O role 'superadmin' fica em user_metadata.global_role no JWT Supabase
-- (campo raw_user_meta_data no auth.users).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP POLICY IF EXISTS "companies_superadmin_select"          ON public.companies;
-- DROP POLICY IF EXISTS "companies_superadmin_insert"          ON public.companies;
-- DROP POLICY IF EXISTS "companies_superadmin_update"          ON public.companies;
-- DROP POLICY IF EXISTS "companies_superadmin_delete"          ON public.companies;
-- DROP POLICY IF EXISTS "company_features_superadmin_select"   ON public.company_features;
-- DROP POLICY IF EXISTS "company_features_superadmin_insert"   ON public.company_features;
-- DROP POLICY IF EXISTS "company_features_superadmin_update"   ON public.company_features;
-- DROP POLICY IF EXISTS "company_features_superadmin_delete"   ON public.company_features;
-- DROP POLICY IF EXISTS "profiles_superadmin_select"           ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_superadmin_insert"           ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_superadmin_update"           ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_superadmin_delete"           ON public.profiles;
-- DROP FUNCTION IF EXISTS public.auth_is_superadmin();
-- CREATE POLICY "superadmin_all" ON public.companies       FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "superadmin_all" ON public.company_features FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "superadmin_all" ON public.profiles        FOR ALL USING (true) WITH CHECK (true);
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. Remover policies abertas existentes (todos os nomes possíveis)
-- =============================================================================
DROP POLICY IF EXISTS "superadmin_all"               ON public.companies;
DROP POLICY IF EXISTS "companies_core_access"        ON public.companies;
DROP POLICY IF EXISTS "companies_superadmin_all"     ON public.companies;

DROP POLICY IF EXISTS "superadmin_all"               ON public.company_features;
DROP POLICY IF EXISTS "company_features_core_access" ON public.company_features;
DROP POLICY IF EXISTS "company_features_superadmin_all" ON public.company_features;

DROP POLICY IF EXISTS "superadmin_all"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_core_access"         ON public.profiles;

-- =============================================================================
-- 2. Função auth_is_superadmin()
--    Retorna true para:
--    - Chamadas via service_role key (backend interno)
--    - Sessões JWT com user_metadata.global_role = 'superadmin'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auth_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'user_metadata' ->> 'global_role') = 'superadmin',
    false
  );
$$;

-- =============================================================================
-- 3. Policies granulares — companies
-- =============================================================================
DROP POLICY IF EXISTS "companies_superadmin_select" ON public.companies;
CREATE POLICY "companies_superadmin_select"
  ON public.companies FOR SELECT
  USING (auth_is_superadmin());

DROP POLICY IF EXISTS "companies_superadmin_insert" ON public.companies;
CREATE POLICY "companies_superadmin_insert"
  ON public.companies FOR INSERT
  WITH CHECK (auth_is_superadmin());

DROP POLICY IF EXISTS "companies_superadmin_update" ON public.companies;
CREATE POLICY "companies_superadmin_update"
  ON public.companies FOR UPDATE
  USING      (auth_is_superadmin())
  WITH CHECK (auth_is_superadmin());

DROP POLICY IF EXISTS "companies_superadmin_delete" ON public.companies;
CREATE POLICY "companies_superadmin_delete"
  ON public.companies FOR DELETE
  USING (auth_is_superadmin());

-- =============================================================================
-- 4. Policies granulares — company_features
-- =============================================================================
DROP POLICY IF EXISTS "company_features_superadmin_select" ON public.company_features;
CREATE POLICY "company_features_superadmin_select"
  ON public.company_features FOR SELECT
  USING (auth_is_superadmin());

DROP POLICY IF EXISTS "company_features_superadmin_insert" ON public.company_features;
CREATE POLICY "company_features_superadmin_insert"
  ON public.company_features FOR INSERT
  WITH CHECK (auth_is_superadmin());

DROP POLICY IF EXISTS "company_features_superadmin_update" ON public.company_features;
CREATE POLICY "company_features_superadmin_update"
  ON public.company_features FOR UPDATE
  USING      (auth_is_superadmin())
  WITH CHECK (auth_is_superadmin());

DROP POLICY IF EXISTS "company_features_superadmin_delete" ON public.company_features;
CREATE POLICY "company_features_superadmin_delete"
  ON public.company_features FOR DELETE
  USING (auth_is_superadmin());

-- =============================================================================
-- 5. Policies granulares — profiles
--    SELECT/UPDATE: superadmin OU próprio usuário (owner access)
--    INSERT/DELETE: apenas superadmin
-- =============================================================================
DROP POLICY IF EXISTS "profiles_superadmin_select" ON public.profiles;
CREATE POLICY "profiles_superadmin_select"
  ON public.profiles FOR SELECT
  USING (auth_is_superadmin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_superadmin_insert" ON public.profiles;
CREATE POLICY "profiles_superadmin_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth_is_superadmin());

DROP POLICY IF EXISTS "profiles_superadmin_update" ON public.profiles;
CREATE POLICY "profiles_superadmin_update"
  ON public.profiles FOR UPDATE
  USING      (auth_is_superadmin() OR id = auth.uid())
  WITH CHECK (auth_is_superadmin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_superadmin_delete" ON public.profiles;
CREATE POLICY "profiles_superadmin_delete"
  ON public.profiles FOR DELETE
  USING (auth_is_superadmin());

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT policyname, tablename, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- =============================================================================
