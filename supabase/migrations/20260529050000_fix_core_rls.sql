-- ---------------------------------------------------------------------------
-- Fix RLS — hubm-core (vtirfoafpmolffzgszhp)
--
-- Remove a dependência da função auth_global_role() (que precisava da
-- tabela profiles, inexistente no core) e recria as policies usando
-- claims do JWT diretamente.
--
-- Política: service_role (chave do superadmin) OU qualquer usuário
-- autenticado com e-mail no JWT (para sessões futuras, se necessário).
-- ---------------------------------------------------------------------------

-- 1. Remove policies antigas
DROP POLICY IF EXISTS "companies_superadmin_all"       ON public.companies;
DROP POLICY IF EXISTS "company_features_superadmin_all" ON public.company_features;

-- 2. Remove função que dependia de profiles
-- Guard: em dev local (mowig/moveria), global_role enum existe — não dropar.
-- Em produção core (vtirfoafpmolffzgszhp): enum não existe → executa normalmente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    DROP FUNCTION IF EXISTS public.auth_global_role();
  END IF;
END $$;

-- 3. Novas policies — sem dependência de tabelas externas
CREATE POLICY "companies_core_access"
  ON public.companies FOR ALL TO public
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR (auth.jwt() ->> 'email') IS NOT NULL
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
    OR (auth.jwt() ->> 'email') IS NOT NULL
  );

CREATE POLICY "company_features_core_access"
  ON public.company_features FOR ALL TO public
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR (auth.jwt() ->> 'email') IS NOT NULL
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
    OR (auth.jwt() ->> 'email') IS NOT NULL
  );
