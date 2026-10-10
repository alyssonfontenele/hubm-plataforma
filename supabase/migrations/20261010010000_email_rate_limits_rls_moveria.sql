-- =============================================================================
-- MIGRATION: email_rate_limits_rls_moveria
-- Aplica em: hubm-moveria (fzgasvcfxufhrbrdakow) APENAS.
--
-- Achado de auditoria #5 (auditoria/2026-10-10-seguranca-hubm.md):
-- email_rate_limits estava sem RLS habilitada no projeto Moveria — anon
-- conseguia ler todas as linhas (email + sent_at, permitindo enumerar
-- e-mails reais) e inserir/apagar linhas via REST, neutralizando o próprio
-- rate-limit de envio de e-mail.
--
-- Confirmado (advisors + consulta direta a pg_class.relrowsecurity) que no
-- projeto Mowig (xpoqiclaqkudznmshzal) a tabela já tem RLS habilitada sem
-- policies (nega tudo por padrão — sem achado) e que a tabela não existe no
-- banco Core. Só o Moveria precisa deste fix.
--
-- Replica o mesmo padrão já usado em auth_rate_limits
-- (20260531020000_auth_rate_limits.sql): acesso restrito a service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP POLICY IF EXISTS "email_rate_limits_service_only" ON public.email_rate_limits;
-- ALTER TABLE public.email_rate_limits DISABLE ROW LEVEL SECURITY;
-- -----------------------------------------------------------------------------

DO $migration$
BEGIN
  IF to_regclass('public.email_rate_limits') IS NOT NULL THEN
    ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "email_rate_limits_service_only" ON public.email_rate_limits;
    CREATE POLICY "email_rate_limits_service_only"
      ON public.email_rate_limits FOR ALL
      USING      (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010010000_email_rate_limits_rls_moveria.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'email_rate_limits';
-- -- esperado: true
-- =============================================================================
