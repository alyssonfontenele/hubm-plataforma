-- =============================================================================
-- MIGRATION: tarefas_fase1_schema
-- Aplica em: bancos Mowig (xpoqiclaqkudznmshzal) + Moveria (fzgasvcfxufhrbrdakow)
-- Pula     : Core (ausência do enum global_role)
-- Objetivo : Módulo Tarefas/Requisições — Fase 1 (MVP)
--
-- Conteúdo: 5 enums, 8 tabelas, 10 índices, 3 helpers, 2 fns de trigger,
--           6 triggers, GRANTs explícitos, RLS completo.
--
-- Decisões de produto implementadas:
--   D1 – Extensão de prazo: campos sla_*_due_at + evento prazo_estendido_*
--   D2 – Recusa colaborativo: gate trigger → tarefa volta para 'devolvida'
--   D3 – Conclusão colaborativo: gate trigger → 'concluida' no último
--   D4 – Cancelamento: estados cancelamento_solicitado / cancelada
--   D5 – Rejeição terminal: reaberta_de FK self-referencing + 'rejeitada_final'
--   D6 – Validação de terceiro: tarefas_validacoes com campos claim (dormente, Fase 2)
--
-- Nota SLA: due_at populados pela app no INSERT (integração com calendário de feriados).
--   claim_timeout padrão configurável via tarefas_slas.claim_timeout_minutos;
--   materializado em tarefas_validacoes.claim_timeout no momento da criação da linha.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS tarefas_validacoes, tarefas_anexos, tarefas_checklist_itens,
--     tarefas_eventos, tarefas_atribuicoes, tarefas, tarefas_modelos, tarefas_slas CASCADE;
--   DROP FUNCTION IF EXISTS tarefas_set_atualizado_em, tarefas_sou_participante,
--     tarefas_is_admin, tarefas_fn_valida_transicao, tarefas_fn_gate_colaborativo CASCADE;
--   DROP TYPE IF EXISTS tarefas_tipo_evento, tarefas_status_atribuicao,
--     tarefas_tipo, tarefas_modo, tarefas_status CASCADE;
-- =============================================================================

DO $migration$
DECLARE
  v_schema text := 'public';
