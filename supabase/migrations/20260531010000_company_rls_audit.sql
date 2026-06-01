-- =============================================================================
-- MIGRATION: company_rls_audit
-- Projeto  : hubm-mowig (xpoqiclaqkudznmshzal) — aplica a todos os bancos de empresa
-- Objetivo : Corrigir 5 policies que faltavam escopo de company_id,
--            garantindo isolamento multi-tenant.
--
-- Problemas corrigidos:
--   1. admin_manager_can_read_all_folders — leitura cross-company sem filtro
--   2. folders: manager do setor e admin gerenciam — admin sem company scope
--   3. profiles: admin insere novos usuários — insert em qualquer company
--   4. profiles: atualizar o próprio perfil — admin sem company scope
--   5. resources: manager e admin gerenciam — admin sem company scope
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP POLICY IF EXISTS "admin_manager_can_read_all_folders"      ON public.folders;
-- DROP POLICY IF EXISTS "folders: manager do setor e admin gerenciam" ON public.folders;
-- DROP POLICY IF EXISTS "profiles: admin insere novos usuários"   ON public.profiles;
-- DROP POLICY IF EXISTS "profiles: atualizar o próprio perfil"    ON public.profiles;
-- DROP POLICY IF EXISTS "resources: manager e admin gerenciam"    ON public.resources;
-- -----------------------------------------------------------------------------

-- Guard: migration exclusiva de bancos empresa (mowig/moveria).
-- Banco core não tem global_role enum, folders nem resources → pular tudo.
DO $$
BEGIN
  -- Se não existe o enum global_role, estamos no banco core → skip completo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'company_rls_audit: banco core detectado (sem global_role enum) — migration pulada.';
    RETURN;
  END IF;

  -- ==========================================================================
  -- 1. folders — admin_manager_can_read_all_folders
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='folders') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "admin_manager_can_read_all_folders" ON public.folders $sql$;
    EXECUTE $sql$
      CREATE POLICY "admin_manager_can_read_all_folders"
        ON public.folders FOR SELECT
        USING (
          auth_global_role() = ANY (ARRAY['admin'::global_role, 'manager'::global_role])
          AND EXISTS (
            SELECT 1 FROM sectors s
            WHERE s.id = folders.sector_id
              AND s.company_id = auth_company_id()
          )
        )
    $sql$;

    -- ========================================================================
    -- 2. folders — manager do setor e admin gerenciam
    -- ========================================================================
    EXECUTE $sql$ DROP POLICY IF EXISTS "folders: manager do setor e admin gerenciam" ON public.folders $sql$;
    EXECUTE $sql$
      CREATE POLICY "folders: manager do setor e admin gerenciam"
        ON public.folders FOR ALL
        USING (
          (
            auth_global_role() = 'admin'::global_role
            AND EXISTS (
              SELECT 1 FROM sectors s
              WHERE s.id = folders.sector_id
                AND s.company_id = auth_company_id()
            )
          )
          OR EXISTS (
            SELECT 1 FROM sector_members sm
            WHERE sm.profile_id = auth.uid()
              AND sm.sector_id = folders.sector_id
              AND sm.role = 'manager'::sector_role
          )
        )
        WITH CHECK (
          (
            auth_global_role() = 'admin'::global_role
            AND EXISTS (
              SELECT 1 FROM sectors s
              WHERE s.id = folders.sector_id
                AND s.company_id = auth_company_id()
            )
          )
          OR EXISTS (
            SELECT 1 FROM sector_members sm
            WHERE sm.profile_id = auth.uid()
              AND sm.sector_id = folders.sector_id
              AND sm.role = 'manager'::sector_role
          )
        )
    $sql$;
  END IF;

  -- ==========================================================================
  -- 3. profiles — admin insere novos usuários
  -- ==========================================================================
  EXECUTE $sql$ DROP POLICY IF EXISTS "profiles: admin insere novos usuários" ON public.profiles $sql$;
  EXECUTE $sql$
    CREATE POLICY "profiles: admin insere novos usuários"
      ON public.profiles FOR INSERT
      WITH CHECK (
        auth_global_role() = 'admin'::global_role
        AND company_id = auth_company_id()
      )
  $sql$;

  -- ==========================================================================
  -- 4. profiles — atualizar o próprio perfil
  -- ==========================================================================
  EXECUTE $sql$ DROP POLICY IF EXISTS "profiles: atualizar o próprio perfil" ON public.profiles $sql$;
  EXECUTE $sql$
    CREATE POLICY "profiles: atualizar o próprio perfil"
      ON public.profiles FOR UPDATE
      USING (
        id = auth.uid()
        OR (auth_global_role() = 'admin'::global_role AND company_id = auth_company_id())
      )
      WITH CHECK (
        id = auth.uid()
        OR (auth_global_role() = 'admin'::global_role AND company_id = auth_company_id())
      )
  $sql$;

  -- ==========================================================================
  -- 5. resources — manager e admin gerenciam
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='resources') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "resources: manager e admin gerenciam" ON public.resources $sql$;
    EXECUTE $sql$
      CREATE POLICY "resources: manager e admin gerenciam"
        ON public.resources FOR ALL
        USING (
          (
            auth_global_role() = 'admin'::global_role
            AND EXISTS (
              SELECT 1 FROM sectors s
              WHERE s.id = resources.sector_id
                AND s.company_id = auth_company_id()
            )
          )
          OR EXISTS (
            SELECT 1 FROM folders f
            JOIN sector_members sm ON sm.sector_id = f.sector_id
            WHERE f.id = resources.folder_id
              AND sm.profile_id = auth.uid()
              AND sm.role = 'manager'::sector_role
          )
        )
        WITH CHECK (
          (
            auth_global_role() = 'admin'::global_role
            AND EXISTS (
              SELECT 1 FROM sectors s
              WHERE s.id = resources.sector_id
                AND s.company_id = auth_company_id()
            )
          )
          OR EXISTS (
            SELECT 1 FROM folders f
            JOIN sector_members sm ON sm.sector_id = f.sector_id
            WHERE f.id = resources.folder_id
              AND sm.profile_id = auth.uid()
              AND sm.role = 'manager'::sector_role
          )
        )
    $sql$;
  END IF;

END $$;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT policyname, tablename, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('folders', 'profiles', 'resources', 'resource_permissions')
-- ORDER BY tablename, policyname;
-- =============================================================================
