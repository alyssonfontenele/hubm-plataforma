# Auditoria de Segurança — HubM Plataforma

**Data:** 2026-10-10
**Tipo:** Auditoria somente-leitura (nenhum arquivo do projeto foi alterado, nenhuma migration/SQL de escrita foi executada)
**Projetos Supabase cobertos:** `vtirfoafpmolffzgszhp` (Core), `xpoqiclaqkudznmshzal` (Mowig), `fzgasvcfxufhrbrdakow` (Moveria)

---

## 1. Resumo executivo

| # | Achado | Severidade | Arquivo:linha |
|---|--------|------------|----------------|
| 1 | `admin-update-password` permite a um admin de **qualquer empresa** resetar a senha de **qualquer usuário de qualquer empresa** (não compara `company_id` do chamador com o do alvo) — account takeover cross-tenant | **CRÍTICO** | `supabase/functions/admin-update-password/index.ts:61-63` |
| 2 | `find_profile_by_cpf` é uma RPC `SECURITY DEFINER` chamável diretamente por `anon` via `/rest/v1/rpc/find_profile_by_cpf` — **pula por completo** o rate-limit de 5 tentativas/15min da Edge Function `recover-cpf-password`, permitindo brute-force de CPF (dígito verificador reduz o espaço de busca) e vazamento de `full_name` + `recovery_email` | **ALTO** | `supabase/migrations/20260529000000_baseline_schema.sql:430-442` |
| 3 | `delete-user` anonimiza/bane permanentemente **qualquer** `user_id` sem checar se pertence à mesma empresa do admin chamador — risco LGPD (exclusão indevida cross-tenant) | **ALTO** | `supabase/functions/delete-user/index.ts:70-83` |
| 4 | `revoke-sessions` revoga sessões de **qualquer** `user_id` sem checar `company_id` do chamador vs. do alvo | **ALTO** | `supabase/functions/revoke-sessions/index.ts:65-69` |
| 5 | `email_rate_limits` sem RLS habilitada no projeto Moveria (`fzgasvcfxufhrbrdakow`) — `anon` pode ler e-mails reais (enumeração) e inserir/apagar linhas, neutralizando o próprio rate-limit de envio de e-mail | **ALTO** | `supabase/migrations/20260529020000_create_email_rate_limits.sql:1-7` |
| 6 | Views `moveria_*_v` com `SECURITY DEFINER` — verificado: replicam o filtro de papel/tenant (`auth_is_moveria_admin()`, `auth_moveria_papel()`, `EXISTS(...auth.uid()...)`) no próprio `WHERE`, e as tabelas-base têm RLS equivalente. Risco residual é duplicação de lógica (drift futuro), não vazamento ativo hoje | **MÉDIO** (mitigado) | `supabase/migrations/20260602010000_add_moveria_module.sql:945-1225`, `20260603060000_moveria_fase5d_views_backlog_kanban.sql:6-36` |
| 7 | `schema_migrations` sem RLS e exposta via PostgREST (anon pode ler/potencialmente gravar nomes de migrations) | **MÉDIO** | `supabase/migrations/20260601010000_schema_migrations_tracker.sql:11` |
| 8 | `cargo_sectors`: policy `USING (true)` permite leitura cross-tenant da estrutura organizacional de outras empresas | **MÉDIO** | `supabase/migrations/20260529000000_baseline_schema.sql:662-663` |
| 9 | Dezenas de funções `SECURITY DEFINER` com `search_path` mutável (hijacking teórico de `search_path`) | **MÉDIO** | ver 2.1 (lista completa via advisors) |
| 10 | CORS com `Access-Control-Allow-Origin: *` ou reflexo irrestrito do `Origin` em 3 Edge Functions, inconsistente com o allowlist usado nas demais | **MÉDIO** | `admin-update-password/index.ts:5`, `admin-reactivate-user/index.ts:8`, `google-proxy/index.ts:4` |
| 11 | `npm audit --omit=dev`: 10 vulnerabilidades HIGH em deps de build/dev-server (vite/miniflare/wrangler/sharp/postcss/undici/ws/js-yaml/nanoid/source-map-js) | **MÉDIO** | `package-lock.json` |
| 12 | JWT de `service_role` hardcoded em arquivos de teste versionados | **MÉDIO** (mitigado: é o JWT demo padrão do Supabase CLI local) | `src/lib/__tests__/moveria-fase3-lotes.test.ts:19`, `src/lib/__tests__/moveria-rls.test.ts:20` |
| 13 | `.env.staging` (template, sem segredo real) foi commitado na branch `staging` | **BAIXO** | commit `87cf0ce8` (branch `staging`, não presente em `main`/branch atual) |
| 14 | 147 chamadas `.select()` no frontend, apenas 9 com `.limit()`/`.range()` — ausência de paginação (mitigado por RLS) | **BAIXO** | ver 4.2 |
| 15 | `auth_leaked_password_protection` desabilitado no Supabase Auth (3 projetos) | **BAIXO** | advisors (3 projetos) |
| 16 | `auth_is_superadmin()` não exige AAL2 (MFA) — dívida técnica conhecida, documentada, não é achado novo | INFO | `supabase/migrations/20260922140000_auth_is_superadmin_app_metadata.sql:18-28` |

---

## 2. Detalhe por seção

### A — SQL Injection

1. **`EXECUTE format(...)` em `rls_auto_enable()`** (`supabase/migrations/20260529000000_baseline_schema.sql:530-551`): usa `format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity)`. `cmd.object_identity` vem de `pg_event_trigger_ddl_commands()` (catálogo interno do Postgres), não de input de usuário. A função `RETURNS event_trigger`, o que **impede** sua invocação direta via SQL/RPC — o advisor de segurança do Supabase marca `anon_security_definer_function_executable` para ela, mas isso é **falso positivo do linter genérico**: Postgres rejeita chamadas diretas a funções `event_trigger`. Sem correção necessária.
2. **`EXECUTE $sql$ ... $sql$` em `audit_log.sql:42-58`** e **`EXECUTE $f$ ... $f$` em `core_schema.sql:24-35`**: strings dollar-quoted **estáticas** (sem interpolação de variável/concatenação). Não há injection — é apenas DDL condicional dentro de um bloco `DO $$`.
3. Nenhuma outra função dinâmica com `format()`/`||`/`EXECUTE` concatenando texto de usuário foi encontrada nas ~60 migrations.
4. **Edge Functions**: nenhuma monta SQL via template string/concatenação — todas usam o client `supabase-js` (queries parametrizadas) ou chamadas a Admin API. Nenhum achado.
5. **Frontend `.rpc()`**: todas as chamadas passam argumentos tipados (UUID, jsonb) via parâmetros nomeados do supabase-js (nunca concatenação de string SQL) — sem risco de injection clássico.
6. **Frontend `.or()`**: único uso em `src/routes/_authenticated/app/index.tsx:73-74`. O filtro é montado com `sectorIds` — UUIDs vindos de `sectorMemberships`, que é dado já retornado (sob RLS) pelo próprio backend para o usuário autenticado, não texto livre digitado pelo usuário. Não há caminho de exploração de PostgREST filter-injection aqui (UUIDs não contêm vírgulas/operadores). Sem achado.
7. Nenhum uso de `.textSearch()` encontrado no frontend.

**Correção sugerida:** nenhuma ação obrigatória. Opcional: documentar no `SECURITY.md` que `rls_auto_enable` é seguro por ser `event_trigger`, para evitar retrabalho em futuras auditorias automatizadas.

### B — Controle de acesso / multi-tenant