BEGIN

  -- Guard 1: Core não tem enum global_role → pula silenciosamente.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = v_schema AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'tarefas_fase1_schema: global_role ausente — pulada (banco core).';
    RETURN;
  END IF;

  -- Guard 2: idempotência — tabela principal já existe.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = 'tarefas'
  ) THEN
    RAISE NOTICE 'tarefas_fase1_schema: tabela tarefas já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'tarefas_fase1_schema: iniciando…';

  -- ===========================================================================
  -- SEÇÃO 1 — ENUMS (5)
  -- ===========================================================================

  -- 1.1 Estado agregado da tarefa (máquina de estados central)
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'tarefas_status') THEN
    EXECUTE $t$
      CREATE TYPE tarefas_status AS ENUM (
        'solicitada',
        'aceita',
        'em_andamento',
        'concluida',
        'validada',
        'devolvida',
        'ajuste_solicitado',
        'rejeitada',
        'rejeitada_final',
        'cancelamento_solicitado',
        'cancelada'
      )
    $t$;
    RAISE NOTICE '  enum tarefas_status criado.';
  END IF;

  -- 1.2 Modo de atribuição
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'tarefas_modo') THEN
    EXECUTE $t$ CREATE TYPE tarefas_modo AS ENUM ('unica', 'colaborativo', 'paralelo') $t$;
    RAISE NOTICE '  enum tarefas_modo criado.';
  END IF;

  -- 1.3 Tipo (criada para si ou requisitada a outro)
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'tarefas_tipo') THEN
    EXECUTE $t$ CREATE TYPE tarefas_tipo AS ENUM ('propria', 'requisitada') $t$;
    RAISE NOTICE '  enum tarefas_tipo criado.';
  END IF;

  -- 1.4 Estado individual em tarefas_atribuicoes — necessário para gates D2/D3
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'tarefas_status_atribuicao') THEN
    EXECUTE $t$
      CREATE TYPE tarefas_status_atribuicao AS ENUM (
        'pendente_aceite',
        'aceita',
        'recusada',
        'em_andamento',
        'concluida'
      )
    $t$;
    RAISE NOTICE '  enum tarefas_status_atribuicao criado.';
  END IF;

  -- 1.5 Tipos de evento para o log append-only
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = v_schema AND t.typname = 'tarefas_tipo_evento') THEN
    EXECUTE $t$
      CREATE TYPE tarefas_tipo_evento AS ENUM (
        'criada',
        'aceita',
        'recusada',
        'devolvida',
        'resubmetida',
        'inicio_execucao',
        'concluida',
        'validada',
        'ajuste_solicitado',
        'rejeitada',
        'rejeitada_final',
        'cancelamento_solicitado',
        'cancelamento_confirmado',
        'cancelamento_contestado',
        'cancelada',
        'prazo_estendido_solicitado',
        'prazo_estendido_aprovado',
        'prazo_estendido_recusado',
        'atribuicao_aceita',
        'atribuicao_recusada',
        'atribuicao_recusada_trava',
        'atribuicao_concluida',
        'todos_aceitaram',
        'todos_concluiram',
        'lote_criado',
        'reaberta_como',
        'origem_reaberta',
        'anexo_adicionado',
        'checklist_atualizado',
        'campo_preenchido',
        'sla_vencido',
        'escalado'
      )
    $t$;
    RAISE NOTICE '  enum tarefas_tipo_evento criado.';
  END IF;

  -- ===========================================================================
  -- SEÇÃO 2 — TABELAS (8, ordem topológica de FK)
  -- ===========================================================================

  -- 2.1 tarefas_slas — configuração de SLA por empresa (admin-editable)
  --     claim_timeout_minutos: default do D6 (Fase 2), materializado em
  --     tarefas_validacoes.claim_timeout no momento da criação da validação.
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_slas (
      id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id                uuid        NOT NULL REFERENCES companies(id),
      nome                      text        NOT NULL,
      ativo                     boolean     NOT NULL DEFAULT true,
      prazo_resposta_horas      integer     NOT NULL DEFAULT 24
                                            CHECK (prazo_resposta_horas > 0),
      prazo_execucao_dias_uteis integer     NOT NULL DEFAULT 5
                                            CHECK (prazo_execucao_dias_uteis > 0),
      prazo_validacao_horas     integer     NOT NULL DEFAULT 48
                                            CHECK (prazo_validacao_horas > 0),
      escalonamento_apos_horas  integer     NOT NULL DEFAULT 4
                                            CHECK (escalonamento_apos_horas > 0),
      escalonamento_gestor_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      claim_timeout_minutos     integer     NOT NULL DEFAULT 30
                                            CHECK (claim_timeout_minutos > 0),
      criado_em                 timestamptz NOT NULL DEFAULT now(),
      atualizado_em             timestamptz NOT NULL DEFAULT now(),
      UNIQUE (company_id, nome)
    )
  $sql$;

  -- 2.2 tarefas_modelos — templates pessoais (Fase 1) e globais (Fase 2)
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_modelos (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    uuid        NOT NULL REFERENCES companies(id),
      nome          text        NOT NULL,
      escopo        text        NOT NULL DEFAULT 'pessoal'
                                CHECK (escopo IN ('pessoal', 'global')),
      criado_por    uuid        NOT NULL REFERENCES profiles(id),
      payload       jsonb       NOT NULL DEFAULT '{}',
      criado_em     timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.3 tarefas — tabela principal
  --   lote_id    : UUID livre sem FK — chave de agrupamento de tarefas paralelas.
  --                Todas as irmãs de um batch compartilham o mesmo lote_id.
  --   reaberta_de: FK self-ref (D5) — nova tarefa aponta para a original encerrada.
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas (
      id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id            uuid           NOT NULL REFERENCES companies(id),
      tipo                  tarefas_tipo   NOT NULL DEFAULT 'requisitada',
      modo                  tarefas_modo   NOT NULL DEFAULT 'unica',
      solicitante_id        uuid           NOT NULL REFERENCES profiles(id),
      status                tarefas_status NOT NULL DEFAULT 'solicitada',
      objetivo              text           NOT NULL,
      instrucoes            text,
      prazo                 timestamptz    NOT NULL,
      campos_personalizados jsonb          NOT NULL DEFAULT '{}',
      sla_id                uuid           REFERENCES tarefas_slas(id) ON DELETE SET NULL,
      sla_resposta_due_at   timestamptz,
      sla_execucao_due_at   timestamptz,
      sla_validacao_due_at  timestamptz,
      lote_id               uuid,
      reaberta_de           uuid           REFERENCES tarefas(id) ON DELETE SET NULL,
      template_id           uuid           REFERENCES tarefas_modelos(id) ON DELETE SET NULL,
      fechado_em            timestamptz,
      criado_em             timestamptz    NOT NULL DEFAULT now(),
      atualizado_em         timestamptz    NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.4 tarefas_atribuicoes — estado individual por atribuído (gates D2/D3)
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_atribuicoes (
      id            uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
      tarefa_id     uuid                      NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
      atribuido_id  uuid                      NOT NULL REFERENCES profiles(id),
      status        tarefas_status_atribuicao NOT NULL DEFAULT 'pendente_aceite',
      aceito_em     timestamptz,
      concluido_em  timestamptz,
      criado_em     timestamptz               NOT NULL DEFAULT now(),
      UNIQUE (tarefa_id, atribuido_id)
    )
  $sql$;

  -- 2.5 tarefas_eventos — append-only; fonte única de verdade para D1–D6.
  --     UPDATE e DELETE são revogados na Seção 7.
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_eventos (
      id            uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
      tarefa_id     uuid                NOT NULL REFERENCES tarefas(id),
      tipo          tarefas_tipo_evento NOT NULL,
      autor_id      uuid                NOT NULL REFERENCES profiles(id),
      atribuicao_id uuid                REFERENCES tarefas_atribuicoes(id) ON DELETE SET NULL,
      payload       jsonb               NOT NULL DEFAULT '{}',
      criado_em     timestamptz         NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.6 tarefas_checklist_itens — itens ordenados vinculados à tarefa
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_checklist_itens (
      id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      tarefa_id uuid        NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
      descricao text        NOT NULL,
      ordem     integer     NOT NULL DEFAULT 0,
      feito     boolean     NOT NULL DEFAULT false,
      feito_em  timestamptz,
      feito_por uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      criado_em timestamptz NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.7 tarefas_anexos — arquivos, imagens, áudio
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_anexos (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      tarefa_id     uuid        NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
      evento_id     uuid        REFERENCES tarefas_eventos(id) ON DELETE SET NULL,
      storage_path  text        NOT NULL,
      nome_arquivo  text,
      mime_type     text,
      tamanho_bytes bigint,
      autor_id      uuid        NOT NULL REFERENCES profiles(id),
      criado_em     timestamptz NOT NULL DEFAULT now()
    )
  $sql$;

  -- 2.8 tarefas_validacoes — validação de terceiro (D6, Fase 2)
  --     campos claim presentes mas dormentes na Fase 1.
  --     claim_timeout: materializado de tarefas_slas.claim_timeout_minutos
  --     no momento da criação da linha (cada linha é self-contained).
  --     Constraint: validador_id e cargo_id não podem ser ambos NOT NULL.
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS tarefas_validacoes (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      tarefa_id     uuid        NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
      validador_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      cargo_id      uuid        REFERENCES cargos(id) ON DELETE SET NULL,
      ordem         integer     NOT NULL DEFAULT 0,
      status        text        NOT NULL DEFAULT 'pendente'
                                CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
      parecer       text,
      anexo_path    text,
      claimed_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      claimed_at    timestamptz,
      claim_timeout interval    NOT NULL DEFAULT '30 minutes',
      criado_em     timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT validacao_sem_duplo_alvo
        CHECK (NOT (validador_id IS NOT NULL AND cargo_id IS NOT NULL))
    )
  $sql$;

  -- ===========================================================================
  -- SEÇÃO 3 — ÍNDICES
  -- ===========================================================================

  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_company_status  ON tarefas(company_id, status) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_solicitante      ON tarefas(solicitante_id) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_lote_id          ON tarefas(lote_id) WHERE lote_id IS NOT NULL $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_reaberta_de      ON tarefas(reaberta_de) WHERE reaberta_de IS NOT NULL $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_atrib_tarefa     ON tarefas_atribuicoes(tarefa_id) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_atrib_usuario    ON tarefas_atribuicoes(atribuido_id) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_eventos_timeline ON tarefas_eventos(tarefa_id, criado_em) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_checklist_ordem  ON tarefas_checklist_itens(tarefa_id, ordem) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_tarefa    ON tarefas_anexos(tarefa_id) $sql$;
  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS idx_tarefas_valid_ordem      ON tarefas_validacoes(tarefa_id, ordem) $sql$;

  RAISE NOTICE '  índices criados.';

  -- ===========================================================================
  -- SEÇÃO 4 — FUNÇÕES HELPER (SECURITY DEFINER — evitam recursão em RLS)
  -- ===========================================================================

  -- 4.1 Trigger genérico para atualizado_em
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_set_atualizado_em()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      NEW.atualizado_em = now();
      RETURN NEW;
    END;
    $body$
  $f$;

  -- 4.2 Verifica se o usuário atual é admin ou manager da empresa
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_is_admin()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT COALESCE(
        auth_is_superadmin()
        OR auth_global_role()::text IN ('admin', 'manager'),
        false
      );
    $body$
  $f$;

  -- 4.3 Verifica se o usuário é solicitante ou atribuído de uma tarefa da sua empresa
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_sou_participante(p_tarefa_id uuid)
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM tarefas t
        WHERE t.id = p_tarefa_id
          AND t.company_id = auth_company_id()
          AND (
            t.solicitante_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM tarefas_atribuicoes ta
              WHERE ta.tarefa_id = t.id AND ta.atribuido_id = auth.uid()
            )
          )
      );
    $body$
  $f$;

  -- ===========================================================================
  -- SEÇÃO 5 — FUNÇÕES DE TRIGGER
  -- ===========================================================================

  -- 5.1 Valida transições de tarefas.status (máquina de estados)
  --
  --     'solicitada → em_andamento' é restrita ao modo colaborativo: o gate D2-inv
  --     avança direto de solicitada para em_andamento quando todos aceitam.
  --     Modos único e paralelo passam obrigatoriamente por 'aceita' primeiro.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_fn_valida_transicao()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE
      v_de   text := OLD.status::text;
      v_para text := NEW.status::text;
    BEGIN
      IF OLD.status = NEW.status THEN RETURN NEW; END IF;

      -- Estados terminais: registra fechado_em
      IF v_para IN ('validada', 'rejeitada', 'rejeitada_final', 'cancelada') THEN
        NEW.fechado_em = COALESCE(NEW.fechado_em, now());
      END IF;

      -- Admin/manager: override irrestrito (auditoria via event log)
      IF tarefas_is_admin() THEN RETURN NEW; END IF;

      -- Transições válidas
      IF    (v_de = 'solicitada'              AND v_para IN ('aceita','rejeitada','devolvida','cancelada'))                THEN RETURN NEW;
      ELSIF (v_de = 'solicitada'              AND v_para = 'em_andamento' AND OLD.modo::text = 'colaborativo')            THEN RETURN NEW;
      ELSIF (v_de = 'devolvida'               AND v_para = 'solicitada')                                                  THEN RETURN NEW;
      ELSIF (v_de = 'aceita'                  AND v_para IN ('em_andamento','cancelamento_solicitado'))                   THEN RETURN NEW;
      ELSIF (v_de = 'em_andamento'            AND v_para IN ('concluida','devolvida'))                                   THEN RETURN NEW;
      ELSIF (v_de = 'cancelamento_solicitado' AND v_para IN ('cancelada','em_andamento'))                                THEN RETURN NEW;
      ELSIF (v_de = 'concluida'               AND v_para IN ('validada','ajuste_solicitado','rejeitada_final'))           THEN RETURN NEW;
      ELSIF (v_de = 'ajuste_solicitado'       AND v_para = 'em_andamento')                                               THEN RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Transição de status inválida: % → % (modo: %). Consulte a máquina de estados do módulo Tarefas.',
        v_de, v_para, OLD.modo USING ERRCODE = 'P0001';
    END;
    $body$
  $f$;

  -- 5.2 Gates colaborativos (D2 e D3) — AFTER UPDATE OF status em tarefas_atribuicoes
  --
  --     D2: qualquer recusa → tarefa inteira devolve ao solicitante ('devolvida').
  --         Modo paralelo ignora (cada tarefa-irmã é independente).
  --     D2-inv: todos aceitaram → tarefa avança para 'em_andamento' (sem passar por 'aceita').
  --     D3: todos concluíram → tarefa avança para 'concluida'.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_fn_gate_colaborativo()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    DECLARE
      v_modo          text;
      v_tarefa_status text;
      v_total         integer;
      v_aceitas       integer;
      v_concluidas    integer;
    BEGIN
      SELECT modo::text, status::text INTO v_modo, v_tarefa_status
      FROM tarefas WHERE id = NEW.tarefa_id;

      IF v_modo <> 'colaborativo' THEN RETURN NEW; END IF;

      -- Registra evento individual ANTES dos checks de gate para garantir que
      -- a auditoria não perde o instante exato de cada aceite/recusa/conclusão.
      IF NEW.status = 'aceita' THEN
        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (NEW.tarefa_id, 'atribuicao_aceita', NEW.atribuido_id, NEW.id,
                jsonb_build_object('atribuido_id', NEW.atribuido_id));
      ELSIF NEW.status = 'recusada' THEN
        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (NEW.tarefa_id, 'atribuicao_recusada', NEW.atribuido_id, NEW.id,
                jsonb_build_object('atribuido_id', NEW.atribuido_id));
      ELSIF NEW.status = 'concluida' THEN
        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (NEW.tarefa_id, 'atribuicao_concluida', NEW.atribuido_id, NEW.id,
                jsonb_build_object('atribuido_id', NEW.atribuido_id));
      END IF;

      SELECT
        count(*),
        count(*) FILTER (WHERE status = 'aceita'),
        count(*) FILTER (WHERE status = 'concluida')
      INTO v_total, v_aceitas, v_concluidas
      FROM tarefas_atribuicoes WHERE tarefa_id = NEW.tarefa_id;

      -- D2: recusa trava a tarefa inteira → devolve ao solicitante
      --     Grava também evento agregado 'atribuicao_recusada_trava' (d2: true).
      IF NEW.status = 'recusada'
         AND v_tarefa_status NOT IN (
               'cancelada','cancelamento_solicitado',
               'rejeitada','rejeitada_final','devolvida'
             ) THEN
        UPDATE tarefas
           SET status = 'devolvida', atualizado_em = now()
         WHERE id = NEW.tarefa_id;

        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (
          NEW.tarefa_id, 'atribuicao_recusada_trava', NEW.atribuido_id, NEW.id,
          jsonb_build_object('d2', true, 'atribuido_id', NEW.atribuido_id)
        );
        RETURN NEW;
      END IF;

      -- D2-inv: todos aceitaram → inicia execução (evento agregado 'todos_aceitaram')
      IF NEW.status = 'aceita' AND v_aceitas = v_total AND v_tarefa_status = 'solicitada' THEN
        UPDATE tarefas
           SET status = 'em_andamento', atualizado_em = now()
         WHERE id = NEW.tarefa_id;

        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (
          NEW.tarefa_id, 'todos_aceitaram', NEW.atribuido_id, NEW.id,
          jsonb_build_object('total_atribuidos', v_total)
        );
        RETURN NEW;
      END IF;

      -- D3: todos concluíram → tarefa concluída
      IF NEW.status = 'concluida' AND v_concluidas = v_total AND v_tarefa_status = 'em_andamento' THEN
        UPDATE tarefas
           SET status = 'concluida', atualizado_em = now()
         WHERE id = NEW.tarefa_id;

        INSERT INTO tarefas_eventos (tarefa_id, tipo, autor_id, atribuicao_id, payload)
        VALUES (
          NEW.tarefa_id, 'todos_concluiram', NEW.atribuido_id, NEW.id,
          jsonb_build_object('d3', true, 'ultimo_a_concluir', NEW.atribuido_id)
        );
        RETURN NEW;
      END IF;

      RETURN NEW;
    END;
    $body$
  $f$;

  -- ===========================================================================
  -- SEÇÃO 6 — TRIGGERS
  -- ===========================================================================

  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_updated_at            ON tarefas             $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_slas_updated_at       ON tarefas_slas        $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_modelos_updated_at    ON tarefas_modelos     $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_valid_updated_at      ON tarefas_validacoes  $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_check_status          ON tarefas             $sql$;
  EXECUTE $sql$ DROP TRIGGER IF EXISTS trg_tarefas_gate_colaborativo     ON tarefas_atribuicoes $sql$;

  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_updated_at
      BEFORE UPDATE ON tarefas
      FOR EACH ROW EXECUTE FUNCTION tarefas_set_atualizado_em()
  $sql$;
  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_slas_updated_at
      BEFORE UPDATE ON tarefas_slas
      FOR EACH ROW EXECUTE FUNCTION tarefas_set_atualizado_em()
  $sql$;
  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_modelos_updated_at
      BEFORE UPDATE ON tarefas_modelos
      FOR EACH ROW EXECUTE FUNCTION tarefas_set_atualizado_em()
  $sql$;
  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_valid_updated_at
      BEFORE UPDATE ON tarefas_validacoes
      FOR EACH ROW EXECUTE FUNCTION tarefas_set_atualizado_em()
  $sql$;

  -- BEFORE UPDATE OF status: valida transição na máquina de estados.
  -- Disparo restrito à coluna status (OF status) para não bloquear updates
  -- de outros campos (atualizado_em, campos_personalizados, etc.).
  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_check_status
      BEFORE UPDATE OF status ON tarefas
      FOR EACH ROW EXECUTE FUNCTION tarefas_fn_valida_transicao()
  $sql$;

  -- AFTER UPDATE OF status em atribuicoes: avalia gates D2 e D3.
  EXECUTE $sql$
    CREATE TRIGGER trg_tarefas_gate_colaborativo
      AFTER UPDATE OF status ON tarefas_atribuicoes
      FOR EACH ROW EXECUTE FUNCTION tarefas_fn_gate_colaborativo()
  $sql$;

  RAISE NOTICE '  triggers criados.';

  -- ===========================================================================
  -- SEÇÃO 7 — GRANTS
  -- RLS controla linhas; GRANTs de tabela são necessários para authenticated.
  -- tarefas_eventos: apenas SELECT + INSERT (append-only).
  -- ===========================================================================

  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE         ON tarefas_slas            TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE, DELETE ON tarefas_modelos         TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE         ON tarefas                 TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE         ON tarefas_atribuicoes     TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT                 ON tarefas_eventos         TO authenticated $sql$;
  EXECUTE $sql$ REVOKE UPDATE, DELETE                ON tarefas_eventos         FROM authenticated $sql$;
  EXECUTE $sql$ REVOKE UPDATE, DELETE                ON tarefas_eventos         FROM PUBLIC $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE, DELETE ON tarefas_checklist_itens TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT                 ON tarefas_anexos          TO authenticated $sql$;
  EXECUTE $sql$ GRANT SELECT, INSERT, UPDATE         ON tarefas_validacoes      TO authenticated $sql$;

  RAISE NOTICE '  GRANTs configurados; UPDATE/DELETE revogados em tarefas_eventos.';

  -- ===========================================================================
  -- SEÇÃO 8 — RLS
  -- ===========================================================================

  EXECUTE $sql$ ALTER TABLE tarefas_slas            ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_modelos         ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas                 ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_atribuicoes     ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_eventos         ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_checklist_itens ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_anexos          ENABLE ROW LEVEL SECURITY $sql$;
  EXECUTE $sql$ ALTER TABLE tarefas_validacoes      ENABLE ROW LEVEL SECURITY $sql$;

  -- Limpa policies anteriores para idempotência parcial
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_slas: select"          ON tarefas_slas            $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_slas: insert"          ON tarefas_slas            $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_slas: update"          ON tarefas_slas            $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_modelos: select"       ON tarefas_modelos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_modelos: insert"       ON tarefas_modelos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_modelos: update"       ON tarefas_modelos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_modelos: delete"       ON tarefas_modelos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas: select"               ON tarefas                 $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas: insert"               ON tarefas                 $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas: update"               ON tarefas                 $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_atrib: select"         ON tarefas_atribuicoes     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_atrib: insert"         ON tarefas_atribuicoes     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_atrib: update"         ON tarefas_atribuicoes     $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_eventos: select"       ON tarefas_eventos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_eventos: insert"       ON tarefas_eventos         $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_checklist: select"     ON tarefas_checklist_itens $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_checklist: insert"     ON tarefas_checklist_itens $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_checklist: update"     ON tarefas_checklist_itens $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_checklist: delete"     ON tarefas_checklist_itens $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_anexos: select"        ON tarefas_anexos          $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_anexos: insert"        ON tarefas_anexos          $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_valid: select"         ON tarefas_validacoes      $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_valid: insert"         ON tarefas_validacoes      $sql$;
  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_valid: update"         ON tarefas_validacoes      $sql$;

  -- ---- tarefas_slas ----
  -- SELECT: todos na empresa (precisam ver SLAs ativos)
  -- INSERT/UPDATE: apenas admin/manager
  EXECUTE $sql$
    CREATE POLICY "tarefas_slas: select" ON tarefas_slas
      FOR SELECT USING (company_id = auth_company_id())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_slas: insert" ON tarefas_slas
      FOR INSERT WITH CHECK (company_id = auth_company_id() AND tarefas_is_admin())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_slas: update" ON tarefas_slas
      FOR UPDATE USING (company_id = auth_company_id() AND tarefas_is_admin())
  $sql$;

  -- ---- tarefas_modelos ----
  -- SELECT: globais → todos na empresa; pessoal → criador + admin
  EXECUTE $sql$
    CREATE POLICY "tarefas_modelos: select" ON tarefas_modelos
      FOR SELECT USING (
        company_id = auth_company_id()
        AND (
          escopo = 'global'
          OR criado_por = auth.uid()
          OR tarefas_is_admin()
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_modelos: insert" ON tarefas_modelos
      FOR INSERT WITH CHECK (
        company_id = auth_company_id()
        AND criado_por = auth.uid()
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_modelos: update" ON tarefas_modelos
      FOR UPDATE USING (
        company_id = auth_company_id()
        AND (criado_por = auth.uid() OR tarefas_is_admin())
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_modelos: delete" ON tarefas_modelos
      FOR DELETE USING (
        company_id = auth_company_id()
        AND (criado_por = auth.uid() OR tarefas_is_admin())
      )
  $sql$;

  -- ---- tarefas ----
  -- SELECT: admin/manager vê tudo na empresa; demais só onde participam
  -- INSERT: solicitante = auth.uid() (usuário só cria tarefas em seu nome)
  -- UPDATE: participantes + admin; máquina de estados valida transições via trigger
  EXECUTE $sql$
    CREATE POLICY "tarefas: select" ON tarefas
      FOR SELECT USING (
        company_id = auth_company_id()
        AND (tarefas_is_admin() OR tarefas_sou_participante(id))
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas: insert" ON tarefas
      FOR INSERT WITH CHECK (
        company_id = auth_company_id()
        AND solicitante_id = auth.uid()
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas: update" ON tarefas
      FOR UPDATE USING (
        company_id = auth_company_id()
        AND (tarefas_is_admin() OR tarefas_sou_participante(id))
      )
  $sql$;

  -- ---- tarefas_atribuicoes ----
  -- INSERT: solicitante da tarefa ou admin cria atribuições
  -- UPDATE: o próprio atribuído (muda seu status) ou admin
  EXECUTE $sql$
    CREATE POLICY "tarefas_atrib: select" ON tarefas_atribuicoes
      FOR SELECT USING (
        tarefas_is_admin()
        OR tarefas_sou_participante(tarefa_id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_atrib: insert" ON tarefas_atribuicoes
      FOR INSERT WITH CHECK (
        tarefas_is_admin()
        OR EXISTS (
          SELECT 1 FROM tarefas t
          WHERE t.id = tarefa_id
            AND t.company_id = auth_company_id()
            AND t.solicitante_id = auth.uid()
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_atrib: update" ON tarefas_atribuicoes
      FOR UPDATE USING (
        tarefas_is_admin()
        OR atribuido_id = auth.uid()
      )
  $sql$;

  -- ---- tarefas_eventos (append-only) ----
  -- Sem policies de UPDATE/DELETE: REVOKE + default deny do PostgreSQL garantem imutabilidade.
  EXECUTE $sql$
    CREATE POLICY "tarefas_eventos: select" ON tarefas_eventos
      FOR SELECT USING (
        tarefas_is_admin()
        OR tarefas_sou_participante(tarefa_id)
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_eventos: insert" ON tarefas_eventos
      FOR INSERT WITH CHECK (
        autor_id = auth.uid()
        AND (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
      )
  $sql$;

  -- ---- tarefas_checklist_itens ----
  EXECUTE $sql$
    CREATE POLICY "tarefas_checklist: select" ON tarefas_checklist_itens
      FOR SELECT USING (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_checklist: insert" ON tarefas_checklist_itens
      FOR INSERT WITH CHECK (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_checklist: update" ON tarefas_checklist_itens
      FOR UPDATE USING (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_checklist: delete" ON tarefas_checklist_itens
      FOR DELETE USING (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
  $sql$;

  -- ---- tarefas_anexos ----
  EXECUTE $sql$
    CREATE POLICY "tarefas_anexos: select" ON tarefas_anexos
      FOR SELECT USING (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_anexos: insert" ON tarefas_anexos
      FOR INSERT WITH CHECK (
        autor_id = auth.uid()
        AND (tarefas_is_admin() OR tarefas_sou_participante(tarefa_id))
      )
  $sql$;

  -- ---- tarefas_validacoes ----
  -- SELECT: participantes + validador designado + quem fez claim
  -- INSERT: solicitante da tarefa ou admin
  -- UPDATE: validador designado (para preencher parecer/claim D6) ou admin
  EXECUTE $sql$
    CREATE POLICY "tarefas_valid: select" ON tarefas_validacoes
      FOR SELECT USING (
        tarefas_is_admin()
        OR tarefas_sou_participante(tarefa_id)
        OR validador_id = auth.uid()
        OR claimed_by   = auth.uid()
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_valid: insert" ON tarefas_validacoes
      FOR INSERT WITH CHECK (
        tarefas_is_admin()
        OR EXISTS (
          SELECT 1 FROM tarefas t
          WHERE t.id = tarefa_id
            AND t.company_id = auth_company_id()
            AND t.solicitante_id = auth.uid()
        )
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY "tarefas_valid: update" ON tarefas_validacoes
      FOR UPDATE USING (
        tarefas_is_admin()
        OR validador_id = auth.uid()
        OR claimed_by   = auth.uid()
      )
  $sql$;

  RAISE NOTICE 'tarefas_fase1_schema: aplicada com sucesso.';
  RAISE NOTICE '  5 enums | 8 tabelas | 10 índices | 3 helpers | 2 trigger fns | 6 triggers | RLS completo';
  RAISE NOTICE '  tarefas_eventos: append-only (UPDATE/DELETE revogados de authenticated + PUBLIC)';
  RAISE NOTICE '  tarefas_validacoes: campos D6 (claimed_by/claimed_at/claim_timeout) presentes, dormentes até Fase 2';

END $migration$;

-- =============================================================================
-- VERIFICAÇÃO (executar após aplicar):
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'tarefas%' ORDER BY 1;
--   -- Esperado: 8 linhas
--
--   SELECT typname FROM pg_type t
--   JOIN pg_namespace n ON n.oid = t.typnamespace
--   WHERE n.nspname = 'public' AND t.typname LIKE 'tarefas%' ORDER BY 1;
--   -- Esperado: 5 linhas
--
--   SELECT policyname, tablename, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename LIKE 'tarefas%'
--   ORDER BY tablename, policyname;
--   -- Esperado: 20 policies
--
--   SELECT has_table_privilege('authenticated', 'tarefas_eventos', 'UPDATE');
--   -- Deve retornar FALSE (append-only garantido)
--
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname LIKE 'trg_tarefas%' ORDER BY 1;
--   -- Esperado: 6 triggers
-- =============================================================================

INSERT INTO public.schema_migrations (filename)
VALUES ('20260610000000_tarefas_fase1_schema.sql')
ON CONFLICT (filename) DO NOTHING;
