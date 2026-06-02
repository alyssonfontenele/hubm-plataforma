-- =============================================================================
-- MIGRATION: add_moveria_module
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Objetivo : Módulo Contratos Moveria — schema completo com 10 tabelas,
--            enums, triggers, views de mascaramento e RLS de 3 perfis.
--
-- PRÉ-CONDIÇÃO DE SEGURANÇA (não é DDL — é ação no painel):
--   MFA/TOTP deve estar ativo para todos os usuários com global_role='superadmin'
--   ANTES de publicar em produção. Sem MFA, auth_is_superadmin() pode ser usado
--   para contornar mascaramento de CPF e travas de lote.
--   Ver checklist Fase 1 antes do deploy.
--
-- NOTA SOBRE MASCARAMENTO DE COLUNAS:
--   O mascaramento de valor_unitario/valor_item (vendedor) e cpf_hash (vendedor)
--   é implementado nas views moveria_*_v. As views usam o comportamento padrão
--   do PostgreSQL (owner=postgres, RLS do owner), com cláusulas WHERE explícitas
--   para filtragem de linhas e CASE para mascaramento de colunas.
--   A camada de app/PostgREST deve usar as views para exibição ao vendedor.
--   Ajuste 2: o vendedor vê valores R$ SOMENTE na resposta da Edge Function de
--   importação (tela one-time de conferência). A navegação posterior usa as views.
--   Ajuste 3: NUNCA usar moveria_itens_contrato.consultor_designado em políticas
--   de RLS. Fonte de verdade para acesso do consultor = moveria_designacoes.
--
-- ROLLBACK (executar na ordem inversa se necessário):
--   DROP VIEW IF EXISTS moveria_itens_v, moveria_contratos_v, moveria_clientes_v CASCADE;
--   DROP TABLE IF EXISTS moveria_eventos, moveria_documentos, moveria_medicoes,
--     moveria_designacoes, moveria_lote_itens, moveria_itens_contrato,
--     moveria_lotes, moveria_contratos, moveria_clientes, moveria_membros CASCADE;
--   DROP FUNCTION IF EXISTS
--     auth_moveria_papel(), auth_is_moveria_admin(),
--     moveria_set_atualizado_em(), moveria_fn_check_status_item_transition(),
--     moveria_fn_avanca_status_apos_medicao(), moveria_fn_check_lote_item_insert(),
--     moveria_fn_check_lote_item_delete(), moveria_fn_sync_lote_id_on_insert(),
--     moveria_fn_sync_lote_id_on_delete(), moveria_fn_check_lote_conformacao(),
--     moveria_fn_sync_consultor_designado() CASCADE;
--   DROP TYPE IF EXISTS moveria_tipo_evento, moveria_tipo_doc, moveria_veredito,
--     moveria_status_contrato, moveria_status_lote, moveria_status_item,
--     moveria_papel CASCADE;
-- =============================================================================

DO $migration$
DECLARE
  v_schema text := 'public';
