-- =============================================================================
-- MIGRATION: tarefas_flag
-- Backfill da feature flag 'tarefas' em company_features para todas as empresas
-- existentes. enabled=false por padrão — o superadmin ou admin habilita no painel.
--
-- config inicial: { "papeis_liberados": [] }  →  fail-closed: nenhum papel
-- liberado até configuração explícita.
--
-- Roda em: Mowig, Moveria, Core (todos têm companies + company_features).
-- Idempotente: ON CONFLICT (company_id, feature_slug) DO NOTHING.
-- =============================================================================

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    RAISE NOTICE 'tarefas_flag: tabela companies ausente — pulado.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_features'
  ) THEN
    RAISE NOTICE 'tarefas_flag: tabela company_features ausente — pulado.';
    RETURN;
  END IF;

  INSERT INTO public.company_features (company_id, feature_slug, enabled, config)
  SELECT
    id,
    'tarefas',
    false,
    '{"papeis_liberados":[]}'::jsonb
  FROM public.companies
  ON CONFLICT (company_id, feature_slug) DO NOTHING;

  RAISE NOTICE 'tarefas_flag: feature tarefas garantida para todas as empresas.';

  INSERT INTO public.schema_migrations (filename)
  VALUES ('20260611000000_tarefas_flag.sql')
  ON CONFLICT (filename) DO NOTHING;
END $migration$;
