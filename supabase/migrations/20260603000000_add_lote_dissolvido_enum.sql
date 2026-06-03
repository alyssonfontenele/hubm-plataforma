-- =============================================================================
-- MIGRATION: add_lote_dissolvido_enum
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Guards:    moveria_tipo_evento ausente → pula (Core, Mowig)
--            IF NOT EXISTS → idempotente
--
-- ATENÇÃO: ALTER TYPE ADD VALUE deve rodar em migration PRÓPRIA e ANTERIOR
-- à migration que referencia o novo valor em INSERT/UPDATE, para garantir
-- que o valor está confirmado (committed) antes de ser usado.
-- A migration moveria_fase3_lotes (20260603010000) depende desta.
-- =============================================================================

DO $enum_guard$
BEGIN
  -- Guard: moveria_tipo_evento só existe no banco Moveria
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'moveria_tipo_evento'
  ) THEN
    RAISE NOTICE 'add_lote_dissolvido_enum: moveria_tipo_evento ausente — pulada (Core/Mowig).';
    RETURN;
  END IF;

  ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'lote_dissolvido' AFTER 'lote_reaberto';
  RAISE NOTICE 'add_lote_dissolvido_enum: valor ''lote_dissolvido'' adicionado ao enum moveria_tipo_evento.';
END $enum_guard$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603000000_add_lote_dissolvido_enum.sql')
ON CONFLICT (filename) DO NOTHING;
