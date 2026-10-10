# supabase/moveria/migrations/ — Moveria

Projeto: **hubm-moveria** (`fzgasvcfxufhrbrdakow`).

Esta pasta **não tem deploy automático** — o projeto Moveria não está
conectado a nenhuma integração GitHub (confirmado via `list_branches`,
retorna vazio). Nada aqui é aplicado por um push em `main`.

Contém apenas migrations exclusivas do Moveria (`-- projeto: moveria`). Se
uma migration afetar Moveria **e** o Mowig, ela não vai aqui — vai em
`supabase/migrations/` com o cabeçalho `-- projeto: mowig,moveria` (ou
`-- projeto: mowig,core,moveria`).

## Como aplicar (manual)
Uma das duas formas, uma migration por vez:

1. **MCP**: `mcp__supabase__apply_migration` com
   `project_id = "fzgasvcfxufhrbrdakow"` e o conteúdo do arquivo.
2. **CLI**: `./scripts/deploy-migrations.sh fzgasvcfxufhrbrdakow` (requer
   `SUPABASE_ACCESS_TOKEN`) — mesma observação do README do Core sobre o
   `MIGRATIONS_DIR` padrão do script.

Depois de aplicar, confirme com
`mcp__supabase__get_advisors(project_id="fzgasvcfxufhrbrdakow", type="security")`
e, se a migration tiver uma seção `VERIFICAÇÃO`, rode a query sugerida.
