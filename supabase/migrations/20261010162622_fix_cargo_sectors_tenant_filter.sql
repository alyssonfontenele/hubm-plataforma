-- projeto: mowig,moveria
-- =============================================================================
-- MIGRATION: fix_cargo_sectors_tenant_filter
-- Aplica em: hubm-mowig (xpoqiclaqkudznmshzal), hubm-moveria (fzgasvcfxufhrbrdakow)
--            — tabela cargo_sectors não existe no banco Core.
--
-- Achado de auditoria #8 (auditoria/2026-10-10-seguranca-hubm.md):
-- cargo_sectors é tabela de associação (cargo_id, sector_id) sem coluna
-- company_id própria, com policy de SELECT `USING (true)` — permitia
-- leitura cross-tenant da estrutura organizacional de outras empresas.
-- cargos e sectors têm company_id; filtra via join conforme auditoria 2.B.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK: ver auditoria/rollback/20261010050000_fix_cargo_sectors_tenant_filter_rollback.sql
-- -----------------------------------------------------------------------------

DO $migration$
BEGIN
  IF to_regclass('public.cargo_sectors') IS NOT NULL THEN
    DROP POLICY IF EXISTS authenticated_reads_cargo_sectors ON public.cargo_sectors;

    CREATE POLICY authenticated_reads_cargo_sectors ON public.cargo_sectors
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.cargos c
        WHERE c.id = cargo_sectors.cargo_id AND c.company_id = auth_company_id()
      )
      AND EXISTS (
        SELECT 1 FROM public.sectors s
        WHERE s.id = cargo_sectors.sector_id AND s.company_id = auth_company_id()
      )
    );
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010050000_fix_cargo_sectors_tenant_filter.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT policyname, qual FROM pg_policies
--   WHERE schemaname='public' AND tablename='cargo_sectors';
-- =============================================================================
