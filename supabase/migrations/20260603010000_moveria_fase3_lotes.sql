-- =============================================================================
-- MIGRATION: moveria_fase3_lotes
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Depende de: 20260603000000_add_lote_dissolvido_enum (enum 'lote_dissolvido')
-- Guards:    moveria_lotes ausente → pula (Core, Mowig)
--            contrato_id já existe em moveria_lotes → idempotente
--
-- Alterações:
--   1. Adiciona contrato_id (NOT NULL, FK → moveria_contratos) a moveria_lotes
--   2. Troca UNIQUE(numero) por UNIQUE(contrato_id, numero)
--   3. Cria moveria_fn_reservar_numero_lote (numeração densa concorrente-segura)
--   4. Cria trigger trg_moveria_lotes_autonum (auto-numeração no INSERT)
--   5. Reescreve moveria_fn_check_lote_item_insert (trava por contrato, não cliente)
--   6. Reescreve moveria_fn_sync_lote_id_on_insert (seta contrato_id no lote)
--   7. Reescreve moveria_fn_check_lote_conformacao (remove branch conformado→aberto)
--   8. Cria moveria_fn_dissolver_lote + trigger BEFORE DELETE (dissolução admin-only)
--   9. Cria RLS DELETE em moveria_lotes
--  10. Adiciona GRANTs para contrato_id
--  11. Cria view moveria_lotes_v
--  12. Documenta gancho Fase 4 na função de reserva
-- =============================================================================

DO $migration$
DECLARE
  v_schema text := 'public';
