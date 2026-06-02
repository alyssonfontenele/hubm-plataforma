-- =============================================================================
-- MIGRATION: add_client_role
-- Aplica em: bancos empresa (xpoqiclaqkudznmshzal, fzgasvcfxufhrbrdakow)
-- Objetivo : Implementar a role 'cliente' com isolamento total (defesa em profundidade).
--
-- Camadas implementadas:
--   1. Enum: adiciona 'cliente' ao global_role e 'email' ao auth_type
--   2. Triggers: bloqueio na origem de qualquer vínculo com setor interno
--   3. RLS: cliente lê apenas a própria linha em profiles; nenhum acesso interno
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_profiles_prevent_client_sector_link ON public.profiles;
-- DROP TRIGGER IF EXISTS trg_sector_members_prevent_client ON public.sector_members;
-- DROP TRIGGER IF EXISTS trg_profile_cargos_prevent_client ON public.profile_cargos;
-- DROP FUNCTION IF EXISTS public.prevent_client_sector_link();
-- DROP FUNCTION IF EXISTS public.prevent_client_sector_membership();
-- DROP FUNCTION IF EXISTS public.prevent_client_cargo_link();
-- -- Restaurar policies originais...
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Guard: migration exclusiva de bancos empresa.
  -- Banco core não tem global_role enum → pular tudo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'add_client_role: banco core detectado (sem global_role enum) — migration pulada.';
    RETURN;
  END IF;

  -- ==========================================================================
  -- 1a. Adicionar 'cliente' ao enum global_role
  -- ==========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role' AND e.enumlabel = 'cliente'
  ) THEN
    EXECUTE 'ALTER TYPE public.global_role ADD VALUE ''cliente''';
    RAISE NOTICE 'add_client_role: ''cliente'' adicionado ao enum global_role.';
  END IF;

  -- ==========================================================================
  -- 1b. Adicionar 'email' ao enum auth_type (para clientes com e-mail real)
  -- ==========================================================================
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'auth_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'auth_type' AND e.enumlabel = 'email'
    ) THEN
      EXECUTE 'ALTER TYPE public.auth_type ADD VALUE ''email''';
      RAISE NOTICE 'add_client_role: ''email'' adicionado ao enum auth_type.';
    END IF;
  END IF;

  -- ==========================================================================
  -- 1c. Atualizar constraints para suportar auth_type='email' (sem cpf_hash)
  --     Regra: cpf_hash é obrigatório apenas quando auth_type='cpf'
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE table_schema='public' AND table_name='profiles'
               AND constraint_name='cpf_required_for_cpf_auth') THEN
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT cpf_required_for_cpf_auth';
    EXECUTE $c$
      ALTER TABLE public.profiles ADD CONSTRAINT cpf_required_for_cpf_auth
        CHECK (auth_type::text != 'cpf' OR cpf_hash IS NOT NULL)
    $c$;
    RAISE NOTICE 'add_client_role: constraint cpf_required_for_cpf_auth atualizada.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE table_schema='public' AND table_name='profiles'
               AND constraint_name='recovery_email_required_for_cpf') THEN
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT recovery_email_required_for_cpf';
    EXECUTE $c$
      ALTER TABLE public.profiles ADD CONSTRAINT recovery_email_required_for_cpf
        CHECK (auth_type::text != 'cpf' OR recovery_email IS NOT NULL)
    $c$;
    RAISE NOTICE 'add_client_role: constraint recovery_email_required_for_cpf atualizada.';
  END IF;

  -- ==========================================================================
  -- 2a. Trigger: prevent_client_sector_link
  --     Bloqueia na origem qualquer perfil 'cliente' com vínculo a setor interno.
  --     Dispara em BEFORE INSERT OR UPDATE em profiles.
  -- ==========================================================================
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.prevent_client_sector_link()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public' AS $body$
    BEGIN
      IF NEW.global_role::text = 'cliente' THEN
        IF EXISTS (SELECT 1 FROM sector_members WHERE profile_id = NEW.id) THEN
          RAISE EXCEPTION
            'SEGURANÇA: Perfil % com role cliente não pode ter vínculo com setores internos.',
            NEW.id USING ERRCODE = 'P0001';
        END IF;
        IF EXISTS (SELECT 1 FROM profile_cargos WHERE profile_id = NEW.id) THEN
          RAISE EXCEPTION
            'SEGURANÇA: Perfil % com role cliente não pode ter cargo de setor.',
            NEW.id USING ERRCODE = 'P0001';
        END IF;
        IF EXISTS (SELECT 1 FROM profile_sector_requests WHERE profile_id = NEW.id) THEN
          RAISE EXCEPTION
            'SEGURANÇA: Perfil % com role cliente não pode ter solicitações de acesso a setores.',
            NEW.id USING ERRCODE = 'P0001';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $body$
  $f$;

  EXECUTE $f$ DROP TRIGGER IF EXISTS trg_profiles_prevent_client_sector_link ON public.profiles $f$;
  EXECUTE $f$
    CREATE TRIGGER trg_profiles_prevent_client_sector_link
      BEFORE INSERT OR UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.prevent_client_sector_link()
  $f$;

  -- ==========================================================================
  -- 2b. Trigger: prevent_client_sector_membership
  --     Bloqueia inserção em sector_members quando o perfil é cliente.
  --     Dispara em BEFORE INSERT OR UPDATE em sector_members.
  -- ==========================================================================
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.prevent_client_sector_membership()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public' AS $body$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = NEW.profile_id AND global_role::text = 'cliente'
      ) THEN
        RAISE EXCEPTION
          'SEGURANÇA: Clientes não podem ser associados a setores internos. Operação negada.'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $body$
  $f$;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sector_members') THEN
    EXECUTE $f$ DROP TRIGGER IF EXISTS trg_sector_members_prevent_client ON public.sector_members $f$;
    EXECUTE $f$
      CREATE TRIGGER trg_sector_members_prevent_client
        BEFORE INSERT OR UPDATE ON public.sector_members
        FOR EACH ROW EXECUTE FUNCTION public.prevent_client_sector_membership()
    $f$;
  END IF;

  -- ==========================================================================
  -- 2c. Trigger: prevent_client_cargo_link
  --     Bloqueia inserção em profile_cargos quando o perfil é cliente.
  -- ==========================================================================
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.prevent_client_cargo_link()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public' AS $body$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = NEW.profile_id AND global_role::text = 'cliente'
      ) THEN
        RAISE EXCEPTION
          'SEGURANÇA: Clientes não podem ter cargos de setor. Operação negada.'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $body$
  $f$;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='profile_cargos') THEN
    EXECUTE $f$ DROP TRIGGER IF EXISTS trg_profile_cargos_prevent_client ON public.profile_cargos $f$;
    EXECUTE $f$
      CREATE TRIGGER trg_profile_cargos_prevent_client
        BEFORE INSERT OR UPDATE ON public.profile_cargos
        FOR EACH ROW EXECUTE FUNCTION public.prevent_client_cargo_link()
    $f$;
  END IF;

  -- ==========================================================================
  -- 3. RLS — Políticas restritivas para 'cliente'
  --
  --    Estratégia de defesa em profundidade:
  --    a) Modificar policies de SELECT amplas para excluir clientes explicitamente.
  --    b) Adicionar policy específica que permite cliente ver APENAS o próprio perfil.
  --    c) Clientes não têm acesso a setores, cargos, sector_members, announcements, etc.
  -- ==========================================================================

  -- 3a. profiles — cliente só lê a própria linha
  EXECUTE $sql$ DROP POLICY IF EXISTS "profiles: ver perfis da própria empresa" ON public.profiles $sql$;
  EXECUTE $sql$
    CREATE POLICY "profiles: ver perfis da própria empresa"
      ON public.profiles FOR SELECT TO public
      USING (
        company_id = auth_company_id()
        AND auth_global_role()::text != 'cliente'
      )
  $sql$;

  EXECUTE $sql$ DROP POLICY IF EXISTS "profiles: cliente vê apenas o próprio" ON public.profiles $sql$;
  EXECUTE $sql$
    CREATE POLICY "profiles: cliente vê apenas o próprio"
      ON public.profiles FOR SELECT TO public
      USING (
        id = auth.uid()
        AND auth_global_role()::text = 'cliente'
      )
  $sql$;

  -- 3b. sectors — cliente não acessa nenhum setor
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sectors') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "sectors: ver da própria empresa" ON public.sectors $sql$;
    EXECUTE $sql$
      CREATE POLICY "sectors: ver da própria empresa"
        ON public.sectors FOR SELECT TO public
        USING (
          company_id = auth_company_id()
          AND auth_is_active()
          AND auth_global_role()::text != 'cliente'
        )
    $sql$;
  END IF;

  -- 3c. cargos — cliente não acessa
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cargos') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "cargos: leitura da empresa" ON public.cargos $sql$;
    EXECUTE $sql$
      CREATE POLICY "cargos: leitura da empresa"
        ON public.cargos FOR SELECT TO authenticated
        USING (
          (company_id = auth_company_id() OR auth_company_id() IS NULL)
          AND auth_global_role()::text != 'cliente'
        )
    $sql$;
  END IF;

  -- 3d. announcements — cliente não vê avisos internos
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='announcements') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "announcements: ver da empresa, ativos e não expirados" ON public.announcements $sql$;
    EXECUTE $sql$
      CREATE POLICY "announcements: ver da empresa, ativos e não expirados"
        ON public.announcements FOR SELECT TO public
        USING (
          company_id = auth_company_id()
          AND auth_is_active()
          AND active = true
          AND (expires_at IS NULL OR expires_at > now())
          AND (sector_id IS NULL OR is_sector_member(sector_id))
          AND auth_global_role()::text != 'cliente'
        )
    $sql$;
  END IF;

  -- 3e. sector_members — cliente não vê membros de setores
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sector_members') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "sector_members: ver da própria empresa" ON public.sector_members $sql$;
    EXECUTE $sql$
      CREATE POLICY "sector_members: ver da própria empresa"
        ON public.sector_members FOR SELECT TO public
        USING (
          EXISTS (
            SELECT 1 FROM sectors s
            WHERE s.id = sector_members.sector_id
              AND s.company_id = auth_company_id()
          )
          AND auth_global_role()::text != 'cliente'
        )
    $sql$;
  END IF;

  -- 3f. integrations — já restrito a admin, mas adicionando guard explícito
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='integrations') THEN
    EXECUTE $sql$ DROP POLICY IF EXISTS "integrations: ver da própria empresa" ON public.integrations $sql$;
    EXECUTE $sql$
      CREATE POLICY "integrations: ver da própria empresa"
        ON public.integrations FOR SELECT TO public
        USING (
          company_id = auth_company_id()
          AND auth_is_active()
          AND auth_global_role()::text != 'cliente'
        )
    $sql$;
  END IF;

  RAISE NOTICE 'add_client_role: migration aplicada com sucesso.';
END $$;

-- =============================================================================
-- VERIFICAÇÃO:
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'global_role' ORDER BY enumsortorder;
--
-- SELECT policyname, tablename, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND policyname LIKE '%cliente%'
-- ORDER BY tablename, policyname;
-- =============================================================================

-- Auto-registro no tracker de migrations do HubM
INSERT INTO public.schema_migrations (filename)
VALUES ('20260602000000_add_client_role.sql')
ON CONFLICT (filename) DO NOTHING;