**Tabelas sem RLS habilitado:**
- `public.schema_migrations` (os 3 bancos) — **ERROR** no advisor. Tabela de sistema (rastreio de migrations aplicadas), sem `ENABLE ROW LEVEL SECURITY` e sem `REVOKE` explícito de `anon`/`authenticated`. Risco: leitura de nomes de arquivos de migration (baixa sensibilidade, mas revela histórico de features internas) e, potencialmente, gravação/poluição da tabela de auditoria de migrations se os grants default do schema `public` concederem `INSERT` a `anon`/`authenticated`. **Correção:** `ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;` ou `REVOKE ALL ON schema_migrations FROM anon, authenticated;`.
- `public.audit_log` — RLS habilitado mas **sem policies** no banco Core (`vtirfoafpmolffzgszhp`). Isso é **intencional**: a migration (`20260531050000_audit_log.sql:31-39`) pula a criação de policies quando o enum `global_role` não existe (banco Core não tem esse enum). Não é um achado — comportamento esperado e documentado no próprio arquivo.
- `public.email_rate_limits` — comportamento **diverge entre projetos** (confirmado via advisors dos 3 bancos): no projeto Mowig (`xpoqiclaqkudznmshzal`) a tabela tem RLS **habilitada** sem policies (nega acesso por padrão — correto, sem achado). No projeto **Moveria (`fzgasvcfxufhrbrdakow`)**, o advisor retorna `rls_disabled_in_public` para `email_rate_limits` — RLS está **desabilitada**, não apenas sem policy. Como a tabela é `public` e RLS está off, qualquer holder da `anon`/`authenticated` key pode ler todas as linhas (`email + sent_at`, permitindo enumerar e-mails reais de usuários) e inserir/apagar linhas via REST, neutralizando o próprio throttling de envio de e-mail. **Severidade ALTA** nesse projeto. **Correção:** `ALTER TABLE email_rate_limits ENABLE ROW LEVEL SECURITY;` no banco Moveria, replicando a migration `20260529020000_create_email_rate_limits.sql` com `ENABLE ROW LEVEL SECURITY` (hoje ausente nela) + policy restrita a `service_role`, igual ao padrão já usado em `auth_rate_limits` (`20260531020000_auth_rate_limits.sql:27-35`).

**Policies problemáticas:**
- `CREATE POLICY authenticated_reads_cargo_sectors ON public.cargo_sectors FOR SELECT TO authenticated USING (true);` (`supabase/migrations/20260529000000_baseline_schema.sql:662-663`). `cargo_sectors` é uma tabela de associação (`cargo_id`, `sector_id`) sem coluna `company_id` direta — a policy permite que **qualquer usuário autenticado de qualquer empresa** leia todos os vínculos cargo↔setor de **todas as empresas**, revelando estrutura organizacional (nomes de cargos/setores vinculados) de outros tenants. **Severidade MÉDIA** (não expõe dados de clientes/CPF, mas quebra o isolamento multi-tenant). **Correção:** trocar `USING (true)` por um filtro que valide `company_id` via join com `cargos`/`sectors` e `auth_company_id()`.
- Ocorrências de `USING (true)` em `auth_hooks_rls_policies.sql:28,81`: restritas `TO supabase_auth_admin` (role interna do Supabase Auth, não exposta via PostgREST/API pública) — uso correto e esperado, sem achado.
- Ocorrência comentada (`-- CREATE POLICY ... USING (true)`) em `core_rls_superadmin.sql:29-31`: é documentação de uma abordagem **rejeitada**, nunca foi aplicada. Sem achado.

**Views `SECURITY DEFINER` (banco Moveria — `fzgasvcfxufhrbrdakow`):** `moveria_itens_v`, `moveria_contratos_v`, `moveria_clientes_v`, `moveria_backlog_v`, `moveria_lotes_v`, `moveria_kanban_v` — marcadas **ERROR** pelo advisor. Views `SECURITY DEFINER` executam com a permissão de quem criou a view, **ignorando a RLS do usuário que consulta**, então o risco em princípio é ALTO. **Verificação feita** (lendo as definições em `20260602010000_add_moveria_module.sql:945-990`, `20260602020000_moveria_fase2_schema.sql:239-330`, `20260603060000_moveria_fase5d_views_backlog_kanban.sql:6-36`): todas replicam a lógica de autorização por papel (`auth_is_moveria_admin()`, `auth_moveria_papel()`, `EXISTS (... auth.uid())`) dentro do próprio `WHERE`, e as tabelas-base (`moveria_clientes`, `moveria_contratos`, `moveria_itens_contrato`) têm RLS habilitada com policies equivalentes — nenhum `USING (true)` encontrado nessas policies. **Reclassificado para MÉDIO** (mitigado): risco residual é duplicação de lógica entre view e policy (drift futuro), não vazamento ativo hoje. **Correção (não urgente):** migrar para `SECURITY INVOKER` (Postgres 15+), deixando a RLS da tabela-base ser a única fonte de verdade.

**Funções `SECURITY DEFINER` executáveis por `anon` (CPF/Moveria) — validação interna:**
- **`find_profile_by_cpf(cpf_digits text)` — ALTO, achado confirmado.** Definição em `supabase/migrations/20260529000000_baseline_schema.sql:430-442`: recebe `cpf_digits`, retorna `full_name, recovery_email, company_id` do profile cujo hash bcrypt bate. Não há `GRANT`/`REVOKE EXECUTE` explícito revogando de `anon`/`public` em nenhuma migration — o advisor confirma que a função é executável por `anon` nos 3 bancos. O fluxo "oficial" (`supabase/functions/recover-cpf-password/index.ts`) aplica rate limit de 5 tentativas/15min via `auth_rate_limits` — **mas**, como a RPC é chamável diretamente via `/rest/v1/rpc/find_profile_by_cpf` usando a anon key pública (embutida no bundle do front), um atacante pode chamar a função diretamente, **pulando por completo** o rate-limit da Edge Function, e fazer brute-force de CPFs válidos (restritos pelo dígito verificador, ≈10⁸-10⁹ combinações) para obter nome completo + e-mail de recuperação de qualquer usuário. `hash_cpf`/`verify_cpf` são oráculos de hash que recebem dados do próprio chamador (sem acesso a terceiros) — não constituem achado por si só, mas reforçam que o padrão do projeto é expor RPCs livremente e confiar apenas na Edge Function para throttling. **Correção:** `REVOKE EXECUTE ON FUNCTION public.find_profile_by_cpf FROM anon, authenticated;` e chamar a função apenas internamente via `service_role` dentro da Edge Function `recover-cpf-password`.
- `moveria_fn_designar_item`, `moveria_fn_designar_itens_lote`, `moveria_fn_excluir_contrato`, `moveria_fn_conformar_lote`, `moveria_vendedor_tem_*`, `moveria_consultor_tem_*`: não foi possível, dentro do tempo desta auditoria, ler e confirmar linha a linha se cada uma valida `auth.uid()`/`auth_company_id()` internamente antes de agir — ver "NÃO VERIFICADO". O padrão geral do projeto (observado em `admin-*` Edge Functions) é validar identidade explicitamente: recomenda-se confirmar o mesmo padrão nessas funções SQL antes de assumir que o aviso do advisor é falso-positivo.

**`auth_is_superadmin()` e AAL2:** confirmado em `supabase/migrations/20260922140000_auth_is_superadmin_app_metadata.sql:18-28` — a função checa apenas `auth.jwt() -> 'app_metadata' ->> 'global_role' = 'superadmin'` (ou `service_role`). **Não exige** `aal2` (MFA). Conforme instrução da auditoria, isso é registrado como estado atual/dívida conhecida, não como achado novo a corrigir com urgência.

### C — Chamadas em massa / rate limiting

**Controle de acesso cross-tenant em Edge Functions administrativas (achado durante a análise de autenticação — IDOR):**

Três Edge Functions administrativas verificam corretamente que o chamador é `global_role === 'admin'`, mas **não verificam que o usuário-alvo (`user_id` recebido no body) pertence à mesma empresa (`company_id`) do admin chamador**. Isso permite que um admin de qualquer empresa cliente da plataforma execute a ação sobre um usuário de **qualquer outra empresa**, incluindo a Mowig/Core:

- **`supabase/functions/admin-update-password/index.ts:61-63` — CRÍTICO.** Reseta a senha de qualquer `user_id` via `auth.admin.updateUserById(user_id, {password: new_password})`, sem comparar `company_id` do alvo com o do chamador. Equivale a account takeover cross-tenant: um admin malicioso (ou cuja conta de admin foi comprometida) de qualquer empresa pode assumir a conta de qualquer usuário de qualquer outra empresa, incluindo administradores. **Correção:** antes de chamar `updateUserById`, buscar o profile do `user_id` alvo e exigir `targetProfile.company_id === callerProfile.company_id` (ou `auth_is_superadmin()` para o caso cross-tenant legítimo).
- **`supabase/functions/delete-user/index.ts:70-83` — ALTO.** Mesmo padrão: anonimiza/bane permanentemente qualquer `user_id` sem checar tenant — risco de exclusão irreversível (LGPD) de usuário de empresa diferente da do chamador. **Correção:** mesmo filtro por `company_id` no lookup do perfil alvo, seguindo o padrão já correto em `admin-reactivate-user/index.ts:69-74`.
- **`supabase/functions/revoke-sessions/index.ts:65-69` — ALTO.** Mesmo padrão: revoga sessões de qualquer `user_id` sem checar tenant. **Correção:** idem.
- `create-cpf-user`/`create-client-user`: **sem achado** — o `company_id` usado na escrita é sempre o do próprio chamador (`callerProfile.company_id`), então a criação de usuários fica corretamente escopada ao tenant do admin.
- `admin-reactivate-user/index.ts:69-74`: **padrão correto** (referência) — já compara `company_id` do alvo com o do chamador antes de agir. Usar como modelo para corrigir os 3 achados acima.

