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
--
-- CREATE POLICY "admin_manager_can_read_all_folders" ON public.folders FOR SELECT
--   USING (auth_global_role() = ANY (ARRAY['admin'::global_role, 'manager'::global_role]));
--
-- CREATE POLICY "folders: manager do setor e admin gerenciam" ON public.folders FOR ALL
--   USING ((auth_global_role() = 'admin'::global_role) OR (EXISTS (
--     SELECT 1 FROM sector_members sm
--     WHERE sm.profile_id = auth.uid() AND sm.sector_id = folders.sector_id AND sm.role = 'manager'::sector_role
--   )));
--
-- CREATE POLICY "profiles: admin insere novos usuários" ON public.profiles FOR INSERT
--   WITH CHECK (auth_global_role() = 'admin'::global_role);
--
-- CREATE POLICY "profiles: atualizar o próprio perfil" ON public.profiles FOR UPDATE
--   USING (id = auth.uid() OR auth_global_role() = 'admin'::global_role);
--
-- CREATE POLICY "resources: manager e admin gerenciam" ON public.resources FOR ALL
--   USING ((auth_global_role() = 'admin'::global_role) OR (EXISTS (
--     SELECT 1 FROM folders f
--     JOIN sector_members sm ON sm.sector_id = f.sector_id
--     WHERE f.id = resources.folder_id AND sm.profile_id = auth.uid() AND sm.role = 'manager'::sector_role
--   )));
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. folders — admin_manager_can_read_all_folders
--    Adiciona escopo de company via JOIN em sectors
-- =============================================================================
DROP POLICY IF EXISTS "admin_manager_can_read_all_folders" ON public.folders;

CREATE POLICY "admin_manager_can_read_all_folders"
  ON public.folders FOR SELECT
  USING (
    auth_global_role() = ANY (ARRAY['admin'::global_role, 'manager'::global_role])
    AND EXISTS (
      SELECT 1 FROM sectors s
      WHERE s.id = folders.sector_id
        AND s.company_id = auth_company_id()
    )
  );

-- =============================================================================
-- 2. folders — manager do setor e admin gerenciam
--    Adiciona company scope para o caso admin + WITH CHECK explícito
-- =============================================================================
DROP POLICY IF EXISTS "folders: manager do setor e admin gerenciam" ON public.folders;

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
  );

-- =============================================================================
-- 3. profiles — admin insere novos usuários
--    Admin só pode inserir perfis na própria empresa
-- =============================================================================
DROP POLICY IF EXISTS "profiles: admin insere novos usuários" ON public.profiles;

CREATE POLICY "profiles: admin insere novos usuários"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth_global_role() = 'admin'::global_role
    AND company_id = auth_company_id()
  );

-- =============================================================================
-- 4. profiles — atualizar o próprio perfil
--    Admin só atualiza perfis da própria empresa + WITH CHECK explícito
-- =============================================================================
DROP POLICY IF EXISTS "profiles: atualizar o próprio perfil" ON public.profiles;

CREATE POLICY "profiles: atualizar o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (auth_global_role() = 'admin'::global_role AND company_id = auth_company_id())
  )
  WITH CHECK (
    id = auth.uid()
    OR (auth_global_role() = 'admin'::global_role AND company_id = auth_company_id())
  );

-- =============================================================================
-- 5. resources — manager e admin gerenciam
--    Admin: escopo via sector_id → company. + WITH CHECK explícito
-- =============================================================================
DROP POLICY IF EXISTS "resources: manager e admin gerenciam" ON public.resources;

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
  );

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT policyname, tablename, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('folders', 'profiles', 'resources', 'resource_permissions')
-- ORDER BY tablename, policyname;
-- =============================================================================
