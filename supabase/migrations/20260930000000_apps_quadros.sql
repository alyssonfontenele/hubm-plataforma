-- =============================================================================
-- MIGRATION: apps_quadros
-- Bancos   : só mowig (empresa com slug 'mowig'). Pulada em qualquer banco
--            sem a tabela public.apps (ex.: core) ou sem essa empresa (ex.:
--            moveria) — a rotina de deploy (deploy-migrations.sh) aplica esta
--            migration em todos os projetos, sem rotear por banco.
--
-- Insere o app "Quadros de Produção" (painel da mowig-api, mesmo padrão
-- data-driven do "Estoque de Chapas" em 20260925010000_apps.sql) em
-- public.apps, logo após o Chapas na ordenação da sidebar (sort_order maior).
-- =============================================================================

DO $$
DECLARE
  v_company_id uuid;
BEGIN
  IF to_regclass('public.apps') IS NULL THEN
    RAISE NOTICE 'apps_quadros: tabela public.apps não existe neste banco (core?) — migration pulada.';
    RETURN;
  END IF;

  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mowig';
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'apps_quadros: empresa com slug ''mowig'' não encontrada neste banco (moveria?) — migration pulada.';
    RETURN;
  END IF;

  INSERT INTO public.apps (company_id, name, slug, icon, url, sort_order)
  VALUES (
    v_company_id,
    'QUADROS DE PRODUÇÃO',
    'quadros',
    'layout-grid',
    'https://mowig-api-596192369800.southamerica-east1.run.app/quadros/',
    10
  )
  ON CONFLICT (company_id, slug) DO NOTHING;
END
$$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260930000000_apps_quadros.sql')
ON CONFLICT (filename) DO NOTHING;
