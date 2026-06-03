-- =============================================================================
-- Migration: moveria_fase6_a_schema
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Adiciona: novos event types, tabela moveria_comentarios (Conexão c/ Comercial),
--           fn_finalizar_medicao, update fn_conformar_lote (requer sessão finalizada
--           E desenho obrigatório).
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_membros'
  ) THEN
    RAISE NOTICE 'fase6_a: moveria_membros ausente — pulada.';
    RETURN;
  END IF;
END $guard$;

-- ─── 1. Novos valores em moveria_tipo_evento ──────────────────────────────────
ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'contrato_editado';
ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'aptidao_corrigida';
ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'comentario_removido';
ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'medicao_finalizada';
ALTER TYPE moveria_tipo_evento ADD VALUE IF NOT EXISTS 'lote_conformado_v2';

-- ─── 2. moveria_comentarios ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moveria_comentarios (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id  uuid        NOT NULL REFERENCES moveria_contratos(id) ON DELETE CASCADE,
  autor_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE NO ACTION,
  texto        text        NOT NULL CHECK (char_length(trim(texto)) > 0),
  anexo_path   text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  removido_em  timestamptz,
  removido_por uuid        REFERENCES profiles(id) ON DELETE NO ACTION
);

ALTER TABLE public.moveria_comentarios ENABLE ROW LEVEL SECURITY;

DO $rls_com$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moveria_comentarios'
      AND policyname = 'moveria_comentarios: select'
  ) THEN
    CREATE POLICY "moveria_comentarios: select"
      ON moveria_comentarios FOR SELECT
      USING (
        removido_em IS NULL
        AND (auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moveria_comentarios'
      AND policyname = 'moveria_comentarios: insert'
  ) THEN
    CREATE POLICY "moveria_comentarios: insert"
      ON moveria_comentarios FOR INSERT
      WITH CHECK (
        auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moveria_comentarios'
      AND policyname = 'moveria_comentarios: update'
  ) THEN
    CREATE POLICY "moveria_comentarios: update"
      ON moveria_comentarios FOR UPDATE
      USING (auth_is_moveria_admin());
  END IF;
END $rls_com$;

GRANT SELECT (id, contrato_id, autor_id, texto, anexo_path, criado_em)
  ON public.moveria_comentarios TO authenticated;
GRANT INSERT (contrato_id, autor_id, texto, anexo_path)
  ON public.moveria_comentarios TO authenticated;
GRANT UPDATE (removido_em, removido_por)
  ON public.moveria_comentarios TO authenticated;

-- ─── 3. fn_finalizar_medicao ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.moveria_fn_finalizar_medicao(
  p_medicao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM moveria_medicoes
    WHERE id = p_medicao_id
      AND status = 'em_andamento'
      AND (
        auth_is_moveria_admin()
        OR EXISTS (
          SELECT 1 FROM moveria_membros m
          WHERE m.id = moveria_medicoes.consultor_id AND m.profile_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Sessão não encontrada, já finalizada ou sem permissão.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE moveria_medicoes
  SET status = 'finalizada', finalizada_em = now()
  WHERE id = p_medicao_id;

  INSERT INTO moveria_eventos (tipo, contrato_id, autor_id, payload)
  SELECT 'medicao_finalizada', contrato_id, auth.uid(),
    jsonb_build_object('medicao_id', p_medicao_id)
  FROM moveria_medicoes WHERE id = p_medicao_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.moveria_fn_finalizar_medicao(uuid) TO authenticated;

-- ─── 4. fn_conformar_lote: requer sessão finalizada + desenho obrigatório ─────
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
  IF NOT EXISTS (
    SELECT 1 FROM moveria_medicoes
    WHERE id = p_medicao_id AND status = 'finalizada'
  ) THEN
    RAISE EXCEPTION 'Sessão de medição não finalizada. Finalize a sessão antes de conformar.'
      USING ERRCODE = 'P0001';
  END IF;

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
      v_bad_items USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(i.id::text, ', ' ORDER BY i.id) INTO v_bad_items
  FROM moveria_itens_contrato i
  WHERE i.contrato_id = p_contrato_id
    AND i.aptidao IN ('apto','apto_ressalva')
    AND i.deletado_em IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM moveria_desenhos_medicao d WHERE d.item_id = i.id
    );

  IF v_bad_items IS NOT NULL THEN
    RAISE EXCEPTION
      'Itens sem desenho de medição (obrigatório para conformar): %',
      v_bad_items USING ERRCODE = 'P0001';
  END IF;

  SELECT profile_id INTO v_profile_id FROM moveria_membros WHERE id = p_consultor_id;
  SELECT cliente_id INTO v_cliente_id FROM moveria_contratos WHERE id = p_contrato_id;
  v_numero := moveria_fn_reservar_numero_lote(p_contrato_id, v_qtd_aptos);

  INSERT INTO moveria_lotes (numero, contrato_id, consultor_id, cliente_id, status)
  VALUES (v_numero, p_contrato_id, p_consultor_id, v_cliente_id, 'aberto')
  RETURNING id INTO v_lote_id;

  FOR v_item_id IN
    SELECT id FROM moveria_itens_contrato
    WHERE contrato_id = p_contrato_id AND aptidao IN ('apto','apto_ressalva') AND deletado_em IS NULL
    ORDER BY id
  LOOP
    BEGIN
      INSERT INTO moveria_lote_itens (lote_id, item_id, adicionado_por)
      VALUES (v_lote_id, v_item_id, v_profile_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Item % já está em outro lote — ignorado.', v_item_id;
    END;
  END LOOP;

  UPDATE moveria_lotes
  SET status = 'medido', conformado_em = now(), conformado_por = v_profile_id
  WHERE id = v_lote_id;

  RETURN v_lote_id;
END;
$function$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603200000_moveria_fase6_a_schema.sql')
ON CONFLICT (filename) DO NOTHING;
