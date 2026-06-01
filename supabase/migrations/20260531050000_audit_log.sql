-- =============================================================================
-- MIGRATION: audit_log
-- Aplica em: todos os bancos de empresa (xpoqiclaqkudznmshzal, fzgasvcfxufhrbrdakow)
-- Objetivo : Trilha de auditoria imutável — append-only por RLS.
--            Nenhum UPDATE ou DELETE é permitido para qualquer role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.audit_log;
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id    uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_id      uuid        REFERENCES public.profiles(id)  ON DELETE SET NULL,
  actor_name    text,
  event         text        NOT NULL,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies só se aplicam a bancos empresa (global_role enum existe).
-- Banco core não tem o enum → pular criação de policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'audit_log: banco core detectado — policies de RLS puladas.';
    RETURN;
  END IF;

  -- Admin da empresa vê apenas os registros da sua empresa
  EXECUTE $sql$ DROP POLICY IF EXISTS "audit_log_company_select" ON public.audit_log $sql$;
  EXECUTE $sql$
    CREATE POLICY "audit_log_company_select"
      ON public.audit_log FOR SELECT
      USING (
        auth_global_role() = ANY (ARRAY['admin'::global_role, 'manager'::global_role])
        AND company_id = auth_company_id()
      )
  $sql$;

  -- Usuários autenticados e ativos podem inserir
  EXECUTE $sql$ DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log $sql$;
  EXECUTE $sql$
    CREATE POLICY "audit_log_insert"
      ON public.audit_log FOR INSERT
      WITH CHECK (auth_is_active())
  $sql$;
END $$;

-- UPDATE e DELETE: nenhuma policy criada → bloqueados para todos os roles
-- (incluindo service_role em contexto de usuário — RLS é FORCE para superadmin,
-- mas service_role bypassa RLS: logging server-side via service key é permitido)

-- Index para filtros comuns no painel de auditoria
CREATE INDEX IF NOT EXISTS audit_log_company_id_idx   ON public.audit_log (company_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx     ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_event_idx        ON public.audit_log (event);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx   ON public.audit_log (created_at DESC);

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT * FROM public.audit_log LIMIT 0;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'audit_log';
-- =============================================================================
