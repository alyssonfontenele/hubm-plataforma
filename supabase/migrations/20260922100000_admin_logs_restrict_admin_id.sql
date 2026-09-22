-- =============================================================================
-- Migration: admin_logs_restrict_admin_id
-- Bancos: Mowig + Moveria (Core não possui admin_logs — guard torna no-op lá).
--
-- admin_logs.admin_id era ON DELETE SET NULL, mas o trigger que torna os logs
-- imutáveis (prevent_log_modification) só sabe fazer bypass desse SET NULL
-- automático para access_logs.profile_id, não para admin_logs.admin_id — uma
-- linha em admin_logs referenciando um profile que fosse fisicamente deletado
-- quebrava com "record \"old\" has no field \"profile_id\"".
--
-- Agora que a exclusão de usuário nunca mais apaga a linha de profiles (apenas
-- anonimiza + bane no Auth — ver supabase/functions/delete-user), esse cascade
-- nunca deveria disparar. Trocamos para ON DELETE RESTRICT para tornar essa
-- invariante explícita: qualquer tentativa de apagar fisicamente um profile
-- referenciado em admin_logs falha com um erro de FK limpo, em vez de um
-- SET NULL silencioso (e potencialmente quebrado). O trigger de imutabilidade
-- não é alterado por esta migration.
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.admin_logs') IS NOT NULL THEN
    ALTER TABLE public.admin_logs DROP CONSTRAINT IF EXISTS admin_logs_admin_id_fkey;
    ALTER TABLE public.admin_logs ADD CONSTRAINT admin_logs_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922100000_admin_logs_restrict_admin_id.sql')
ON CONFLICT (filename) DO NOTHING;
