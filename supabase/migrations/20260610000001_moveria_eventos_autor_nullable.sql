-- =============================================================================
-- moveria_eventos: autor_id nullable + CHECK de identificação + dissolução
--
-- DECISÃO DE AUDITORIA (10/06/2026):
--   autor_id torna-se nullable para suportar eventos gerados por service_role
--   ou triggers internos onde auth.uid() = NULL. Como compensação, todo evento
--   com autor_id NULL DEVE conter a chave 'origem' no payload, identificando
--   a fonte (ex.: 'service_role', 'trigger_sistema').
--
--   CHECK: (autor_id IS NOT NULL) OR (payload ? 'origem')
--
-- Função moveria_fn_dissolver_lote atualizada para incluir 'origem' no payload,
-- satisfazendo o CHECK acima.
--
-- DRIFT REMOTO: no banco Moveria remoto (fzgasvcfxufhrbrdakow), autor_id é
-- NOT NULL. Esta migration cria divergência intencional que será resolvida no
-- push do pacote completo (tarefas + fixes) aprovado após o relatório de drift.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'moveria_eventos'
      AND column_name  = 'autor_id'
  ) THEN
    RAISE NOTICE 'moveria_eventos_autor_nullable: coluna autor_id ausente — pulado.';
    RETURN;
  END IF;
END $guard$;

-- ── 1. Remover NOT NULL ────────────────────────────────────────────────────
ALTER TABLE moveria_eventos
  ALTER COLUMN autor_id DROP NOT NULL;

-- ── 2. CHECK de compensação ────────────────────────────────────────────────
-- Todo evento sem autor_id identificado DEVE declarar 'origem' no payload.
ALTER TABLE moveria_eventos
  DROP CONSTRAINT IF EXISTS moveria_eventos_autor_ou_origem_check;

ALTER TABLE moveria_eventos
  ADD CONSTRAINT moveria_eventos_autor_ou_origem_check
  CHECK (
    autor_id IS NOT NULL
    OR (payload ? 'origem')       -- jsonb key-exists operator
  );

-- ── 3. Atualizar moveria_fn_dissolver_lote: adicionar 'origem' no payload ──
-- Agora satisfaz o CHECK acima quando chamado via service_role (auth.uid() NULL).
CREATE OR REPLACE FUNCTION moveria_fn_dissolver_lote()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
BEGIN
  IF NOT auth_is_moveria_admin() THEN
    RAISE EXCEPTION 'Apenas admin pode dissolver um lote'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock advisory para serializar criação/dissolução concorrente no mesmo contrato.
  PERFORM pg_advisory_xact_lock(
    hashtext('moveria_lote_numero:' || OLD.contrato_id::text)
  );

  -- Evento de auditoria.
  -- 'origem' é obrigatório quando autor_id é NULL (constraint moveria_eventos_autor_ou_origem_check).
  -- Após o DELETE do lote, lote_id será zerado pelo ON DELETE SET NULL da FK
  -- (migration 20260610000002). O payload preserva numero e contrato_id para rastreabilidade.
  INSERT INTO moveria_eventos (tipo, lote_id, autor_id, payload)
  VALUES (
    'lote_dissolvido',
    OLD.id,
    auth.uid(),
    jsonb_build_object(
      'numero',      OLD.numero,
      'contrato_id', OLD.contrato_id,
      'qtd_itens',   0,
      'origem',      CASE WHEN auth.uid() IS NULL THEN 'service_role' ELSE 'usuario' END
    )
  );

  RETURN OLD;
END;
$body$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260610000001_moveria_eventos_autor_nullable.sql')
ON CONFLICT (filename) DO NOTHING;
