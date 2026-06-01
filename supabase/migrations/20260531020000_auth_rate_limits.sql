-- =============================================================================
-- MIGRATION: auth_rate_limits
-- Aplica em: todos os bancos de empresa (hubm-mowig, hubm-moveria, etc.)
-- Objetivo : Rastrear tentativas de recuperação de senha por CPF para
--            implementar lockout de 15 minutos após 5 tentativas.
--
-- cpf_hash = SHA-256 do cpfDigits (não armazena o CPF em texto plano).
-- Apenas service_role (Edge Functions) tem acesso à tabela via RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP POLICY IF EXISTS "auth_rate_limits_service_only" ON public.auth_rate_limits;
-- DROP TABLE IF EXISTS public.auth_rate_limits;
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  cpf_hash        text        NOT NULL,
  attempts        integer     NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz,
  CONSTRAINT auth_rate_limits_pkey        PRIMARY KEY (id),
  CONSTRAINT auth_rate_limits_cpf_hash_key UNIQUE (cpf_hash)
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (Edge Functions com service key) acessa esta tabela.
-- Usuários autenticados não têm acesso.
DROP POLICY IF EXISTS "auth_rate_limits_service_only" ON public.auth_rate_limits;
CREATE POLICY "auth_rate_limits_service_only"
  ON public.auth_rate_limits FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS auth_rate_limits_cpf_hash_idx
  ON public.auth_rate_limits (cpf_hash);

CREATE INDEX IF NOT EXISTS auth_rate_limits_locked_until_idx
  ON public.auth_rate_limits (locked_until)
  WHERE locked_until IS NOT NULL;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'auth_rate_limits'
-- ORDER BY ordinal_position;
-- =============================================================================
