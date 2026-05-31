-- =============================================================================
-- MIGRATION: offboarding
-- Aplica em: todos os bancos de empresa (xpoqiclaqkudznmshzal, fzgasvcfxufhrbrdakow)
-- Objetivo : Suportar processo de offboarding de colaboradores com revogação
--            imediata de acesso e trilha de auditoria via deactivated_at.
--
-- Distinção intencional entre colunas:
--   active        = false → usuário suspenso/desativado (reversível)
--   deleted_at    → exclusão definitiva (soft delete)
--   deactivated_at → offboarding formal com data/hora de desligamento
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS deactivated_at;
-- DROP INDEX IF EXISTS profiles_deactivated_at_idx;
-- CREATE OR REPLACE FUNCTION public.auth_is_active()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   select exists (
--     select 1 from profiles
--     where id = auth.uid()
--     and active = true
--     and deleted_at is null
--   );
-- $$;
-- -----------------------------------------------------------------------------

-- 1. Nova coluna
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- 2. Index para queries de auditoria e filtros de RLS
CREATE INDEX IF NOT EXISTS profiles_deactivated_at_idx
  ON public.profiles (deactivated_at)
  WHERE deactivated_at IS NOT NULL;

-- 3. Atualizar auth_is_active() para bloquear usuários desligados
CREATE OR REPLACE FUNCTION public.auth_is_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND active = true
      AND deleted_at IS NULL
      AND deactivated_at IS NULL
  );
$$;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
-- ORDER BY ordinal_position;
--
-- SELECT pg_get_functiondef(oid) FROM pg_proc
-- WHERE proname = 'auth_is_active' AND pronamespace = 'public'::regnamespace;
-- =============================================================================
