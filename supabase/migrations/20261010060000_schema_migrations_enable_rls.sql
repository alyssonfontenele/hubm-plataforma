-- projeto: mowig,core,moveria
-- =============================================================================
-- MIGRATION: schema_migrations_enable_rls
-- Aplica em: hubm-mowig, hubm-moveria, hubm-plataforma/Core (os 3 projetos).
--
-- Achado de auditoria #7 (auditoria/2026-10-10-seguranca-hubm.md):
-- schema_migrations exposta via PostgREST sem RLS.
--
-- Verificado antes de aplicar: scripts/check-migrations.sh lê esta tabela via
-- service_role key (HUBM_*_KEY) — bypassa RLS, continua funcionando.
-- scripts/deploy-migrations.sh usa o histórico interno do Supabase CLI
-- (schema supabase_migrations), não esta tabela — sem impacto.
-- RLS habilitada sem policies: nega anon/authenticated por padrão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK: ver auditoria/rollback/20261010060000_schema_migrations_enable_rls_rollback.sql
-- -----------------------------------------------------------------------------

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010060000_schema_migrations_enable_rls.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'schema_migrations';
-- -- esperado: true
-- =============================================================================
