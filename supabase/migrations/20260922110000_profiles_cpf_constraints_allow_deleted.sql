-- =============================================================================
-- Migration: profiles_cpf_constraints_allow_deleted
-- Bancos: onde as constraints já existirem (Mowig, Moveria). Core não possui
-- cpf_required_for_cpf_auth/recovery_email_required_for_cpf — guard não cria
-- constraint nova lá, só ajusta as que já existem.
--
-- delete-user agora limpa cpf_hash e recovery_email na anonimização total do
-- perfil (LGPD), mas as CHECK constraints originais exigiam ambos sempre que
-- auth_type = 'cpf', o que bloquearia a limpeza. Adiciona a via de escape
-- "OR deleted_at IS NOT NULL": perfis excluídos podem ficar com esses campos
-- nulos; perfis ativos continuam exigindo os dois normalmente.
--
-- Aproveita para unificar a condição em "auth_type <> 'cpf'" (a forma usada em
-- Moveria), em vez de "auth_type = 'google'" (a forma original em Mowig), que
-- ficaria incorreta caso surja um terceiro auth_type além de google/cpf.
-- =============================================================================

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'cpf_required_for_cpf_auth'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT cpf_required_for_cpf_auth;
    ALTER TABLE public.profiles ADD CONSTRAINT cpf_required_for_cpf_auth
      CHECK (auth_type <> 'cpf' OR cpf_hash IS NOT NULL OR deleted_at IS NOT NULL);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'recovery_email_required_for_cpf'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT recovery_email_required_for_cpf;
    ALTER TABLE public.profiles ADD CONSTRAINT recovery_email_required_for_cpf
      CHECK (auth_type <> 'cpf' OR recovery_email IS NOT NULL OR deleted_at IS NOT NULL);
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922110000_profiles_cpf_constraints_allow_deleted.sql')
ON CONFLICT (filename) DO NOTHING;
