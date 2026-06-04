-- =============================================================================
-- Migration: moveria_fase8c — RPC moveria_fn_designar_itens_lote
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Recebe array [{item_id, consultor_id, data_prevista?}] e grava TODOS
-- em uma única transação (rollback total em qualquer erro).
-- Triggers item-a-item (designacao_criada / desativada) disparam normalmente.
-- Trilha de ação (designacao_registrada) gravada pelo frontend após sucesso.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='moveria_designacoes') THEN
    RAISE NOTICE 'fase8c: moveria_designacoes ausente — pulada.'; RETURN;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.moveria_fn_designar_itens_lote(
  p_designacoes jsonb  -- [{item_id, consultor_id, data_prevista?}]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entrada    jsonb;
  v_item_id    uuid;
  v_consultor  uuid;
  v_data_prev  date;
  v_count      integer := 0;
BEGIN
  IF NOT auth_is_moveria_admin() THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  IF p_designacoes IS NULL OR jsonb_array_length(p_designacoes) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_entrada IN SELECT jsonb_array_elements(p_designacoes)
  LOOP
    v_item_id   := (v_entrada->>'item_id')::uuid;
    v_consultor := (v_entrada->>'consultor_id')::uuid;
    v_data_prev := NULLIF(TRIM(v_entrada->>'data_prevista'), '')::date;

    IF NOT EXISTS (
      SELECT 1 FROM moveria_itens_contrato
      WHERE id = v_item_id AND deletado_em IS NULL
    ) THEN
      RAISE EXCEPTION 'Item % não encontrado.', v_item_id USING ERRCODE = 'P0002';
    END IF;

    -- Desativa designação anterior (trigger dispara designacao_desativada)
    UPDATE moveria_designacoes
    SET ativo = false
    WHERE item_id = v_item_id AND ativo = true;

    -- Insere nova (trigger dispara designacao_criada)
    INSERT INTO moveria_designacoes
      (item_id, consultor_id, designado_por, designado_em, ativo, data_prevista)
    VALUES
      (v_item_id, v_consultor, auth.uid(), now(), true, v_data_prev);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.moveria_fn_designar_itens_lote(jsonb) TO authenticated;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604040000_moveria_fase8c_fn_designar_itens_lote.sql')
ON CONFLICT (filename) DO NOTHING;
