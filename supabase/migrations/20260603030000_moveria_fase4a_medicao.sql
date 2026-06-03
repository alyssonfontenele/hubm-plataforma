-- =============================================================================
-- MIGRATION: moveria_fase4a_medicao
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Depende de: 20260603010000_moveria_fase3_lotes
-- Guards:    moveria_lotes ausente → pula (Core, Mowig)
--            coluna aptidao já existe → idempotente
--
-- Alterações:
--   Pre-bloco A : ADD VALUE (5 novos status) em moveria_status_lote
--   Seção 1     : CREATE TYPE moveria_aptidao + moveria_status_medicao
--   Seção 2     : ADD COLUMNS aptidao, aptidao_obs em moveria_itens_contrato
--   Seção 3     : DROP trigger + função moveria_fn_avanca_status_apos_medicao
--                 (desacoplamento aptidão ↔ status_item — INTENCIONAL, sem substituto)
--   Seção 4     : DROP das 3 storage policies do bucket moveria-medicoes (delete,
--                 insert, select) antes do DROP TABLE; guard count=0;
--                 DROP TABLE + CREATE TABLE moveria_medicoes (por sessão)
--   Seção 5     : ADD COLUMN medicao_id em moveria_itens_contrato (FK nova tabela)
--   Seção 6     : CREATE TABLE moveria_desenhos_medicao (path, não URL)
--   Seção 7     : REWRITE moveria_fn_check_lote_item_insert (IN → != aberto)
--   Seção 7b    : REWRITE moveria_fn_check_lote_item_delete (= conformado → != aberto)
--   Seção 8     : RLS para moveria_medicoes + moveria_desenhos_medicao
--                 + 3 storage policies recriadas (referencia moveria_desenhos_medicao,
--                   sem branch de vendedor — admin ou consultor_tecnico designado)
--   Seção 9     : GRANTs
--
-- Storage INSERT policy: valida designação via path-based check.
--   Assume convenção de path: {item_id}/{filename}
--   item_id extraído via split_part(name,'/',1) comparado como texto contra
--   moveria_designacoes.item_id::text. Se a app usar outra convenção de path,
--   a policy rejeitará uploads legítimos — revisar antes de usar em produção.
--
-- Máquina de estado do lote (transições pós-conformado): SEM guardas de trigger.
-- Controle na aplicação por ora — revisável em migration futura.
-- =============================================================================

-- ─── PRÉ-BLOCO A: ADD VALUE em moveria_status_lote ───────────────────────────
DO $enum_sl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'moveria_status_lote'
  ) THEN
    RAISE NOTICE 'fase4a_medicao: moveria_status_lote ausente — ADD VALUE pulado (Core/Mowig).';
    RETURN;
  END IF;
  ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'medido'                        AFTER 'conformado';
  ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'apresentacao_tecnica'           AFTER 'medido';
  ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'aprovado'                      AFTER 'apresentacao_tecnica';
  ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'documentacao_tecnica_completa'  AFTER 'aprovado';
  ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'cancelado'                     AFTER 'concluido';
  RAISE NOTICE 'fase4a_medicao: 5 valores adicionados a moveria_status_lote.';
END $enum_sl$;


-- ─── BLOCO PRINCIPAL ─────────────────────────────────────────────────────────
DO $migration$
DECLARE
  v_schema text   := 'public';
  v_cnt    bigint;
