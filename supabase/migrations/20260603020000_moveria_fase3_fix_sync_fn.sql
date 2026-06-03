-- =============================================================================
-- MIGRATION: moveria_fase3_fix_sync_fn
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Guards:    moveria_lotes ausente → pula (Core, Mowig)
--            fn body já enxuto (sem v_item_contrato) → idempotente
--
-- Corrige dead code em moveria_fn_sync_lote_id_on_insert introduzido em
-- 20260603010000_moveria_fase3_lotes: como contrato_id agora é NOT NULL,
-- o branch "UPDATE moveria_lotes SET contrato_id=... WHERE contrato_id IS NULL"
-- nunca é verdadeiro. Remove:
--   · variável v_item_contrato do DECLARE
--   · c.id do SELECT (alimentava v_item_contrato)
--   · UPDATE de contrato_id (condição WHERE sempre falsa)
-- Mantém o setter de cliente_id: campo ainda nullable, lido por
-- moveria_fn_check_lote_item_insert na guarda de admin cross-contrato.
-- =============================================================================

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_lotes'
  ) THEN
    RAISE NOTICE 'moveria_fase3_fix_sync_fn: moveria_lotes ausente — pulada (Core/Mowig).';
    RETURN;
  END IF;

  -- Idempotência: detecta se a variável morta ainda existe no corpo da função
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'moveria_fn_sync_lote_id_on_insert'
      AND prosrc LIKE '%v_item_contrato%'
  ) THEN
    RAISE NOTICE 'moveria_fase3_fix_sync_fn: função já está enxuta — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'moveria_fase3_fix_sync_fn: removendo dead code de moveria_fn_sync_lote_id_on_insert…';

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_sync_lote_id_on_insert()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_item_cliente uuid;
    BEGIN
      UPDATE moveria_itens_contrato
      SET lote_id = NEW.lote_id, atualizado_em = now()
      WHERE id = NEW.item_id;

      SELECT c.cliente_id INTO v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

      UPDATE moveria_lotes
      SET cliente_id = v_item_cliente, atualizado_em = now()
      WHERE id = NEW.lote_id AND cliente_id IS NULL;

      INSERT INTO moveria_eventos (tipo, item_id, lote_id, autor_id, payload)
      VALUES (
        'item_adicionado_lote', NEW.item_id, NEW.lote_id, NEW.adicionado_por,
        jsonb_build_object('item_id', NEW.item_id, 'lote_id', NEW.lote_id)
      );

      RETURN NEW;
    END;
    $body$
  $f$;

  RAISE NOTICE 'moveria_fase3_fix_sync_fn: concluído.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603020000_moveria_fase3_fix_sync_fn.sql')
ON CONFLICT (filename) DO NOTHING;
