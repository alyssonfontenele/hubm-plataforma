-- =============================================================================
-- Migration: moveria_fase8b — RPC moveria_fn_designar_item
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Depende de: 20260604020000 (enum 'designacao_registrada' já commitado)
-- Designa um ÚNICO item a um consultor. Retorna 1 se sucesso.
-- Trilha item-a-item: via triggers existentes (designacao_criada / desativada).
-- Trilha de ação: gravada pelo dialog no frontend (designacao_registrada).
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='moveria_designacoes') THEN
    RAISE NOTICE 'fase8b: moveria_designacoes ausente — pulada.'; RETURN;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.moveria_fn_designar_item(
  p_item_id       uuid,
  p_consultor_id  uuid,
  p_data_prevista date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato_id uuid;
BEGIN
  IF NOT auth_is_moveria_admin() THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  SELECT contrato_id INTO v_contrato_id
  FROM moveria_itens_contrato
  WHERE id = p_item_id AND deletado_em IS NULL;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- Desativa designação anterior (trigger dispara designacao_desativada)
  UPDATE moveria_designacoes
  SET ativo = false
  WHERE item_id = p_item_id AND ativo = true;

  -- Insere nova (trigger dispara designacao_criada)
  INSERT INTO moveria_designacoes
    (item_id, consultor_id, designado_por, designado_em, ativo, data_prevista)
  VALUES
    (p_item_id, p_consultor_id, auth.uid(), now(), true, p_data_prevista);

  RETURN 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.moveria_fn_designar_item(uuid, uuid, date) TO authenticated;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604030000_moveria_fase8b_fn_designar_item.sql')
ON CONFLICT (filename) DO NOTHING;