BEGIN

  -- Guard 1: Core/Mowig
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'moveria_lotes'
  ) THEN
    RAISE NOTICE 'fase4a_medicao: moveria_lotes ausente — pulada (Core/Mowig).';
    RETURN;
  END IF;

  -- Guard 2: idempotência
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema
      AND table_name   = 'moveria_itens_contrato'
      AND column_name  = 'aptidao'
  ) THEN
    RAISE NOTICE 'fase4a_medicao: aptidao já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'fase4a_medicao: iniciando…';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 1 — Novos tipos
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ CREATE TYPE moveria_aptidao AS ENUM ('pendente','apto','apto_ressalva','inapto') $sql$;
  EXECUTE $sql$ CREATE TYPE moveria_status_medicao AS ENUM ('em_andamento','finalizada') $sql$;
  RAISE NOTICE '  tipos moveria_aptidao e moveria_status_medicao criados.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 2 — Adicionar aptidao + aptidao_obs a moveria_itens_contrato
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    ALTER TABLE moveria_itens_contrato
      ADD COLUMN aptidao     moveria_aptidao NOT NULL DEFAULT 'pendente',
      ADD COLUMN aptidao_obs text
  $sql$;
  RAISE NOTICE '  aptidao + aptidao_obs adicionados a moveria_itens_contrato.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 3 — DROP trigger acoplado + função (desacoplamento intencional)
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_medicao_after_insert ON moveria_medicoes $sql$;
  EXECUTE $sql$ DROP FUNCTION IF EXISTS moveria_fn_avanca_status_apos_medicao() $sql$;
  RAISE NOTICE '  trigger + função moveria_fn_avanca_status_apos_medicao removidos.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 4 — DROP das 3 storage policies + guard count=0 + DROP+CREATE
  --
  -- As 3 policies do bucket moveria-medicoes são dropadas antes do DROP TABLE:
  --   • select: JOIN direto em moveria_medicoes.fotos_urls (schema antigo) — bloqueante
  --   • insert: controla o mesmo bucket — recriada com regras atualizadas
  --   • delete: controla o mesmo bucket — recriada com regras atualizadas
  -- Todas recriadas na Seção 8 apontando para moveria_desenhos_medicao.
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria-medicoes: select" ON storage.objects $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria-medicoes: insert" ON storage.objects $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria-medicoes: delete" ON storage.objects $sql$;
  RAISE NOTICE '  3 storage policies moveria-medicoes removidas.';

  SELECT count(*) INTO v_cnt FROM moveria_medicoes;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: moveria_medicoes tem % linha(s) — limpe antes de reaplicar.', v_cnt
    USING ERRCODE = 'P0001';
  END IF;

  EXECUTE $sql$ DROP TABLE moveria_medicoes $sql$;

  EXECUTE $sql$
    CREATE TABLE moveria_medicoes (
      id            uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
      contrato_id   uuid                   NOT NULL
        REFERENCES moveria_contratos(id) ON DELETE CASCADE,
      consultor_id  uuid                   NOT NULL
        REFERENCES moveria_membros(id)   ON DELETE NO ACTION,
      data_visita   date                   NOT NULL,
      status        moveria_status_medicao NOT NULL DEFAULT 'em_andamento',
      criado_em     timestamptz            NOT NULL DEFAULT now(),
      finalizada_em timestamptz
    )
  $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_medicoes ENABLE ROW LEVEL SECURITY $sql$;
  RAISE NOTICE '  moveria_medicoes recriada (nova estrutura por sessão).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 5 — medicao_id em moveria_itens_contrato
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    ALTER TABLE moveria_itens_contrato
      ADD COLUMN medicao_id uuid REFERENCES moveria_medicoes(id) ON DELETE SET NULL
  $sql$;
  RAISE NOTICE '  medicao_id adicionado a moveria_itens_contrato.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 6 — moveria_desenhos_medicao (substitui fotos_urls text[] do antigo)
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    CREATE TABLE moveria_desenhos_medicao (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id     uuid        NOT NULL
        REFERENCES moveria_itens_contrato(id) ON DELETE CASCADE,
      path        text        NOT NULL,
      enviado_por uuid        NOT NULL
        REFERENCES profiles(id) ON DELETE NO ACTION,
      criado_em   timestamptz NOT NULL DEFAULT now()
    )
  $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_desenhos_medicao ENABLE ROW LEVEL SECURITY $sql$;
  RAISE NOTICE '  moveria_desenhos_medicao criada.';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 7 — Reescrever moveria_fn_check_lote_item_insert (!= aberto)
  -- ═════════════════════════════════════════════════════════════════════════
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

      IF v_lote_status != 'aberto' THEN
        RAISE EXCEPTION 'Lote está % — composição travada. Apenas status aberto permite inserção de itens.',
          v_lote_status USING ERRCODE = 'P0001';
      END IF;

      SELECT i.contrato_id, c.cliente_id
      INTO v_item_contrato, v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

      IF v_lote_contrato IS NOT NULL AND v_lote_contrato <> v_item_contrato THEN
        IF auth_is_moveria_admin() THEN
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
  RAISE NOTICE '  moveria_fn_check_lote_item_insert reescrita (!= aberto).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 7b — Reescrever moveria_fn_check_lote_item_delete (!= aberto)
  -- Decisão product owner: travar composição em TODOS os estados pós-aberto.
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_item_delete()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_lote_status moveria_status_lote;
      v_item_status moveria_status_item;
    BEGIN
      SELECT status     INTO v_lote_status FROM moveria_lotes          WHERE id = OLD.lote_id;
      SELECT status_item INTO v_item_status FROM moveria_itens_contrato WHERE id = OLD.item_id;

      IF v_item_status = 'inapto' THEN
        RETURN OLD;
      END IF;

      IF v_lote_status != 'aberto' AND NOT auth_is_moveria_admin() THEN
        RAISE EXCEPTION 'Lote está % — composição travada. Apenas admin pode remover itens.',
          v_lote_status USING ERRCODE = 'P0001';
      END IF;

      RETURN OLD;
    END;
    $body$
  $f$;
  RAISE NOTICE '  moveria_fn_check_lote_item_delete reescrita (!= aberto).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 8 — RLS: moveria_medicoes + moveria_desenhos_medicao + storage
  -- ═════════════════════════════════════════════════════════════════════════

  -- ── RLS moveria_medicoes ──────────────────────────────────────────────────
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: select"
      ON moveria_medicoes FOR SELECT
      USING (auth_is_moveria_admin() OR auth_moveria_papel() IS NOT NULL)
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: insert"
      ON moveria_medicoes FOR INSERT
      WITH CHECK (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND moveria_consultor_tem_contrato(contrato_id)
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: update"
      ON moveria_medicoes FOR UPDATE
      USING (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            WHERE m.id = moveria_medicoes.consultor_id AND m.profile_id = auth.uid()
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: delete"
      ON moveria_medicoes FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;

  -- ── RLS moveria_desenhos_medicao ──────────────────────────────────────────
  EXECUTE $sql$
    CREATE POLICY "moveria_desenhos_medicao: select"
      ON moveria_desenhos_medicao FOR SELECT
      USING (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes des
            JOIN moveria_membros m ON m.id = des.consultor_id AND m.profile_id = auth.uid()
            WHERE des.item_id = moveria_desenhos_medicao.item_id AND des.ativo = true
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_desenhos_medicao: insert"
      ON moveria_desenhos_medicao FOR INSERT
      WITH CHECK (
        auth_is_moveria_admin()
        OR (
          (auth_moveria_papel())::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes des
            JOIN moveria_membros m ON m.id = des.consultor_id AND m.profile_id = auth.uid()
            WHERE des.item_id = moveria_desenhos_medicao.item_id AND des.ativo = true
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_desenhos_medicao: delete"
      ON moveria_desenhos_medicao FOR DELETE
      USING (auth_is_moveria_admin())
  $sql$;

  -- ── Storage policies recriadas (bucket moveria-medicoes) ──────────────────
  -- Regra: admin OU consultor_tecnico designado no item. SEM branch de vendedor.
  --
  -- SELECT: valida designação via moveria_desenhos_medicao.path = objects.name
  EXECUTE $sql$
    CREATE POLICY "moveria-medicoes: select"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'moveria-medicoes'
        AND (
          auth_is_moveria_admin()
          OR (
            (auth_moveria_papel())::text = 'consultor_tecnico'
            AND EXISTS (
              SELECT 1 FROM moveria_desenhos_medicao d
              JOIN moveria_designacoes des
                ON des.item_id = d.item_id AND des.ativo = true
              JOIN moveria_membros m
                ON m.id = des.consultor_id AND m.profile_id = auth.uid()
              WHERE d.path = objects.name
            )
          )
        )
      )
  $sql$;

  -- INSERT: o registro em moveria_desenhos_medicao ainda não existe no momento do
  -- upload — não é possível fazer JOIN nessa tabela. Validação via path-based:
  -- assume convenção path = '{item_id}/{filename}', extrai item_id do primeiro
  -- segmento e verifica designação. Se a app usar outra convenção de path, revisar.
  EXECUTE $sql$
    CREATE POLICY "moveria-medicoes: insert"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'moveria-medicoes'
        AND (
          auth_is_moveria_admin()
          OR (
            (auth_moveria_papel())::text = 'consultor_tecnico'
            AND EXISTS (
              SELECT 1 FROM moveria_designacoes des
              JOIN moveria_membros m
                ON m.id = des.consultor_id AND m.profile_id = auth.uid()
              WHERE des.item_id::text = split_part(objects.name, '/', 1)
                AND des.ativo = true
            )
          )
        )
      )
  $sql$;

  -- DELETE: mesma lógica de designação do SELECT (registro já existe)
  EXECUTE $sql$
    CREATE POLICY "moveria-medicoes: delete"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'moveria-medicoes'
        AND (
          auth_is_moveria_admin()
          OR (
            (auth_moveria_papel())::text = 'consultor_tecnico'
            AND EXISTS (
              SELECT 1 FROM moveria_desenhos_medicao d
              JOIN moveria_designacoes des
                ON des.item_id = d.item_id AND des.ativo = true
              JOIN moveria_membros m
                ON m.id = des.consultor_id AND m.profile_id = auth.uid()
              WHERE d.path = objects.name
            )
          )
        )
      )
  $sql$;
  RAISE NOTICE '  RLS e 3 storage policies recriadas (sem vendedor).';

  -- ═════════════════════════════════════════════════════════════════════════
  -- SEÇÃO 9 — GRANTs
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE $sql$
    GRANT SELECT (aptidao, aptidao_obs, medicao_id) ON moveria_itens_contrato TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT INSERT (aptidao, aptidao_obs, medicao_id) ON moveria_itens_contrato TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT UPDATE (aptidao, aptidao_obs, medicao_id) ON moveria_itens_contrato TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT SELECT (id, contrato_id, consultor_id, data_visita, status, criado_em, finalizada_em)
      ON moveria_medicoes TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT INSERT (contrato_id, consultor_id, data_visita) ON moveria_medicoes TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT UPDATE (status, finalizada_em) ON moveria_medicoes TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT SELECT (id, item_id, path, enviado_por, criado_em)
      ON moveria_desenhos_medicao TO authenticated
  $sql$;
  EXECUTE $sql$
    GRANT INSERT (item_id, path, enviado_por) ON moveria_desenhos_medicao TO authenticated
  $sql$;
  RAISE NOTICE '  GRANTs aplicados.';

  RAISE NOTICE 'fase4a_medicao: concluída com sucesso.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603030000_moveria_fase4a_medicao.sql')
ON CONFLICT (filename) DO NOTHING;
