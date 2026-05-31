# Ambiente de Staging — HubM

## 1. Criar o projeto Supabase de staging

1. Acesse https://supabase.com/dashboard e clique em **New project**
2. Nome sugerido: `hubm-staging`
3. Região: mesma do projeto de produção (ex: South America - São Paulo)
4. Após a criação, anote:
   - **Project URL**: `https://<ref>.supabase.co`
   - **Anon Key**: disponível em Settings → API

## 2. Configurar variáveis no Vercel para a branch staging

1. No painel do Vercel, acesse o projeto HubM → **Settings → Environment Variables**
2. Para cada variável abaixo, selecione o ambiente **Preview** e o target branch `staging`:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase de staging |
| `VITE_SUPABASE_ANON_KEY` | Anon Key do projeto de staging |
| `VITE_COMPANY_SLUG` | `mowig` (ou o slug de staging) |

3. O arquivo `.env.staging` na raiz do repositório serve como referência de quais variáveis são necessárias — os valores reais ficam **somente no Vercel**, nunca commitados.

## 3. Rodar as migrations no staging

Pré-requisito: ter o `SUPABASE_ACCESS_TOKEN` exportado.

```bash
export SUPABASE_ACCESS_TOKEN=<seu-personal-access-token>

# Aplicar todas as migrations pendentes no projeto de staging
bash scripts/deploy-migrations.sh <staging-project-ref>
```

O script em `scripts/deploy-migrations.sh` detecta automaticamente quais migrations ainda não foram aplicadas e executa apenas as pendentes.

## 4. Fazer um PR de staging → main

1. Desenvolva e valide as features na branch `staging`
2. Certifique-se de que o deploy de staging no Vercel está saudável
3. Execute as migrations de staging e confirme que não há erros
4. Abra um Pull Request: **staging → main** no GitHub
5. Aguarde revisão e aprovação antes do merge

## 5. Checklist de promoção staging → produção

- [ ] Todos os testes passando na branch staging
- [ ] CI (`npm audit`) verde
- [ ] Migrations validadas no banco de staging
- [ ] Preview URL do Vercel testada manualmente (golden path)
- [ ] Nenhuma variável de ambiente de staging hardcoded no código
- [ ] PR aprovado por pelo menos 1 revisor
