-- projeto: core
-- =============================================================================
-- MIGRATION: core_profiles_fk_auth_users
-- Aplica em: hubm-plataforma / Core (vtirfoafpmolffzgszhp) APENAS.
--
-- Vive em supabase/core/migrations/ (exclusiva do Core, sem deploy
-- automático — ver README.md desta pasta). supabase/migrations/ agora é
-- exclusiva/compartilhada com o Mowig, que tem integração GitHub ativa na
-- branch `main` (confirmado via `list_branches`); Core e Moveria aplicam
-- manualmente.
--
-- Achado do smoke test pós-ondas A/B (auditoria/2026-10-10-seguranca-hubm.md,
-- seção 3 "Pendências de correção" e seção 7): public.profiles.id não tem
-- foreign key para auth.users.id no Core, divergente de Mowig e Moveria
-- (que têm `profiles_id_fkey ON DELETE CASCADE`). Sem a FK, excluir um
-- auth.users via Admin API não remove o profile correspondente — fica órfão
-- indefinidamente. Contagem de órfãos em 2026-10-10: 0.
--
-- A checagem abaixo aborta a migration (RAISE EXCEPTION, nada é alterado)
-- se houver qualquer orphan no momento em que for de fato aplicada — a FK só
-- pode ser criada com a tabela já consistente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK: ver auditoria/rollback/20261010070000_core_profiles_fk_auth_users_rollback.sql
-- -----------------------------------------------------------------------------

DO $migration$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Abortando core_profiles_fk_auth_users: % profile(s) em public.profiles sem auth.users correspondente. Resolva os órfãos antes de aplicar esta FK.',
      orphan_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_fkey' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20261010070000_core_profiles_fk_auth_users.sql')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO (depois de aplicar):
-- SELECT tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
-- WHERE tc.table_name='profiles' AND tc.constraint_type='FOREIGN KEY'
--   AND tc.constraint_name='profiles_id_fkey';
-- -- esperado: delete_rule = CASCADE
-- =============================================================================
