# supabase/migrations/ — Mowig

Projeto: **hubm-mowig** (`xpoqiclaqkudznmshzal`).

Esta pasta é aplicada **automaticamente** no Mowig via integração GitHub ativa
na branch `main` (confirmado via `list_branches`: registro com
`git_branch="main"`, `is_default=true`). Todo push em `main` que altere
arquivos aqui pode disparar uma tentativa de deploy automático nesse projeto.

Contém:
- Migrations exclusivas do Mowig (`-- projeto: mowig`).
- Migrations compartilhadas que **incluem** o Mowig, mesmo que também
  afetem Core e/ou Moveria (`-- projeto: mowig,moveria` ou
  `-- projeto: mowig,core,moveria`) — cada uma delas também precisa ser
  aplicada manualmente nos outros projetos listados no cabeçalho, nas
  pastas `supabase/core/migrations/` e/ou `supabase/moveria/migrations/`
  (ou, se ainda não existir lá, diretamente via `apply_migration`/CLI
  apontando para o `project_id` correto).

**Nunca** coloque aqui uma migration marcada só `core` ou só `moveria` —
o step `Verifica isolamento de supabase/migrations/` em
`.github/workflows/tests.yml` falha o CI se isso acontecer.

Toda migration nova, nesta pasta ou nas outras duas, deve começar com a
linha `-- projeto: mowig`, `-- projeto: core`, `-- projeto: moveria` ou uma
lista separada por vírgula (ex.: `-- projeto: mowig,moveria`).

## Como aplicar (automático)
Push em `main` — a integração GitHub do Mowig sincroniza esta pasta.

## Antes de confiar no deploy automático
Rode `npx supabase link --project-ref xpoqiclaqkudznmshzal` e
`npx supabase migration list --linked` para confirmar que não há
migration local "pendente" por divergência de timestamp vs. versão
remota (ver `auditoria/2026-10-10-seguranca-hubm.md`, seção 8, para um
caso real desse problema).
