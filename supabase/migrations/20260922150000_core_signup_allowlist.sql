-- =============================================================================
-- Migration: core_signup_allowlist
-- Banco: Core (vtirfoafpmolffzgszhp) APENAS — não é um conceito de Mowig/Moveria.
--
-- Core não tem um fluxo legítimo de autocadastro (CPF ou Google): a única
-- razão para existir uma conta ali é acesso de superadmin, concedido
-- manualmente. Este hook before_user_created bloqueia QUALQUER criação de
-- usuário (independente de provider) cujo e-mail não esteja na allowlist.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.core_signup_allowlist (
  email      text        PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.core_signup_allowlist ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon: só service_role (usado pelo hook e
-- por administração manual via SQL/Admin API) enxerga esta tabela.

INSERT INTO public.core_signup_allowlist (email, note)
VALUES ('alysson@mowig.com.br', 'Fundador — acesso superadmin ao Core')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hook_core_signup_allowlist(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  req_email  text;
  is_allowed boolean;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.hook_core_signup_allowlist TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_core_signup_allowlist FROM authenticated, anon, public;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260922150000_core_signup_allowlist.sql')
ON CONFLICT (filename) DO NOTHING;
