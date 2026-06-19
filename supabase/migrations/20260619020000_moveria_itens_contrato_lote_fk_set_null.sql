-- =============================================================================
-- Migration: moveria_itens_contrato_lote_fk_set_null
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Corrige FK moveria_itens_contrato_lote_id_fkey para ON DELETE SET NULL.
-- Contexto: migration 20260610000002 corrigiu moveria_eventos mas esqueceu
-- moveria_itens_contrato. O trigger moveria_fn_dissolver_lote depende deste
-- SET NULL para funcionar (o comentário interno da função já referenciava isso).
-- Guard: moveria_designacoes ausente → pula (Core/Mowig).
-- =============================================================================

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_designacoes'
  ) THEN
    RAISE NOTICE 'itens_contrato_lote_fk_set_null: banco não é Moveria — pulado.'; RETURN;
  END IF;

  -- Recriar FK com ON DELETE SET NULL (mantendo mesmo nome)
  ALTER TABLE public.moveria_itens_contrato
    DROP CONSTRAINT IF EXISTS moveria_itens_contrato_lote_id_fkey;

  ALTER TABLE public.moveria_itens_contrato
    ADD CONSTRAINT moveria_itens_contrato_lote_id_fkey
      FOREIGN KEY (lote_id) REFERENCES public.moveria_lotes(id) ON DELETE SET NULL;

  RAISE NOTICE 'FK moveria_itens_contrato_lote_id_fkey atualizada para ON DELETE SET NULL.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260619020000_moveria_itens_contrato_lote_fk_set_null.sql')
ON CONFLICT (filename) DO NOTHING;
