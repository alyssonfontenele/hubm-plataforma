# Arquitetura HubM — Multi-empresa

## Visão geral

HubM é uma plataforma SaaS multi-tenant onde cada empresa tem seu próprio banco Supabase isolado. Um banco central (hubm-core) armazena o catálogo de empresas e é gerenciado exclusivamente pelo SuperAdmin.

## Bancos de dados

| Banco | Projeto Supabase | Propósito |
|---|---|---|
| hubm-core | `vtirfoafpmolffzgszhp` | Catálogo de empresas, features, perfil do SuperAdmin |
| hubm-mowig | `xpoqiclaqkudznmshzal` | Dados operacionais da empresa Mowig |
| hubm-moveria | `fzgasvcfxufhrbrdakow` | Dados operacionais da empresa Moveria |

Cada banco de empresa é **completamente isolado**: não há joins cross-banco, não há service account compartilhada entre empresas.

## Isolamento de tenant

O isolamento é garantido em três camadas:

1. **Banco separado por empresa** — impossível acesso cross-tenant via SQL direto
2. **RLS por `company_id`** — todas as tabelas com dados de empresa filtram por `auth_company_id()`, que lê o `company_id` do perfil do usuário autenticado
3. **Edge Functions autenticadas** — funções admin requerem JWT válido com `global_role = 'admin'` ou `'manager'`

## Seleção de empresa no frontend

A variável `VITE_COMPANY_SLUG` (configurada por ambiente no Vercel) determina qual empresa o deploy serve. O frontend busca a configuração da empresa (logo, cores, domínios permitidos) na tabela `companies` do hubm-core via `VITE_SUPABASE_URL`.

## Autenticação

- **CPF:** usuários operacionais autenticam com CPF + senha. O CPF é armazenado apenas como hash bcrypt (`cpf_hash`). O email no Supabase Auth é `<digits>@hubm.internal`.
- **Google OAuth:** usuários com domínio corporativo autorizado podem usar Google Sign-In. O acesso fica pendente até aprovação de um admin.
- **SuperAdmin:** autentica diretamente no hubm-core com CPF. O `global_role = 'superadmin'` é verificado via JWT claim `user_metadata.global_role`.

## Edge Functions

Seis funções Supabase (Deno/TypeScript) tratam operações que requerem service_role:

- `create-cpf-user` — cria usuário CPF + perfil + envia email de boas-vindas
- `delete-user` — remove usuário do Supabase Auth
- `resend-access` — reenvia email de acesso (requer role admin)
- `recover-cpf-password` — gera link de recuperação de senha por CPF (com rate limiting)
- `send-email` — proxy para Brevo API com rate limiting por destinatário
- `admin-notify` — proxy autenticado de email para admins/managers (sem expor INTERNAL_SECRET no frontend)

Ver **docs/edge-functions.md** para detalhes de cada função.

## Fluxo de deploy

```
feature branch → PR → main → Vercel (produção automática)
                            → staging branch → Vercel Preview
```

Migrations de banco são aplicadas manualmente via `scripts/deploy-migrations.sh <project-ref>` ou pelo MCP Supabase. Ver **docs/STAGING.md** para o fluxo de staging.
