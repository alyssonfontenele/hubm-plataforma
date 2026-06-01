-- =============================================================================
-- MIGRATION: security_logging
-- Aplica em: todos os bancos de empresa (xpoqiclaqkudznmshzal, fzgasvcfxufhrbrdakow)
-- Objetivo : Adicionar colunas event_type e metadata à tabela admin_logs para
--            suportar logging centralizado de eventos de segurança.
--
-- Coluna event_type: identifica o tipo do evento (login_success, login_failure,
--   lockout_triggered, user_created, user_deleted).
-- Coluna metadata  : payload JSON livre com contexto do evento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- ALTER TABLE public.admin_logs DROP COLUMN IF EXISTS event_type;
-- ALTER TABLE public.admin_logs DROP COLUMN IF EXISTS metadata;
-- -----------------------------------------------------------------------------

-- Guard: banco core não tem admin_logs → pular.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='admin_logs') THEN
    RAISE NOTICE 'security_logging: tabela admin_logs não existe (banco core) — migration pulada.';
    RETURN;
  END IF;

  EXECUTE $sql$ ALTER TABLE public.admin_logs
    ADD COLUMN IF NOT EXISTS event_type text,
    ADD COLUMN IF NOT EXISTS metadata   jsonb $sql$;

  EXECUTE $sql$ CREATE INDEX IF NOT EXISTS admin_logs_event_type_idx
    ON public.admin_logs (event_type)
    WHERE event_type IS NOT NULL $sql$;
END $$;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'admin_logs'
-- ORDER BY ordinal_position;
-- =============================================================================
