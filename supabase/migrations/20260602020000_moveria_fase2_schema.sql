-- =============================================================================
-- MIGRATION: moveria_fase2_schema
-- Aplica em: banco Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Guards:    global_role ausente → pula (Core)
--            slug 'moveria' ausente → pula (Mowig)
--            numero_base já existe → idempotente
-- Tabela moveria_contratos confirmada VAZIA no remoto em 2026-06-02.
-- Ajustes aplicados:
--   1. Coluna numero NÃO dropada (auditoria futura antes do drop)
--   2. Backfill com parsing do formato XXXXX-N para preservar versao
--   3. Separador de versão '-' na view (bate com formato do PDF)
--   4. Policy UPDATE em company_features para global_role='admin'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRÉ-BLOCO A: ADD VALUE ao enum — bloco separado com guard de existência.
-- Seguro em Core e Mowig: moveria_status_contrato não existe nesses bancos.
-- ---------------------------------------------------------------------------
DO $enum_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'moveria_status_contrato'
  ) THEN
    ALTER TYPE moveria_status_contrato ADD VALUE IF NOT EXISTS 'substituido';
    RAISE NOTICE 'moveria_fase2_schema: ''substituido'' adicionado ao enum moveria_status_contrato.';
  END IF;
END $enum_guard$;


-- ---------------------------------------------------------------------------
-- PRÉ-BLOCO B: UPDATE policy em company_features para global_role='admin'.
-- Permite que o admin da empresa edite config da feature moveria-contratos
-- (ex.: {"data_corte": "2024-01-01"}) sem depender de superadmin.
-- Guard próprio: só cria se ainda não existir.
-- ---------------------------------------------------------------------------
DO $policy_guard$
BEGIN
  -- Guard: auth_company_id() não existe no Core → pula
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_company_id'
  ) THEN
    RAISE NOTICE 'moveria_fase2_schema: auth_company_id ausente — policy company_features_admin_update pulada (Core).';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'company_features'
      AND policyname = 'company_features_admin_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "company_features_admin_update"
        ON public.company_features
        FOR UPDATE TO authenticated
        USING (
          company_id = auth_company_id()
          AND auth_global_role()::text = 'admin'
        )
        WITH CHECK (
          company_id = auth_company_id()
          AND auth_global_role()::text = 'admin'
        )
    $pol$;
    RAISE NOTICE 'moveria_fase2_schema: policy company_features_admin_update criada.';
  ELSE
    RAISE NOTICE 'moveria_fase2_schema: policy company_features_admin_update já existe — pulada.';
  END IF;
END $policy_guard$;


DO $migration$
DECLARE
  v_schema text := 'public';