BEGIN

  -- Guard 1: moveria_lotes só existe no banco Moveria
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'moveria_lotes'
  ) THEN
    RAISE NOTICE 'moveria_fase3_lotes: moveria_lotes ausente — pulada (Core/Mowig).';
    RETURN;
  END IF;

  -- Guard 2: idempotência — contrato_id já existe → já foi aplicada
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema
      AND table_name   = 'moveria_lotes'
      AND column_name  = 'contrato_id'
  ) THEN
    RAISE NOTICE 'moveria_fase3_lotes: contrato_id já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'moveria_fase3_lotes: iniciando…';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 1 — contrato_id: âncora do lote ao contrato de origem
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Tabela confirmada VAZIA no remoto — NOT NULL seguro sem backfill.
  EXECUTE $sql$
    ALTER TABLE moveria_lotes
      ADD COLUMN contrato_id uuid
        REFERENCES moveria_contratos(id) ON DELETE RESTRICT
  $sql$;
  EXECUTE $sql$
    ALTER TABLE moveria_lotes
      ALTER COLUMN contrato_id SET NOT NULL
  $sql$;
  RAISE NOTICE '  contrato_id adicionado (NOT NULL, FK → moveria_contratos RESTRICT).';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 2 — Unicidade por (contrato_id, numero) em vez de numero global
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    ALTER TABLE moveria_lotes DROP CONSTRAINT IF EXISTS moveria_lotes_numero_key
  $sql$;
  EXECUTE $sql$
    ALTER TABLE moveria_lotes
      ADD CONSTRAINT moveria_lotes_contrato_numero_key
        UNIQUE (contrato_id, numero)
  $sql$;
  RAISE NOTICE '  UNIQUE(contrato_id, numero) criado; UNIQUE(numero) global removido.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 3 — moveria_fn_reservar_numero_lote
  -- Numeração densa por contrato, concorrente-segura via advisory lock.
  -- "ÚNICO" = lote cobre TODOS os itens ativos do contrato, independente de
  -- histórico ou ordem de criação.
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_reservar_numero_lote(
      p_contrato_id        uuid,
      p_qtd_itens_no_lote  integer
    ) RETURNS text
    LANGUAGE plpgsql AS $body$
    DECLARE
      v_total_itens   integer;
      v_existing_nums integer[];
      v_candidate     integer := 1;
    BEGIN
      -- Advisory lock transacional: serializa criação e dissolução por contrato.
      -- Liberado automaticamente no COMMIT/ROLLBACK.
      PERFORM pg_advisory_xact_lock(
        hashtext('moveria_lote_numero:' || p_contrato_id::text)
      );

      -- Total de itens ativos do contrato
      SELECT count(*) INTO v_total_itens
      FROM moveria_itens_contrato
      WHERE contrato_id = p_contrato_id AND deletado_em IS NULL;

      -- "ÚNICO": cobertura total, independente de histórico ou ordem
      IF v_total_itens > 0 AND p_qtd_itens_no_lote >= v_total_itens THEN
        RETURN 'ÚNICO';
      END IF;

      -- Coleta inteiros existentes (exclui 'ÚNICO')
      SELECT COALESCE(
        array_agg(numero::integer ORDER BY numero::integer),
        ARRAY[]::integer[]
      )
      INTO v_existing_nums
      FROM moveria_lotes
      WHERE contrato_id = p_contrato_id
        AND numero ~ '^\d+$';

      -- Retorna o menor slot disponível (preenche buracos de dissoluções)
      LOOP
        IF NOT (v_candidate = ANY(v_existing_nums)) THEN
          RETURN v_candidate::text;
        END IF;
        v_candidate := v_candidate + 1;
      END LOOP;
    END;
    $body$
  $f$;
  RAISE NOTICE '  moveria_fn_reservar_numero_lote criada.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 4 — Auto-numeração BEFORE INSERT em moveria_lotes
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_autonum_lote()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.numero IS NULL OR NEW.numero = '' THEN
        IF NEW.contrato_id IS NULL THEN
          RAISE EXCEPTION 'contrato_id obrigatório ao criar lote sem número explícito'
            USING ERRCODE = 'P0001';
        END IF;
        -- Autonum com qtd=0 → nunca atribui ''ÚNICO'' automaticamente.
        -- Para ''ÚNICO'', o chamador chama moveria_fn_reservar_numero_lote() explicitamente.
        NEW.numero := moveria_fn_reservar_numero_lote(NEW.contrato_id, 0);
      END IF;
      RETURN NEW;
    END;
    $body$
  $f$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lotes_autonum ON moveria_lotes $sql$;
  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lotes_autonum
      BEFORE INSERT ON moveria_lotes
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_autonum_lote()
  $sql$;
  RAISE NOTICE '  trg_moveria_lotes_autonum criado.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 5 — Reescreve moveria_fn_check_lote_item_insert
  -- Trava muda de cliente_id → contrato_id.
  -- Admin pode cruzar contratos do mesmo cliente; não-admin: mesmo contrato.
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_item_insert()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_lote_status   moveria_status_lote;
      v_lote_contrato uuid;
      v_lote_cliente  uuid;
      v_item_contrato uuid;
      v_item_cliente  uuid;
    BEGIN
      SELECT status, contrato_id, cliente_id
      INTO v_lote_status, v_lote_contrato, v_lote_cliente
      FROM moveria_lotes WHERE id = NEW.lote_id;

      -- Regra 1: lote conformado ou concluído não aceita novos itens
      IF v_lote_status IN ('conformado', 'concluido') THEN
        RAISE EXCEPTION 'Lote está % — composição travada.',
          v_lote_status USING ERRCODE = 'P0001';
      END IF;

      -- Obtém contrato e cliente do item
      SELECT i.contrato_id, c.cliente_id
      INTO v_item_contrato, v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

      -- Regra 2: trava por contrato (com exceção admin para mesmo cliente)
      IF v_lote_contrato IS NOT NULL AND v_lote_contrato <> v_item_contrato THEN
        IF auth_is_moveria_admin() THEN
          -- Admin: permite contratos diferentes se for o mesmo cliente
          IF v_lote_cliente IS NOT NULL AND v_lote_cliente <> v_item_cliente THEN
            RAISE EXCEPTION 'Trava: itens de clientes diferentes não podem estar no mesmo lote.'
              USING ERRCODE = 'P0001';
          END IF;
        ELSE
          RAISE EXCEPTION 'Trava: item pertence ao contrato % mas o lote é do contrato %. Apenas admin pode cruzar contratos do mesmo cliente.',
            v_item_contrato, v_lote_contrato USING ERRCODE = 'P0001';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;
  RAISE NOTICE '  moveria_fn_check_lote_item_insert reescrita (trava por contrato_id).';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 6 — Reescreve moveria_fn_sync_lote_id_on_insert
  -- Adiciona setter de contrato_id do lote (além do cliente_id já existente).
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_sync_lote_id_on_insert()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_item_contrato uuid;
      v_item_cliente  uuid;
    BEGIN
      -- Sincroniza lote_id denormalizado no item
      UPDATE moveria_itens_contrato
      SET lote_id = NEW.lote_id, atualizado_em = now()
      WHERE id = NEW.item_id;

      -- Obtém contrato e cliente do item
      SELECT c.id, c.cliente_id
      INTO v_item_contrato, v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

      -- Define contrato_id do lote se ainda nulo (primeiro item do lote)
      UPDATE moveria_lotes
      SET contrato_id = v_item_contrato, atualizado_em = now()
      WHERE id = NEW.lote_id AND contrato_id IS NULL;

      -- Define cliente_id do lote se ainda nulo (primeiro item do lote)
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
  RAISE NOTICE '  moveria_fn_sync_lote_id_on_insert atualizada (seta contrato_id).';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 7 — Reescreve moveria_fn_check_lote_conformacao
  -- Remove branch conformado→aberto (dissolução é via DELETE, não UPDATE).
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_conformacao()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_qtd_itens integer;
    BEGIN
      -- Conformação: requer ≥1 item
      IF NEW.status = 'conformado' AND OLD.status = 'aberto' THEN
        SELECT count(*) INTO v_qtd_itens FROM moveria_lote_itens WHERE lote_id = NEW.id;
        IF v_qtd_itens < 1 THEN
          RAISE EXCEPTION 'Lote sem itens não pode ser conformado'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.conformado_em = now();

        INSERT INTO moveria_eventos (tipo, lote_id, autor_id, payload)
        VALUES (
          'lote_conformado', NEW.id,
          COALESCE(auth.uid(), NEW.conformado_por),
          jsonb_build_object('qtd_itens', v_qtd_itens)
        );
      END IF;

      -- Reabertura direta desativada (Fase 3+): use DELETE para dissolver o lote.
      IF OLD.status = 'conformado' AND NEW.status = 'aberto' THEN
        RAISE EXCEPTION 'Dissolva o lote via DELETE para liberar seus itens. UPDATE de status conformado→aberto está desativado no modelo Fase 3+.'
          USING ERRCODE = 'P0001';
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;
  RAISE NOTICE '  moveria_fn_check_lote_conformacao: branch conformado→aberto substituída por EXCEPTION.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 8 — Dissolução: BEFORE DELETE com advisory lock e audit log
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_dissolver_lote()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NOT auth_is_moveria_admin() THEN
        RAISE EXCEPTION 'Apenas admin pode dissolver um lote'
          USING ERRCODE = 'P0001';
      END IF;

      -- Serializa com moveria_fn_reservar_numero_lote para o mesmo contrato.
      -- Garante que criação e dissolução simultâneas não produzem gaps ou leituras sujas.
      PERFORM pg_advisory_xact_lock(
        hashtext('moveria_lote_numero:' || OLD.contrato_id::text)
      );

      INSERT INTO moveria_eventos (tipo, lote_id, autor_id, payload)
      VALUES (
        'lote_dissolvido', OLD.id, auth.uid(),
        jsonb_build_object(
          'numero',      OLD.numero,
          'contrato_id', OLD.contrato_id,
          'qtd_itens',   (SELECT count(*) FROM moveria_lote_itens WHERE lote_id = OLD.id)
        )
      );

      RETURN OLD;
    END;
    $body$
  $f$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lotes_before_delete ON moveria_lotes $sql$;
  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lotes_before_delete
      BEFORE DELETE ON moveria_lotes
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_dissolver_lote()
  $sql$;
  RAISE NOTICE '  moveria_fn_dissolver_lote + trg_moveria_lotes_before_delete criados.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 9 — RLS DELETE para moveria_lotes (dissolução admin-only)
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    DROP POLICY IF EXISTS "moveria_lotes: delete" ON moveria_lotes
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_lotes: delete"
      ON moveria_lotes FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;
  RAISE NOTICE '  RLS DELETE para moveria_lotes criada.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 10 — GRANTs para contrato_id
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    GRANT SELECT (contrato_id) ON moveria_lotes TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT INSERT (contrato_id) ON moveria_lotes TO authenticated
  $sql$;
  RAISE NOTICE '  GRANTs SELECT+INSERT para contrato_id adicionados.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 11 — View moveria_lotes_v
  -- Expõe lotes com dados desnormalizados para a UI: contrato, cliente,
  -- consultor, contagem de itens. WHERE reflete a RLS existente em moveria_lotes.
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ DROP VIEW IF EXISTS moveria_lotes_v $sql$;
  EXECUTE $view$
    CREATE VIEW moveria_lotes_v AS
    SELECT
      l.id,
      l.numero,
      l.contrato_id,
      c.numero_base
        || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END
        AS contrato_numero,
      l.cliente_id,
      cl.nome_completo AS cliente_nome,
      l.consultor_id,
      p.full_name     AS consultor_nome,
      l.status,
      l.conformado_em,
      l.conformado_por,
      l.criado_em,
      l.atualizado_em,
      (SELECT count(*) FROM moveria_lote_itens WHERE lote_id = l.id)::integer AS qtd_itens
    FROM moveria_lotes l
    LEFT JOIN moveria_contratos c  ON c.id  = l.contrato_id
    LEFT JOIN moveria_clientes  cl ON cl.id = l.cliente_id
    LEFT JOIN moveria_membros   m  ON m.id  = l.consultor_id
    LEFT JOIN profiles          p  ON p.id  = m.profile_id
    WHERE
      auth_is_moveria_admin()
      OR (
        (auth_moveria_papel())::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1 FROM moveria_membros mm
          WHERE mm.id = l.consultor_id AND mm.profile_id = auth.uid()
        )
      )
      OR moveria_vendedor_tem_lote(l.id)
  $view$;
  EXECUTE $sql$ GRANT SELECT ON moveria_lotes_v TO authenticated $sql$;
  RAISE NOTICE '  moveria_lotes_v criada com GRANT SELECT.';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 12 — Documenta gancho Fase 4
  -- ═══════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    COMMENT ON FUNCTION moveria_fn_reservar_numero_lote(uuid, integer) IS
    'GANCHO FASE 4 — Protocolo intra-transação de criação de lote a partir de medição:
     1. Reservar número (dentro da transação de medição):
          SELECT moveria_fn_reservar_numero_lote(contrato_id, qtd_itens_no_batch)
          → retorna ''ÚNICO'' ou ''1''/''2''... (advisory lock mantido até COMMIT).
     2. Criar lote em estado transitório interno:
          INSERT INTO moveria_lotes (..., status = ''aberto'')
          -- ''aberto'' é invisível externamente (read committed); nunca observável por outros clients.
     3. Inserir itens: INSERT INTO moveria_lote_itens (trigger valida contrato/cliente).
     4. Conformar atomicamente:
          UPDATE moveria_lotes SET status = ''conformado'', conformado_por = auth.uid()
     5. COMMIT → lote aparece conformado para todos os observers externos.
     Invariante: do ponto de vista externo, o lote SEMPRE está conformado.
     O status ''aberto'' existe apenas como artefato de implementação intra-transação.'
  $sql$;

  RAISE NOTICE 'moveria_fase3_lotes: concluído com sucesso.';

END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603010000_moveria_fase3_lotes.sql')
ON CONFLICT (filename) DO NOTHING;
