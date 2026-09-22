-- =============================================================================
-- Migration: profiles_anonymized_at
-- Bancos: onde public.profiles existir (Mowig, Moveria; Core sem as
-- constraints/funções de CPF — guards tornam essas partes no-op lá).
--
-- Até aqui, deleted_at fazia dois papéis diferentes:
--   1. Inativação reversível (UserActionsMenu.inactivate(), OffboardingModal)
--   2. Exclusão/autoexclusão irreversível (delete-user, data-rights)
-- Isso já causava confusão (ex.: admin-reactivate-user tinha que adivinhar
-- qual dos dois casos era, checando o full_name). Esta migration separa os
-- dois conceitos:
--   - deleted_at / deactivated_at: inativação reversível.
--   - anonymized_at: exclusão irreversível (dados pessoais já apagados).
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN

    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

    -- Backfill: perfis já anonimizados por delete-user/data-rights
    -- (identificados pelo placeholder de nome ou pelo e-mail anonimizado em
    -- auth.users) ganham anonymized_at e perdem o deleted_at (que volta a
    -- significar só "inativação reversível").
    UPDATE public.profiles p
    SET anonymized_at = COALESCE(p.deleted_at, p.deactivated_at, now())
    WHERE p.anonymized_at IS NULL
      AND (
        p.full_name IN ('Usuário excluído', 'Usuário removido')
        OR EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = p.id AND u.email LIKE 'deleted-%@invalid.local'
        )
      );

    -- Constraints de CPF/recovery_email passam a liberar nulo apenas para
    -- perfis anonimizados (não mais para qualquer inativação reversível).
    -- Precisa rodar ANTES de zerar deleted_at abaixo: enquanto a constraint
    -- antiga (escape hatch = deleted_at) ainda estiver de pé, zerar
    -- deleted_at de um perfil já anonimizado (cpf_hash/recovery_email nulos)
    -- viola a constraint antiga.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.profiles'::regclass AND conname = 'cpf_required_for_cpf_auth'
    ) THEN
      ALTER TABLE public.profiles DROP CONSTRAINT cpf_required_for_cpf_auth;
      ALTER TABLE public.profiles ADD CONSTRAINT cpf_required_for_cpf_auth
        CHECK (auth_type <> 'cpf' OR cpf_hash IS NOT NULL OR anonymized_at IS NOT NULL);
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.profiles'::regclass AND conname = 'recovery_email_required_for_cpf'
    ) THEN
      ALTER TABLE public.profiles DROP CONSTRAINT recovery_email_required_for_cpf;
      ALTER TABLE public.profiles ADD CONSTRAINT recovery_email_required_for_cpf
        CHECK (auth_type <> 'cpf' OR recovery_email IS NOT NULL OR anonymized_at IS NOT NULL);
    END IF;

    UPDATE public.profiles
    SET deleted_at = NULL
    WHERE anonymized_at IS NOT NULL AND deleted_at IS NOT NULL;

  END IF;

  -- auth_is_active(): também bloqueia login de perfis anonimizados.
  IF to_regproc('public.auth_is_active') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.auth_is_active()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $fn$
      SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND active = true
          AND deleted_at IS NULL
          AND deactivated_at IS NULL
          AND anonymized_at IS NULL
      );
    $fn$;
  END IF;

  -- find_profile_by_cpf(): agora exclui só anonymized_at, não mais deleted_at
  -- — perfis inativados (deleted_at/deactivated_at preenchidos, mas não
  -- anonimizados) voltam a ser encontrados pelo fluxo de recuperação de
  -- senha por CPF (antes eram bloqueados incorretamente).
  IF to_regproc('public.find_profile_by_cpf') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.find_profile_by_cpf(cpf_digits text)
    RETURNS TABLE(full_name text, recovery_email text, company_id uuid)
    LANGUAGE sql SECURITY DEFINER
    AS $fn$
      -- Sem exigir active=true: perfis inativados (active=false, mas não
      -- anonimizados) também devem ser encontrados, para permitir recuperar
      -- a senha como parte de um fluxo de reativação pelo admin.
      SELECT full_name, recovery_email, company_id
      FROM profiles
      WHERE auth_type = 'cpf'
        AND anonymized_at IS NULL
        AND cpf_hash = crypt(cpf_digits, cpf_hash)
      LIMIT 1;
    $fn$;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922130000_profiles_anonymized_at.sql')
ON CONFLICT (filename) DO NOTHING;
