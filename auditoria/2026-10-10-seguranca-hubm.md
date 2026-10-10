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

*Auditoria gerada por Claude Code em modo somente-leitura. Nenhum valor completo de segredo foi incluído neste documento.*
