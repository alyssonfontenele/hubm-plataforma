-- =============================================================================
-- Migration: moveria_itens_contrato_check_lote_locked
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Cria trigger BEFORE UPDATE OF aptidao, aptidao_obs em moveria_itens_contrato.
-- Guarda: se OLD.lote_id IS NOT NULL e aptidao/aptidao_obs mudam → RAISE.
-- Bloqueia TODOS (sem exceção de admin) — decisão de produto.
-- Não interfere com: UPDATE OF lote_id (conformação/dissolução), UPDATE de outros
--   campos (medicao_id, status_item…), itens sem lote.
-- Guard: moveria_designacoes ausente → pula (Core/Mowig).
-- Idempotente: verifica existência do trigger antes de criar.
-- =============================================================================

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_designacoes'
  ) THEN
    RAISE NOTICE 'check_lote_locked: banco não é Moveria — pulado.'; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname     = 'trg_moveria_itens_check_lote_locked'
      AND tgrelid    = 'public.moveria_itens_contrato'::regclass
  ) THEN
    RAISE NOTICE 'trg_moveria_itens_check_lote_locked já existe — nada a fazer.'; RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.moveria_fn_check_lote_locked()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $body$
  BEGIN
    IF OLD.lote_id IS NOT NULL
      AND (
        NEW.aptidao    IS DISTINCT FROM OLD.aptidao
        OR NEW.aptidao_obs IS DISTINCT FROM OLD.aptidao_obs
      )
    THEN
      RAISE EXCEPTION 'Ambiente já conformado em lote — aptidão não pode ser alterada. Desfaça o lote primeiro.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END;
  $body$;

  CREATE TRIGGER trg_moveria_itens_check_lote_locked
    BEFORE UPDATE OF aptidao, aptidao_obs
    ON public.moveria_itens_contrato
    FOR EACH ROW
    EXECUTE FUNCTION public.moveria_fn_check_lote_locked();

  RAISE NOTICE 'trg_moveria_itens_check_lote_locked criado em moveria_itens_contrato.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260619030000_moveria_itens_contrato_check_lote_locked.sql')
ON CONFLICT (filename) DO NOTHING;
