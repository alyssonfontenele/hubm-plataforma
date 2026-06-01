-- ---------------------------------------------------------------------------
-- Tabela profiles mínima para o hubm-core (banco do SuperAdmin).
-- Tem todos os campos do interface Profile do TypeScript para compatibilidade
-- com AuthContext.tsx sem exigir alterações de tipo.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid        NOT NULL,
  company_id           uuid,
  full_name            text        NOT NULL DEFAULT '',
  display_name         text,
  auth_type            text        NOT NULL DEFAULT 'cpf',
  cpf_hash             text,
  recovery_email       text,
  cellphone            text,
  avatar_url           text,
  global_role          text        NOT NULL DEFAULT 'superadmin',
  active               boolean     NOT NULL DEFAULT true,
  must_change_password boolean     NOT NULL DEFAULT false,
  deleted_at           timestamptz,
  last_login_at        timestamptz,
  consent_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- O próprio usuário pode ler seu perfil; service_role tem acesso total.
DROP POLICY IF EXISTS "profiles_core_access" ON public.profiles;
CREATE POLICY "profiles_core_access"
  ON public.profiles FOR ALL TO public
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR id = auth.uid()
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
    OR id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Registro inicial: SuperAdmin
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, display_name, global_role, active, auth_type)
VALUES (
  '49b6bb17-6c08-4568-afd7-61bf52978dda',
  'Super Admin',
  'Alysson',
  'superadmin',
  true,
  'cpf'
)
ON CONFLICT (id) DO NOTHING;
