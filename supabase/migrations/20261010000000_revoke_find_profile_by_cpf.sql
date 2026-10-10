-- =============================================================================
-- MIGRATION: revoke_find_profile_by_cpf
-- Aplica em: hubm-mowig (xpoqiclaqkudznmshzal), hubm-moveria (fzgasvcfxufhrbrdakow)
--            — função não existe no banco Core (confirmado via advisors).
--
-- Achado de auditoria #2 (auditoria/2026-10-10-seguranca-hubm.md):
-- find_profile_by_cpf é SECURITY DEFINER, chamável direto por anon via
-- /rest/v1/rpc/find_profile_by_cpf, pulando por completo o rate-limit de 5
-- tentativas/15min de recover-cpf-password e permitindo brute-force de CPF
-- com vazamento de full_name + recovery_email.
--
-- Fix: revoga EXECUTE de PUBLIC/anon/authenticated, mantém só para
-- service_role (único chamador legítimo, dentro de recover-cpf-password).
-- Também fixa search_path — mutável desde a redefinição em
-- 20260922130000_profiles_anonymized_at.sql, que não repetiu o
-- `SET search_path` presente na definição original do baseline.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public.find_profile_by_cpf(text) TO anon, authenticated;
-- ALTER FUNCTION public.find_profile_by_cpf(text) RESET search_path;
-- -----------------------------------------------------------------------------

DO $migration$
BEGIN
  IF to_regprocedure('public.find_profile_by_cpf(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.find_profile_by_cpf(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.find_profile_by_cpf(text) FROM anon;
    REVOKE ALL ON FUNCTION public.find_profile_by_cpf(text) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.find_profile_by_cpf(text) TO service_role;

    ALTER FUNCTION public.find_profile_by_cpf(text) SET search_path = extensions, public;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010000000_revoke_find_profile_by_cpf.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT has_function_privilege('anon', 'public.find_profile_by_cpf(text)', 'EXECUTE');
-- -- esperado: false
-- =============================================================================
