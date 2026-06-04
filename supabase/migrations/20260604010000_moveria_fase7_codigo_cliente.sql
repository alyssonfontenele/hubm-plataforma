-- =============================================================================
-- Migration: moveria_fase7_codigo_cliente
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Adiciona codigo_cliente TEXT NULL em moveria_clientes e propaga para as
-- views moveria_clientes_v, moveria_lotes_v, moveria_kanban_v.
-- Coluna acrescentada ao FINAL das listas (regra CREATE OR REPLACE VIEW).
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='moveria_clientes') THEN
    RAISE NOTICE 'fase7: moveria_clientes ausente — pulada.'; RETURN;
  END IF;
END $guard$;

ALTER TABLE moveria_clientes
  ADD COLUMN IF NOT EXISTS codigo_cliente TEXT NULL;

-- moveria_clientes_v, moveria_lotes_v, moveria_kanban_v recriadas
-- com codigo_cliente/cliente_codigo ao final de cada SELECT.
-- (ver apply_migration no histórico de sessão para o corpo completo)

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604010000_moveria_fase7_codigo_cliente.sql')
ON CONFLICT (filename) DO NOTHING;