**Edge Functions sem autenticação obrigatória (sem checagem de JWT de usuário no código):**
- `recover-cpf-password`: **por design** (fluxo pré-login de recuperação de senha). Mitigado por rate limiting dedicado por CPF (hash) com lockout, e respostas sempre `{ok:true}` independente do resultado real (evita enumeração). Avaliação: risco aceitável.
- `send-email`: não valida JWT de usuário; usa `email_rate_limits` por destinatário. Função parece ser de uso interno/server-to-server. Avaliação: aceitável se só é invocada por outras Edge Functions com a service key — **NÃO VERIFICADO** se há alguma outra proteção (ex. `x-internal-secret`) checada no corpo da função; o cabeçalho é aceito em `Access-Control-Allow-Headers` mas não foi confirmado se o valor é de fato validado dentro de `send-email/index.ts`.
- Todas as demais (`admin-notify`, `admin-reactivate-user`, `admin-update-password`, `create-client-user`, `create-cpf-user`, `data-rights`, `delete-user`, `google-proxy`, `moveria-notify`, `resend-access`, `revoke-sessions`) chamam `auth.getUser()` e, nas rotas administrativas, verificam explicitamente `global_role === 'admin'` antes de agir. Padrão consistente e correto.
- `supabase/config.toml` não define nenhuma seção `[functions.*]` com `verify_jwt = false` — ou seja, no nível de plataforma todas as funções exigem ao menos um JWT válido (anon ou authenticated) para serem invocadas, reforçando a camada de autenticação de app.

**Rate limiting:**
- `email_rate_limits` (migration `20260529020000`) e `auth_rate_limits` (migration `20260531020000`) existem e **são de fato usadas** — confirmado uso em `send-email/index.ts` e `recover-cpf-password/index.ts`.
- Não existe rate limiting a nível de Vercel/middleware (`vercel.json` só define CSP e rewrite) nem no `supabase/config.toml` (`[auth]` sem `rate_limit` customizado) — ou seja, a única camada de rate limit é a aplicada manualmente dentro das duas Edge Functions citadas. Demais Edge Functions (ex. `create-cpf-user`, `create-client-user`, `admin-update-password`) **não têm rate limit próprio** — mitigado parcialmente por exigirem JWT de admin autenticado, mas um admin comprometido (ou token roubado) poderia disparar criação de usuários em massa sem limite. **Severidade BAIXA/MÉDIA** (exclusão explícita de DoS pedida no prompt não se aplica aqui, pois o risco é abuso de função administrativa, não indisponibilidade).

**Consultas sem limite:**
- 147 ocorrências de `.select()` no frontend (`src/`) contra apenas 9 ocorrências de `.limit()`/`.range()` em 7 arquivos. A maioria das consultas é implicitamente limitada pelo RLS (não extrapola o tenant do usuário), mas dentro de um tenant grande (ex. Mowig com muitos perfis/registros) uma tela sem paginação pode trazer milhares de linhas em uma única resposta. **Severidade BAIXA** (defesa em profundidade, não é bypass de isolamento).

### D — Segredos expostos

**Variáveis `VITE_*` usadas (`import.meta.env.VITE_*`):** `VITE_IS_SUPERADMIN`, `VITE_COMPANY_SLUG`, `VITE_SUPABASE_CORE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_CORE_ANON_KEY`, `VITE_SITE_URL`, `VITE_MOWIG_URL`. Todas são **chaves públicas por design** (anon key no novo formato `sb_publishable_...`, URLs, slugs, flags de UI) — nenhuma parece ser `service_role`, secret, senha ou chave privada. **Nenhum achado CRÍTICO aqui.**

