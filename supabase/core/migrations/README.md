# supabase/core/migrations/ — Core

Projeto: **hubm-plataforma / Core** (`vtirfoafpmolffzgszhp`).

Esta pasta **não tem deploy automático** — o projeto Core não está
conectado a nenhuma integração GitHub (confirmado via `list_branches`,
retorna vazio). Nada aqui é aplicado por um push em `main`.

Contém apenas migrations exclusivas do Core (`-- projeto: core`). Se uma
migration afetar Core **e** outro projeto, ela não vai aqui — vai em
`supabase/migrations/` (se incluir o Mowig) com o cabeçalho listando todos
os projetos, por ex. `-- projeto: mowig,core,moveria`.

## Como aplicar (manual)
Uma das duas formas, uma migration por vez:

1. **MCP**: `mcp__supabase__apply_migration` com
   `project_id = "vtirfoafpmolffzgszhp"` e o conteúdo do arquivo.
2. **CLI**: `./scripts/deploy-migrations.sh vtirfoafpmolffzgszhp` (requer
   `SUPABASE_ACCESS_TOKEN`) — mas note que esse script aponta para
   `supabase/migrations/` por padrão; para usar com esta pasta, ajuste o
   `MIGRATIONS_DIR` do script ou copie o arquivo temporariamente.

Depois de aplicar, confirme com
`mcp__supabase__get_advisors(project_id="vtirfoafpmolffzgszhp", type="security")`
e, se a migration tiver uma seção `VERIFICAÇÃO`, rode a query sugerida.
