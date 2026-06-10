-- =============================================================================
-- moveria_eventos.lote_id: muda FK de RESTRICT para ON DELETE SET NULL
--
-- PROBLEMA (código 23503 no db reset):
--   O trigger BEFORE DELETE de moveria_lotes insere um evento 'lote_dissolvido'
--   com lote_id = OLD.id. Em seguida o próprio DELETE do lote falha porque
--   moveria_eventos.lote_id FK é RESTRICT — o evento recém-criado referencia
--   o lote que está sendo removido.
--
-- SOLUÇÃO — ON DELETE SET NULL:
--   Após o DELETE do lote ser concluído, o banco anula automaticamente
--   moveria_eventos.lote_id em todos os eventos que referenciavam aquele lote.
--   O evento fica no log (auditoria preservada); lote_id fica NULL.
--
-- TRILHA DE AUDITORIA PÓS-DISSOLUÇÃO:
--   Com lote_id = NULL, a rastreabilidade é garantida via payload jsonb:
--     payload->>'numero'      — número do lote no contrato (ex.: "3")
--     payload->>'contrato_id' — UUID do contrato ao qual pertencia o lote
--     payload->>'origem'      — identifica chamador: 'service_role' ou 'usuario'
--
--   Para buscar o evento de dissolução de um lote, use:
--     SELECT * FROM moveria_eventos
--     WHERE tipo = 'lote_dissolvido'
--       AND payload->>'numero'      = '<numero>'
--       AND payload->>'contrato_id' = '<contrato_id>';
--
-- DRIFT REMOTO: no banco Moveria remoto (fzgasvcfxufhrbrdakow), a FK é
--   NO ACTION (sem cascade). Esta migration introduz divergência intencional.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_eventos'
  ) THEN
    RAISE NOTICE 'moveria_eventos_lote_fk_set_null: moveria_eventos ausente — pulado.';
    RETURN;
  END IF;
END $guard$;

ALTER TABLE moveria_eventos
  DROP CONSTRAINT IF EXISTS moveria_eventos_lote_id_fkey;

ALTER TABLE moveria_eventos
  ADD CONSTRAINT moveria_eventos_lote_id_fkey
    FOREIGN KEY (lote_id)
    REFERENCES moveria_lotes(id)
    ON DELETE SET NULL;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260610000002_moveria_eventos_lote_fk_set_null.sql')
ON CONFLICT (filename) DO NOTHING;
