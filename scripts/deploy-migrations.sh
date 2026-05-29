#!/usr/bin/env bash
# deploy-migrations.sh — aplica migrations pendentes em um projeto Supabase remoto
#
# Uso:
#   export SUPABASE_ACCESS_TOKEN=<seu-token>
#   ./scripts/deploy-migrations.sh <project-ref>
#
# Exemplo:
#   ./scripts/deploy-migrations.sh xpoqiclaqkudznmshzal

set -euo pipefail

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "${BLUE}[deploy]${RESET} $*"; }
ok()   { echo -e "${GREEN}[deploy]${RESET} $*"; }
warn() { echo -e "${YELLOW}[deploy]${RESET} ⚠️  $*"; }
err()  { echo -e "${RED}[deploy]${RESET} ❌  $*" >&2; }

# ─── Argumento obrigatório ────────────────────────────────────────────────────
PROJECT_REF="${1:-}"
if [[ -z "$PROJECT_REF" ]]; then
  err "project-ref não informado."
  echo ""
  echo -e "  ${BOLD}Uso:${RESET}     $0 <project-ref>"
  echo -e "  ${BOLD}Exemplo:${RESET} $0 xpoqiclaqkudznmshzal"
  echo ""
  exit 1
fi

# ─── Token ────────────────────────────────────────────────────────────────────
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  err "SUPABASE_ACCESS_TOKEN não está definido."
  echo ""
  echo -e "  Execute antes: ${BOLD}export SUPABASE_ACCESS_TOKEN=<seu-token>${RESET}"
  echo ""
  exit 1
fi

# ─── Caminhos ─────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  err "Diretório não encontrado: $MIGRATIONS_DIR"
  exit 1
fi

# ─── Cabeçalho ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  HubM — Deploy de Migrations${RESET}"
echo -e "${BOLD}  Projeto : ${YELLOW}$PROJECT_REF${RESET}"
echo -e "${BOLD}  Diretório: $MIGRATIONS_DIR${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo ""

# ─── Vincula projeto ──────────────────────────────────────────────────────────
log "Vinculando ao projeto remoto…"
if npx supabase link --project-ref "$PROJECT_REF" 2>/dev/null; then
  ok "Projeto vinculado."
else
  warn "supabase link falhou — assumindo projeto já vinculado e continuando."
fi

# ─── Estado remoto ────────────────────────────────────────────────────────────
echo ""
log "Consultando migrations no banco remoto…"

MIGRATION_OUTPUT=""
APPLIED_REMOTE=""

if MIGRATION_OUTPUT=$(npx supabase migration list --linked 2>&1); then
  # Extrai versões da coluna REMOTE (coluna 2, separada por │)
  # Linhas de dados têm NR>2 (pula cabeçalho + separador)
  APPLIED_REMOTE=$(echo "$MIGRATION_OUTPUT" \
    | awk -F'│' 'NR>2 { gsub(/[[:space:]]/, "", $2); if (length($2)>0) print $2 }')
  ok "Estado remoto obtido."
else
  warn "Não foi possível obter o estado remoto. Todas as migrations serão consideradas pendentes."
fi

# ─── Varredura local ──────────────────────────────────────────────────────────
echo ""
log "Migrations locais em supabase/migrations/:"
echo ""

shopt -s nullglob
SQL_FILES=( "$MIGRATIONS_DIR"/*.sql )
shopt -u nullglob

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  warn "Nenhum arquivo .sql encontrado em $MIGRATIONS_DIR"
  echo ""
  exit 0
fi

# Ordena por nome (ordem cronológica garantida pelo prefixo de timestamp)
IFS=$'\n' SORTED_FILES=($(printf '%s\n' "${SQL_FILES[@]}" | sort))
unset IFS

PENDING_LIST=()
APPLIED_COUNT=0

for filepath in "${SORTED_FILES[@]}"; do
  filename=$(basename "$filepath")
  version="${filename%%_*}"

  if [[ -n "$APPLIED_REMOTE" ]] && echo "$APPLIED_REMOTE" | grep -qx "$version"; then
    echo -e "  ${GREEN}✅${RESET}  $filename"
    APPLIED_COUNT=$(( APPLIED_COUNT + 1 ))
  else
    echo -e "  ${YELLOW}⏳${RESET}  $filename  ${YELLOW}← pendente${RESET}"
    PENDING_LIST+=("$filename")
  fi
done

PENDING_COUNT=${#PENDING_LIST[@]}

echo ""
echo -e "  ─────────────────────────────────────────────────────"
printf   "  ${BOLD}%-12s${RESET} %d\n" "Aplicadas:" "$APPLIED_COUNT"
printf   "  ${BOLD}%-12s${RESET} %d\n" "Pendentes:" "$PENDING_COUNT"
echo -e "  ─────────────────────────────────────────────────────"
echo ""

# ─── Nada a fazer ─────────────────────────────────────────────────────────────
if [[ $PENDING_COUNT -eq 0 ]]; then
  ok "Banco já está atualizado. Nenhuma migration a aplicar."
  echo ""
  exit 0
fi

# ─── Aplica pendentes ─────────────────────────────────────────────────────────
log "Aplicando $PENDING_COUNT migration(s) pendente(s) via db push…"
echo ""

if npx supabase db push --linked; then
  echo ""
  ok "Deploy concluído — $PENDING_COUNT migration(s) aplicada(s):"
  for f in "${PENDING_LIST[@]}"; do
    echo -e "     ${GREEN}→${RESET}  $f"
  done
  echo ""
else
  echo ""
  err "db push falhou. Verifique os erros acima."
  echo ""
  echo -e "  ${BOLD}Dicas:${RESET}"
  echo -e "  • Confirme que SUPABASE_ACCESS_TOKEN é válido."
  echo -e "  • Verifique conflitos de schema no banco remoto."
  echo -e "  • Use o Dashboard para inspecionar o estado atual:"
  echo -e "    https://supabase.com/dashboard/project/$PROJECT_REF"
  echo ""
  exit 1
fi
