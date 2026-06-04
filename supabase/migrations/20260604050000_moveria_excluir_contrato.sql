-- =============================================================================
-- Migration: moveria_excluir_contrato
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Cria:
--   1. moveria_exclusoes_log — log de exclusões sem FK para contratos
--   2. moveria_fn_excluir_contrato(uuid) — RPC SECURITY DEFINER com:
--      - verificação de permissão (etapa + papel)
--      - cascata controlada (triggers de guarda desabilitados só nos passos 13-14)
--      - log de auditoria gravado dentro da mesma transação antes dos DELETEs
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_contratos') THEN
    RAISE NOTICE 'moveria_excluir_contrato: moveria_contratos ausente — pulada.'; RETURN;
  END IF;
END $guard$;

-- ─── 1. Tabela de log (sem FK → sobrevive à cascata) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.moveria_exclusoes_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id          uuid        NOT NULL,    -- cópia simples, sem FK
  numero_base          text        NOT NULL,
  versao               integer     NOT NULL,
  cliente_id           uuid        NOT NULL,    -- cópia simples, sem FK
  -- etapa_kanban: 'backlog' | 'aguardando_medicao' | <status_lote> | 'sem_itens'
  etapa_kanban         text        NOT NULL,
  -- status técnico do lote mais avançado no momento da exclusão (NULL se sem lote)
  status_lote_avancado text,
  qtd_itens            integer,
  qtd_lotes            integer,
  autor_id             uuid        NOT NULL,
  excluido_em          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moveria_exclusoes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_can_read_exclusoes_log" ON public.moveria_exclusoes_log;
CREATE POLICY "admins_can_read_exclusoes_log"
  ON public.moveria_exclusoes_log
  FOR SELECT
  USING (auth_is_moveria_admin());

