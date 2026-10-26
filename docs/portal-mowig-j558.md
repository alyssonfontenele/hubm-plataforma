# Portal Mowig (J558) — lado HubM

Diário da janela J558 (branch `portal-mowig`, projeto Supabase `hubm-mowig` / `xpoqiclaqkudznmshzal`).

## Conferências (só leitura)
- **(a) JWKS**: `/auth/v1/.well-known/jwks.json` publica 1 chave **ES256** (P-256, kid `0290b27d-…`). Não é mais só HS256. O ERP valida RS256/ES256 por JWKS. Não decodifiquei um token recém-emitido (exigiria chave de serviço no ambiente, ausente).
- **(b) SMTP**: o envio de e-mail do Auth **falha** (`Error sending invite email` ao convidar) — compatível com o SMTP padrão do Supabase, que só entrega a endereços da equipe do projeto. Confirmar em Authentication › SMTP; sugestão: SMTP do Brevo (já usado em `send-email`).
- **(c) Tenant/papéis**: tenant por `VITE_COMPANY_SLUG`; `profiles.global_role` (`admin|manager|member|viewer|operational|superadmin|cliente`); `superadmin` vem de `app_metadata.global_role`. O papel `cliente` já existente é de **perfil** (com `company_id`); o lojista é outra coisa: usuário do Auth **sem linha em `profiles`**, marcado em `app_metadata.tipo = 'lojista'`. Hoje, sem perfil, `auth_company_id()`/`auth_global_role()` retornam NULL, mas políticas "qualquer autenticado" vazavam (baseline: lojista lia 3 `companies` e 6 `sectors`; podia inserir em `access_logs`/`profile_sector_requests`/`profiles` pendente).

## Função `portal-lojista-admin`
POST, `Authorization: Bearer <token>` (comparação em tempo constante), `verify_jwt=false`. Ações: `convidar | reenviar | desativar | reativar` com `email` (ou `sub`) e `nome`. Resposta `{ ok, sub, email, situacao: CONVITE_ENVIADO|ATIVO|DESATIVADO }`.
- convidar: cria o usuário já com `app_metadata.tipo='lojista'` e envia o convite; e-mail já existente devolve o mesmo `sub` (idempotente). E-mail de colaborador → 409 (nunca vira lojista).
- reenviar: convite (se nunca ativou) ou e-mail de redefinição de senha; desativado → 409.
- desativar: banimento (~100 anos) + remove `auth.sessions` (o access token já emitido vale até expirar; o ERP corta pelo vínculo). reativar: remove o banimento.
- Redirect dos e-mails: `https://hubm.mowig.ind.br/auth/callback` (já na lista do Auth), que encaminha o lojista para `/portal/definir-senha`. Sobrescrevível pelo segredo `PORTAL_REDIRECT_URL`.

## Telas (`/portal/*`)
`entrar`, `definir-senha` (convite e recuperação), `esqueci`, casca `/portal` (saudação via `GET /v1/portal/me`; 503/erro de rede = "Portal em preparação"; 403 = acesso ainda não liberado). `LojistaGate` (em `__root`) recusa qualquer rota fora de `/portal/*` e `/auth/callback` para lojista. Visual: tokens do ERP escopados em `.portal-mowig`. Fonte IBM Plex Sans com fallback do sistema (CSP não libera fontes externas).

## RLS
Migração aditiva `20261026180000_portal_lojista_isolamento_rls.sql`: helper `is_lojista()` + política RESTRICTIVE `lojista_negado` (FOR ALL, TO authenticated) em todas as tabelas de `public`. Roteiro: `supabase/tests/portal_lojista_rls_roteiro.sql`; reversão: `supabase/tests/portal_lojista_rls_reverter.sql`.
Residual (fora do escopo de tabelas): RPCs `SECURITY DEFINER` executáveis por autenticado/anon (`hash_cpf`, `verify_cpf`, `list_cargos_for_request_access`…) — existentes, não dependem de dados do lojista; avaliar revogação numa janela própria.

## Decisões de julgamento
1. Token administrativo: o valor existe só no Secret Manager (`hubm-portal-admin-token`, projeto `importanfe`); na função fica o **digest SHA-256** (o conector de segredos do Supabase exige o valor digitado no painel, e eu não imprimo o token). Equivalente em segurança para um token de 256 bits; se `PORTAL_ADMIN_TOKEN_SHA256`/`PORTAL_ADMIN_TOKEN` forem definidos nos segredos da função, têm precedência sobre o digest embutido.
2. Criar o usuário com `createUser(app_metadata)` e só depois convidar, para nunca existir lojista sem o marcador.
3. Redirect pelo `/auth/callback` (já permitido no Auth) em vez de exigir nova URL na lista.
4. RLS por política RESTRICTIVE genérica em vez de reescrever cada política: não altera nenhuma política atual, é reversível com um comando.
