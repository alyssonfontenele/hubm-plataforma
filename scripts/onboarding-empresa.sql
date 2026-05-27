-- =============================================================================
-- SCRIPT DE ONBOARDING DE NOVA EMPRESA — HubMowig
-- =============================================================================
-- Como usar:
--   1. Edite o bloco "VARIÁVEIS" abaixo com os dados da nova empresa.
--   2. Cole o script inteiro no Supabase SQL Editor do projeto e execute.
--   3. Ao final, os SELECTs de verificação confirmarão o que foi criado.
--
-- Pré-requisito: a extensão pgcrypto deve estar ativa (já habilitada por padrão
-- no Supabase). Ela é usada para gerar UUIDs via gen_random_uuid().
-- =============================================================================

DO $$
DECLARE
  -- -------------------------------------------------------------------------
  -- VARIÁVEIS — edite aqui antes de executar
  -- -------------------------------------------------------------------------

  -- Empresa
  v_company_name    TEXT    := 'Nome da Empresa';          -- Ex: 'Acme Corp'
  v_company_slug    TEXT    := 'acme';                     -- Ex: 'acme' (único, sem espaços)
  v_company_domain  TEXT    := 'acme.com.br';              -- Domínio principal (pode ser NULL)
  v_company_color   TEXT    := '#111111';                  -- Cor primária em hex
  v_company_logo    TEXT    := NULL;                       -- URL do logo (pode ser NULL)
  v_email_sender    TEXT    := 'noreply@acme.com.br';      -- E-mail remetente dos e-mails transacionais

  -- Domínios Google permitidos para login corporativo (array)
  -- Deixe vazio ('{}') se não usar Google OAuth
  v_allowed_domains TEXT[]  := ARRAY['acme.com.br'];

  -- Setor inicial
  v_sector_name     TEXT    := 'Geral';                    -- Nome do primeiro setor
  v_sector_slug     TEXT    := 'geral';                    -- Slug do setor (único por empresa)
  v_sector_icon     TEXT    := '🏠';                       -- Emoji ou nome de ícone

  -- Cargos padrão — adicione ou remova linhas conforme necessário
  -- Formato: ARRAY[ARRAY['nome', 'descrição'], ...]
  v_cargos          TEXT[][] := ARRAY[
    ARRAY['Analista',    'Responsável por análise e execução de tarefas operacionais.'],
    ARRAY['Coordenador', 'Coordena equipes e processos dentro do setor.'],
    ARRAY['Gerente',     'Gestão estratégica e supervisão geral da área.'],
    ARRAY['Estagiário',  'Estudante em período de aprendizado prático.']
  ];

  -- -------------------------------------------------------------------------
  -- Variáveis internas — não edite
  -- -------------------------------------------------------------------------
  v_company_id  UUID;
  v_sector_id   UUID;
  v_cargo_id    UUID;
  v_cargo       TEXT[];

BEGIN

  -- ===========================================================================
  -- 1. EMPRESA
  -- Insere a empresa na tabela companies.
  -- primary_color aceita qualquer valor CSS válido (hex, oklch, rgb...).
  -- allowed_domains define quais domínios de e-mail podem usar Google OAuth.
  -- ===========================================================================
  INSERT INTO companies (name, slug, domain, primary_color, logo_url, email_sender, allowed_domains, active)
  VALUES (
    v_company_name,
    v_company_slug,
    v_company_domain,
    v_company_color,
    v_company_logo,
    v_email_sender,
    v_allowed_domains,
    true
  )
  RETURNING id INTO v_company_id;

  RAISE NOTICE 'Empresa criada: % (id: %)', v_company_name, v_company_id;

  -- ===========================================================================
  -- 2. SETOR INICIAL
  -- Cria o primeiro setor da empresa. Mais setores podem ser adicionados
  -- posteriormente pelo painel de administração.
  -- ===========================================================================
  INSERT INTO sectors (company_id, name, slug, icon, sort_order, active)
  VALUES (
    v_company_id,
    v_sector_name,
    v_sector_slug,
    v_sector_icon,
    1,
    true
  )
  RETURNING id INTO v_sector_id;

  RAISE NOTICE 'Setor criado: % (id: %)', v_sector_name, v_sector_id;

  -- ===========================================================================
  -- 3. CARGOS PADRÃO
  -- Insere cada cargo do array v_cargos e já o vincula ao setor inicial
  -- via cargo_sectors. Usuários aprovados com esse cargo recebem acesso
  -- automático ao setor correspondente.
  -- ===========================================================================
  FOREACH v_cargo SLICE 1 IN ARRAY v_cargos LOOP

    INSERT INTO cargos (company_id, name, description)
    VALUES (
      v_company_id,
      v_cargo[1],
      v_cargo[2]
    )
    RETURNING id INTO v_cargo_id;

    RAISE NOTICE 'Cargo criado: % (id: %)', v_cargo[1], v_cargo_id;

    -- 4. VÍNCULO CARGO ↔ SETOR
    -- Cada cargo é vinculado ao setor inicial. Quando um usuário for aprovado
    -- com esse cargo, receberá automaticamente membership no setor.
    INSERT INTO cargo_sectors (cargo_id, sector_id)
    VALUES (v_cargo_id, v_sector_id);

    RAISE NOTICE '  → Cargo % vinculado ao setor %', v_cargo[1], v_sector_name;

  END LOOP;

  RAISE NOTICE '=== Onboarding concluído para % ===', v_company_name;

END;
$$;


-- =============================================================================
-- 5. USUÁRIO ADMINISTRADOR
-- =============================================================================
-- O primeiro usuário admin NÃO é criado por este script.
-- Existem dois caminhos dependendo do tipo de login:
--
-- A) Login Google (corporativo):
--    O usuário faz login em hubm.mowig.ind.br com o e-mail corporativo.
--    Um perfil pendente é criado automaticamente via /request-access.
--    O admin existente (ou você via SQL abaixo) aprova e promove a global_role:
--
--    UPDATE profiles
--    SET active = true, global_role = 'admin'
--    WHERE recovery_email = 'admin@acme.com.br';
--
-- B) Login por CPF (operacional):
--    Use a Edge Function create-cpf-user para criar o usuário diretamente:
--
--    curl -X POST https://<projeto>.supabase.co/functions/v1/create-cpf-user \
--      -H "x-internal-secret: <INTERNAL_SECRET>" \
--      -H "Content-Type: application/json" \
--      -d '{
--            "cpf": "000.000.000-00",
--            "password": "senha-inicial",
--            "full_name": "Nome do Admin",
--            "company_id": "<company_id>",
--            "global_role": "admin"
--          }'
-- =============================================================================


-- =============================================================================
-- VERIFICAÇÃO — execute após o bloco DO para confirmar os dados inseridos
-- =============================================================================

-- Substitua <slug> pelo valor de v_company_slug que você usou acima.

SELECT
  id, name, slug, domain, primary_color, logo_url, allowed_domains, active
FROM companies
WHERE slug = 'acme';  -- <- substitua pelo slug configurado

SELECT
  s.id, s.name, s.slug, s.icon, s.sort_order, s.active
FROM sectors s
JOIN companies c ON c.id = s.company_id
WHERE c.slug = 'acme';  -- <- substitua pelo slug configurado

SELECT
  ca.id, ca.name, ca.description,
  cs.sector_id
FROM cargos ca
LEFT JOIN cargo_sectors cs ON cs.cargo_id = ca.id
JOIN companies c ON c.id = ca.company_id
WHERE c.slug = 'acme'  -- <- substitua pelo slug configurado
ORDER BY ca.name;
