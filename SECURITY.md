# Política de Segurança — HubM

## Responsável e contato

**Sistema:** HubM Plataforma  
**Mantenedor:** Alysson Fontenele — alysson@mowig.com.br  
**Repositório:** https://github.com/alyssonfontenele/hubm-plataforma

Para reportar uma vulnerabilidade de segurança, envie um e-mail para **alysson@mowig.com.br** com o assunto `[SECURITY] <resumo>`. Não abra issues públicas para vulnerabilidades.

---

## O que constitui um incidente

- Acesso não autorizado a dados de usuários ou empresas
- Bypass de autenticação ou autorização
- Exposição de segredos (service key, INTERNAL_SECRET, CPF em texto plano)
- Execução de SQL ou código arbitrário via inputs
- Acesso cross-tenant (dados de empresa A visíveis para empresa B)

## Como reportar

1. Envie e-mail para alysson@mowig.com.br com:
   - Descrição do problema
   - Passos para reproduzir
   - Impacto estimado
   - Sugestão de correção (opcional)
2. Aguarde confirmação em até 48 horas
3. Não divulgue publicamente antes de uma correção ser liberada

---

## Principais políticas RLS e o que cada uma protege

### hubm-core (banco do SuperAdmin)

| Policy | Tabela | Proteção |
|---|---|---|
| `companies_superadmin_*` | `companies` | Somente superadmin (via `auth_is_superadmin()`) lê/escreve empresas |
| `company_features_superadmin_*` | `company_features` | Idem para features por empresa |
| `profiles_superadmin_*` | `profiles` | Superadmin gerencia perfis; usuário lê o próprio |

### bancos de empresa (hubm-mowig, etc.)

| Policy | Tabela | Proteção |
|---|---|---|
| `profiles: ver perfis da própria empresa` | `profiles` | Usuário só vê perfis da mesma `company_id` |
| `profiles: admin insere novos usuários` | `profiles` | Admin só insere na própria empresa |
| `profiles: atualizar o próprio perfil` | `profiles` | Usuário edita o próprio; admin edita da própria empresa |
| `folders: ver se é membro do setor` | `folders` | Membro só acessa pastas do seu setor |
| `admin_manager_can_read_all_folders` | `folders` | Admin/manager lê pastas da própria empresa (via sector → company) |
| `folders: manager do setor e admin gerenciam` | `folders` | Escrita scoped por empresa |
| `resources: leitura com escopo` | `resources` | Acesso por `resolve_resource_permission()` |
| `resources: manager e admin gerenciam` | `resources` | Admin scoped por `sector_id → company_id` |
| `resource_permissions: usuário vê os próprios` | `resource_permissions` | Usuário ativo vê só as próprias permissões |
| `auth_rate_limits_service_only` | `auth_rate_limits` | Apenas service_role (Edge Functions) acessa |

---

## Variáveis de ambiente obrigatórias por projeto

Para verificar ou setar via CLI: `export SUPABASE_ACCESS_TOKEN=<token>` e então `npx supabase secrets list --project-ref <ref>`.

### hubm-core (`vtirfoafpmolffzgszhp`)

| Secret | Valor esperado |
|---|---|
| `SUPABASE_URL` | URL do projeto hubm-core |
| `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` | Service role key do hubm-core |
| `INTERNAL_SECRET` | Segredo interno de autenticação entre Edge Functions |
| `ALLOWED_ORIGINS` | `https://admin.mowig.ind.br` |
| `ANON_KEY_JWT` | Anon key do hubm-core |

### hubm-mowig (`xpoqiclaqkudznmshzal`)

| Secret | Valor esperado |
|---|---|
| `SUPABASE_URL` | URL do projeto hubm-mowig |
| `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` | Service role key do hubm-mowig |
| `INTERNAL_SECRET` | Segredo interno (diferente do core) |
| `ALLOWED_ORIGINS` | `https://hubm.mowig.ind.br` |
| `ANON_KEY_JWT` | Anon key do hubm-mowig |
| `SITE_URL` | `https://hubm.mowig.ind.br` |
| `BREVO_API_KEY` | Chave da API Brevo para envio de emails |

### hubm-moveria (`fzgasvcfxufhrbrdakow`)

| Secret | Valor esperado |
|---|---|
| `SUPABASE_URL` | URL do projeto hubm-moveria |
| `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` | Service role key do hubm-moveria |
| `INTERNAL_SECRET` | Segredo interno (diferente dos outros projetos) |
| `ALLOWED_ORIGINS` | `https://moveria.app.br` |
| `ANON_KEY_JWT` | Anon key do hubm-moveria |
| `SITE_URL` | `https://moveria.app.br` |
| `BREVO_API_KEY` | Chave da API Brevo para envio de emails |

> **Nota:** cada projeto deve ter seu próprio `INTERNAL_SECRET` único. Nunca reutilizar o mesmo segredo entre projetos. Rotacionar imediatamente em caso de suspeita de exposição.

---

## Em caso de incidente operacional

Ver **docs/hubm-runbook.md** para procedimentos de resposta, rollback de migrations e rotação de chaves.