-- ─── 2. RPC de exclusão atômica ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.moveria_fn_excluir_contrato(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_numero_base        text;
  v_versao             integer;
  v_cliente_id         uuid;
  v_lote_avancado      text;
  v_tem_lote_avancado  boolean;
  v_etapa_kanban       text;
  v_qtd_itens          integer;
  v_qtd_lotes          integer;
  v_substituto_numero  text;
BEGIN

  -- ── 1. Verificação de permissão básica ─────────────────────────────────────
  IF NOT auth_is_moveria_admin() THEN
    RAISE EXCEPTION 'Permissão negada — exclusão restrita a admins do sistema Moveria.'
      USING ERRCODE = '42501';
  END IF;

  -- ── 2. Buscar contrato ─────────────────────────────────────────────────────
  SELECT numero_base, versao, cliente_id
    INTO v_numero_base, v_versao, v_cliente_id
    FROM moveria_contratos
   WHERE id = p_contrato_id AND deletado_em IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. Calcular lote mais avançado ────────────────────────────────────────
  SELECT status::text INTO v_lote_avancado
    FROM moveria_lotes
   WHERE contrato_id = p_contrato_id
     AND status NOT IN ('aberto', 'cancelado')
   ORDER BY criado_em DESC
   LIMIT 1;

  v_tem_lote_avancado := v_lote_avancado IS NOT NULL;

  -- ── 4. Verificar permissão por etapa ──────────────────────────────────────
  IF v_tem_lote_avancado AND NOT auth_is_superadmin() THEN
    RAISE EXCEPTION
      'Contrato tem lotes em andamento (etapa atual: %). Somente superadmin pode excluir este contrato.',
      v_lote_avancado
      USING ERRCODE = '42501';
  END IF;

  -- ── 5. Verificar substituto ativo ─────────────────────────────────────────
  SELECT (numero_base || CASE WHEN versao > 1 THEN '-' || versao::text ELSE '' END)
    INTO v_substituto_numero
    FROM moveria_contratos
   WHERE substitui_contrato_id = p_contrato_id
     AND deletado_em IS NULL
   LIMIT 1;

  IF v_substituto_numero IS NOT NULL THEN
    RAISE EXCEPTION
      'Não é possível excluir: o contrato % é uma substituição ativa deste contrato. Exclua o substituto primeiro.',
      v_substituto_numero;
  END IF;

  -- ── 6. Calcular etapa_kanban (para o log) ─────────────────────────────────
  IF v_tem_lote_avancado THEN
    v_etapa_kanban := v_lote_avancado;
  ELSIF EXISTS (
    SELECT 1
      FROM moveria_itens_contrato i
      JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
     WHERE i.contrato_id = p_contrato_id
       AND i.lote_id IS NULL
       AND i.deletado_em IS NULL
  ) THEN
    v_etapa_kanban := 'aguardando_medicao';
  ELSIF EXISTS (
    SELECT 1 FROM moveria_itens_contrato
     WHERE contrato_id = p_contrato_id AND lote_id IS NULL AND deletado_em IS NULL
  ) THEN
    v_etapa_kanban := 'backlog';
  ELSE
    v_etapa_kanban := 'sem_itens';
  END IF;

  SELECT COUNT(*) INTO v_qtd_itens
    FROM moveria_itens_contrato
   WHERE contrato_id = p_contrato_id AND deletado_em IS NULL;

  SELECT COUNT(*) INTO v_qtd_lotes
    FROM moveria_lotes WHERE contrato_id = p_contrato_id;

  -- ── 7. Log de auditoria (antes dos DELETEs; reverte junto se a transação falhar) ──
  INSERT INTO moveria_exclusoes_log (
    contrato_id, numero_base, versao, cliente_id,
    etapa_kanban, status_lote_avancado,
    qtd_itens, qtd_lotes, autor_id
  ) VALUES (
    p_contrato_id, v_numero_base, v_versao, v_cliente_id,
    v_etapa_kanban, v_lote_avancado,
    v_qtd_itens, v_qtd_lotes, auth.uid()
  );

  -- ── 8. NULL out itens.lote_id (libera FK NO ACTION antes de apagar lotes) ──
  UPDATE moveria_itens_contrato
     SET lote_id = NULL
   WHERE contrato_id = p_contrato_id;

  -- ── 9. DELETE eventos (FK NO ACTION — deve vir antes de itens, lotes e contrato) ──
  DELETE FROM moveria_eventos
   WHERE contrato_id = p_contrato_id
      OR item_id IN (SELECT id FROM moveria_itens_contrato WHERE contrato_id = p_contrato_id)
      OR lote_id IN (SELECT id FROM moveria_lotes WHERE contrato_id = p_contrato_id);

  -- ── 10. DELETE documentos (FK RESTRICT) ───────────────────────────────────
  DELETE FROM moveria_documentos WHERE contrato_id = p_contrato_id;

  -- ── 11. DELETE medicoes (explícito — evita conflito SET NULL no cascade) ──
  DELETE FROM moveria_medicoes WHERE contrato_id = p_contrato_id;

  -- ── 12-13. Disable triggers de guarda ─────────────────────────────────────
  ALTER TABLE moveria_lote_itens DISABLE TRIGGER trg_moveria_lote_itens_before_delete;
  ALTER TABLE moveria_lotes      DISABLE TRIGGER trg_moveria_lotes_before_delete;

  -- ── 14. DELETE lote_itens (FK RESTRICT via item_id) ───────────────────────
  DELETE FROM moveria_lote_itens
   WHERE lote_id IN (SELECT id FROM moveria_lotes WHERE contrato_id = p_contrato_id);

  -- ── 15. DELETE lotes (FK RESTRICT via contrato_id) ────────────────────────
  DELETE FROM moveria_lotes WHERE contrato_id = p_contrato_id;

  -- ── 16. Re-enable triggers de guarda ──────────────────────────────────────
  ALTER TABLE moveria_lote_itens ENABLE TRIGGER trg_moveria_lote_itens_before_delete;
  ALTER TABLE moveria_lotes      ENABLE TRIGGER trg_moveria_lotes_before_delete;

  -- ── 17. DELETE contrato — CASCADE apaga automaticamente: ──────────────────
  --   moveria_comentarios (CASCADE)
  --   moveria_itens_contrato (CASCADE) → desenhos_medicao, designacoes, questionario_ambiente
  DELETE FROM moveria_contratos WHERE id = p_contrato_id;

END;
$fn$;

GRANT EXECUTE ON FUNCTION public.moveria_fn_excluir_contrato(uuid) TO authenticated;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604050000_moveria_excluir_contrato.sql')
ON CONFLICT (filename) DO NOTHING;
