-- =============================================================================
-- MIGRATION: tarefas_c3_escrita
-- Aplica em: bancos Mowig + Moveria (Core: sem global_role → guard no-op)
-- Objetivo : C.3 — Primeira escrita: responsavel_id, CHECK modo/responsável,
--            tarefas_papel_liberado(), RLS INSERT robusto (cross-tenant + papel).
--
-- Conteúdo:
--   • ALTER TABLE tarefas ADD COLUMN responsavel_id uuid NULL REFERENCES profiles(id)
--   • CHECK (modo='unica'/'paralelo' → responsavel_id NOT NULL;
--            modo='colaborativo'     → responsavel_id NULL)  — NOT VALID + VALIDATE
--   • FUNCTION tarefas_papel_liberado() SECURITY DEFINER
--     verifica company_features.config->'papeis_liberados' para o papel atual
--   • FUNCTION tarefas_sou_participante() atualizada (inclui responsavel_id)
--   • POLICY "tarefas: insert" reescrita (papel + cross-tenant no responsavel)
--   • POLICY "tarefas_atrib: insert" reescrita (cross-tenant no atribuído)
--   • GRANT INSERT explícito (lição FIX 2)
-- =============================================================================

DO $migration$
BEGIN

  -- Guard: Core não tem enum global_role → pula silenciosamente.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'tarefas_c3_escrita: global_role ausente — pulada (banco core).';
    RETURN;
  END IF;

  -- Idempotência: coluna responsavel_id já existe → migração já foi aplicada.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tarefas'
      AND column_name  = 'responsavel_id'
  ) THEN
    RAISE NOTICE 'tarefas_c3_escrita: responsavel_id já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'tarefas_c3_escrita: iniciando…';

  -- ===========================================================================
  -- SEÇÃO 1 — COLUNA responsavel_id
  -- NULL: modo colaborativo não tem responsável único; NOT NULL: modo unica/paralelo.
  -- FK → profiles: garante integridade referencial.
  -- ===========================================================================

  EXECUTE $sql$
    ALTER TABLE tarefas
      ADD COLUMN responsavel_id uuid NULL REFERENCES profiles(id)
  $sql$;

  RAISE NOTICE '  coluna responsavel_id adicionada.';

  -- ===========================================================================
  -- SEÇÃO 2 — CHECK de coerência modo × responsavel_id
  --
  --   unica/paralelo : responsavel_id NOT NULL (responsável identificado)
  --   colaborativo   : responsavel_id NULL     (responsabilidade nos atribuídos)
  --   outros modos   : sem restrição (extensibilidade futura)
  --
  -- NOT VALID: seguro para tabelas com dados existentes — valida apenas linhas
  --            novas no momento do ALTER, evita full-table scan bloqueante.
  -- VALIDATE  : aplica a verificação a dados pré-existentes (no-op se vazio).
  -- ===========================================================================

  EXECUTE $sql$
    ALTER TABLE tarefas
      ADD CONSTRAINT tarefas_responsavel_modo_ck
        CHECK (
          (modo IN ('unica', 'paralelo') AND responsavel_id IS NOT NULL)
          OR (modo = 'colaborativo' AND responsavel_id IS NULL)
          OR modo NOT IN ('unica', 'paralelo', 'colaborativo')
        )
        NOT VALID
  $sql$;

  EXECUTE $sql$
    ALTER TABLE tarefas VALIDATE CONSTRAINT tarefas_responsavel_modo_ck
  $sql$;

  RAISE NOTICE '  CHECK tarefas_responsavel_modo_ck criada e validada.';

  -- ===========================================================================
  -- SEÇÃO 3 — FUNÇÃO tarefas_papel_liberado() (SECURITY DEFINER)
  --
  --   Consulta company_features.config->'papeis_liberados' para verificar se
  --   o papel do usuário atual está liberado para o módulo Tarefas.
  --   SECURITY DEFINER: necessário para evitar recursão em RLS (company_features
  --   pode ter RLS própria que bloquearia a consulta dentro de uma policy).
  -- ===========================================================================

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_papel_liberado()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT COALESCE(
        EXISTS (
          SELECT 1 FROM company_features
          WHERE company_id   = auth_company_id()
            AND feature_slug = 'tarefas'
            AND enabled      = true
            AND config->'papeis_liberados' ? (auth_global_role()::text)
        ),
        false
      );
    $body$
  $f$;

  RAISE NOTICE '  função tarefas_papel_liberado() criada.';

  -- ===========================================================================
  -- SEÇÃO 4 — ATUALIZAR tarefas_sou_participante()
  --
  --   Adiciona verificação de responsavel_id ao critério de participação,
  --   para que o responsável de modo=unica passe nas policies de SELECT/UPDATE
  --   e nos checks de RLS de tarefas_eventos.
  -- ===========================================================================

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION tarefas_sou_participante(p_tarefa_id uuid)
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM tarefas t
        WHERE t.id         = p_tarefa_id
          AND t.company_id = auth_company_id()
          AND (
            t.solicitante_id   = auth.uid()
            OR t.responsavel_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM tarefas_atribuicoes ta
              WHERE ta.tarefa_id   = t.id
                AND ta.atribuido_id = auth.uid()
            )
          )
      );
    $body$
  $f$;

  RAISE NOTICE '  tarefas_sou_participante() atualizada (inclui responsavel_id).';

  -- ===========================================================================
  -- SEÇÃO 5 — POLICY "tarefas: insert" (reescrita)
  --
  --   Adiciona em relação à Fase 1:
  --     • tarefas_papel_liberado(): papel do criador deve estar em papeis_liberados
  --     • responsavel cross-tenant: responsavel_id (quando informado) deve ser
  --       de profile ativo da mesma empresa (bloqueia IDOR/cross-tenant)
  -- ===========================================================================

  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas: insert" ON tarefas $sql$;

  EXECUTE $sql$
    CREATE POLICY "tarefas: insert" ON tarefas
      FOR INSERT WITH CHECK (
        company_id       = auth_company_id()
        AND solicitante_id = auth.uid()
        AND tarefas_papel_liberado()
        AND (
          responsavel_id IS NULL
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id         = responsavel_id
              AND p.company_id = auth_company_id()
              AND p.active     = true
              AND p.deleted_at IS NULL
          )
        )
      )
  $sql$;

  RAISE NOTICE '  policy "tarefas: insert" reescrita (papel + cross-tenant responsavel).';

  -- ===========================================================================
  -- SEÇÃO 6 — POLICY "tarefas_atrib: insert" (reescrita)
  --
  --   Adiciona em relação à Fase 1:
  --     • atribuido cross-tenant: atribuido_id deve pertencer à mesma empresa
  --       e estar ativo — bloqueia inserção de usuários de outros tenants.
  -- ===========================================================================

  EXECUTE $sql$ DROP POLICY IF EXISTS "tarefas_atrib: insert" ON tarefas_atribuicoes $sql$;

  EXECUTE $sql$
    CREATE POLICY "tarefas_atrib: insert" ON tarefas_atribuicoes
      FOR INSERT WITH CHECK (
        (
          tarefas_is_admin()
          OR EXISTS (
            SELECT 1 FROM tarefas t
            WHERE t.id             = tarefa_id
              AND t.company_id     = auth_company_id()
              AND t.solicitante_id = auth.uid()
          )
        )
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id         = atribuido_id
            AND p.company_id = auth_company_id()
            AND p.active     = true
            AND p.deleted_at IS NULL
        )
      )
  $sql$;

  RAISE NOTICE '  policy "tarefas_atrib: insert" reescrita (cross-tenant atribuído).';

  -- ===========================================================================
  -- SEÇÃO 7 — GRANTs explícitos (lição FIX 2: sempre declarar; GRANT é idempotente)
  -- ===========================================================================

  EXECUTE $sql$ GRANT INSERT ON tarefas             TO authenticated $sql$;
  EXECUTE $sql$ GRANT INSERT ON tarefas_atribuicoes TO authenticated $sql$;
  EXECUTE $sql$ GRANT INSERT ON tarefas_eventos     TO authenticated $sql$;
  EXECUTE $sql$ GRANT UPDATE ON tarefas             TO authenticated $sql$;

  RAISE NOTICE '  GRANTs INSERT/UPDATE confirmados.';

  RAISE NOTICE 'tarefas_c3_escrita: concluída com sucesso.';
  RAISE NOTICE '  responsavel_id | CHECK modo/responsavel | tarefas_papel_liberado()';
  RAISE NOTICE '  tarefas_sou_participante() atualizada | RLS INSERT reforçado';

  INSERT INTO public.schema_migrations (filename)
  VALUES ('20260611000001_tarefas_c3_escrita.sql')
  ON CONFLICT (filename) DO NOTHING;

END $migration$;

-- =============================================================================
-- VERIFICAÇÃO (executar após aplicar):
--
--   -- Coluna adicionada
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'tarefas'
--     AND column_name = 'responsavel_id';
--   -- Esperado: 1 linha, is_nullable = YES
--
--   -- Constraint presente
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'tarefas'::regclass AND contype = 'c';
--   -- Deve incluir tarefas_responsavel_modo_ck
--
--   -- Funções atualizadas
--   SELECT proname FROM pg_proc WHERE proname IN (
--     'tarefas_papel_liberado', 'tarefas_sou_participante'
--   );
--   -- Esperado: 2 linhas
--
--   -- Policies reescritas
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('tarefas','tarefas_atribuicoes')
--     AND cmd = 'INSERT';
--   -- Esperado: 2 linhas (tarefas: insert, tarefas_atrib: insert)
-- =============================================================================
