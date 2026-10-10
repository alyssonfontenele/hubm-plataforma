-- Rollback de 20261010050000_fix_cargo_sectors_tenant_filter.sql — NÃO aplicado automaticamente.
DROP POLICY IF EXISTS authenticated_reads_cargo_sectors ON public.cargo_sectors;
CREATE POLICY authenticated_reads_cargo_sectors ON public.cargo_sectors
FOR SELECT TO authenticated
USING (true);
