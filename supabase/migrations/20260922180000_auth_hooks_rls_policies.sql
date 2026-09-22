-- =============================================================================
-- Migration: auth_hooks_rls_policies
-- Bancos: Core (core_signup_allowlist) + Mowig/Moveria (companies).
--
-- GRANT SELECT (migration 20260922160000) não bastava: RLS filtra por linha
-- independente do GRANT de tabela. core_signup_allowlist tinha RLS habilitado
-- sem NENHUMA policy (bloqueia tudo, para todo mundo, sempre). companies tem
-- policies, mas nenhuma cobre supabase_auth_admin no contexto real de
-- execução do hook (sem request.jwt.claims setado, e supabase_auth_admin não
-- é membro do role "authenticated") — auth_is_superadmin() avalia false ali,
-- então "companies_superadmin_select" também não cobre.
--
-- Fix: policy de SELECT específica para supabase_auth_admin, USING (true) —
-- é exatamente o padrão recomendado pela documentação oficial da Supabase
-- para Auth Hooks (ver exemplo custom_access_token_hook), em vez de
-- SECURITY DEFINER (que a mesma documentação desaconselha explicitamente,
-- por rodar com os privilégios amplos do dono da função).
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.core_signup_allowlist') IS NOT NULL THEN
    DROP POLICY IF EXISTS "hook_core_signup_allowlist_read" ON public.core_signup_allowlist;
    CREATE POLICY "hook_core_signup_allowlist_read"
      ON public.core_signup_allowlist
      AS PERMISSIVE FOR SELECT
      TO supabase_auth_admin
      USING (true);
  END IF;

  -- Recria a função sem o INSERT de debug (instrumentação temporária de
  -- diagnóstico, já cumpriu seu papel).
  IF to_regproc('public.hook_core_signup_allowlist') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.hook_core_signup_allowlist(event jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      provider   text;
      req_email  text;
      is_allowed boolean;
    BEGIN
      provider := event->'user'->'app_metadata'->>'provider';

      IF provider IS DISTINCT FROM 'google' THEN
        RETURN jsonb_build_object(
          'error', jsonb_build_object(
            'message', 'Cadastro público só é permitido via Google.',
            'http_code', 403
          )
        );
      END IF;

      req_email := lower(coalesce(event->'user'->>'email', ''));

      SELECT EXISTS (
        SELECT 1 FROM public.core_signup_allowlist
        WHERE lower(email) = req_email
      ) INTO is_allowed;

      IF is_allowed THEN
        RETURN '{}'::jsonb;
      END IF;

      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'Cadastro não autorizado neste ambiente.',
          'http_code', 403
        )
      );
    END;
    $fn$;
  END IF;

  IF to_regclass('public.companies') IS NOT NULL AND to_regproc('public.hook_restrict_google_signup_by_domain') IS NOT NULL THEN
    DROP POLICY IF EXISTS "hook_google_signup_domain_read" ON public.companies;
    CREATE POLICY "hook_google_signup_domain_read"
      ON public.companies
      AS PERMISSIVE FOR SELECT
      TO supabase_auth_admin
      USING (true);
  END IF;

  -- Remove a tabela de debug temporária (diagnóstico concluído).
  DROP TABLE IF EXISTS public.core_hook_debug;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922180000_auth_hooks_rls_policies.sql')
ON CONFLICT (filename) DO NOTHING;
