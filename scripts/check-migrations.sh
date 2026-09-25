#!/usr/bin/env bash
# check-migrations.sh — Compara migrations do repositório com o estado de cada banco Supabase
#
# Requer (service role keys do Supabase Dashboard → Project Settings → API):
#   HUBM_MOWIG_KEY    — projeto mowig   (xpoqiclaqkudznmshzal)
#   HUBM_MOVERIA_KEY  — projeto moveria (fzgasvcfxufhrbrdakow)
#   HUBM_CORE_KEY     — projeto core    (vtirfoafpmolffzgszhp)
#
# Uso:
#   export HUBM_MOWIG_KEY=<service_role_key>
#   export HUBM_MOVERIA_KEY=<service_role_key>
#   export HUBM_CORE_KEY=<service_role_key>
#   ./scripts/check-migrations.sh

set -euo pipefail

# ─── Cores ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Configuração dos projetos ─────────────────────────────────────────────────
MOWIG_URL="https://xpoqiclaqkudznmshzal.supabase.co"
MOVERIA_URL="https://fzgasvcfxufhrbrdakow.supabase.co"
CORE_URL="https://vtirfoafpmolffzgszhp.supabase.co"

MOWIG_KEY="${HUBM_MOWIG_KEY:-}"
MOVERIA_KEY="${HUBM_MOVERIA_KEY:-}"
CORE_KEY="${HUBM_CORE_KEY:-}"

# ─── Validação de variáveis ────────────────────────────────────────────────────
# Banco sem key definida é pulado (aviso), não aborta o script — só falha se
# nenhuma das três estiver disponível.
MOWIG_ENABLED=0;   [[ -n "$MOWIG_KEY" ]]   && MOWIG_ENABLED=1   || echo -e "${YELLOW}Aviso:${RESET} HUBM_MOWIG_KEY não definida — pulando mowig"
MOVERIA_ENABLED=0; [[ -n "$MOVERIA_KEY" ]] && MOVERIA_ENABLED=1 || echo -e "${YELLOW}Aviso:${RESET} HUBM_MOVERIA_KEY não definida — pulando moveria"
CORE_ENABLED=0;    [[ -n "$CORE_KEY" ]]    && CORE_ENABLED=1    || echo -e "${YELLOW}Aviso:${RESET} HUBM_CORE_KEY não definida — pulando core"
if [[ $((MOWIG_ENABLED + MOVERIA_ENABLED + CORE_ENABLED)) -eq 0 ]]; then
  echo ""
  echo -e "${RED}Erro:${RESET} nenhuma key definida (HUBM_MOWIG_KEY / HUBM_MOVERIA_KEY / HUBM_CORE_KEY)."
  echo "  Obtenha em: Supabase Dashboard → Project Settings → API → service_role"
  echo ""
  exit 1
fi

# ─── Caminhos ─────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo -e "${RED}Erro:${RESET} diretório não encontrado: $MIGRATIONS_DIR"
  exit 1
fi

# ─── Migrations locais (ordem alfabética) ─────────────────────────────────────
mapfile -t LOCAL_FILES < <(
  find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -printf '%f\n' 2>/dev/null \
  || find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" | xargs -I{} basename {} \
  | sort
)
# Garante ordenação mesmo sem -printf (macOS/BSD)
IFS=$'\n' LOCAL_FILES=($(printf '%s\n' "${LOCAL_FILES[@]}" | sort)); unset IFS

TOTAL=${#LOCAL_FILES[@]}

if [[ $TOTAL -eq 0 ]]; then
  echo "Nenhuma migration encontrada em $MIGRATIONS_DIR"
  exit 0
fi

# ─── Busca migrations aplicadas em um banco via REST ──────────────────────────
fetch_applied() {
  local url="$1" key="$2"
  curl -sf \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    "$url/rest/v1/schema_migrations?select=filename&order=filename.asc" \
    | grep -oP '(?<="filename":")[^"]*' || true
}

# ─── Consulta os 3 bancos ─────────────────────────────────────────────────────
echo ""
echo -e "${DIM}Consultando bancos...${RESET}"

MOWIG_APPLIED="";   [[ $MOWIG_ENABLED   -eq 1 ]] && MOWIG_APPLIED=$(fetch_applied   "$MOWIG_URL"   "$MOWIG_KEY")
MOVERIA_APPLIED=""; [[ $MOVERIA_ENABLED -eq 1 ]] && MOVERIA_APPLIED=$(fetch_applied "$MOVERIA_URL" "$MOVERIA_KEY")
CORE_APPLIED="";    [[ $CORE_ENABLED    -eq 1 ]] && CORE_APPLIED=$(fetch_applied    "$CORE_URL"    "$CORE_KEY")

# Função: verifica se filename está na lista aplicada; "⏭️" quando o banco foi pulado
is_applied() {
  local filename="$1" applied_list="$2" bank_enabled="$3"
  [[ "$bank_enabled" -eq 0 ]] && { echo "⏭️"; return; }
  echo "$applied_list" | grep -qx "$filename" && echo "✅" || echo "❌"
}

# ─── Cabeçalho ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  HubM — Estado das Migrations${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo ""

# Largura da coluna de nome (trunca em 42 chars)
NAME_W=42
printf "${BOLD}  %-${NAME_W}s  %-8s %-9s %s${RESET}\n" "Migration" "mowig" "moveria" "core"
printf "  %s  %s %s %s\n" \
  "$(printf '%.0s─' $(seq 1 $NAME_W))" \
  "────────" "─────────" "────"

# ─── Relatório por migration ──────────────────────────────────────────────────
all_synced=0
divergent=()

for filename in "${LOCAL_FILES[@]}"; do
  m=$(is_applied "$filename" "$MOWIG_APPLIED"   "$MOWIG_ENABLED")
  v=$(is_applied "$filename" "$MOVERIA_APPLIED" "$MOVERIA_ENABLED")
  c=$(is_applied "$filename" "$CORE_APPLIED"    "$CORE_ENABLED")

  # Trunca nome longo
  display="${filename:0:$NAME_W}"
  [[ ${#filename} -gt $NAME_W ]] && display="${filename:0:$(( NAME_W - 2 ))}.."

  printf "  %-${NAME_W}s  %-8s %-9s %s\n" "$display" "$m" "$v" "$c"

  if [[ "$m" == "❌" || "$v" == "❌" || "$c" == "❌" ]]; then
    divergent+=("$filename")
    all_synced=1
  fi
done

# ─── Resumo ───────────────────────────────────────────────────────────────────
echo ""
echo -e "  $(printf '%.0s─' $(seq 1 70))"
echo ""

if [[ $((MOWIG_ENABLED + MOVERIA_ENABLED + CORE_ENABLED)) -lt 3 ]]; then
  echo -e "  ${YELLOW}Nota:${RESET} banco(s) pulado(s) por falta de key não entram na checagem acima (⏭️)."
  echo ""
fi

if [[ $all_synced -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✅  $TOTAL/$TOTAL migrations aplicadas em todos os bancos verificados.${RESET}"
else
  applied_all=$(( TOTAL - ${#divergent[@]} ))
  echo -e "  ${YELLOW}${BOLD}⚠️   $applied_all/$TOTAL migrations aplicadas em todos os bancos.${RESET}"
  echo ""
  echo -e "  ${BOLD}Divergências:${RESET}"
  for d in "${divergent[@]}"; do
    echo -e "    ${RED}→${RESET}  $d"
  done
fi

echo ""
