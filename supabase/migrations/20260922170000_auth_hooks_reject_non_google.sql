-- =============================================================================
-- Migration: auth_hooks_reject_non_google
-- Bancos: Mowig/Moveria (hook_restrict_google_signup_by_domain) e Core
-- (hook_core_signup_allowlist).
--
-- Os dois hooks before_user_created agora REJEITAM qualquer autocadastro
-- público cujo provider não seja 'google' (e-mail/senha, magic link, etc.),
-- além das checagens que já faziam (domínio em Mowig/Moveria, allowlist no
-- Core). Isso NÃO afeta create-cpf-user/create-client-user: contas criadas
-- via Admin API (service_role) não passam pelo hook before_user_created —
-- confirmado empiricamente (teste real via /auth/v1/admin/users não dispara
-- o hook, só /auth/v1/signup e fluxos OAuth disparam).
-- =============================================================================

DO $migration$
BEGIN
  IF to_regproc('public.hook_restrict_google_signup_by_domain') IS NOT NULL THEN
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

      IF provider IS DISTINCT FROM 'google' THEN
        RETURN jsonb_build_object(
          'error', jsonb_build_object(
            'message', 'Cadastro público só é permitido via Google.',
            'http_code', 403
          )
        );
      END IF;

      email        := lower(coalesce(event->'user'->>'email', ''));
      email_domain := split_part(email, '@', 2);

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
  END IF;

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
END
$migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922170000_auth_hooks_reject_non_google.sql')
ON CONFLICT (filename) DO NOTHING;
