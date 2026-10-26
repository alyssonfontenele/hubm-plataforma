-- projeto: mowig
-- J558 · POR-H1: isolamento do lojista do Portal Mowig no banco.
-- Lojista = usuário do Auth com app_metadata.tipo = 'lojista' (gravado só pelo servidor; o usuário não consegue alterar).
-- Ele NÃO tem linha em profiles. Várias políticas hoje só exigem "estar autenticado"
-- (ex.: companies/sectors "authenticated_can_read_active_*", "Google: auto-registro pendente",
-- access_logs/profile_sector_requests insert). Esta migração é ADITIVA e idempotente:
--   1) helper public.is_lojista();
--   2) uma política RESTRICTIVE "lojista_negado" (FOR ALL, TO authenticated) em TODA tabela de public:
--      como é RESTRICTIVE, é combinada com AND às políticas existentes — nenhuma política existente é alterada,
--      e o colaborador (is_lojista() = false) continua exatamente como está.
-- Reverter: ver supabase/tests/portal_lojista_rls_reverter.sql

CREATE OR REPLACE FUNCTION public.is_lojista()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'tipo') = 'lojista', false);
$$;

REVOKE ALL ON FUNCTION public.is_lojista() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lojista() TO anon, authenticated, service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS lojista_negado ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY lojista_negado ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_lojista()) WITH CHECK (NOT public.is_lojista())',
      t.relname
    );
  END LOOP;
END $$;
