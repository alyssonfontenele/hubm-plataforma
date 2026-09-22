-- =============================================================================
-- Migration: auth_is_superadmin_app_metadata
-- Bancos: Core, Mowig, Moveria (auth_is_superadmin() existe idêntica nos 3 —
-- usada pelas policies companies_superadmin_*, company_features_superadmin_*
-- e profiles_superadmin_* de cada banco).
--
-- auth_is_superadmin() autorizava lendo user_metadata.global_role do JWT
-- (raw_user_meta_data em auth.users). user_metadata é editável pelo PRÓPRIO
-- usuário via supabase.auth.updateUser({ data: {...} })  — qualquer usuário
-- autenticado podia se autopromover a superadmin chamando isso no console do
-- navegador. app_metadata (raw_app_meta_data) só é editável via Admin API
-- (service_role) — nunca pelo cliente.
-- =============================================================================

DO $migration$
BEGIN
  IF to_regproc('public.auth_is_superadmin') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.auth_is_superadmin()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $fn$
      SELECT COALESCE(
        auth.role() = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'global_role') = 'superadmin',
        false
      );
    $fn$;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922140000_auth_is_superadmin_app_metadata.sql')
ON CONFLICT (filename) DO NOTHING;