BEGIN

  -- Guard 1: bancos empresa têm global_role; Core não tem
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = v_schema AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'moveria_fase2_schema: global_role ausente — pulada (Core).';
    RETURN;
  END IF;

  -- Guard 2: apenas banco Moveria
  IF NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'moveria') THEN
    RAISE NOTICE 'moveria_fase2_schema: slug ''moveria'' ausente — pulada (Mowig).';
    RETURN;
  END IF;

  -- Guard 3: idempotência — numero_base já existe → já foi aplicada
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema
      AND table_name   = 'moveria_contratos'
      AND column_name  = 'numero_base'
  ) THEN
    RAISE NOTICE 'moveria_fase2_schema: numero_base já existe — nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'moveria_fase2_schema: iniciando…';

  -- ===========================================================================
  -- SEÇÃO 1 — moveria_clientes: endereço decomposto em 5 colunas
  -- Coluna endereco (texto livre) mantida por retrocompatibilidade.
  -- ===========================================================================
  EXECUTE $sql$
    ALTER TABLE moveria_clientes
      ADD COLUMN IF NOT EXISTS endereco_rua    text,
      ADD COLUMN IF NOT EXISTS endereco_bairro text,
      ADD COLUMN IF NOT EXISTS endereco_cidade text,
      ADD COLUMN IF NOT EXISTS endereco_uf     text,
      ADD COLUMN IF NOT EXISTS endereco_cep    text
  $sql$;
  RAISE NOTICE '  moveria_clientes: 5 colunas de endereço decomposto adicionadas.';

  -- ===========================================================================
  -- SEÇÃO 2 — moveria_contratos: numero versionado + novos campos
  -- ===========================================================================

  -- 2.1 Novas colunas
  EXECUTE $sql$
    ALTER TABLE moveria_contratos
      ADD COLUMN IF NOT EXISTS numero_base           text,
      ADD COLUMN IF NOT EXISTS versao                integer     NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS data_contrato         date,
      ADD COLUMN IF NOT EXISTS valor_total_declarado numeric(12,2),
      ADD COLUMN IF NOT EXISTS substitui_contrato_id uuid        REFERENCES moveria_contratos(id),
      ADD COLUMN IF NOT EXISTS entrega_rua           text,
      ADD COLUMN IF NOT EXISTS entrega_bairro        text,
      ADD COLUMN IF NOT EXISTS entrega_cidade        text,
      ADD COLUMN IF NOT EXISTS entrega_uf            text,
      ADD COLUMN IF NOT EXISTS entrega_cep           text,
      ADD COLUMN IF NOT EXISTS entrega_igual_atual   boolean     NOT NULL DEFAULT true
  $sql$;

  -- 2.2 Backfill: numero_base e versao a partir de numero.
  --   Formato sem versão (ex.: "100000672" ou "MOV-2026-0001"):
  --     → numero_base = numero, versao = 1
  --   Formato com versão (ex.: "100000672-2", terminando em -N, N entre 2 e 99):
  --     → numero_base = tudo antes do último hífen, versao = N
  --   Tabela confirmada VAZIA em 2026-06-02: backfill é inócuo mas
  --   mantido para segurança em futuros ambientes com dados de teste.
  EXECUTE $sql$
    UPDATE moveria_contratos
    SET
      numero_base = CASE
        WHEN numero ~ '^(.+)-([2-9]|[1-9][0-9])$'
        THEN (regexp_match(numero, '^(.+)-(\d+)$'))[1]
        ELSE numero
      END,
      versao = CASE
        WHEN numero ~ '^(.+)-([2-9]|[1-9][0-9])$'
        THEN (regexp_match(numero, '^(.+)-(\d+)$'))[2]::integer
        ELSE 1
      END
    WHERE numero_base IS NULL
  $sql$;

  -- 2.3 NOT NULL em numero_base (seguro após backfill)
  EXECUTE $sql$
    ALTER TABLE moveria_contratos ALTER COLUMN numero_base SET NOT NULL
  $sql$;

  -- 2.4 Drop constraint UNIQUE antiga em numero sozinho
  EXECUTE $sql$
    ALTER TABLE moveria_contratos
      DROP CONSTRAINT IF EXISTS moveria_contratos_numero_key
  $sql$;

  -- 2.5 Novo UNIQUE no par (numero_base, versao)
  EXECUTE $sql$
    ALTER TABLE moveria_contratos
      DROP CONSTRAINT IF EXISTS moveria_contratos_numero_base_versao_key
  $sql$;
  EXECUTE $sql$
    ALTER TABLE moveria_contratos
      ADD CONSTRAINT moveria_contratos_numero_base_versao_key
      UNIQUE (numero_base, versao)
  $sql$;

  -- NOTA AJUSTE 1: coluna numero mantida como backup redundante.
  -- Não dropada nesta fase — auditoria de Edge Functions e queries diretas
  -- antes do DROP em migration futura.

  RAISE NOTICE '  moveria_contratos: numero_base+versao, constraint atualizado, colunas novas adicionadas.';

  -- ===========================================================================
  -- SEÇÃO 3 — GRANTS atualizados
  -- ===========================================================================

  -- moveria_clientes: reemitir GRANT SELECT com colunas novas de endereço.
  -- cpf_hash e cnpj_hash permanecem bloqueados (apenas via view mascarada).
  EXECUTE $sql$ REVOKE SELECT ON moveria_clientes FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT SELECT (
      id, profile_id, nome_completo, cpf_mascarado,
      telefone, email, endereco,
      endereco_rua, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
      criado_em
    ) ON moveria_clientes TO authenticated
  $sql$;

  -- moveria_contratos: reemitir SELECT sem expor numero (legacy) nem desconto_pct.
  -- Authenticated acessa numero via view (formato computado numero_base[-versao]).
  EXECUTE $sql$ REVOKE SELECT ON moveria_contratos FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT SELECT (
      id, numero_base, versao, cliente_id, vendedor_id, status,
      data_contrato, valor_total_declarado, substitui_contrato_id,
      drive_folder_id, storage_prefix, observacoes,
      entrega_rua, entrega_bairro, entrega_cidade, entrega_uf, entrega_cep,
      entrega_igual_atual, criado_em, atualizado_em, deletado_em
    ) ON moveria_contratos TO authenticated
  $sql$;

  -- UPDATE: admin via RLS; numero_base e versao imutáveis (não no GRANT).
  EXECUTE $sql$ REVOKE UPDATE ON moveria_contratos FROM authenticated $sql$;
  EXECUTE $sql$
    GRANT UPDATE (
      status, observacoes, drive_folder_id, storage_prefix,
      data_contrato, valor_total_declarado, substitui_contrato_id,
      entrega_rua, entrega_bairro, entrega_cidade, entrega_uf, entrega_cep,
      entrega_igual_atual, deletado_em, atualizado_em
    ) ON moveria_contratos TO authenticated
  $sql$;

  RAISE NOTICE '  GRANTs atualizados.';

  -- ===========================================================================
  -- SEÇÃO 4 — Recriar views com novos campos
  -- ===========================================================================

  -- 4.1 moveria_clientes_v — inclui endereços decompostos
  -- DROP necessário: CREATE OR REPLACE VIEW não permite inserir colunas no meio da lista.
  EXECUTE $sql$ DROP VIEW IF EXISTS moveria_clientes_v $sql$;
  EXECUTE $view$
    CREATE VIEW moveria_clientes_v AS
    SELECT
      c.id,
      c.profile_id,
      c.nome_completo,
      CASE
        WHEN auth_is_moveria_admin()
          OR auth_moveria_papel()::text = 'consultor_tecnico'
        THEN c.cpf_hash ELSE NULL
      END AS cpf_hash,
      c.cpf_mascarado,
      CASE
        WHEN auth_is_moveria_admin()
          OR auth_moveria_papel()::text = 'consultor_tecnico'
        THEN c.cnpj_hash ELSE NULL
      END AS cnpj_hash,
      c.telefone,
      c.email,
      c.endereco,
      c.endereco_rua,
      c.endereco_bairro,
      c.endereco_cidade,
      c.endereco_uf,
      c.endereco_cep,
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

  -- 4.2 moveria_contratos_v
  --   numero display: "100000672" (versao=1) | "100000672-2" (versao>=2)
  --   Separador '-' conforme formato dos PDFs (ajuste 3).
  --   Coluna legacy numero NÃO exposta — view é a interface canônica.
  -- DROP necessário: a coluna numero mudou de c.numero para expressão computada.
  EXECUTE $sql$ DROP VIEW IF EXISTS moveria_contratos_v $sql$;
  EXECUTE $view$
    CREATE VIEW moveria_contratos_v AS
    SELECT
      c.id,
      c.numero_base
        || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END
        AS numero,
      c.numero_base,
      c.versao,
      c.cliente_id,
      c.vendedor_id,
      c.status,
      c.data_contrato,
      c.valor_total_declarado,
      c.substitui_contrato_id,
      CASE
        WHEN auth_moveria_papel()::text = 'vendedor' THEN NULL::numeric
        ELSE c.desconto_pct
      END AS desconto_pct,
      c.drive_folder_id,
      c.storage_prefix,
      c.observacoes,
      c.entrega_rua,
      c.entrega_bairro,
      c.entrega_cidade,
      c.entrega_uf,
      c.entrega_cep,
      c.entrega_igual_atual,
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

  RAISE NOTICE '  views moveria_clientes_v e moveria_contratos_v recriadas.';
  RAISE NOTICE 'moveria_fase2_schema: concluído com sucesso.';

END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260602020000_moveria_fase2_schema.sql')
ON CONFLICT (filename) DO NOTHING;
