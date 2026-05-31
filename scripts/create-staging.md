# Checklist: Criar ambiente de staging do zero

Execute cada item em ordem. Marque ao concluir.

---

## Supabase

- [ ] Criar projeto Supabase `hubm-mowig-staging` em https://supabase.com/dashboard
- [ ] Anotar o **Project Ref** (ex: `abcdefghijklmnopqrst`)
- [ ] Anotar a **Project URL** (ex: `https://abcdefghijklmnopqrst.supabase.co`)
- [ ] Anotar a **Anon Key** (Settings → API)
- [ ] Anotar a **Service Role Key** (Settings → API — manter segura)
- [ ] Exportar o token de acesso pessoal:
  ```bash
  export SUPABASE_ACCESS_TOKEN=<seu-personal-access-token>
  ```
- [ ] Rodar as migrations:
  ```bash
  bash scripts/deploy-migrations.sh <staging-project-ref>
  ```
- [ ] Verificar no Dashboard → Table Editor que as tabelas foram criadas

## Secrets das Edge Functions

No painel Supabase do projeto staging → Edge Functions → Secrets:

- [ ] `SUPABASE_URL` = URL do staging
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = service role key do staging
- [ ] `SERVICE_ROLE_KEY` = idem
- [ ] `INTERNAL_SECRET` = gerar novo valor aleatório:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] `ANON_KEY_JWT` = anon key do staging
- [ ] `SITE_URL` = URL preview do Vercel (preencher após o próximo passo)
- [ ] `ALLOWED_ORIGINS` = URL preview do Vercel
- [ ] `BREVO_API_KEY` = chave Brevo

## Vercel

- [ ] No Vercel → projeto HubM → Settings → Environment Variables
- [ ] Adicionar para ambiente **Preview**, target branch `staging`:
  - `VITE_SUPABASE_URL` = URL do staging
  - `VITE_SUPABASE_ANON_KEY` = anon key do staging
  - `VITE_COMPANY_SLUG` = `mowig`
- [ ] Fazer push na branch `staging` para acionar o deploy:
  ```bash
  git checkout staging
  git push origin staging
  ```
- [ ] Anotar a Preview URL gerada pelo Vercel
- [ ] Atualizar `SITE_URL` e `ALLOWED_ORIGINS` nos secrets do Supabase staging com essa URL

## Teste de smoke

- [ ] Acessar a Preview URL e confirmar que a tela de login carrega
- [ ] Testar login com CPF de um usuário de staging
- [ ] Confirmar que o email de boas-vindas é enviado ao criar um usuário
- [ ] Confirmar que a recuperação de senha por CPF funciona
- [ ] Verificar admin_logs no Dashboard do Supabase staging

---

Referência completa: **docs/STAGING.md**
