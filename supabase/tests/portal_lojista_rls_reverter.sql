-- Reversão da migração 20261026180000_portal_lojista_isolamento_rls.sql (projeto: mowig).
-- Remove só as políticas lojista_negado e o helper; nada mais foi alterado pela migração.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS lojista_negado ON public.%I', t.relname);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.is_lojista();
