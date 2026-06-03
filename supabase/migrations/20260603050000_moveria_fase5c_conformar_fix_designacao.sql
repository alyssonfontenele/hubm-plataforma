-- =================================================================
-- Migration (c): fix fn_conformar_lote (medido) + designação em massa
-- =================================================================

-- 1. moveria_fn_conformar_lote: status final 'conformado' → 'medido'
CREATE OR REPLACE FUNCTION public.moveria_fn_conformar_lote(
  p_contrato_id  uuid,
  p_consultor_id uuid,
  p_medicao_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote_id    uuid;
  v_numero     text;
  v_qtd_aptos  integer;
  v_profile_id uuid;
  v_cliente_id uuid;
  v_bad_items  text;
  v_item_id    uuid;
BEGIN
  SELECT count(*)::integer INTO v_qtd_aptos
  FROM moveria_itens_contrato
  WHERE contrato_id = p_contrato_id
    AND aptidao IN ('apto','apto_ressalva')
    AND deletado_em IS NULL;

  IF v_qtd_aptos = 0 THEN
    RAISE EXCEPTION 'Contrato sem itens aptos ou aptos com ressalva — conformação abortada.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(i.id::text, ', ' ORDER BY i.id) INTO v_bad_items
  FROM moveria_itens_contrato i
  WHERE i.contrato_id = p_contrato_id
    AND i.aptidao IN ('apto','apto_ressalva')
    AND i.deletado_em IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM moveria_questionario_ambiente q
      WHERE q.item_id              = i.id
        AND q.pedireito_opcao_id   IS NOT NULL
        AND q.bancadas_opcao_id    IS NOT NULL
        AND q.instalacoes_opcao_id IS NOT NULL
        AND q.eletros_opcao_id     IS NOT NULL
    );

  IF v_bad_items IS NOT NULL THEN
    RAISE EXCEPTION
      'Itens sem questionário completo (todos os blocos obrigatórios devem ter opção selecionada): %',
      v_bad_items
      USING ERRCODE = 'P0001';
  END IF;

  SELECT profile_id INTO v_profile_id
  FROM moveria_membros WHERE id = p_consultor_id;

  SELECT cliente_id INTO v_cliente_id
  FROM moveria_contratos WHERE id = p_contrato_id;

  v_numero := moveria_fn_reservar_numero_lote(p_contrato_id, v_qtd_aptos);

  INSERT INTO moveria_lotes (numero, contrato_id, consultor_id, cliente_id, status)
  VALUES (v_numero, p_contrato_id, p_consultor_id, v_cliente_id, 'aberto')
  RETURNING id INTO v_lote_id;

  FOR v_item_id IN
    SELECT id FROM moveria_itens_contrato
    WHERE contrato_id = p_contrato_id
      AND aptidao IN ('apto','apto_ressalva')
      AND deletado_em IS NULL
    ORDER BY id
  LOOP
    BEGIN
      INSERT INTO moveria_lote_itens (lote_id, item_id, adicionado_por)
      VALUES (v_lote_id, v_item_id, v_profile_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Item % já está em outro lote — ignorado na composição.', v_item_id;
    END;
  END LOOP;

  UPDATE moveria_lotes
  SET status        = 'medido',
      conformado_em  = now(),
      conformado_por = v_profile_id
  WHERE id = v_lote_id;

  RETURN v_lote_id;
END;
$function$;

-- 2. Coluna de data prevista para designações
ALTER TABLE moveria_designacoes ADD COLUMN data_prevista date NULL;

-- 3. Designação em massa — apenas ambientes sem lote e não resolvidos
CREATE OR REPLACE FUNCTION public.moveria_fn_designar_contrato(
  p_contrato_id   uuid,
  p_consultor_id  uuid,
  p_data_prevista date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_count   integer := 0;
BEGIN
  IF NOT auth_is_moveria_admin() THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  FOR v_item_id IN
    SELECT id FROM moveria_itens_contrato
    WHERE contrato_id = p_contrato_id
      AND lote_id     IS NULL
      AND aptidao     IN ('pendente', 'inapto')
      AND deletado_em IS NULL
    ORDER BY id
  LOOP
    UPDATE moveria_designacoes
    SET ativo = false
    WHERE item_id = v_item_id AND ativo = true;

    INSERT INTO moveria_designacoes
      (item_id, consultor_id, designado_por, designado_em, ativo, data_prevista)
    VALUES
      (v_item_id, p_consultor_id, auth.uid(), now(), true, p_data_prevista);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.moveria_fn_designar_contrato(uuid, uuid, date) TO authenticated;
