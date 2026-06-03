-- =============================================================================
-- MIGRATION: moveria_fase4b_questionario
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Depende de: 20260603030000_moveria_fase4a_medicao
-- Guards:    moveria_lotes ausente → pula (Core, Mowig)
--            moveria_q_blocos já existe → idempotente
--
-- Alterações:
--   Seção 1 : CREATE TABLE moveria_q_blocos
--   Seção 2 : CREATE TABLE moveria_q_opcoes
--   Seção 3 : CREATE TABLE moveria_questionario_ambiente
--   Seção 4 : SEED — 4 blocos + 16 opções
--   Seção 5 : CREATE FUNCTION moveria_fn_conformar_lote(contrato, consultor, medicao)
--             SECURITY DEFINER (precisa ler todos os itens do contrato independente de
--             designação, e escrever em moveria_lotes / moveria_lote_itens via RLS)
--   Seção 6 : DROP + CREATE VIEW moveria_lotes_v — adiciona coluna tem_ressalva
--   Seção 7 : RLS (q_blocos, q_opcoes, questionario_ambiente)
--   Seção 8 : GRANTs
-- =============================================================================

DO $migration$
DECLARE
  v_schema text := 'public';
BEGIN

  -- Guard 1: Core/Mowig
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'moveria_lotes'
  ) THEN
    RAISE NOTICE 'fase4b_questionario: moveria_lotes ausente — pulada (Core/Mowig).';
    RETURN;
  END IF;

  -- Guard 2: idempotência
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'moveria_q_blocos'
  ) THEN
    RAISE NOTICE 'fase4b_questionario: moveria_q_blocos já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'fase4b_questionario: iniciando…';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 1 — moveria_q_blocos
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    CREATE TABLE moveria_q_blocos (
      id    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
      chave text    NOT NULL UNIQUE,
      label text    NOT NULL,
      ordem integer NOT NULL,
      ativo boolean NOT NULL DEFAULT true
    )
  $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_q_blocos ENABLE ROW LEVEL SECURITY $sql$;
  RAISE NOTICE '  moveria_q_blocos criada.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 2 — moveria_q_opcoes
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    CREATE TABLE moveria_q_opcoes (
      id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
      bloco_id        uuid    NOT NULL REFERENCES moveria_q_blocos(id) ON DELETE CASCADE,
      valor           text    NOT NULL,
      label           text    NOT NULL,
      tem_campo_valor boolean NOT NULL DEFAULT false,
      ordem           integer NOT NULL,
      ativo           boolean NOT NULL DEFAULT true,
      UNIQUE (bloco_id, valor)
    )
  $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_q_opcoes ENABLE ROW LEVEL SECURITY $sql$;
  RAISE NOTICE '  moveria_q_opcoes criada.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 3 — moveria_questionario_ambiente
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    CREATE TABLE moveria_questionario_ambiente (
      id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id              uuid        NOT NULL UNIQUE
        REFERENCES moveria_itens_contrato(id) ON DELETE CASCADE,
      pedireito_opcao_id   uuid        REFERENCES moveria_q_opcoes(id) ON DELETE RESTRICT,
      pedireito_valor      text,
      bancadas_opcao_id    uuid        REFERENCES moveria_q_opcoes(id) ON DELETE RESTRICT,
      bancadas_valor       text,
      instalacoes_opcao_id uuid        REFERENCES moveria_q_opcoes(id) ON DELETE RESTRICT,
      instalacoes_valor    text,
      eletros_opcao_id     uuid        REFERENCES moveria_q_opcoes(id) ON DELETE RESTRICT,
      eletros_valor        text,
      observacoes          text,
      preenchido_por       uuid        NOT NULL REFERENCES profiles(id) ON DELETE NO ACTION,
      criado_em            timestamptz NOT NULL DEFAULT now(),
      atualizado_em        timestamptz NOT NULL DEFAULT now()
    )
  $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_questionario_ambiente ENABLE ROW LEVEL SECURITY $sql$;
  RAISE NOTICE '  moveria_questionario_ambiente criada.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 4 — Seed: 4 blocos + 16 opções
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    WITH blocos AS (
      INSERT INTO moveria_q_blocos (chave, label, ordem, ativo) VALUES
        ('pedireito',   'Pé-direito',  1, true),
        ('bancadas',    'Bancadas',    2, true),
        ('instalacoes', 'Instalações', 3, true),
        ('eletros',     'Eletros',     4, true)
      ON CONFLICT (chave) DO UPDATE SET
        label = EXCLUDED.label,
        ordem = EXCLUDED.ordem
      RETURNING id, chave
    )
    INSERT INTO moveria_q_opcoes (bloco_id, valor, label, tem_campo_valor, ordem, ativo)
    SELECT b.id, o.valor, o.label, o.tcv, o.ord, true
    FROM blocos b
    JOIN (VALUES
      ('pedireito',   'conferido_in_loco',    'Conferido in loco',                 false, 1),
      ('pedireito',   'especificado_projeto',  'Especificado em projeto/obra',      true,  2),
      ('pedireito',   'determinado_moveria',   'Determinado pela Moveria',          true,  3),
      ('pedireito',   'nao_se_aplica',         'Não se aplica',                     false, 4),
      ('bancadas',    'conferidas_in_loco',    'Conferidas in loco',                false, 1),
      ('bancadas',    'especificadas_projeto', 'Especificadas em projeto',           false, 2),
      ('bancadas',    'projeto_moveria',       'Projeto enviado pela Moveria',       false, 3),
      ('bancadas',    'nao_se_aplica',         'Não se aplica',                     false, 4),
      ('instalacoes', 'conferidas_in_loco',    'Conferidas in loco',                false, 1),
      ('instalacoes', 'especificadas_projeto', 'Especificadas em projeto',           false, 2),
      ('instalacoes', 'projeto_moveria',       'Projeto enviado pela Moveria',       false, 3),
      ('instalacoes', 'nao_se_aplica',         'Não se aplica',                     false, 4),
      ('eletros',     'determinado_cliente',   'Conferido/determinado pelo cliente', false, 1),
      ('eletros',     'sugeridos_moveria',     'Sugeridos pela Moveria',             false, 2),
      ('eletros',     'indefinidos',           'Indefinidos',                        false, 3),
      ('eletros',     'nao_se_aplica',         'Não se aplica',                     false, 4)
    ) AS o(chave, valor, label, tcv, ord) ON b.chave = o.chave
    ON CONFLICT (bloco_id, valor) DO NOTHING
  $sql$;
  RAISE NOTICE '  seed: 4 blocos + 16 opções inseridos.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 5 — moveria_fn_conformar_lote
  --
  -- SECURITY DEFINER: necessário para (a) ler TODOS os itens do contrato
  -- independentemente da designação do chamador, e (b) escrever em
  -- moveria_lotes e moveria_lote_itens que têm RLS restritiva.
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_conformar_lote(
      p_contrato_id  uuid,
      p_consultor_id uuid,
      p_medicao_id   uuid
    ) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_lote_id     uuid;
      v_numero      text;
      v_qtd_aptos   integer;
      v_profile_id  uuid;
      v_cliente_id  uuid;
      v_bad_items   text;
      v_item_id     uuid;
    BEGIN
      -- 1. Conta itens apto+apto_ressalva no contrato
      SELECT count(*)::integer INTO v_qtd_aptos
      FROM moveria_itens_contrato
      WHERE contrato_id = p_contrato_id
        AND aptidao IN ('apto','apto_ressalva')
        AND deletado_em IS NULL;

      IF v_qtd_aptos = 0 THEN
        RAISE EXCEPTION 'Contrato sem itens aptos ou aptos com ressalva — conformação abortada.'
          USING ERRCODE = 'P0001';
      END IF;

      -- 2. Valida que todos os apto/apto_ressalva têm questionário com OPÇÕES selecionadas
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

      -- 3. Obtém profile_id do consultor e cliente_id do contrato
      SELECT profile_id INTO v_profile_id
      FROM moveria_membros WHERE id = p_consultor_id;

      SELECT cliente_id INTO v_cliente_id
      FROM moveria_contratos WHERE id = p_contrato_id;

      -- 4. Reserva número do lote (advisory lock interno à função)
      v_numero := moveria_fn_reservar_numero_lote(p_contrato_id, v_qtd_aptos);

      -- 5. INSERT lote com status=aberto
      INSERT INTO moveria_lotes (numero, contrato_id, consultor_id, cliente_id, status)
      VALUES (v_numero, p_contrato_id, p_consultor_id, v_cliente_id, 'aberto')
      RETURNING id INTO v_lote_id;

      -- 6. INSERT lote_itens — NOTICE informativo se item já estiver em outro lote
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

      -- 7. UPDATE lote para conformado
      UPDATE moveria_lotes
      SET status        = 'conformado',
          conformado_em  = now(),
          conformado_por = v_profile_id
      WHERE id = v_lote_id;

      RETURN v_lote_id;
    END;
    $body$
  $f$;
  RAISE NOTICE '  moveria_fn_conformar_lote criada (SECURITY DEFINER).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 6 — Recriar moveria_lotes_v com tem_ressalva
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ DROP VIEW IF EXISTS moveria_lotes_v $sql$;
  EXECUTE $sql$
    CREATE VIEW moveria_lotes_v AS
    SELECT
      l.id,
      l.numero,
      l.contrato_id,
      c.numero_base || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END
        AS contrato_numero,
      l.cliente_id,
      cl.nome_completo AS cliente_nome,
      l.consultor_id,
      p.full_name      AS consultor_nome,
      l.status,
      l.conformado_em,
      l.conformado_por,
      l.criado_em,
      l.atualizado_em,
      (SELECT count(*) FROM moveria_lote_itens
       WHERE moveria_lote_itens.lote_id = l.id)::integer AS qtd_itens,
      EXISTS (
        SELECT 1 FROM moveria_lote_itens li
        JOIN moveria_itens_contrato i ON i.id = li.item_id
        WHERE li.lote_id = l.id AND i.aptidao = 'apto_ressalva'
      ) AS tem_ressalva
    FROM moveria_lotes l
    LEFT JOIN moveria_contratos c  ON c.id  = l.contrato_id
    LEFT JOIN moveria_clientes  cl ON cl.id = l.cliente_id
    LEFT JOIN moveria_membros   m  ON m.id  = l.consultor_id
    LEFT JOIN profiles          p  ON p.id  = m.profile_id
    WHERE auth_is_moveria_admin()
      OR  (auth_moveria_papel())::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros mm
            WHERE mm.id = l.consultor_id AND mm.profile_id = auth.uid()
          )
      OR  moveria_vendedor_tem_lote(l.id)
  $sql$;
  RAISE NOTICE '  moveria_lotes_v recriada com tem_ressalva.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 7 — RLS
  -- ═════════════════════════════════════════════════════════════════════════

  -- ── moveria_q_blocos (referência — SELECT qualquer membro, resto só admin) ──
  EXECUTE $sql$
    CREATE POLICY "moveria_q_blocos: select"
      ON moveria_q_blocos FOR SELECT
      USING (auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL)
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_blocos: insert"
      ON moveria_q_blocos FOR INSERT
      WITH CHECK (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_blocos: update"
      ON moveria_q_blocos FOR UPDATE
      USING (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_blocos: delete"
      ON moveria_q_blocos FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;

  -- ── moveria_q_opcoes (referência — SELECT qualquer membro, resto só admin) ──
  EXECUTE $sql$
    CREATE POLICY "moveria_q_opcoes: select"
      ON moveria_q_opcoes FOR SELECT
      USING (auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL)
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_opcoes: insert"
      ON moveria_q_opcoes FOR INSERT
      WITH CHECK (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_opcoes: update"
      ON moveria_q_opcoes FOR UPDATE
      USING (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_q_opcoes: delete"
      ON moveria_q_opcoes FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;

  -- ── moveria_questionario_ambiente ─────────────────────────────────────────
  EXECUTE $sql$
    CREATE POLICY "moveria_questionario_ambiente: select"
      ON moveria_questionario_ambiente FOR SELECT
      USING (auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL)
  $sql$;
  -- INSERT: admin ou consultor_tecnico designado no item (preenchido_por = chamador)
  EXECUTE $sql$
    CREATE POLICY "moveria_questionario_ambiente: insert"
      ON moveria_questionario_ambiente FOR INSERT
      WITH CHECK (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND preenchido_por = auth.uid()
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes des
            JOIN moveria_membros m
              ON m.id = des.consultor_id AND m.profile_id = auth.uid()
            WHERE des.item_id = moveria_questionario_ambiente.item_id
              AND des.ativo = true
          )
        )
      )
  $sql$;
  -- UPDATE: admin ou quem preencheu originalmente
  EXECUTE $sql$
    CREATE POLICY "moveria_questionario_ambiente: update"
      ON moveria_questionario_ambiente FOR UPDATE
      USING (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND moveria_questionario_ambiente.preenchido_por = auth.uid()
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_questionario_ambiente: delete"
      ON moveria_questionario_ambiente FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;
  RAISE NOTICE '  RLS criadas (q_blocos, q_opcoes, questionario_ambiente).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 8 — GRANTs
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE, DELETE ON moveria_q_blocos  TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE, DELETE ON moveria_q_opcoes  TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT ON moveria_questionario_ambiente TO authenticated $sql$;
  EXECUTE $sql$
    GRANT INSERT (item_id,
                  pedireito_opcao_id,   pedireito_valor,
                  bancadas_opcao_id,    bancadas_valor,
                  instalacoes_opcao_id, instalacoes_valor,
                  eletros_opcao_id,     eletros_valor,
                  observacoes, preenchido_por)
      ON moveria_questionario_ambiente TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT UPDATE (pedireito_opcao_id,   pedireito_valor,
                  bancadas_opcao_id,    bancadas_valor,
                  instalacoes_opcao_id, instalacoes_valor,
                  eletros_opcao_id,     eletros_valor,
                  observacoes, atualizado_em)
      ON moveria_questionario_ambiente TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION moveria_fn_conformar_lote(uuid, uuid, uuid) TO authenticated
  $sql$;
  RAISE NOTICE '  GRANTs aplicados.';

  RAISE NOTICE 'fase4b_questionario: concluída com sucesso.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603040000_moveria_fase4b_questionario.sql')
ON CONFLICT (filename) DO NOTHING;
