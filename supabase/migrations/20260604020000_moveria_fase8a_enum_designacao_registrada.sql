-- =============================================================================
-- Migration: moveria_fase8a — ADD VALUE ao enum moveria_tipo_evento
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- ISOLADA intencionalmente: ALTER TYPE ADD VALUE não pode ser consumido
-- na mesma transação em que é criado (Postgres).
-- Esta migration deve ser commitada ANTES de qualquer migration/RPC/código
-- que referencie 'designacao_registrada'.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='moveria_eventos') THEN
    RAISE NOTICE 'fase8a: moveria_eventos ausente — pulada.'; RETURN;
  END IF;
END $guard$;

ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'designacao_registrada'
  AFTER 'designacao_desativada';

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604020000_moveria_fase8a_enum_designacao_registrada.sql')
ON CONFLICT (filename) DO NOTHING;
