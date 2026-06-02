-- SEED LOCAL MOVERIA - Módulo Contratos
-- Executar APENAS em banco local (127.0.0.1:54322)
-- Schema alinhado à migration 20260602010000_add_moveria_module

BEGIN;

-- ============================================================
-- STEP 1: auth.users (3 usuários de teste)
-- ============================================================
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_user_meta_data, raw_app_meta_data,
  is_super_admin, confirmation_token, recovery_token
)
VALUES
  (
    'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'consultor@moveria.test',
    crypt('Teste@1234', gen_salt('bf')),
    now(), now(), now(),
    '{"global_role": "member"}'::jsonb,
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    false, '', ''
  ),
  (
    'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'vendedor@moveria.test',
    crypt('Teste@1234', gen_salt('bf')),
    now(), now(), now(),
    '{"global_role": "member"}'::jsonb,
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    false, '', ''
  ),
  (
    'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'cliente.joao@moveria.test',
    crypt('Teste@1234', gen_salt('bf')),
    now(), now(), now(),
    '{"global_role": "member"}'::jsonb,
    '{"provider": "cpf", "providers": ["cpf"]}'::jsonb,
    false, '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 2: public.profiles
-- ============================================================
INSERT INTO public.profiles (
  id, company_id, full_name, display_name,
  auth_type, global_role, active, cpf_hash, cellphone, recovery_email
)
VALUES
  (
    'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
    'fac9ae68-d906-4055-b228-02861cff3a7f',
    'Carlos Eduardo Mendes', 'Carlos Consultor',
    'google', 'member', true, null, '(11) 91234-5678', null
  ),
  (
    'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2',
    'fac9ae68-d906-4055-b228-02861cff3a7f',
    'Fernanda Lima Costa', 'Fernanda Vendedora',
    'google', 'member', true, null, '(11) 92345-6789', null
  ),
  (
    'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3',
    'fac9ae68-d906-4055-b228-02861cff3a7f',
    'João Silva Santos', 'João Cliente',
    'cpf', 'member', true,
    encode(sha256('52998224725'::bytea), 'hex'),
    '(11) 93456-7890', 'joao.recuperacao@moveria.test'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 2b: auth.identities (necessário para sign-in via email+password)
-- ============================================================
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES
  (
    'consultor@moveria.test',
    'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
    '{"sub": "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1", "email": "consultor@moveria.test", "email_verified": true}'::jsonb,
    'email', now(), now()
  ),
  (
    'vendedor@moveria.test',
    'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2',
    '{"sub": "b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2", "email": "vendedor@moveria.test", "email_verified": true}'::jsonb,
    'email', now(), now()
  ),
  (
    'cliente.joao@moveria.test',
    'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3',
    '{"sub": "c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3", "email": "cliente.joao@moveria.test", "email_verified": true}'::jsonb,
    'email', now(), now()
  )
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Corrige campos que GoTrue não aceita como NULL (email_change)
UPDATE auth.users SET
  email_change               = COALESCE(NULLIF(email_change, ''), ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, '')
WHERE email LIKE '%moveria.test%';

-- ============================================================
-- STEP 3: moveria_membros (consultor + vendedor)
-- ============================================================
INSERT INTO moveria_membros (id, profile_id, papel, ativo)
VALUES
  (
    'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4',
    'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
    'consultor_tecnico', true
  ),
  (
    'e5e5e5e5-e5e5-4e5e-e5e5-e5e5e5e5e5e5',
    'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2',
    'vendedor', true
  )
ON CONFLICT (profile_id) DO NOTHING;

-- ============================================================
-- STEP 4: moveria_clientes (cliente fictício)
-- CPF de teste: 529.982.247-25 (válido, domínio público)
-- ============================================================
INSERT INTO moveria_clientes (
  id, profile_id, nome_completo, cpf_hash, cpf_mascarado,
  telefone, email, endereco
)
VALUES (
  'f6f6f6f6-f6f6-4f6f-f6f6-f6f6f6f6f6f6',
  'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3',
  'João Silva Santos',
  encode(sha256('52998224725'::bytea), 'hex'),
  '529.982.XXX-XX',
  '(11) 93456-7890',
  'cliente.joao@moveria.test',
  'Rua das Flores, 123, Jardim Primavera, São Paulo - SP, CEP 04567-000'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 5: moveria_contratos (sem consultor_id — vínculo via designacoes)
-- ============================================================
INSERT INTO moveria_contratos (
  id, numero, cliente_id, vendedor_id,
  status, desconto_pct, observacoes
)
VALUES (
  'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
  'MOV-2026-0001',
  'f6f6f6f6-f6f6-4f6f-f6f6-f6f6f6f6f6f6',
  'e5e5e5e5-e5e5-4e5e-e5e5-e5e5e5e5e5e5',
  'em_andamento',
  5.00,
  'Residência completa - 6 ambientes. Início: 02/06/2026.'
)
ON CONFLICT (numero) DO NOTHING;

-- ============================================================
-- STEP 6: moveria_itens_contrato (6 itens, formato 00000AA)
-- ============================================================
INSERT INTO moveria_itens_contrato
  (id, contrato_id, codigo, descricao, ambiente, quantidade, valor_unitario,
   prazo_producao_dias_uteis, status_item, ordem)
VALUES
  ('11111111-0001-0001-0001-111111111111',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00001AM', 'Armário Planejado Cozinha 2,40m', 'Cozinha',    1, 2400.00, 15, 'pendente', 1),
  ('22222222-0002-0002-0002-222222222222',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00002BA', 'Bancada em Granito 3,20m',         'Cozinha',    1, 1800.00, 10, 'pendente', 2),
  ('33333333-0003-0003-0003-333333333333',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00003CL', 'Closet em L Modulado',             'Closet',     1, 3200.00, 20, 'pendente', 3),
  ('44444444-0004-0004-0004-444444444444',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00004HO', 'Mesa e Estante Home Office',       'Home Office', 1, 2100.00, 12, 'pendente', 4),
  ('55555555-0005-0005-0005-555555555555',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00005SS', 'Painel TV + Rack Sala de Estar',   'Sala',        1, 4500.00, 18, 'pendente', 5),
  ('66666666-0006-0006-0006-666666666666',
   'a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7',
   '00006BD', 'Espelheira + Gavetas Banheiro Suíte', 'Banheiro Suíte', 1, 1600.00, 8, 'pendente', 6)
ON CONFLICT (contrato_id, codigo) DO NOTHING;

-- ============================================================
-- STEP 7: moveria_designacoes (consultor designado a todos os 6 itens)
-- Trigger sincroniza consultor_designado no item automaticamente
-- ============================================================
INSERT INTO moveria_designacoes (item_id, consultor_id, designado_por, ativo)
VALUES
  ('11111111-0001-0001-0001-111111111111', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true),
  ('22222222-0002-0002-0002-222222222222', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true),
  ('33333333-0003-0003-0003-333333333333', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true),
  ('44444444-0004-0004-0004-444444444444', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true),
  ('55555555-0005-0005-0005-555555555555', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true),
  ('66666666-0006-0006-0006-666666666666', 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4', 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', true)
ON CONFLICT DO NOTHING;

COMMIT;
