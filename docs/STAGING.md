# Ambiente de Staging — HubM

## 1. Criar o projeto Supabase de staging

1. Acesse https://supabase.com/dashboard e clique em **New project**
2. Nome sugerido: `hubm-mowig-staging`
3. Região: mesma do projeto de produção (ex: South America — São Paulo)
4. Após a criação, anote:
   - **Project URL**: `https://<ref>.supabase.co`
   - **Anon Key**: disponível em Settings → API
   - **Project Ref**: string de 20 caracteres no URL do dashboard

## 2. Rodar migrations no staging

Pré-requisito: `SUPABASE_ACCESS_TOKEN` exportado no shell.

```bash
export SUPABASE_ACCESS_TOKEN=<seu-personal-access-token>
bash scripts/deploy-migrations.sh <staging-project-ref>
```

O script detecta automaticamente as migrations pendentes e aplica somente as novas.

## 3. Configurar secrets das Edge Functions no staging

No painel Supabase do projeto staging → Edge Functions → Secrets, configure:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto staging |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do staging |
| `SERVICE_ROLE_KEY` | Idem |
| `INTERNAL_SECRET` | Gerar um novo valor aleatório para staging |
| `ANON_KEY_JWT` | Anon key do staging |
| `SITE_URL` | URL preview do Vercel para o staging |
| `ALLOWED_ORIGINS` | URL preview do Vercel para o staging |
| `BREVO_API_KEY` | Chave da API Brevo (pode ser a mesma de prod) |

## 4. Configurar variáveis no Vercel para a branch staging

1. No painel do Vercel → projeto HubM → **Settings → Environment Variables**
2. Para cada variável abaixo, selecione o ambiente **Preview** com target branch `staging`:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase staging |
| `VITE_SUPABASE_ANON_KEY` | Anon Key do projeto staging |
| `VITE_COMPANY_SLUG` | `mowig` |

## 5. Fluxo de desenvolvimento

```
feature branch → testar localmente
     ↓
merge na branch staging
     ↓
Vercel gera Preview URL automaticamente
     ↓
testar no Preview URL (login, fluxos principais)
     ↓
abrir PR: staging → main
     ↓
aprovação + merge → deploy em produção
```

## 6. Checklist antes de abrir PR staging → main

- [ ] Todas as migrations validadas no banco staging
- [ ] Login com CPF funcionando no Preview URL
- [ ] CI (`npm audit`) verde na branch staging
- [ ] Nenhuma variável de ambiente de produção hardcoded no código
- [ ] Edge Functions testadas manualmente no staging
- [ ] PR aprovado por pelo menos 1 revisor

## 7. Template de variáveis locais

Copie `.env.staging` da raiz e preencha com os valores reais do projeto staging.
O arquivo `.env.staging` é ignorado pelo git (`.env.*` no `.gitignore`).

## 8. Uso do staging para testes de Disaster Recovery

O ambiente de staging é o local ideal para validar o processo de DR antes de precisar usá-lo em produção:

1. **Restore de banco:** execute um restore de snapshot no projeto Supabase staging e verifique que os dados e funções estão íntegros
2. **Re-deploy de Edge Functions:** teste o deploy de todas as funções no projeto staging a partir do git
3. **Recriação de secrets:** verifique que os secrets documentados em `SECURITY.md` são suficientes para recriar o ambiente do zero
4. **Smoke test:** após o restore, execute o checklist de smoke test da seção 5 desta documentação

Ver procedimento completo em **docs/disaster-recovery.md**.
