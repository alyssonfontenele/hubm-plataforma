-- =============================================================================
-- Migration: before_user_created_hook
-- Bancos: Mowig + Moveria (onde há autocadastro Google por domínio).
--
-- Cria a função que o Auth Hook "Before User Created" deve chamar para
-- bloquear, ANTES de criar a linha em auth.users, um login Google cujo
-- domínio de e-mail não esteja em companies.allowed_domains (empresa ativa).
--
-- Só se aplica a provider='google' (autocadastro público via OAuth). Contas
-- criadas via Admin API por create-cpf-user/create-client-user usam
-- provider='email' e já passam por checagem de admin nessas próprias
-- functions — não são afetadas por este hook.
--
-- IMPORTANTE: criar a função aqui NÃO liga o hook. É preciso habilitá-lo
-- manualmente no Dashboard: Authentication > Hooks (Beta) > Before User
-- Created > selecionar public.hook_restrict_google_signup_by_domain. Não há
-- API/CLI para isso nos bancos hospedados no momento desta migration.
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN

    CREATE OR REPLACE FUNCTION public.hook_restrict_google_signup_by_domain(event jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      provider     text;
      email        text;
      email_domain text;
      is_allowed   boolean;
    BEGIN
      provider := event->'user'->'app_metadata'->>'provider';

      -- Só inspeciona autocadastro via Google. Admin API (create-cpf-user,
      -- create-client-user) usa provider='email' e já é gated por admin.
      IF provider IS DISTINCT FROM 'google' THEN
        RETURN '{}'::jsonb;
      END IF;

      email        := lower(coalesce(event->'user'->>'email', ''));
      email_domain := split_part(email, '@', 2);

      -- "domain" colide com public.companies.domain (coluna) — usar nome
      -- diferente para a variável evita erro de referência ambígua.
      SELECT EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.active = true
          AND (email_domain = ANY(c.allowed_domains) OR '*' = ANY(c.allowed_domains))
      ) INTO is_allowed;

      IF is_allowed THEN
        RETURN '{}'::jsonb;
      END IF;

      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'Domínio de e-mail não autorizado para cadastro.',
          'http_code', 403
        )
      );
    END;
    $fn$;

    GRANT EXECUTE ON FUNCTION public.hook_restrict_google_signup_by_domain TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    REVOKE EXECUTE ON FUNCTION public.hook_restrict_google_signup_by_domain FROM authenticated, anon, public;

  END IF;
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922120000_before_user_created_hook.sql')
ON CONFLICT (filename) DO NOTHING;
