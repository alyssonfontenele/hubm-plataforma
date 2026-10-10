-- projeto: mowig
-- =============================================================================
-- MIGRATION: search_path_mowig_batch1
-- Aplica em: hubm-mowig (xpoqiclaqkudznmshzal) APENAS.
--
-- Achado de auditoria #9 (auditoria/2026-10-10-seguranca-hubm.md):
-- funções SECURITY DEFINER com search_path mutável (hijacking teórico via
-- search_path). Corpo das funções não foi alterado, apenas SET search_path.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK: ver auditoria/rollback/20261010020000_search_path_mowig_batch1_rollback.sql
-- -----------------------------------------------------------------------------

DO $migration$
BEGIN
  IF to_regprocedure('public.auth_company_id()') IS NOT NULL THEN
    ALTER FUNCTION public.auth_company_id() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.auth_global_role()') IS NOT NULL THEN
    ALTER FUNCTION public.auth_global_role() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.auth_is_active()') IS NOT NULL THEN
    ALTER FUNCTION public.auth_is_active() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.is_sector_member(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.is_sector_member(uuid) SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.validate_google_domain_dynamic()') IS NOT NULL THEN
    ALTER FUNCTION public.validate_google_domain_dynamic() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.hash_cpf(text)') IS NOT NULL THEN
    ALTER FUNCTION public.hash_cpf(text) SET search_path = extensions, pg_temp;
  END IF;
  IF to_regprocedure('public.verify_cpf(text, text)') IS NOT NULL THEN
    ALTER FUNCTION public.verify_cpf(text, text) SET search_path = extensions, pg_temp;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010020000_search_path_mowig_batch1.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT proname, proconfig FROM pg_proc WHERE proname IN (
--   'auth_company_id','auth_global_role','auth_is_active','is_sector_member',
--   'validate_google_domain_dynamic','hash_cpf','verify_cpf'
-- ) AND pronamespace = 'public'::regnamespace;
-- =============================================================================
