-- =============================================================================
-- MIGRATION: search_path_core_batch1
-- Aplica em: hubm-plataforma / Core (vtirfoafpmolffzgszhp) APENAS.
--
-- Achado de auditoria #9 (auditoria/2026-10-10-seguranca-hubm.md):
-- funções SECURITY DEFINER com search_path mutável. Corpo não alterado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK: ver auditoria/rollback/20261010030000_search_path_core_batch1_rollback.sql
-- -----------------------------------------------------------------------------

DO $migration$
BEGIN
  IF to_regprocedure('public.auth_is_active()') IS NOT NULL THEN
    ALTER FUNCTION public.auth_is_active() SET search_path = public, pg_temp;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010030000_search_path_core_batch1.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT proname, proconfig FROM pg_proc WHERE proname = 'auth_is_active'
--   AND pronamespace = 'public'::regnamespace;
-- =============================================================================