BEGIN

  -- Guard: esta migration é exclusiva do banco Moveria.
  -- Verifica presença do enum global_role (bancos empresa) E da tabela profiles.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = v_schema AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'add_moveria_module: enum global_role ausente — migration pulada (banco core?).';
    RETURN;
  END IF;

  -- Guard 2: banco Moveria tem slug 'moveria' em companies.
  -- Mowig tem apenas 'mowig' e 'system' — sem 'moveria' → pula.
  -- Core não chegou aqui (guard 1 saiu antes).
  IF NOT EXISTS (
    SELECT 1 FROM companies WHERE slug = 'moveria'
  ) THEN
    RAISE NOTICE 'add_moveria_module: empresa com slug ''moveria'' não encontrada — migration pulada (banco Mowig ou local sem seed?).';
    RETURN;
  END IF;

  -- Guard 3: idempotência — tabelas já existem, nada a fazer.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'moveria_membros'
  ) THEN
    RAISE NOTICE 'add_moveria_module: tabelas já existem — migration idempotente, nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'add_moveria_module: iniciando criação do módulo Contratos Moveria…';

  -- ===========================================================================
  -- SEÇÃO 1 — ENUMS (7)
  -- ===========================================================================

  -- 1.1 moveria_papel
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_papel') THEN
    EXECUTE 'CREATE TYPE moveria_papel AS ENUM (
      ''admin_moveria'', ''consultor_tecnico'', ''vendedor''
    )';
    RAISE NOTICE '  enum moveria_papel criado.';
  END IF;

  -- 1.2 moveria_status_item (7 estados, fluxo estrito via trigger)
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_status_item') THEN
    EXECUTE 'CREATE TYPE moveria_status_item AS ENUM (
      ''pendente'',
      ''em_medicao'',
      ''inapto'',
      ''em_apresentacao_tecnica'',
      ''aprovado_producao'',
      ''em_producao'',
      ''entregue_montado''
    )';
    RAISE NOTICE '  enum moveria_status_item criado.';
  END IF;

  -- 1.3 moveria_status_lote
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_status_lote') THEN
    EXECUTE 'CREATE TYPE moveria_status_lote AS ENUM (
      ''aberto'', ''conformado'', ''em_medicao'', ''concluido''
    )';
    RAISE NOTICE '  enum moveria_status_lote criado.';
  END IF;

  -- 1.4 moveria_status_contrato
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_status_contrato') THEN
    EXECUTE 'CREATE TYPE moveria_status_contrato AS ENUM (
      ''em_andamento'', ''concluido'', ''arquivado''
    )';
    RAISE NOTICE '  enum moveria_status_contrato criado.';
  END IF;

  -- 1.5 moveria_veredito
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_veredito') THEN
    EXECUTE 'CREATE TYPE moveria_veredito AS ENUM (''apto'', ''inapto'')';
    RAISE NOTICE '  enum moveria_veredito criado.';
  END IF;

  -- 1.6 moveria_tipo_doc
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_tipo_doc') THEN
    EXECUTE 'CREATE TYPE moveria_tipo_doc AS ENUM (
      ''proposta_pdf'', ''contrato_assinado'', ''outros''
    )';
    RAISE NOTICE '  enum moveria_tipo_doc criado.';
  END IF;

  -- 1.7 moveria_tipo_evento
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'moveria_tipo_evento') THEN
    EXECUTE 'CREATE TYPE moveria_tipo_evento AS ENUM (
      ''status_item_alterado'',
      ''status_lote_alterado'',
      ''status_contrato_alterado'',
      ''medicao_registrada'',
      ''item_adicionado_lote'',
      ''item_removido_lote'',
      ''lote_conformado'',
      ''lote_reaberto'',
      ''campo_manual_preenchido'',
      ''designacao_criada'',
      ''designacao_desativada'',
      ''documento_importado'',
      ''soft_delete''
    )';
    RAISE NOTICE '  enum moveria_tipo_evento criado.';
  END IF;

  -- ===========================================================================
  -- SEÇÃO 2 — TABELAS (10, em ordem topológica de FK)
  -- ===========================================================================

  -- 2.1 moveria_membros
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_membros (
      id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      papel      moveria_papel NOT NULL DEFAULT 'vendedor',
      ativo      boolean       NOT NULL DEFAULT true,
      criado_em  timestamptz   NOT NULL DEFAULT now(),
      UNIQUE (profile_id)
    )
  $sql$;

  -- 2.2 moveria_clientes
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_clientes (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      nome_completo text        NOT NULL,
      cpf_hash      text,
      cpf_mascarado text,
      cnpj_hash     text,
      telefone      text,
      email         text,
      endereco      text,
      criado_em     timestamptz NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.3 moveria_contratos
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_contratos (
      id              uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
      numero          text                    NOT NULL UNIQUE,
      cliente_id      uuid                    NOT NULL REFERENCES moveria_clientes(id),
      vendedor_id     uuid                    NOT NULL REFERENCES moveria_membros(id),
      status          moveria_status_contrato NOT NULL DEFAULT 'em_andamento',
      desconto_pct    numeric(5,2)            NOT NULL DEFAULT 0
                                              CHECK (desconto_pct >= 0 AND desconto_pct <= 100),
      drive_folder_id text,
      storage_prefix  text,
      observacoes     text,
      criado_em       timestamptz             NOT NULL DEFAULT now(),
      atualizado_em   timestamptz             NOT NULL DEFAULT now(),
      deletado_em     timestamptz
    )
  $sql$;

  -- 2.4 moveria_lotes
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_lotes (
      id             uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
      numero         text                NOT NULL UNIQUE,
      consultor_id   uuid                NOT NULL REFERENCES moveria_membros(id),
      cliente_id     uuid                REFERENCES moveria_clientes(id),
      status         moveria_status_lote NOT NULL DEFAULT 'aberto',
      conformado_em  timestamptz,
      conformado_por uuid                REFERENCES profiles(id),
      criado_em      timestamptz         NOT NULL DEFAULT now(),
      atualizado_em  timestamptz         NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.5 moveria_itens_contrato
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_itens_contrato (
      id                        uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
      contrato_id               uuid                NOT NULL REFERENCES moveria_contratos(id) ON DELETE CASCADE,
      codigo                    text                NOT NULL,
      descricao                 text                NOT NULL,
      ambiente                  text,
      quantidade                integer             NOT NULL DEFAULT 1 CHECK (quantidade > 0),
      valor_unitario            numeric(12,2)       NOT NULL CHECK (valor_unitario >= 0),
      valor_item                numeric(12,2)       GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
      prazo_producao_dias_uteis integer,
      status_item               moveria_status_item NOT NULL DEFAULT 'pendente',
      lote_id                   uuid                REFERENCES moveria_lotes(id),
      consultor_designado       uuid                REFERENCES profiles(id),
      ordem                     integer             NOT NULL DEFAULT 0,
      criado_em                 timestamptz         NOT NULL DEFAULT now(),
      atualizado_em             timestamptz         NOT NULL DEFAULT now(),
      deletado_em               timestamptz,
      UNIQUE (contrato_id, codigo)
    )
  $sql$;

  -- 2.6 moveria_lote_itens
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_lote_itens (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      lote_id       uuid        NOT NULL REFERENCES moveria_lotes(id) ON DELETE CASCADE,
      item_id       uuid        NOT NULL REFERENCES moveria_itens_contrato(id) ON DELETE RESTRICT,
      adicionado_em timestamptz NOT NULL DEFAULT now(),
      adicionado_por uuid       NOT NULL REFERENCES profiles(id),
      UNIQUE (item_id)
    )
  $sql$;

  -- 2.7 moveria_designacoes
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_designacoes (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id       uuid        NOT NULL REFERENCES moveria_itens_contrato(id) ON DELETE CASCADE,
      consultor_id  uuid        NOT NULL REFERENCES moveria_membros(id),
      designado_por uuid        NOT NULL REFERENCES profiles(id),
      designado_em  timestamptz NOT NULL DEFAULT now(),
      ativo         boolean     NOT NULL DEFAULT true
    )
  $sql$;

  -- Partial unique: apenas uma designação ativa por item
  EXECUTE $sql$
    CREATE UNIQUE INDEX IF NOT EXISTS moveria_designacoes_item_ativo_unique
      ON moveria_designacoes(item_id)
      WHERE ativo = true
  $sql$;

  -- 2.8 moveria_medicoes
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_medicoes (
      id         uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id    uuid             NOT NULL REFERENCES moveria_itens_contrato(id) ON DELETE RESTRICT,
      veredito   moveria_veredito NOT NULL,
      parecer    text,
      fotos_urls text[],
      autor_id   uuid             NOT NULL REFERENCES profiles(id),
      criado_em  timestamptz      NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.9 moveria_documentos
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_documentos (
      id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
      contrato_id   uuid             NOT NULL REFERENCES moveria_contratos(id) ON DELETE RESTRICT,
      tipo          moveria_tipo_doc NOT NULL,
      storage_path  text             NOT NULL,
      drive_file_id text,
      nome_arquivo  text,
      mime_type     text,
      tamanho_bytes bigint,
      enviado_por   uuid             NOT NULL REFERENCES profiles(id),
      criado_em     timestamptz      NOT NULL DEFAULT now(),
      deletado_em   timestamptz
    )
  $sql$;

  -- 2.10 moveria_eventos (append-only, sem atualizado_em)
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS moveria_eventos (
      id          uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo        moveria_tipo_evento  NOT NULL,
      contrato_id uuid                REFERENCES moveria_contratos(id),
      item_id     uuid                REFERENCES moveria_itens_contrato(id),
      lote_id     uuid                REFERENCES moveria_lotes(id),
      autor_id    uuid                NOT NULL REFERENCES profiles(id),
      payload     jsonb               NOT NULL DEFAULT '{}',
      criado_em   timestamptz         NOT NULL DEFAULT now()
    )
  $sql$;

  -- ===========================================================================
  -- SEÇÃO 3 — FUNÇÕES HELPER (seguem o padrão de auth_global_role)
  -- ===========================================================================

  -- 3.1 auth_moveria_papel(): papel do usuário atual no módulo
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION auth_moveria_papel()
    RETURNS moveria_papel
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT papel FROM moveria_membros
      WHERE profile_id = auth.uid() AND ativo = true
      LIMIT 1;
    $body$
  $f$;

  -- 3.2 auth_is_moveria_admin(): true para superadmin, admin global e admin_moveria
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION auth_is_moveria_admin()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT COALESCE(
        auth_is_superadmin()
        OR auth_global_role()::text = 'admin'
        OR (SELECT papel::text FROM moveria_membros
            WHERE profile_id = auth.uid() AND ativo = true LIMIT 1) = 'admin_moveria',
        false
      );
    $body$
  $f$;

  -- 3.3–3.8 HELPERS SECURITY DEFINER — quebram recursão nas RLS policies
  --   (ciclo moveria_contratos ↔ moveria_itens_contrato)

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_consultor_tem_contrato(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_itens_contrato i
        JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
        JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
        WHERE i.contrato_id = p_id AND i.deletado_em IS NULL
      );
    $body$
  $f$;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_vendedor_tem_contrato(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_contratos c
        JOIN moveria_membros m ON m.id = c.vendedor_id AND m.profile_id = auth.uid()
        WHERE c.id = p_id AND c.deletado_em IS NULL
      );
    $body$
  $f$;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_consultor_tem_cliente(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_contratos ct
        JOIN moveria_itens_contrato i ON i.contrato_id = ct.id AND i.deletado_em IS NULL
        JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
        JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
        WHERE ct.cliente_id = p_id AND ct.deletado_em IS NULL
      );
    $body$
  $f$;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_vendedor_tem_cliente(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_contratos ct
        JOIN moveria_membros m ON m.id = ct.vendedor_id AND m.profile_id = auth.uid()
        WHERE ct.cliente_id = p_id AND ct.deletado_em IS NULL
      );
    $body$
  $f$;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_vendedor_tem_lote(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_lote_itens li
        JOIN moveria_itens_contrato i ON i.id = li.item_id
        JOIN moveria_contratos c ON c.id = i.contrato_id
        JOIN moveria_membros m ON m.id = c.vendedor_id AND m.profile_id = auth.uid()
        WHERE li.lote_id = p_id
      );
    $body$
  $f$;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_vendedor_tem_item(p_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $body$
      SELECT EXISTS (
        SELECT 1 FROM moveria_itens_contrato i
        JOIN moveria_contratos c ON c.id = i.contrato_id
        JOIN moveria_membros m ON m.id = c.vendedor_id AND m.profile_id = auth.uid()
        WHERE i.id = p_id AND c.deletado_em IS NULL
      );
    $body$
  $f$;

  -- 3.9 moveria_set_atualizado_em(): trigger para coluna atualizado_em
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_set_atualizado_em()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    BEGIN
      NEW.atualizado_em = now();
      RETURN NEW;
    END;
    $body$
  $f$;

  -- ===========================================================================
  -- SEÇÃO 4 — FUNÇÕES DE TRIGGER
  -- ===========================================================================

  -- 4.1 Valida transições de status_item (fluxo estrito)
  --     Admin pode forçar qualquer transição (override para casos excepcionais / reset de teste)
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_status_item_transition()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      v_from text := OLD.status_item::text;
      v_to   text := NEW.status_item::text;
    BEGIN
      IF OLD.status_item = NEW.status_item THEN RETURN NEW; END IF;

      -- Admin pode forçar qualquer transição (override administrativo)
      -- OBRIGATÓRIO: todo override gera evento imutável no log (Ajuste A — spec Fase 1)
      IF auth_is_moveria_admin() THEN
        -- Só registra evento quando há sessão autenticada (auth.uid() != NULL)
        -- Operações via service_role sem usuário (ex.: scripts de setup) não geram evento
        IF auth.uid() IS NOT NULL THEN
          INSERT INTO moveria_eventos (tipo, item_id, autor_id, payload)
          VALUES (
            'status_item_alterado',
            NEW.id,
            auth.uid(),
            jsonb_build_object(
              'de', v_from,
              'para', v_to,
              'admin_override', true
            )
          );
        END IF;
        RETURN NEW;
      END IF;

      IF    (v_from = 'pendente'                  AND v_to = 'em_medicao')                THEN RETURN NEW;
      ELSIF (v_from = 'em_medicao'                AND v_to = 'inapto')                    THEN RETURN NEW;
      ELSIF (v_from = 'em_medicao'                AND v_to = 'em_apresentacao_tecnica')   THEN RETURN NEW;
      ELSIF (v_from = 'inapto'                    AND v_to = 'pendente')                  THEN RETURN NEW;
      ELSIF (v_from = 'em_apresentacao_tecnica'   AND v_to = 'aprovado_producao')         THEN RETURN NEW;
      ELSIF (v_from = 'aprovado_producao'         AND v_to = 'em_producao')               THEN RETURN NEW;
      ELSIF (v_from = 'em_producao'               AND v_to = 'entregue_montado')          THEN RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Transição de status_item inválida: % → %. Fluxo: pendente→em_medicao→(inapto→pendente | em_apresentacao_tecnica→aprovado_producao→em_producao→entregue_montado)',
        v_from, v_to USING ERRCODE = 'P0001';
    END;
    $body$
  $f$;

  -- 4.2 Avança status do item após medição registrada
  --     apto   → em_medicao → em_apresentacao_tecnica
  --     inapto → em_medicao → inapto → libera item do lote (UNIQUE constraint ok)
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_avanca_status_apos_medicao()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    BEGIN
      IF NEW.veredito = 'apto' THEN
        UPDATE moveria_itens_contrato
        SET status_item = 'em_apresentacao_tecnica', atualizado_em = now()
        WHERE id = NEW.item_id AND status_item = 'em_medicao';

        INSERT INTO moveria_eventos (tipo, item_id, autor_id, payload)
        VALUES (
          'status_item_alterado', NEW.item_id, NEW.autor_id,
          jsonb_build_object('de', 'em_medicao', 'para', 'em_apresentacao_tecnica',
                             'veredito', 'apto', 'medicao_id', NEW.id)
        );

      ELSIF NEW.veredito = 'inapto' THEN
        -- UPDATE antes do DELETE: moveria_fn_check_lote_item_delete lê status_item
        UPDATE moveria_itens_contrato
        SET status_item = 'inapto', atualizado_em = now()
        WHERE id = NEW.item_id AND status_item = 'em_medicao';

        -- Libera item do lote (permite entrada em lote futuro sem violar UNIQUE)
        DELETE FROM moveria_lote_itens WHERE item_id = NEW.item_id;

        INSERT INTO moveria_eventos (tipo, item_id, autor_id, payload)
        VALUES (
          'medicao_registrada', NEW.item_id, NEW.autor_id,
          jsonb_build_object('de', 'em_medicao', 'para', 'inapto',
                             'veredito', 'inapto', 'medicao_id', NEW.id)
        );
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;

  -- 4.3 Valida inserção em moveria_lote_itens (3 regras)
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_item_insert()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    DECLARE
      v_lote_status  moveria_status_lote;
      v_lote_cliente uuid;
      v_item_cliente uuid;
    BEGIN
      SELECT status, cliente_id INTO v_lote_status, v_lote_cliente
      FROM moveria_lotes WHERE id = NEW.lote_id;

      -- Regra 1: lote conformado ou concluído não aceita novos itens
      IF v_lote_status IN ('conformado', 'concluido') THEN
        RAISE EXCEPTION 'Lote está % — composição travada. Apenas admin pode reabrir.',
          v_lote_status USING ERRCODE = 'P0001';
      END IF;

      -- Regra 2: trava multi-contrato — todos os itens do lote devem ser do mesmo cliente
      SELECT c.cliente_id INTO v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

      IF v_lote_cliente IS NULL THEN
        -- Primeiro item: define o cliente do lote via trigger after
        NULL;
      ELSIF v_lote_cliente <> v_item_cliente THEN
        RAISE EXCEPTION 'Trava multi-contrato: item pertence ao cliente % mas o lote está vinculado ao cliente %',
          v_item_cliente, v_lote_cliente USING ERRCODE = 'P0001';
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;

  -- 4.4 Valida remoção de moveria_lote_itens
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_item_delete()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    DECLARE
      v_lote_status moveria_status_lote;
      v_item_status moveria_status_item;
    BEGIN
      SELECT status INTO v_lote_status FROM moveria_lotes WHERE id = OLD.lote_id;
      SELECT status_item INTO v_item_status FROM moveria_itens_contrato WHERE id = OLD.item_id;

      -- Permite remoção quando item está inapto (ciclo de retry libera o item)
      IF v_item_status = 'inapto' THEN
        RETURN OLD;
      END IF;

      -- Lote conformado: apenas admin pode remover itens
      IF v_lote_status = 'conformado' AND NOT auth_is_moveria_admin() THEN
        RAISE EXCEPTION 'Lote conformado: apenas admin pode remover itens'
          USING ERRCODE = 'P0001';
      END IF;

      RETURN OLD;
    END;
    $body$
  $f$;

  -- 4.5 AFTER INSERT em lote_itens: sincroniza lote_id no item e define cliente do lote
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_sync_lote_id_on_insert()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    DECLARE
      v_item_cliente uuid;
    BEGIN
      -- Sincroniza lote_id denormalizado no item
      UPDATE moveria_itens_contrato
      SET lote_id = NEW.lote_id, atualizado_em = now()
      WHERE id = NEW.item_id;

      -- Define cliente_id do lote se ainda nulo (primeiro item)
      SELECT c.cliente_id INTO v_item_cliente
      FROM moveria_itens_contrato i
      JOIN moveria_contratos c ON c.id = i.contrato_id
      WHERE i.id = NEW.item_id;

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

  -- 4.6 AFTER DELETE em lote_itens: limpa lote_id no item
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_sync_lote_id_on_delete()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    BEGIN
      UPDATE moveria_itens_contrato
      SET lote_id = NULL, atualizado_em = now()
      WHERE id = OLD.item_id;

      RETURN OLD;
    END;
    $body$
  $f$;

  -- 4.7 BEFORE UPDATE status em moveria_lotes: valida conformação e reabertura
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_check_lote_conformacao()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
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

      -- Reabertura: apenas admin global ou admin_moveria
      IF OLD.status = 'conformado' AND NEW.status = 'aberto' THEN
        IF NOT auth_is_moveria_admin() THEN
          RAISE EXCEPTION 'Apenas admin pode reabrir um lote conformado'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.conformado_em  = NULL;
        NEW.conformado_por = NULL;

        INSERT INTO moveria_eventos (tipo, lote_id, autor_id, payload)
        VALUES (
          'lote_reaberto', NEW.id, auth.uid(),
          jsonb_build_object('reaberto_por', COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid))
        );
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;

  -- 4.8 Sincroniza consultor_designado após mudança em moveria_designacoes
  --     Ajuste 3: consultor_designado é APENAS UI/ordenação — não usar em RLS.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION moveria_fn_sync_consultor_designado()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    DECLARE
      v_profile_id uuid;
    BEGIN
      IF TG_OP = 'INSERT' AND NEW.ativo = true THEN
        SELECT profile_id INTO v_profile_id FROM moveria_membros WHERE id = NEW.consultor_id;
        UPDATE moveria_itens_contrato
        SET consultor_designado = v_profile_id, atualizado_em = now()
        WHERE id = NEW.item_id;

        INSERT INTO moveria_eventos (tipo, item_id, autor_id, payload)
        VALUES (
          'designacao_criada', NEW.item_id,
          COALESCE(auth.uid(), NEW.designado_por),
          jsonb_build_object('consultor_id', NEW.consultor_id, 'designado_por', NEW.designado_por)
        );

      ELSIF TG_OP = 'UPDATE' AND OLD.ativo = true AND NEW.ativo = false THEN
        SELECT profile_id INTO v_profile_id FROM moveria_membros WHERE id = OLD.consultor_id;
        UPDATE moveria_itens_contrato
        SET consultor_designado = NULL, atualizado_em = now()
        WHERE id = OLD.item_id AND consultor_designado = v_profile_id;

        INSERT INTO moveria_eventos (tipo, item_id, autor_id, payload)
        VALUES (
          'designacao_desativada', OLD.item_id,
          COALESCE(auth.uid(), OLD.designado_por),
          jsonb_build_object('consultor_id', OLD.consultor_id)
        );
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;

  -- ===========================================================================
  -- SEÇÃO 5 — TRIGGERS
  -- ===========================================================================

  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_contratos_updated_at      ON moveria_contratos      $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lotes_updated_at           ON moveria_lotes           $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_itens_updated_at           ON moveria_itens_contrato  $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_itens_check_status          ON moveria_itens_contrato  $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_medicao_after_insert        ON moveria_medicoes        $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lote_itens_before_insert    ON moveria_lote_itens      $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lote_itens_before_delete    ON moveria_lote_itens      $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lote_itens_after_insert     ON moveria_lote_itens      $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lote_itens_after_delete     ON moveria_lote_itens      $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_lote_conformacao            ON moveria_lotes           $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_moveria_designacao_sync             ON moveria_designacoes     $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_contratos_updated_at
      BEFORE UPDATE ON moveria_contratos
      FOR EACH ROW EXECUTE FUNCTION moveria_set_atualizado_em()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lotes_updated_at
      BEFORE UPDATE ON moveria_lotes
      FOR EACH ROW EXECUTE FUNCTION moveria_set_atualizado_em()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_itens_updated_at
      BEFORE UPDATE ON moveria_itens_contrato
      FOR EACH ROW EXECUTE FUNCTION moveria_set_atualizado_em()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_itens_check_status
      BEFORE UPDATE OF status_item ON moveria_itens_contrato
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_check_status_item_transition()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_medicao_after_insert
      AFTER INSERT ON moveria_medicoes
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_avanca_status_apos_medicao()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lote_itens_before_insert
      BEFORE INSERT ON moveria_lote_itens
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_check_lote_item_insert()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lote_itens_before_delete
      BEFORE DELETE ON moveria_lote_itens
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_check_lote_item_delete()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lote_itens_after_insert
      AFTER INSERT ON moveria_lote_itens
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_sync_lote_id_on_insert()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lote_itens_after_delete
      AFTER DELETE ON moveria_lote_itens
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_sync_lote_id_on_delete()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_lote_conformacao
      BEFORE UPDATE OF status ON moveria_lotes
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_check_lote_conformacao()
  $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_moveria_designacao_sync
      AFTER INSERT OR UPDATE OF ativo ON moveria_designacoes
      FOR EACH ROW EXECUTE FUNCTION moveria_fn_sync_consultor_designado()
  $sql$;

  -- ===========================================================================
  -- SEÇÃO 6 — VIEWS DE MASCARAMENTO
  --
  -- Usam o comportamento padrão do PostgreSQL: owner=postgres tem acesso às
  -- tabelas base; RLS não é aplicado automaticamente para o owner (superuser
  -- bypassa RLS). As views incluem cláusulas WHERE explícitas para filtragem
  -- de linhas e CASE para mascaramento de colunas por papel.
  -- A camada de aplicação deve usar estas views para exibição ao vendedor.
  -- ===========================================================================

  -- 6.1 moveria_clientes_v — oculta cpf_hash e cnpj_hash para vendedor
  EXECUTE $view$
    CREATE OR REPLACE VIEW moveria_clientes_v AS
    SELECT
      c.id,
      c.profile_id,
      c.nome_completo,
      CASE
        WHEN auth_is_moveria_admin()
          OR auth_moveria_papel()::text = 'consultor_tecnico'
        THEN c.cpf_hash
        ELSE NULL
      END AS cpf_hash,
      c.cpf_mascarado,
      CASE
        WHEN auth_is_moveria_admin()
          OR auth_moveria_papel()::text = 'consultor_tecnico'
        THEN c.cnpj_hash
        ELSE NULL
      END AS cnpj_hash,
      c.telefone,
      c.email,
      c.endereco,
      c.criado_em
    FROM moveria_clientes c
    WHERE
      auth_is_moveria_admin()
      OR (
        auth_moveria_papel()::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1 FROM moveria_contratos ct
          JOIN moveria_itens_contrato i ON i.contrato_id = ct.id AND i.deletado_em IS NULL
          JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
          JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
          WHERE ct.cliente_id = c.id AND ct.deletado_em IS NULL
        )
      )
      OR (
        auth_moveria_papel()::text = 'vendedor'
        AND EXISTS (
          SELECT 1 FROM moveria_contratos ct
          JOIN moveria_membros m ON m.id = ct.vendedor_id AND m.profile_id = auth.uid()
          WHERE ct.cliente_id = c.id AND ct.deletado_em IS NULL
        )
      )
  $view$;

  -- 6.2 moveria_contratos_v — oculta desconto_pct para vendedor
  EXECUTE $view$
    CREATE OR REPLACE VIEW moveria_contratos_v AS
    SELECT
      c.id,
      c.numero,
      c.cliente_id,
      c.vendedor_id,
      c.status,
      CASE
        WHEN auth_moveria_papel()::text = 'vendedor' THEN NULL::numeric
        ELSE c.desconto_pct
      END AS desconto_pct,
      c.drive_folder_id,
      c.storage_prefix,
      c.observacoes,
      c.criado_em,
      c.atualizado_em,
      c.deletado_em
    FROM moveria_contratos c
    WHERE
      c.deletado_em IS NULL
      AND (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_itens_contrato i
            JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            WHERE i.contrato_id = c.id AND i.deletado_em IS NULL
          )
        )
        OR (
          auth_moveria_papel()::text = 'vendedor'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            WHERE m.id = c.vendedor_id AND m.profile_id = auth.uid()
          )
        )
      )
  $view$;

  -- 6.3 moveria_itens_v — oculta valor_unitario e valor_item para vendedor
  --     Ajuste 2: vendedor vê valores R$ apenas na tela one-time da Edge Function
  --               de importação. A navegação usa esta view.
  --     Ajuste 3: consultor_designado exposto como coluna UI/ordenação.
  --               Fonte de verdade para controle de acesso = moveria_designacoes.
  EXECUTE $view$
    CREATE OR REPLACE VIEW moveria_itens_v AS
    SELECT
      i.id,
      i.contrato_id,
      i.codigo,
      i.descricao,
      i.ambiente,
      i.quantidade,
      CASE
        WHEN auth_moveria_papel()::text = 'vendedor' THEN NULL::numeric
        ELSE i.valor_unitario
      END AS valor_unitario,
      CASE
        WHEN auth_moveria_papel()::text = 'vendedor' THEN NULL::numeric
        ELSE i.valor_item
      END AS valor_item,
      i.prazo_producao_dias_uteis,
      i.status_item,
      i.lote_id,
      i.consultor_designado,
      i.ordem,
      i.criado_em,
      i.atualizado_em,
      i.deletado_em
    FROM moveria_itens_contrato i
    WHERE
      i.deletado_em IS NULL
      AND (
        auth_is_moveria_admin()
        OR (
          -- Consultor: acesso via moveria_designacoes (fonte de verdade, Ajuste 3)
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes d
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            WHERE d.item_id = i.id AND d.ativo = true
          )
        )
        OR (
          -- Vendedor: itens dos próprios contratos (sem valores — mascarados acima)
          auth_moveria_papel()::text = 'vendedor'
          AND EXISTS (
            SELECT 1 FROM moveria_contratos c
            JOIN moveria_membros m ON m.id = c.vendedor_id AND m.profile_id = auth.uid()
            WHERE c.id = i.contrato_id AND c.deletado_em IS NULL
          )
        )
      )
  $view$;

  -- ===========================================================================
  -- SEÇÃO 7 — GRANTS
  -- ===========================================================================

  -- Tabelas com acesso direto (RLS controla linhas; sem mascaramento de colunas)
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE ON moveria_membros     TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT        ON moveria_lotes        TO authenticated $sql$;
  EXECUTE $sql$ GRANT UPDATE (status, conformado_em, conformado_por, atualizado_em)
                  ON moveria_lotes TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, DELETE ON moveria_lote_itens  TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE (ativo)
                  ON moveria_designacoes TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT        ON moveria_medicoes     TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE (deletado_em)
                  ON moveria_documentos TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT        ON moveria_eventos      TO authenticated $sql$;

  -- Tabelas com mascaramento de colunas:
  -- Column-level GRANT bloqueia as colunas sensíveis na tabela base.
  -- Colunas não sensíveis são acessíveis para EXISTS em policies de outras tabelas.
  -- Colunas sensíveis só são acessíveis via views mascaradas (_v).
  --
  -- moveria_clientes: bloqueia cpf_hash e cnpj_hash
  EXECUTE $sql$ REVOKE SELECT ON moveria_clientes FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT SELECT (
      id, profile_id, nome_completo, cpf_mascarado,
      telefone, email, endereco, criado_em
    ) ON moveria_clientes TO authenticated
  $sql$;
  EXECUTE $sql$ GRANT INSERT, UPDATE ON moveria_clientes TO authenticated $sql$;

  -- moveria_contratos: bloqueia desconto_pct
  EXECUTE $sql$ REVOKE SELECT ON moveria_contratos FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT SELECT (
      id, numero, cliente_id, vendedor_id, status,
      drive_folder_id, storage_prefix, observacoes,
      criado_em, atualizado_em, deletado_em
    ) ON moveria_contratos TO authenticated
  $sql$;
  EXECUTE $sql$ GRANT INSERT, UPDATE (status, observacoes, drive_folder_id, storage_prefix, deletado_em, atualizado_em)
                  ON moveria_contratos TO authenticated $sql$;

  -- moveria_itens_contrato: bloqueia valor_unitario e valor_item
  EXECUTE $sql$ REVOKE SELECT ON moveria_itens_contrato FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT SELECT (
      id, contrato_id, codigo, descricao, ambiente, quantidade,
      prazo_producao_dias_uteis, status_item, lote_id, consultor_designado,
      ordem, criado_em, atualizado_em, deletado_em
    ) ON moveria_itens_contrato TO authenticated
  $sql$;
  EXECUTE $sql$ GRANT INSERT, UPDATE (status_item, prazo_producao_dias_uteis, atualizado_em, deletado_em)
                  ON moveria_itens_contrato TO authenticated $sql$;

  -- Views mascaradas
  EXECUTE $sql$ GRANT SELECT ON moveria_clientes_v  TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT ON moveria_contratos_v TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT ON moveria_itens_v     TO authenticated $sql$;

  -- ===========================================================================
  -- SEÇÃO 8 — RLS
  -- ===========================================================================

  EXECUTE $sql$ ALTER TABLE moveria_membros        ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_clientes       ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_contratos      ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_lotes          ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_itens_contrato ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_lote_itens     ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_designacoes    ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_medicoes       ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_documentos     ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE moveria_eventos        ENABLE ROW LEVEL SECURITY $sql$;

  -- Limpa policies anteriores (idempotência)
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_membros: select"            ON moveria_membros        $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_membros: insert"            ON moveria_membros        $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_membros: update"            ON moveria_membros        $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_clientes: select"           ON moveria_clientes       $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_clientes: insert"           ON moveria_clientes       $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_clientes: update"           ON moveria_clientes       $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_contratos: select"          ON moveria_contratos      $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_contratos: insert"          ON moveria_contratos      $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_contratos: update"          ON moveria_contratos      $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lotes: select"              ON moveria_lotes          $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lotes: insert"              ON moveria_lotes          $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lotes: update"              ON moveria_lotes          $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_itens: select"              ON moveria_itens_contrato $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_itens: insert"              ON moveria_itens_contrato $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_itens: update"              ON moveria_itens_contrato $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lote_itens: select"         ON moveria_lote_itens     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lote_itens: insert"         ON moveria_lote_itens     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_lote_itens: delete"         ON moveria_lote_itens     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_designacoes: select"        ON moveria_designacoes    $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_designacoes: insert"        ON moveria_designacoes    $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_designacoes: update"        ON moveria_designacoes    $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_medicoes: select"           ON moveria_medicoes       $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_medicoes: insert"           ON moveria_medicoes       $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_documentos: select"         ON moveria_documentos     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_documentos: insert"         ON moveria_documentos     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_documentos: soft_delete"    ON moveria_documentos     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_eventos: select"            ON moveria_eventos        $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "moveria_eventos: insert"            ON moveria_eventos        $sql$;

  -- ---- moveria_membros ----
  EXECUTE $sql$
    CREATE POLICY "moveria_membros: select" ON moveria_membros
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR profile_id = auth.uid()
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_membros: insert" ON moveria_membros
      FOR INSERT WITH CHECK (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_membros: update" ON moveria_membros
      FOR UPDATE USING (auth_is_moveria_admin())
  $sql$;

  -- ---- moveria_clientes ----
  EXECUTE $sql$
    CREATE POLICY "moveria_clientes: select" ON moveria_clientes
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR moveria_consultor_tem_cliente(id)
        OR moveria_vendedor_tem_cliente(id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_clientes: insert" ON moveria_clientes
      FOR INSERT WITH CHECK (
        auth_is_moveria_admin()
        OR auth_moveria_papel()::text = 'consultor_tecnico'
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_clientes: update" ON moveria_clientes
      FOR UPDATE USING (auth_is_moveria_admin())
  $sql$;

  -- ---- moveria_contratos ----
  -- Consultor: helper SECURITY DEFINER evita recursão com moveria_itens_contrato
  -- Vendedor: sem INSERT/UPDATE — criação via Edge Function (service_role)
  EXECUTE $sql$
    CREATE POLICY "moveria_contratos: select" ON moveria_contratos
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR moveria_consultor_tem_contrato(id)
        OR (
          auth_moveria_papel()::text = 'vendedor'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            WHERE m.id = moveria_contratos.vendedor_id AND m.profile_id = auth.uid()
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_contratos: insert" ON moveria_contratos
      FOR INSERT WITH CHECK (auth_is_moveria_admin())
  $sql$;
  -- Vendedor: sem INSERT/UPDATE de contrato. Criação via Edge Function (service_role).
  EXECUTE $sql$
    CREATE POLICY "moveria_contratos: update" ON moveria_contratos
      FOR UPDATE USING (auth_is_moveria_admin())
  $sql$;

  -- ---- moveria_lotes ----
  EXECUTE $sql$
    CREATE POLICY "moveria_lotes: select" ON moveria_lotes
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            WHERE m.id = moveria_lotes.consultor_id AND m.profile_id = auth.uid()
          )
        )
        OR moveria_vendedor_tem_lote(id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_lotes: insert" ON moveria_lotes
      FOR INSERT WITH CHECK (
        auth_is_moveria_admin()
        OR auth_moveria_papel()::text = 'consultor_tecnico'
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_lotes: update" ON moveria_lotes
      FOR UPDATE USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            WHERE m.id = moveria_lotes.consultor_id AND m.profile_id = auth.uid()
          )
        )
      )
  $sql$;

  -- ---- moveria_itens_contrato ----
  -- Ajuste 3: consultor usa moveria_designacoes (fonte de verdade), nunca consultor_designado
  -- Vendedor usa helper SECURITY DEFINER para evitar recursão com moveria_contratos
  EXECUTE $sql$
    CREATE POLICY "moveria_itens: select" ON moveria_itens_contrato
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes d
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            WHERE d.item_id = moveria_itens_contrato.id AND d.ativo = true
          )
        )
        OR moveria_vendedor_tem_contrato(moveria_itens_contrato.contrato_id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_itens: insert" ON moveria_itens_contrato
      FOR INSERT WITH CHECK (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_itens: update" ON moveria_itens_contrato
      FOR UPDATE USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes d
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            WHERE d.item_id = moveria_itens_contrato.id AND d.ativo = true
          )
        )
        -- Vendedor: sem UPDATE
      )
  $sql$;

  -- ---- moveria_lote_itens ----
  EXECUTE $sql$
    CREATE POLICY "moveria_lote_itens: select" ON moveria_lote_itens
      FOR SELECT USING (auth_moveria_papel() IS NOT NULL OR auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_lote_itens: insert" ON moveria_lote_itens
      FOR INSERT WITH CHECK (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            JOIN moveria_lotes l ON l.consultor_id = m.id AND l.id = moveria_lote_itens.lote_id
            WHERE m.profile_id = auth.uid()
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_lote_itens: delete" ON moveria_lote_itens
      FOR DELETE USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_membros m
            JOIN moveria_lotes l ON l.consultor_id = m.id AND l.id = moveria_lote_itens.lote_id
            WHERE m.profile_id = auth.uid()
          )
        )
      )
  $sql$;

  -- ---- moveria_designacoes ----
  EXECUTE $sql$
    CREATE POLICY "moveria_designacoes: select" ON moveria_designacoes
      FOR SELECT USING (auth_moveria_papel() IS NOT NULL OR auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_designacoes: insert" ON moveria_designacoes
      FOR INSERT WITH CHECK (auth_is_moveria_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_designacoes: update" ON moveria_designacoes
      FOR UPDATE USING (auth_is_moveria_admin())
  $sql$;

  -- ---- moveria_medicoes ----
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: select" ON moveria_medicoes
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes d
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            WHERE d.item_id = moveria_medicoes.item_id AND d.ativo = true
          )
        )
        OR moveria_vendedor_tem_item(moveria_medicoes.item_id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_medicoes: insert" ON moveria_medicoes
      FOR INSERT WITH CHECK (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND EXISTS (
            SELECT 1 FROM moveria_designacoes d
            JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
            JOIN moveria_itens_contrato i ON i.id = d.item_id AND i.status_item = 'em_medicao'
            WHERE d.item_id = moveria_medicoes.item_id AND d.ativo = true
          )
        )
      )
  $sql$;
  -- Sem UPDATE/DELETE: medição é imutável após registro.

  -- ---- moveria_documentos ----
  EXECUTE $sql$
    CREATE POLICY "moveria_documentos: select" ON moveria_documentos
      FOR SELECT USING (
        deletado_em IS NULL
        AND (
          auth_is_moveria_admin()
          OR (
            auth_moveria_papel()::text = 'consultor_tecnico'
            AND moveria_consultor_tem_contrato(moveria_documentos.contrato_id)
          )
          OR moveria_vendedor_tem_contrato(moveria_documentos.contrato_id)
        )
      )
  $sql$;
  -- Vendedor pode inserir documentos (PDF import, Ajuste 2)
  EXECUTE $sql$
    CREATE POLICY "moveria_documentos: insert" ON moveria_documentos
      FOR INSERT WITH CHECK (
        auth_is_moveria_admin()
        OR auth_moveria_papel()::text = 'consultor_tecnico'
        OR auth_moveria_papel()::text = 'vendedor'
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_documentos: soft_delete" ON moveria_documentos
      FOR UPDATE USING (auth_is_moveria_admin())
      WITH CHECK (auth_is_moveria_admin())
  $sql$;

  -- ---- moveria_eventos (append-only) ----
  -- Nenhuma policy de UPDATE ou DELETE é criada: default do Postgres nega.
  EXECUTE $sql$
    CREATE POLICY "moveria_eventos: select" ON moveria_eventos
      FOR SELECT USING (
        auth_is_moveria_admin()
        OR (
          auth_moveria_papel()::text = 'consultor_tecnico'
          AND (
            item_id IS NULL
            OR EXISTS (
              SELECT 1 FROM moveria_designacoes d
              JOIN moveria_membros m ON m.id = d.consultor_id AND m.profile_id = auth.uid()
              WHERE d.item_id = moveria_eventos.item_id AND d.ativo = true
            )
          )
        )
        OR (
          auth_moveria_papel()::text = 'vendedor'
          AND (
            contrato_id IS NULL
            OR moveria_vendedor_tem_contrato(moveria_eventos.contrato_id)
          )
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "moveria_eventos: insert" ON moveria_eventos
      FOR INSERT WITH CHECK (auth_moveria_papel() IS NOT NULL OR auth_is_moveria_admin())
  $sql$;

  RAISE NOTICE 'add_moveria_module: migration aplicada com sucesso. 10 tabelas, 7 enums, 3 views, RLS completo.';

END $migration$;

-- =============================================================================
-- VERIFICAÇÃO (executar após a migration para confirmar):
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'moveria_%' ORDER BY 1;
--
--   SELECT typname, array_agg(enumlabel ORDER BY enumsortorder)
--   FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
--   JOIN pg_namespace n ON n.oid=t.typnamespace
--   WHERE n.nspname='public' AND t.typname LIKE 'moveria_%'
--   GROUP BY typname ORDER BY typname;
--
--   SELECT policyname, tablename, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename LIKE 'moveria_%'
--   ORDER BY tablename, policyname;
-- =============================================================================

INSERT INTO public.schema_migrations (filename)
VALUES ('20260602010000_add_moveria_module.sql')
ON CONFLICT (filename) DO NOTHING;
