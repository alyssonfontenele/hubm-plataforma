-- =============================================================================
-- Migration: auth_hooks_table_grants
-- Bancos: Core (core_signup_allowlist) + Mowig/Moveria (companies).
--
-- As funções de hook before_user_created (hook_core_signup_allowlist,
-- hook_restrict_google_signup_by_domain) rodam como supabase_auth_admin, não
-- como superusuário — GRANT EXECUTE na função não basta, é preciso GRANT
-- SELECT nas tabelas que elas consultam. Faltou isso nas migrations originais
-- (20260922150000, 20260922120000): o teste via signup público real no Core
-- falhou com 500 "Error running hook URI" até esse grant ser aplicado — o
-- teste no Mowig não pegou o problema porque o e-mail de teste tinha
-- provider='email' e a função sai cedo (antes do SELECT) nesse caso.
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.core_signup_allowlist') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.core_signup_allowlist TO supabase_auth_admin;
  END IF;

  IF to_regclass('public.companies') IS NOT NULL AND to_regproc('public.hook_restrict_google_signup_by_domain') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.companies TO supabase_auth_admin;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922160000_auth_hooks_table_grants.sql')
ON CONFLICT (filename) DO NOTHING;
