-- projeto: mowig,moveria
-- =============================================================================
-- MIGRATION: apps_admin_rls_uppercase
-- Bancos   : empresa (Mowig/Moveria) — guardada por enum global_role, pulada
--            no Core. Pulada também se a tabela public.apps não existir.
--
-- 1. Substitui a policy "FOR ALL" de admin em public.apps por policies
--    separadas de INSERT/UPDATE — sem policy de DELETE. Desativar um app é
--    feito via UPDATE SET active = false (não há exclusão física).
-- 2. Padroniza os nomes já cadastrados dos apps da empresa mowig para CAIXA
--    ALTA (novos nomes são normalizados pela tela de administração).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'apps_admin_rls_uppercase: banco core detectado (sem global_role enum) — migration pulada.';
    RETURN;
  END IF;

  IF to_regclass('public.apps') IS NULL THEN
    RAISE NOTICE 'apps_admin_rls_uppercase: tabela public.apps não existe neste banco — migration pulada.';
    RETURN;
  END IF;

  -- Policies: INSERT/UPDATE restritas a admin da própria empresa.
  -- Sem policy de DELETE — exclusão física não é permitida via RLS;
  -- desativar um app é feito com UPDATE SET active = false.
  DROP POLICY IF EXISTS "apps: admin gerencia os apps da própria empresa" ON public.apps;

  DROP POLICY IF EXISTS "apps: admin insere apps da própria empresa" ON public.apps;
  CREATE POLICY "apps: admin insere apps da própria empresa"
    ON public.apps FOR INSERT
    WITH CHECK (
      auth_global_role() = 'admin'::global_role
      AND company_id = auth_company_id()
    );

  DROP POLICY IF EXISTS "apps: admin atualiza apps da própria empresa" ON public.apps;
  CREATE POLICY "apps: admin atualiza apps da própria empresa"
    ON public.apps FOR UPDATE
    USING (
      auth_global_role() = 'admin'::global_role
      AND company_id = auth_company_id()
    )
    WITH CHECK (
      auth_global_role() = 'admin'::global_role
      AND company_id = auth_company_id()
    );

  -- Padroniza nomes existentes da empresa mowig para CAIXA ALTA.
  UPDATE public.apps
  SET name = upper(name)
  WHERE company_id = (SELECT id FROM public.companies WHERE slug = 'mowig')
    AND name <> upper(name);
END
$$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261001000000_apps_admin_rls_uppercase.sql')
ON CONFLICT (filename) DO NOTHING;
