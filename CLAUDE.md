# Regras do projeto HubM Plataforma

## Segurança / Edge Functions

- **NUNCA** faça deploy de uma Edge Function temporária/bootstrap em produção (Mowig, Moveria ou Core), nem por um instante, para gerar usuários ou tokens de teste. Para obter um JWT de teste, use a service role key diretamente via Admin API (`auth.admin.createUser` + `signInWithPassword`) ou SQL direto — nunca crie um endpoint HTTP novo só para isso.

## Usuários reais — não tocar

- Nunca altere, anonimize, bana, delete ou modifique de qualquer forma os perfis de usuários reais: **Alysson**, **Lucas Novais**, **Marina**, **QA Criador Mowig**, ou qualquer colaborador ativo real. Testes usam sempre usuários descartáveis criados e limpos na mesma sessão.