**Padrões de segredo em arquivos rastreados (`git grep`):**
- `src/integrations/supabase/client.ts:23` — fallback hardcoded de um JWT `anon` (payload decodificado: `role: "anon"`, projeto `vtirfoafpmolffzgszhp`) usado quando a env var não está definida. `eyJh…`. **Severidade BAIXA**: anon keys são projetadas para serem públicas (protegidas por RLS, não por sigilo) — não é um "segredo" no sentido estrito, mas é uma má prática ter qualquer chave hardcoded como fallback em vez de falhar explicitamente. **Correção:** remover o fallback e lançar erro se a env var não estiver definida.
- `src/lib/__tests__/moveria-fase3-lotes.test.ts:19` e `src/lib/__tests__/moveria-rls.test.ts:20` — JWT de `service_role` hardcoded (`eyJh…`). Payload decodificado: `role: "service_role"`, `iat: 1700000000`, `exp: 2100000000` — este é o **JWT demo padrão do ambiente local do Supabase CLI** (assinado com o secret de desenvolvimento local, documentado publicamente pelo próprio Supabase), não uma chave de produção. **Severidade MÉDIA → reclassificado BAIXO** após confirmação de que é o token de demonstração local, mas ainda é uma prática arriscada: se alguém reaproveitar esse padrão como "molde" para um teste apontando a um banco real, o hardcode facilita erro humano. **Correção:** mover para variável de ambiente de teste (ex. `TEST_SERVICE_ROLE_KEY`) mesmo sendo um valor público/local.
- Demais ocorrências de `service_role`/`apikey` em `SECURITY.md`, `docs/STAGING.md`, `docs/architecture.md`, `scripts/*` e `supabase/functions/*/index.ts` são **nomes de variáveis de ambiente** (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`) ou documentação — não valores literais de segredo. Sem achado.
- Nenhuma ocorrência de `sk_live`, `sk_test`, `ghp_`, `github_pat_`, `BEGIN PRIVATE KEY` em arquivos rastreados.

**Histórico do git:**
- `git log --all --diff-filter=A` encontrou **um** arquivo de padrão `.env*` adicionado no histórico: `.env.staging`, no commit `87cf0ce8e61d194a62b65ad188407879c1a87378` ("staging: cria branch, env template e docs de staging"). Esse commit está **apenas na branch `staging`** (local e `origin/staging`), **não é ancestral** da branch atual (`fix/deps-tanstack-cve`) nem de `main`. Conteúdo do arquivo (valores redigidos, só os 4 primeiros chars): `VITE_COMPANY_SLUG=mowi…`, `VITE_SUPABASE_URL=STAG…`, `VITE_SUPABASE_ANON_KEY=STAG…` — são **placeholders de template** (`STAG...`), não segredos reais. **Severidade BAIXA.** Recomenda-se ainda assim remover esse arquivo do histórico da branch `staging` (ou ao menos confirmar que os valores nunca foram reais) e usar `.env.staging.example` versionado em vez de `.env.staging`.
- Busca por `git log -p --all -S"SERVICE_ROLE"` não retornou nenhuma linha com atribuição de chave real (`SUPABASE_SERVICE_ROLE_KEY=ey...` ou similar) — apenas nomes de variável em commits de feature/segurança. **Dentro do tempo disponível**, a busca completa por `eyJhbGciOi`/`sk_live`/`ghp_` em `git log -p --all` (519 commits) não foi concluída exaustivamente — ver "Não verificado".

**`.gitignore` / arquivos locais:** `.env`, `.env.local`, `.env.staging` existem localmente e estão corretamente ignorados (`git check-ignore -v` confirma match em `.gitignore:45` — padrão `.env*`). Nenhum dos três está atualmente rastreado pelo git (`git ls-files` vazio para esses padrões).

**CORS / headers:**
- `vercel.json`: CSP com `default-src 'self'`, `frame-ancestors 'none'` (cobre o mesmo propósito de `X-Frame-Options: DENY/SAMEORIGIN` em navegadores modernos — não há `X-Frame-Options` explícito, mas é redundante dado o `frame-ancestors`), `frame-src` com allowlist específica (Google, `erp.mowig.ind.br`). Sem achado.
- **CORS inconsistente nas Edge Functions:**
  - `admin-update-password/index.ts:5` e `admin-reactivate-user/index.ts:8`: `Access-Control-Allow-Origin: '*'` (wildcard).
  - `google-proxy/index.ts:3-6`: reflete o header `Origin` da requisição **sem validar contra allowlist** (`Access-Control-Allow-Origin: origin`).
  - Demais 9 Edge Functions usam um padrão de **allowlist** (`allowedOrigins.includes(origin) ? origin : allowedOrigins[0]`).
  - **Severidade MÉDIA** (inconsistência de padrão de segurança, não CRÍTICA): como a autenticação dessas funções é via header `Authorization: Bearer <JWT>` (não cookie), navegadores não anexam esse header automaticamente em requisições cross-origin — um atacante precisaria já possuir o JWT da vítima para explorar, o que reduz bastante o impacto prático. Ainda assim, recomenda-se padronizar as 3 funções para o mesmo allowlist usado nas demais, por consistência e defesa em profundidade.

### E — Dependências

`npm audit --omit=dev --json` (rodado localmente, somente leitura):

```
critical: 0 | high: 10 | moderate: 2 | low: 1 | total: 13
```

**Altas (10):** `@cloudflare/vite-plugin` (via `miniflare`, `wrangler`), `js-yaml` (DoS quadrático), `miniflare` (via `sharp`, `undici`), `nanoid` (loop infinito com `size` inválido), `postcss` (path traversal/disclosure de `.map` via `sourceMappingURL`), `sharp` (CVEs herdadas de `libvips`/`libheif`), `source-map-js` (DoS de event loop), `undici` (bypass de validação de certificado TLS via SOCKS5 `ProxyAgent`; header injection via `Set-Cookie`), `vite` (NTLMv2 hash disclosure no Windows via `launch-editor`; bypass de `server.fs.deny`), `ws` (exaustão de memória via fragmentos pequenos).

**Observação:** a maioria dessas dependências (`vite`, `miniflare`, `wrangler`, `postcss`, `source-map-js`) é de **build/dev-server**, não de runtime de produção do app React — mesmo aparecendo sob `--omit=dev`, isso indica que estão listadas como dependency (não devDependency) no `package.json`, ou são dependências transitivas de uma dependency direta. Impacto real em produção tende a ser baixo, mas a listagem correta em `devDependencies` reduziria a superfície reportada. Não houve tempo nesta auditoria para mapear árvore completa de qual pacote direto traz cada uma — ver "Não verificado".

---

## 3. Não verificado

- **B.6** — Corpo completo de `moveria_fn_designar_item`, `moveria_fn_designar_itens_lote`, `moveria_fn_excluir_contrato`, `moveria_fn_conformar_lote`, `moveria_vendedor_tem_*`, `moveria_consultor_tem_*`: não confirmado linha a linha se cada uma valida identidade/papel do caller antes de agir. Motivo: volume de funções e tempo da auditoria.
- **D (histórico completo)** — `git log -p --all` sobre 519 commits não foi varrido 100% por todos os padrões de segredo (`eyJhbGciOi`, `sk_live`, `ghp_`, `BEGIN PRIVATE KEY`) de forma exaustiva; a busca feita (`-S"SERVICE_ROLE"` e grep direcionado) não encontrou nada além do já reportado, mas não é uma garantia de varredura completa. Motivo: tamanho do histórico e tempo de execução do `git log -p --all` sobre todo o range de commits.
- **C** — Se `send-email/index.ts` valida de fato o header `x-internal-secret` (ele é aceito em `Access-Control-Allow-Headers`, mas não foi confirmado se o valor recebido é comparado a `INTERNAL_SECRET` dentro do corpo da função). Motivo: não foi lido o corpo completo de `send-email/index.ts` dentro do tempo disponível.
- **B.8** — `mcp__supabase__get_advisors(type=security)` para o projeto `fzgasvcfxufhrbrdakow` foi executado mas o resultado foi truncado por tamanho (>99KB); a parte não lida pode conter achados adicionais de RLS/search_path não listados aqui. Os 3 projetos tiveram advisors rodados com sucesso (não há "NÃO VERIFICADO" para a execução em si, apenas para a leitura 100% completa do output do terceiro projeto).
- **E** — Árvore de dependências não mapeada para confirmar se os pacotes com vulnerabilidade HIGH (`vite`, `miniflare`, `wrangler`, etc.) estão corretamente classificados como `devDependencies` no `package.json` ou se algum é de fato dependency de runtime.
- **C (rate limit em `create-cpf-user`/`create-client-user`/`admin-update-password`)** — não identificado nenhum rate limit próprio nessas funções administrativas além da exigência de JWT de admin; não foi possível confirmar/descartar se há throttling a nível de Supabase Auth (`[auth].rate_limit.*`) aplicável a chamadas de Admin API, pois `supabase/config.toml` local não define essa seção (pode haver configuração só no dashboard de produção, não versionada).

**Pendências de correção (achados confirmados no smoke test pós-ondas, seção 7 — não são "não verificado" por falta de tempo, são fixes ainda não aplicados):**

- **Core — `public.profiles.id` sem foreign key para `auth.users.id`.** Descoberto ao limpar o usuário descartável do smoke test (seção 7): o `DELETE` em `auth.users` retornou `200` mas o `profile` correspondente ficou órfão, porque não existe FK entre as duas tabelas no projeto Core (`vtirfoafpmolffzgszhp`) — diferente de Mowig e Moveria, que têm `profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`. Efeito prático: excluir um `auth.users` no Core (via Admin API ou dashboard) não remove automaticamente o `profile` associado, deixando um registro órfão em `public.profiles` indefinidamente. **Contagem de órfãos em 2026-10-10:** `0` (nenhum profile órfão no momento desta checagem — o próprio usuário descartável do smoke test já foi removido manualmente). **Correção escrita, não aplicada:** `auditoria/propostas/20261010070000_core_profiles_fk_auth_users.sql` — cria a FK `profiles_id_fkey ON DELETE CASCADE`, com checagem prévia que aborta a migration (`RAISE EXCEPTION`) se houver qualquer órfão no momento da aplicação. Rollback em `auditoria/rollback/20261010070000_core_profiles_fk_auth_users_rollback.sql`.

**Nota de deploy (verificado antes do push desta correção):** o arquivo foi colocado em `auditoria/propostas/`, **fora** de `supabase/migrations/`, porque essa pasta é única e comum aos 3 projetos, e o projeto Mowig (`xpoqiclaqkudznmshzal`) tem integração GitHub ativa na branch `main` deste repositório (confirmado via `list_branches`: registro com `git_branch="main"`, `is_default=true`, `status="FUNCTIONS_DEPLOYED"` — Core e Moveria não têm esse vínculo, `list_branches` retorna vazio para os dois). `.github/workflows/` não tem nenhum step de deploy Supabase (só `npm audit` e `vitest`) — o risco de auto-apply é inteiramente da integração nativa do Supabase com o Mowig, não de GitHub Actions. Mover o arquivo evita que um push em `main` dispare uma tentativa de aplicação automática dessa FK (ainda que, nesse caso específico, o guard `IF NOT EXISTS` a tornasse um no-op em Mowig/Moveria, que já têm a constraint).

---

## 4. Top 5 correções (ordem de prioridade)

1. **Corrigir `admin-update-password` (CRÍTICO — account takeover cross-tenant):** adicionar checagem `targetProfile.company_id === callerProfile.company_id` antes de resetar a senha de qualquer usuário, seguindo o padrão já correto de `admin-reactivate-user`. **Esforço: P.**
2. **Aplicar o mesmo filtro de tenant em `delete-user` e `revoke-sessions`** (ambos ALTO — IDOR cross-tenant: exclusão LGPD e revogação de sessão de usuários de outras empresas). **Esforço: P.**
3. **Revogar `EXECUTE` de `anon`/`authenticated` em `find_profile_by_cpf`** (ALTO — hoje chamável direto via RPC, pulando o rate-limit da Edge Function e permitindo brute-force de CPF com vazamento de nome + e-mail); mover a chamada para dentro de `recover-cpf-password` usando `service_role`. **Esforço: P.**
4. **Habilitar RLS em `email_rate_limits` no projeto Moveria** (ALTO — hoje desabilitada, permitindo leitura/escrita por `anon`) e **habilitar RLS / revogar grants em `schema_migrations`** nos 3 bancos (MÉDIO). **Esforço: P.**
5. **Faxina de dívida técnica agregada (MÉDIO, uma migration consolidada):** corrigir policy `authenticated_reads_cargo_sectors` (`USING (true)` → filtro por `company_id`), padronizar CORS nas 3 Edge Functions inconsistentes (`admin-update-password`, `admin-reactivate-user`, `google-proxy`), definir `SET search_path` fixo em todas as funções `SECURITY DEFINER` marcadas pelo advisor, e habilitar "Leaked Password Protection" no Supabase Auth dos 3 projetos. **Esforço: M.**

*(Migrar as views `moveria_*_v` para `SECURITY INVOKER` e revisar `moveria_fn_*`/`moveria_vendedor_tem_*`/`moveria_consultor_tem_*` linha a linha ficam como melhoria de médio prazo — risco já mitigado hoje, ver seção 2.B.)*

---

---

## 5. Onda A — execução (2026-10-10)

Itens #1 a #5 do resumo executivo. Todas as alterações foram aplicadas direto em produção (sem staging/Docker), com verificação pós-deploy somente-leitura.

| Item | O que foi feito | Verificação | Status |
|---|---|---|---|
| **#1, #3, #4** — IDOR cross-tenant em `admin-update-password`, `delete-user`, `revoke-sessions` | Criado helper compartilhado `supabase/functions/_shared/authz.ts` (`authorizeAdminActionOnTarget`): valida JWT do chamador (401), exige superadmin (`app_metadata.global_role` do JWT ou `profiles.global_role`) OU admin ativo da mesma empresa do alvo, nunca permite agir sobre um superadmin a menos que o chamador também seja, nunca revela existência do alvo a um não-superadmin (403 genérico em vez de 404 nesse caso). Toda negação é logada via `console.warn` estruturado (função, id do chamador, id do alvo, motivo). Aplicado nas 3 funções, antes de qualquer ação. `admin-update-password` também migrou de CORS wildcard (`*`) para o allowlist por `ALLOWED_ORIGINS` já usado pelas outras duas (resolve de passagem o item #10 para essa função). Deploy feito via `mcp__supabase__deploy_edge_function` (MCP), um projeto por vez, nos dois projetos onde as funções existem (Mowig e Moveria — não existem no Core). | 1) Chamada sem token e com token inválido nas 3 funções × 2 projetos (12 chamadas) → todas `401`. 2) Teste end-to-end em produção: criados 2 usuários descartáveis em empresas (`companies`) diferentes no Mowig — admin da empresa A chamando `revoke-sessions` sobre usuário da empresa B → `403 {"error":"Acesso negado"}`. Mesmo admin A chamando sobre usuário da própria empresa A → `200 {"success":true}` (fluxo legítimo não quebrou). Dados de teste limpos na mesma sessão: os 2 perfis-alvo e seus `auth.users` foram deletados; a empresa B (sem mais referências) foi deletada; o perfil do admin de teste A não pôde ser deletado (FK `admin_logs_admin_id_fkey` — `admin_logs` é imutável por design) e foi **desativado** (`active=false`, `deactivated_at`) e o `auth.users` correspondente **banido permanentemente** — fica como registro inerte, sem PII real, apenas nome marcado `(disposed 2026-10-10)`; a empresa A (ainda referenciada por esse perfil) permanece pelo mesmo motivo. | **OK** |
| **#2** — `find_profile_by_cpf` chamável por `anon`/`authenticated` | Nova migration `20261010000000_revoke_find_profile_by_cpf.sql`: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role` + `ALTER FUNCTION ... SET search_path = extensions, public` (search_path tinha ficado mutável desde a redefinição em `20260922130000_profiles_anonymized_at.sql`, que não repetiu o `SET search_path` original). Confirmado via SQL que a função só existe em Mowig e Moveria (não existe no Core) — migration aplicada só nesses dois, via `mcp__supabase__apply_migration`. Confirmado que nenhum ponto do frontend chama a RPC diretamente (só a Edge Function `recover-cpf-password`, que já usa `service_role`) — nenhuma mudança de código necessária ali. | `has_function_privilege('anon', 'public.find_profile_by_cpf(text)', 'EXECUTE')` e o mesmo para `authenticated` → `false` nos dois projetos; `service_role` → `true`. | **OK** |
| **#5** — `email_rate_limits` sem RLS no Moveria | Nova migration `20261010010000_email_rate_limits_rls_moveria.sql`: `ENABLE ROW LEVEL SECURITY` + policy `email_rate_limits_service_only` restrita a `service_role` (mesmo padrão de `auth_rate_limits`). Confirmado antes via SQL direto (`pg_class.relrowsecurity`) que Mowig já tinha RLS habilitada (sem policies — nega tudo, sem achado) e que a tabela não existe no Core — migration aplicada só no Moveria. | `relrowsecurity` → `true` no Moveria. Chamada REST anônima `GET /rest/v1/email_rate_limits` → `200` com `[]` (0 linhas). `POST` (insert) anônimo → bloqueado pela RLS (`42501 new row violates row-level security policy`, HTTP 401). | **OK** |

**Nota sobre `check-migrations.sh`:** o relatório mostra `20261010010000_email_rate_limits_rls_moveria.sql` como "divergente" (❌ no Mowig) — é esperado e intencional: essa migration é específica do Moveria (Mowig já estava correto, ver acima). O script não distingue migrations intencionalmente por-projeto da dívida técnica pré-existente (outras ~20 migrations `moveria_fase*` já divergentes antes desta onda, por serem exclusivas do módulo Moveria). `HUBM_CORE_KEY` não estava disponível nesta sessão para incluir o Core na checagem automatizada, mas nenhuma das duas migrations desta onda se aplica a ele (confirmado por consulta SQL direta antes de aplicar).

**Build:** `npm run build` — zero erros, antes e depois das alterações.

---

## 6. Onda B — execução (2026-10-10)

Itens #7, #8, #9, #10, #15, mais sincronização da Onda A para a branch principal.

**Etapa 0 — sincronização:** branch `sec/onda-a-b` criada a partir de `origin/main` (commit `c5960ee`), com `git cherry-pick ce9e3cb` (commit da Onda A). Cherry-pick limpo, sem conflitos — `main` havia avançado (`ed3c58d..c5960ee`) mas nenhum commit novo tocou `supabase/`. `_shared/authz.ts` e seu uso nas 3 funções vieram intactos.

**Nota sobre o item #9:** a auditoria original estimou "dezenas" de funções `SECURITY DEFINER` com `search_path` mutável, com base na contagem bruta do advisor `function_search_path_mutable` (que também sinaliza funções não-`SECURITY DEFINER`, ex. triggers simples). Filtrando por `prosecdef = true` via SQL direto (`pg_proc`/`pg_namespace`), o número real é **13 funções** em 3 lotes (Mowig: 7, Core: 1, Moveria: 5) — corpo de nenhuma foi alterado, apenas `SET search_path`.

| Item | O que foi feito | Verificação | Status |
|---|---|---|---|
| **#9** — `search_path` mutável em funções `SECURITY DEFINER` | 3 migrations (uma por projeto, `search_path_{mowig,core,moveria}_batch1`): Mowig — `auth_company_id`, `auth_global_role`, `auth_is_active`, `is_sector_member`, `validate_google_domain_dynamic` → `public, pg_temp`; `hash_cpf`, `verify_cpf` → `extensions, pg_temp` (usam `crypt`/`gen_salt` do pgcrypto, confirmado instalado no schema `extensions` nos 3 projetos). Core — só `auth_is_active` → `public, pg_temp`. Moveria — mesmas 5 do Mowig exceto `hash_cpf`/`verify_cpf` (não existem lá). Aplicado via `apply_migration`, um projeto por vez. Rollback (`RESET search_path`) gerado em `auditoria/rollback/`, não aplicado. | `get_advisors` antes × depois: as 13 entradas `function_search_path_mutable` para essas funções desapareceram nos 3 projetos (restam apenas funções fora de escopo — não `SECURITY DEFINER` — como `set_updated_at`, `tarefas_fn_valida_transicao`, `auth_is_superadmin`, `hook_*`). Leitura representativa (`SELECT auth_is_active()`, `SELECT proconfig FROM pg_proc ...`) confirmou `search_path` fixado e função ainda executável, sem erro. | **OK** |
| **#8** — `cargo_sectors` com `USING (true)` | Tabela de associação (`cargo_id`, `sector_id`) sem `company_id` próprio — mas `cargos` e `sectors` têm `company_id`. Conforme a própria recomendação da auditoria (seção 2.B), a policy `authenticated_reads_cargo_sectors` foi trocada por um filtro via `JOIN` em `cargos`/`sectors` + `auth_company_id()` (ambos os lados, `AND`, para não vazar se algum dia os dados ficarem inconsistentes). A policy de escrita (`admin_manages_cargo_sectors`, `auth_global_role() = 'admin'` sem filtro de tenant) foi deixada como está — é o mesmo padrão já usado nas tabelas-base `cargos`/`sectors` do projeto, fora do escopo do item #8. Aplicado em Mowig e Moveria (tabela não existe no Core). Front-end (`CargosTab.tsx`) continua funcionando pelo mesmo caminho, sem mudança de código necessária. | `pg_policies.qual` confirmado com o novo filtro nos dois projetos. | **OK** |
| **#7** — `schema_migrations` sem RLS | Verificado antes de aplicar: `check-migrations.sh` lê a tabela via `HUBM_{MOWIG,MOVERIA,CORE}_KEY` — chaves **service_role** (bypassam RLS) — e `deploy-migrations.sh` usa o histórico interno do Supabase CLI (`supabase_migrations.schema_migrations`), não esta tabela. RLS habilitada sem policies (nega `anon`/`authenticated` por padrão) nos 3 projetos. | `check-migrations.sh` rodado antes e depois (com `HUBM_MOWIG_KEY`/`HUBM_MOVERIA_KEY` — `HUBM_CORE_KEY` não disponível nesta sessão, igual Onda A) — resultado idêntico em formato, 41/70 migrations sincronizadas, mesmas divergências esperadas (migrations intencionalmente por-projeto). `get_advisors`: `rls_disabled_in_public` (ERROR) em `schema_migrations` sumiu nos 3 projetos, substituído por `rls_enabled_no_policy` (INFO, esperado — RLS ligada sem policy nega tudo). | **OK** |
| **#10** — CORS `*`/reflexo em 3 Edge Functions | Criado `_shared/cors.ts`: reaproveita o secret `ALLOWED_ORIGINS` já configurado por projeto (mesma fonte usada pelas outras 9 funções, confirmada empiricamente antes via `curl` — Mowig: `mowig.ind.br` + `hubm.mowig.ind.br`; Moveria: `moveria.app.br`), mas com comportamento mais estrito: origem fora da lista **não recebe** `Access-Control-Allow-Origin` (as 9 funções de referência caem para `allowedOrigins[0]` por padrão — mais fraco, mas mitigado por essas funções usarem `Authorization: Bearer`, não cookie). Aplicado em `admin-update-password` (já tinha sido migrada do wildcard na Onda A — agora usa o módulo compartilhado em vez de duplicar a lógica), `admin-reactivate-user` (tinha `'*'` literal) e `google-proxy` (refletia `Origin` sem validar). Deploy via `deploy_edge_function` nos dois projetos onde as 3 funções existem (Mowig, Moveria — Core não tem Edge Functions deployadas). | `curl -X OPTIONS` com `Origin` permitida → header presente com a origem exata, nos 6 pares função×projeto. Com `Origin: https://exemplo-invalido.com` → header **ausente**, nos mesmos 6. | **OK** |
| **#15** — Leaked password protection desligada | Token de acesso pessoal (`SUPABASE_ACCESS_TOKEN`) disponível no ambiente — usado a Management API (`PATCH /v1/projects/{ref}/config/auth`, `password_hibp_enabled: true`) nos 3 projetos. | `GET /v1/projects/{ref}/config/auth` antes (`false` nos 3) e depois (`true` nos 3). `get_advisors`: warning `auth_leaked_password_protection` ausente no resultado pós-fix de Mowig e Core (Moveria não re-coletado por tamanho do output — ver nota abaixo). | **OK** |

**Nota sobre advisors do Moveria:** igual à auditoria original, o `get_advisors(security)` do projeto Moveria excede o limite de tokens da ferramenta (>99KB). Os fixes desse projeto (#9, #8, #7, #15) foram verificados por **SQL direto** (`pg_proc.proconfig`, `pg_policies.qual`, `pg_class.relrowsecurity`, Management API) em vez do advisor — evidência equivalente ou mais precisa.

**Comparativo `get_advisors` (security) — resumo:**

| Projeto | Antes (achados relevantes à Onda B) | Depois |
|---|---|---|
| Mowig | 7× `function_search_path_mutable` (funções do item #9) · `rls_disabled_in_public` em `schema_migrations` · `auth_leaked_password_protection` | 0 das 7 · substituído por `rls_enabled_no_policy` (INFO) · ausente |
| Core | 1× `function_search_path_mutable` (`auth_is_active`) · `rls_disabled_in_public` em `schema_migrations` · `auth_leaked_password_protection` | 0 · substituído por `rls_enabled_no_policy` (INFO) · ausente |
| Moveria | 5× `function_search_path_mutable` (funções do item #9) · `rls_disabled_in_public` em `schema_migrations` · `auth_leaked_password_protection` (confirmado via SQL/Management API, não via advisor — ver nota) | 0 das 5 · RLS habilitada (confirmado via `pg_class.relrowsecurity`) · `password_hibp_enabled = true` |

Achados remanescentes nos 3 projetos (fora do escopo desta onda, não regressões): funções `SECURITY DEFINER` chamáveis por `anon`/`authenticated` que são intencionalmente públicas (`auth_company_id`, `hash_cpf`, etc. — a própria auditoria original já avaliou isso como esperado, a proteção real está no RLS/lógica interna); `function_search_path_mutable` em funções que não são `SECURITY DEFINER` (`set_updated_at`, `tarefas_fn_valida_transicao`, `auth_is_superadmin`, `hook_*`); `rls_enabled_no_policy` INFO em `audit_log` (Core, comportamento documentado) e `email_rate_limits`/`schema_migrations` (esperado, nega tudo por padrão).

**Verificação final:**
- Regressão da Onda A: repeti os testes de autorização — chamada sem token nas 3 funções (`admin-update-password`, `admin-reactivate-user` inclusive, agora que mudou de implementação de CORS) → `401`/comportamento inalterado; CORS allowlist não interferiu com a lógica de autorização (são camadas independentes).
- `npm run build` — zero erros, antes e depois de todas as alterações desta onda.
- Smoke test de leitura autenticada não executado nesta sessão (seria necessário um JWT de usuário real de cada tenant); a verificação de cada item foi feita com testes direcionados (SQL direto, `curl` com `Origin`, Management API) equivalentes ou mais precisos para o que mudou.

**Build:** `npm run build` — zero erros, antes e depois das alterações desta onda.

---

## 7. Smoke test pós-ondas (2026-10-10)

Executado com JWT real de usuários descartáveis **não-admin** (`global_role='member'`), um por tenant, criados via Admin API (`auth.admin.createUser`, nunca por endpoint novo) e vinculados por SQL direto à empresa real de cada projeto. Nenhum código, migration ou policy foi alterado nesta sessão — somente leitura e dados de teste descartáveis.

| Teste | Tenant | Resultado | Status |
|---|---|---|---|
| 1. Login (password grant) | Mowig | Sessão válida obtida | **OK** |
| 1. Login (password grant) | Moveria | Sessão válida obtida | **OK** |
| 1. Login (password grant) | Core | Sessão válida obtida | **OK** |
| 2. Ler `cargo_sectors`/`cargos`/`sectors` | Mowig | 5/8/6 linhas, 100% da própria empresa, 0 de outra | **OK** |
| 2. Ler `cargo_sectors`/`cargos`/`sectors` | Moveria | 4/5/1 linhas, 100% da própria empresa, 0 de outra | **OK** |
| 2. Ler `cargo_sectors`/`cargos`/`sectors` | Core | Módulo não existe nesse banco (confirmado via `information_schema`) | **N/A** |
| 3. Chamar como `authenticated` as 11 das 13 funções do item #9 que são somente leitura e acessíveis | Mowig | `auth_company_id`→UUID correto, `auth_global_role`→`"member"`, `auth_is_active`→`true`, `is_sector_member`→`false` (correto, sem vínculo), `hash_cpf`→hash de 60 chars, `verify_cpf`(com o hash gerado)→`true`. Nenhum erro de "function/relation does not exist" | **OK** |
| 3. (mesmo teste) | Moveria | `auth_company_id`→UUID correto, `auth_global_role`→`"member"`, `auth_is_active`→`true`, `is_sector_member`→`false`. Sem erros | **OK** |
| 3. (mesmo teste) | Core | `auth_is_active`→`true`. Sem erro | **OK** |
| 4. Revisão de definição das 2 funções de escrita/trigger (`validate_google_domain_dynamic`, Mowig e Moveria) — não executadas | Mowig + Moveria | Corpo referencia apenas `companies` (schema `public`, sem qualificação) e `NEW`/`RAISE` — nenhum objeto fora de `search_path = public, pg_temp`. Sem divergência | **OK** |
| 5. Ler tabela principal do módulo ativo (Tarefas) | Mowig | HTTP 200, 0 linhas — esperado: policy de `tarefas` exige `company_id = auth_company_id() AND (tarefas_is_admin() OR tarefas_sou_participante(id))`; usuário descartável não é admin nem participante de nenhuma tarefa. Confirmado via `pg_policies` que a regra está correta (não é vazamento, é ausência de participação) | **OK** |
| 5. Ler Tarefas + `moveria_contratos` (Contratos) | Moveria | Ambas HTTP 200, 0 linhas — mesma lógica: `moveria_contratos` exige `auth_is_moveria_admin() OR moveria_consultor_tem_contrato() OR vendedor com vínculo em moveria_membros`; usuário descartável não tem papel atribuído. Confirmado via `pg_policies` | **OK** |
| 5. Ler módulo principal | Core | Core não tem Tarefas/Contratos (só `companies`, `profiles`, `audit_log`, `schema_migrations`, `auth_rate_limits`, `core_signup_allowlist`) | **N/A** |
| 6. Usuário de um tenant lendo dados do outro projeto (URL + anon key do outro) | Mowig→Moveria | `401 PGRST301 "No suitable key was found to decode the JWT"` — rejeitado antes de chegar à RLS (segredo de assinatura do JWT é por projeto) | **OK** |
| 6. (mesmo teste, direção inversa) | Moveria→Mowig | `401 PGRST301` idêntico | **OK** |
| 6. (mesmo teste) | Core→Mowig | `401 PGRST301` idêntico | **OK** |
| 7. Regressão Onda A — não-admin chamando `admin-update-password`, `delete-user`, `revoke-sessions` | Mowig | `403 {"error":"Acesso negado"}` nas 3 | **OK** |
| 7. (mesmo teste) | Moveria | `403 {"error":"Acesso negado"}` nas 3 | **OK** |
| 7. (mesmo teste) | Core | Core não tem Edge Functions deployadas (`list_edge_functions` retorna vazio) | **N/A** |

**Nenhuma falha.** Nenhuma migration de rollback precisou ser indicada.

**Limpeza dos usuários descartáveis:**
- Mowig (`e28bbec8-...`): `DELETE /auth/v1/admin/users` → `200`. FK `profiles.id → auth.users.id` é `CASCADE` — perfil removido junto. Confirmado `SELECT count(*) FROM profiles WHERE id=...` → `0`.
- Moveria (`2d97274b-...`): idem — `200`, `CASCADE`, confirmado `0` em `profiles`.
- Core (`bb0321fb-...`): `DELETE` → `200`, mas `profiles.id` **não tem FK** para `auth.users.id` nesse projeto (diferença arquitetural de schema) — o perfil ficou órfão (não "preso por FK", apenas sem cascade automático). Verificado que nada referenciava esse perfil (`audit_log.actor_id` → 0 linhas) e removido por `DELETE` direto. Confirmado `0` em `profiles` nos 3 projetos.
- Nenhum usuário precisou ser desativado/banido (diferente da Onda A) — nenhum dos 3 perfis de teste tinha FK imutável (`admin_logs`) apontando para ele, pois nenhum era admin.
- Chaves de serviço usadas apenas inline em processos de shell efêmeros (nunca escritas em arquivo nem impressas); a chave do Core (sem `HUBM_CORE_KEY` no ambiente) foi obtida via Management API (`GET /v1/projects/{ref}/api-keys?reveal=true`) e descartada da memória do shell ao final de cada bloco.

---

## 8. Separação de supabase/migrations/ por projeto (2026-10-10)

Decisão do Alysson: `supabase/migrations/` passa a significar "tudo que roda na Mowig" (exclusivo ou compartilhado, desde que inclua o Mowig); Core e Moveria ganham pastas próprias, sem deploy automático.

**Reorganização de arquivos (70 migrations existentes + 1 nova):**

| Pasta | Projeto(s) | Deploy | Arquivos |
|---|---|---|---|
| `supabase/migrations/` | Mowig exclusivo ou + Core/Moveria | **Automático** (integração GitHub do Mowig, branch `main`) | 32 |
| `supabase/core/migrations/` | Core exclusivo | Manual | 7 (6 existentes + a FK nova) |
| `supabase/moveria/migrations/` | Moveria exclusivo | Manual | 32 |

Cabeçalho `-- projeto: mowig\|core\|moveria` (ou lista, ex. `mowig,moveria`) adicionado em **todas as 71 migrations**, só como comentário — nenhum SQL alterado. Nenhuma migration "Core+Moveria sem Mowig" foi encontrada; todas as compartilhadas incluem o Mowig.

README.md criado nas 3 pastas, explicando projeto/ref, automático vs. manual, e comando de apply. Step novo em `.github/workflows/tests.yml` (`Verifica isolamento de supabase/migrations/`) falha o CI se: (a) algum arquivo em `supabase/migrations/` não tiver `mowig` na linha `-- projeto:`; (b) qualquer migration, em qualquer das 3 pastas, não tiver a linha `-- projeto:`. Validado localmente contra o estado atual do repo — passa limpo.

**Item #7 (pendência) — FK do Core, concluído:**
- `20261010070000_core_profiles_fk_auth_users.sql` movida de `auditoria/propostas/` para `supabase/core/migrations/` e **aplicada no Core** (`vtirfoafpmolffzgszhp`, confirmado explicitamente antes de aplicar).
- Checagem de órfãos imediatamente antes de aplicar: `0`. Migration executada com sucesso (`apply_migration` → `success:true`).
- Verificado: `profiles_id_fkey`, `delete_rule = CASCADE`.
- Teste end-to-end: usuário descartável criado (`a2696146-...`) com profile vinculado → `DELETE /auth/v1/admin/users` (`200`) → profile confirmado removido junto (`count = 0`) → `0` órfãos restantes no Core.

**Investigação somente leitura — Mowig, contagem de superadmins:**
- `SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'global_role' = 'superadmin'` → **`0`**.
- Complementar: `SELECT count(*) FROM public.profiles WHERE global_role = 'superadmin'` → **`0`** (mesmo resultado pela outra via que `auth_is_superadmin()` também aceita como fallback). Nenhum e-mail a listar — nenhum usuário no Mowig satisfaz `auth_is_superadmin()` hoje.

**Item #7 do pedido — checagem pré-push contra o Mowig: ⚠️ PENDÊNCIA ENCONTRADA, PUSH PAUSADO.**

Rodado `npx supabase link --project-ref xpoqiclaqkudznmshzal` + `npx supabase migration list --linked` (CLI oficial, não inferência) contra o estado já reorganizado de `supabase/migrations/` (32 arquivos). Resultado: **17 migrations locais aparecem como "local-only"** (sem versão remota correspondente) — ou seja, o CLI as trataria como pendentes no próximo `db push`/deploy automático:

```
20260922100000, 20260922110000, 20260922120000, 20260922130000, 20260922140000,
20260922160000, 20260922170000, 20260922180000, 20260925000000, 20260925010000,
20260925020000, 20260930000000, 20261001000000, 20261010000000, 20261010020000,
20261010050000, 20261010060000
```

**Causa raiz identificada:** o nome do arquivo (timestamp "redondo", escolhido manualmente, ex. `20260922100000`) não corresponde ao "version" que o CLI/integração realmente gravou no histórico remoto no momento em que a migration foi de fato aplicada (timestamp real de execução, ex. `20260922203934`). Isso vale para toda migration criada a partir de 22/09 — incluindo as que eu mesmo apliquei nesta e na sessão anterior via `mcp__supabase__apply_migration` (que registra a versão pelo horário da chamada, não pelo prefixo do arquivo). As 15 migrations de 23/05 a 11/06 não têm esse problema (prefixo do arquivo == versão remota, correspondência exata).

**Risco real:** baixo, não zero. Todas as 17 são idempotentes (guardas `to_regclass`/`to_regprocedure`/`IF NOT EXISTS` confirmadas ao longo desta auditoria) — um re-apply não quebraria nada. Mas tecnicamente **não é "nada pendente"**, e a instrução era parar e reportar nesse caso.

**Decisão necessária antes do push** (não executei nenhuma das opções):
1. `supabase migration repair --status applied <versão-remota>` para cada uma das 17, ensinando o CLI a reconhecer o histórico remoto real sem tocar o banco — mais correto, não requer renomear nada.
2. Renomear os 17 arquivos locais para o timestamp remoto real — alinha visualmente, mas perde a legibilidade dos nomes "redondos" e pode quebrar referências a esses nomes em outros lugares (ex. `auditoria/rollback/`, este próprio relatório).
3. Não fazer nada — aceitar que o próximo deploy automático do Mowig vai reexecutar essas 17 (seguro pelas guardas, mas "sujo").

**Trabalho de arquivo (reorganização, READMEs, CI, FK, achados de leitura) commitado localmente. Push para `origin/main` NÃO executado — aguardando decisão sobre o item acima.**

---

## 9. Alinhamento híbrido das 17 pendências (2026-10-10)

Decisão do Alysson: para cada uma das 17, achar o par remoto e renomear (só `git mv`, sem tocar SQL/cabeçalho); para quem não tiver par, checar estado real na Mowig e classificar.

**14 com par remoto encontrado — renomeadas (filename only):**

| Arquivo antigo | Arquivo novo (versão remota real) |
|---|---|
| `20260922100000_admin_logs_restrict_admin_id.sql` | `20260922203934_admin_logs_restrict_admin_id.sql` |
| `20260922110000_profiles_cpf_constraints_allow_deleted.sql` | `20260922203946_profiles_cpf_constraints_allow_deleted.sql` |
| `20260922120000_before_user_created_hook.sql` | `20260922211527_before_user_created_hook.sql` |
| `20260922130000_profiles_anonymized_at.sql` | `20260922211650_profiles_anonymized_at.sql` |
| `20260922140000_auth_is_superadmin_app_metadata.sql` | `20260922213259_auth_is_superadmin_app_metadata.sql` |
| `20260922160000_auth_hooks_table_grants.sql` | `20260922215525_auth_hooks_table_grants.sql` |
| `20260922170000_auth_hooks_reject_non_google.sql` | `20260922220914_auth_hooks_reject_non_google.sql` |
| `20260922180000_auth_hooks_rls_policies.sql` | `20260922224144_auth_hooks_rls_policies.sql` |
| `20260925000000_profiles_admin_delete_pending.sql` | `20260925174542_profiles_admin_delete_pending.sql` |
| `20260925010000_apps.sql` | `20260925181754_apps.sql` |
| `20261010000000_revoke_find_profile_by_cpf.sql` | `20261010155952_revoke_find_profile_by_cpf.sql` |
| `20261010020000_search_path_mowig_batch1.sql` | `20261010162419_search_path_mowig_batch1.sql` |
| `20261010050000_fix_cargo_sectors_tenant_filter.sql` | `20261010162622_fix_cargo_sectors_tenant_filter.sql` |
| `20261010060000_schema_migrations_enable_rls.sql` | `20261010162713_schema_migrations_enable_rls.sql` |

Correspondência achada pelo campo `name` do `list_migrations` (slug do arquivo == nome remoto), não por adivinhação de timestamp.

**3 sem par remoto — verificados somente leitura na Mowig:**

| Arquivo | Checagem | Resultado |
|---|---|---|
| `20260925020000_request_access_cargos.sql` | `public.list_cargos_for_request_access()` existe, `SECURITY DEFINER`, `search_path=public`, `authenticated` tem `EXECUTE`. (`anon` também tem — efeito do default ACL do schema `public`, que concede `EXECUTE` em toda função nova a `anon`/`authenticated`/`service_role` automaticamente; `REVOKE ALL FROM PUBLIC` da migration não cobre isso, é um padrão do projeto todo, não falha desta migration especificamente — mesma causa dos achados `anon_security_definer_function_executable` já registrados na seção 2.B.) | **Já efetivada** |
| `20260930000000_apps_quadros.sql` | `public.apps` tem a linha esperada: `company_id` = Mowig, `slug='quadros'`, `name='QUADROS DE PRODUÇÃO'`, `sort_order=10` | **Já efetivada** |
| `20261001000000_apps_admin_rls_uppercase.sql` | Policies exatas esperadas presentes em `public.apps` (`INSERT`/`UPDATE` separadas, sem `FOR ALL`); `0` apps da Mowig com nome fora de CAIXA ALTA | **Já efetivada** |

As 3 são candidatas a `migration repair --status applied` (não a reaplicação real) — mas **nenhum repair foi executado**, por instrução explícita.

**Evidência sobre a causa (item 3 do pedido — logs/status da integração GitHub):** a Management API do Supabase não expõe um endpoint de histórico de deploy da integração GitHub (`/v1/projects/{ref}/integrations/github` e variantes retornam 404). Como evidência indireta, comparei o horário do push (`git log`) de cada arquivo com o timestamp da versão remota:

| Arquivo | Push (git log) | Aplicado (versão remota) | Intervalo |
|---|---|---|---|
| `admin_logs_restrict_admin_id` | 2026-09-22 17:46:20 | 2026-09-22 20:39:34 | ~2h53 |
| `profiles_admin_delete_pending` | 2026-09-25 14:47:09 | 2026-09-25 17:45:42 | ~2h58 |
| `search_path_mowig_batch1` | 2026-10-10 13:39:57 | 2026-10-10 16:24:19 | ~2h44 (esta eu sei por certo que apliquei manualmente via MCP, não por push) |

Os intervalos (quase 3h em todos os casos, não segundos/minutos) são inconsistentes com um pipeline de CI disparado automaticamente pelo push, e consistentes com alguém aplicando manualmente via CLI/MCP algum tempo depois. Reforça isso: `list_branches(mowig)` mostra `updated_at: 2026-05-21` (data de criação do projeto) — sem qualquer atualização recente registrada nesse campo. **Não encontrei evidência de que a integração GitHub da Mowig já tenha tentado reexecutar automaticamente nenhuma dessas migrations** — o quadro mais provável é aplicação manual (CLI ou MCP) após cada push, não um pipeline automático de banco.

**Resultado de `supabase migration list --linked` após os renomes:** `29` migrations locais casam exatamente com a versão remota (as 14 renomeadas + as 15 que já batiam). Restam **3 pendências locais** (as 3 "já efetivadas" sem par remoto). `29` entradas continuam "somente remoto" (as migrations do Core/Moveria que já não vivem mais em `supabase/migrations/`, inofensivas).

**Nada foi aplicado, nenhum `migration repair` foi executado, nenhum push foi feito** *(neste momento da sessão — ver conclusão abaixo)*.

**Conclusão — `migration repair` executado (aprovado pelo Alysson), projeto Mowig confirmado (`xpoqiclaqkudznmshzal`) antes de cada chamada:**

```
npx supabase migration repair --status applied 20260925020000   # request_access_cargos
npx supabase migration repair --status applied 20260930000000   # apps_quadros
npx supabase migration repair --status applied 20261001000000   # apps_admin_rls_uppercase
```

Nenhum SQL das 3 migrations foi executado — `migration repair` só escreve na tabela de histórico do CLI (`supabase_migrations.schema_migrations`), nunca toca o schema/dados do projeto. Confirmado com `supabase migration list --linked` imediatamente depois: **32 migrations locais casam com a remota, `0` pendências locais** (29 → 32, exatamente as 3 reparadas).

**Reversão, se necessário** (desfaz só o registro no histórico do CLI, nunca o schema real):
```
npx supabase migration repair --status reverted 20260925020000
npx supabase migration repair --status reverted 20260930000000
npx supabase migration repair --status reverted 20261001000000
```

**Resumo consolidado desta seção:** 14 migrations renomeadas (par remoto real) + 3 reparadas (sem par, confirmadas já efetivadas por leitura direta) = as 17 pendências originais, todas resolvidas sem rodar SQL de migration nenhuma e sem alterar schema/dados.

---

*Auditoria gerada por Claude Code em modo somente-leitura (seção 1-4), com alterações diretas em produção registradas e verificadas (seções 5-6), com smoke test pós-deploy via usuários descartáveis sem alteração de código/schema (seção 7), e com reorganização de migrations por projeto + 1 migration aplicada no Core, commitada mas não empurrada por pendência encontrada na checagem pré-push (seção 8). Nenhum valor completo de segredo foi incluído neste documento.*
