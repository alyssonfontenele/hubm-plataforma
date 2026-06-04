import { useState, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LayoutList, LayoutGrid, Plus, FileText, User } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ContratoPanel } from "@/components/moveria/contrato-panel";
import { EtapaBadge, SubEstadoBadge, AtrasoBadge } from "@/components/moveria/status-badge";
import { formatCodigoCliente } from "@/lib/moveria";

// ─── Route ────────────────────────────────────────────────────────────────────
const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/contratos/")({
  ssr: false,
  validateSearch: searchSchema,
  component: ContratosWorkspace,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type KanbanCard = {
  tipo_card: "contrato" | "lote";
  etapa: string;
  contrato_id: string;
  contrato_numero: string;
  cliente_nome: string;
  cliente_codigo: string | null;
  lote_id: string | null;
  lote_numero: string | null;
  consultor_id: string | null;
  consultor_nome: string | null;
  status: string | null;
  conformado_em: string | null;
  tem_ressalva: boolean;
  qtd_itens: number;
  qtd_ambientes_sem_lote: number;
  sub_estado: "designado" | "em_rodadas" | null;
  data_prevista_max: string | null;
  tem_atraso: boolean;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  data_contrato: string | null;
  valor_total_declarado: number | null;
};

type ContratoListRow = {
  contrato_id: string;
  contrato_numero: string;
  cliente_nome: string;
  cliente_codigo: string | null;
  etapa_principal: string;
  etapas_extras_count: number;
  etapa_tooltip: string;
  qtd_ambientes: number;
  consultor_nome: string | null;
  vendedor_nome: string | null;
  valor_total_declarado: number | null;
  data_contrato: string | null;
  data_prevista_max: string | null;
};

type ViewMode = "lista" | "kanban";

const KANBAN_COLUNAS = [
  { etapa: "backlog",                        label: "Backlog" },
  { etapa: "aguardando_medicao",             label: "Aguardando Medição" },
  { etapa: "medido",                         label: "Medido" },
  { etapa: "apresentacao_tecnica",           label: "Apresentação" },
  { etapa: "em_aprovacao",                   label: "Em Aprovação" },
  { etapa: "aprovado",                       label: "Aprovado" },
  { etapa: "pedidos_fornecedores",           label: "Ped. Fornec." },
  { etapa: "documentacao_tecnica_completa",  label: "Doc. Técnica" },
];

const ETAPA_PRIORITY: Record<string, number> = Object.fromEntries(
  KANBAN_COLUNAS.map((c, i) => [c.etapa, i + 1])
);
const ETAPA_LABEL: Record<string, string> = Object.fromEntries(
  KANBAN_COLUNAS.map((c) => [c.etapa, c.label])
);

const PLANILHA_COLS = "80px minmax(0,2fr) 110px 140px 48px minmax(0,1fr) minmax(0,1fr) 100px 96px 100px";

function buildListRows(cards: KanbanCard[]): ContratoListRow[] {
  const byContrato = new Map<string, KanbanCard[]>();
  for (const c of cards) {
    const arr = byContrato.get(c.contrato_id) ?? [];
    arr.push(c);
    byContrato.set(c.contrato_id, arr);
  }

  return Array.from(byContrato.values()).map((group) => {
    // Etapa mais avançada
    let maxPriority = 0;
    let etapaPrincipal = group[0].etapa;
    for (const c of group) {
      const p = ETAPA_PRIORITY[c.etapa] ?? 0;
      if (p > maxPriority) { maxPriority = p; etapaPrincipal = c.etapa; }
    }

    // Etapas distintas anteriores à principal
    const distinctEtapas = [...new Set(group.map((c) => c.etapa))];
    const etapasExtras = distinctEtapas.filter((e) => (ETAPA_PRIORITY[e] ?? 0) < maxPriority);

    // Tooltip: distribuição de ambientes/itens por etapa
    const etapaCount: Record<string, number> = {};
    for (const c of group) {
      const n = c.tipo_card === "contrato"
        ? (c.qtd_ambientes_sem_lote ?? 0)
        : (c.qtd_itens ?? 0);
      etapaCount[c.etapa] = (etapaCount[c.etapa] ?? 0) + n;
    }
    const tooltipParts = Object.entries(etapaCount)
      .sort(([a], [b]) => (ETAPA_PRIORITY[a] ?? 0) - (ETAPA_PRIORITY[b] ?? 0))
      .map(([etapa, n]) => `${n} ${ETAPA_LABEL[etapa] ?? etapa}`);

    // Total de ambientes (sem lote + em lotes)
    const qtdSemLote = group.find((c) => c.tipo_card === "contrato")?.qtd_ambientes_sem_lote ?? 0;
    const qtdEmLotes = group
      .filter((c) => c.tipo_card === "lote")
      .reduce((s, c) => s + (c.qtd_itens ?? 0), 0);

    // Consultor: preferir aguardando_medicao, depois qualquer lote com consultor
    const aguardando = group.find((c) => c.etapa === "aguardando_medicao");
    const loteComConsultor = group.find((c) => c.tipo_card === "lote" && c.consultor_nome);
    const consultorNome = aguardando?.consultor_nome ?? loteComConsultor?.consultor_nome ?? null;

    const ref = group[0];
    return {
      contrato_id:           ref.contrato_id,
      contrato_numero:       ref.contrato_numero,
      cliente_nome:          ref.cliente_nome,
      cliente_codigo:        ref.cliente_codigo,
      etapa_principal:       etapaPrincipal,
      etapas_extras_count:   etapasExtras.length,
      etapa_tooltip:         tooltipParts.length > 1 ? tooltipParts.join(" · ") : "",
      qtd_ambientes:         qtdSemLote + qtdEmLotes,
      consultor_nome:        consultorNome,
      vendedor_nome:         ref.vendedor_nome,
      valor_total_declarado: ref.valor_total_declarado,
      data_contrato:         ref.data_contrato,
      data_prevista_max:     aguardando?.data_prevista_max ?? null,
    };
  });
}

function getViewMode(): ViewMode {
  try { return (localStorage.getItem("moveria.viewMode") as ViewMode) ?? "lista"; } catch { return "lista"; }
}
function setViewMode(v: ViewMode) {
  try { localStorage.setItem("moveria.viewMode", v); } catch { /* ignore */ }
}

// ─── Sub-estado compacto ──────────────────────────────────────────────────────
function SubEstadoMini({ sub }: { sub: "designado" | "em_rodadas" }) {
  return sub === "em_rodadas" ? (
    <span className="flex-shrink-0 text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border border-[var(--color-warning)] leading-none">
      rodadas
    </span>
  ) : (
    <span className="flex-shrink-0 text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-info-light)] text-[var(--color-info-text)] border border-[var(--color-info)] leading-none">
      desig.
    </span>
  );
}

// ─── Card de contrato — layout compacto ───────────────────────────────────────
function KanbanContratoCard({
  card, isActive, onClick,
}: { card: KanbanCard; isActive: boolean; onClick: () => void }) {
  const codigo = formatCodigoCliente(card.cliente_codigo);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border transition-all min-w-0 ${
        isActive
          ? "border-foreground bg-accent-light shadow-sm"
          : "border-border bg-surface hover:border-text-muted"
      }`}
    >
      {/* Topo: código · cliente + sub-estado */}
      <div className="flex items-start gap-1 px-2 pt-2 pb-1 min-w-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
            {codigo && (
              <span className="font-mono font-bold text-[11px] text-text-primary flex-shrink-0">{codigo}</span>
            )}
            {codigo && <span className="text-text-muted text-[10px] flex-shrink-0">·</span>}
            <span className="text-[11px] text-text-secondary truncate leading-tight">{card.cliente_nome}</span>
          </div>
          {card.tem_atraso && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-[9px] font-semibold text-[var(--color-danger-text)]">⚠ atrasado</span>
            </div>
          )}
        </div>
        {card.sub_estado && <SubEstadoMini sub={card.sub_estado} />}
      </div>
      {/* Rodapé: consultor + s/lote */}
      {(card.consultor_nome || card.qtd_ambientes_sem_lote > 0) && (
        <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5 border-t border-border/50 min-w-0">
          <User className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
          <span className="text-[10px] text-text-muted truncate flex-1 min-w-0">
            {card.consultor_nome ?? "—"}
          </span>
          {card.qtd_ambientes_sem_lote > 0 && (
            <span className="flex-shrink-0 text-[10px] font-mono text-text-muted">
              {card.qtd_ambientes_sem_lote}s/l
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Card de lote — layout compacto ──────────────────────────────────────────
function KanbanLoteCard({ card, isActive, onClick }: { card: KanbanCard; isActive: boolean; onClick: () => void }) {
  const codigo = formatCodigoCliente(card.cliente_codigo);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border transition-all min-w-0 ${
        isActive
          ? "border-foreground bg-accent-light shadow-sm"
          : "border-border bg-surface hover:border-text-muted"
      }`}
    >
      {/* Topo: código · cliente + ressalva */}
      <div className="flex items-start gap-1 px-2 pt-2 pb-1 min-w-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
            {codigo && (
              <span className="font-mono font-bold text-[11px] text-text-primary flex-shrink-0">{codigo}</span>
            )}
            {codigo && <span className="text-text-muted text-[10px] flex-shrink-0">·</span>}
            <span className="text-[11px] text-text-secondary truncate leading-tight">{card.cliente_nome}</span>
          </div>
        </div>
        {card.tem_ressalva && (
          <span className="flex-shrink-0 text-[10px] text-[var(--color-warning)] font-bold">⚠</span>
        )}
      </div>
      {/* Rodapé: consultor */}
      {card.consultor_nome && (
        <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5 border-t border-border/50 min-w-0">
          <User className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
          <span className="text-[10px] text-text-muted truncate">{card.consultor_nome}</span>
        </div>
      )}
    </button>
  );
}

// ─── Workspace ────────────────────────────────────────────────────────────────
function ContratosWorkspace() {
  const { id: selectedId } = Route.useSearch();
  const navigate = useNavigate();
  const { globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";

  const [viewMode, setViewModeState] = useState<ViewMode>(getViewMode);

  const { data: cards = [], isLoading } = useQuery<KanbanCard[]>({
    queryKey: ["moveria_kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_kanban_v")
        .select("tipo_card, etapa, contrato_id, contrato_numero, cliente_nome, cliente_codigo, lote_id, lote_numero, consultor_id, consultor_nome, status, conformado_em, tem_ressalva, qtd_itens, qtd_ambientes_sem_lote, sub_estado, data_prevista_max, tem_atraso, vendedor_id, vendedor_nome, data_contrato, valor_total_declarado");
      if (error) throw error;
      return (data ?? []) as KanbanCard[];
    },
  });

  const listRows = useMemo(() => buildListRows(cards), [cards]);

  function selectContrato(id: string) {
    if (id === selectedId) {
      navigate({ to: "/contratos", search: {} });
    } else {
      navigate({ to: "/contratos", search: { id } });
    }
  }

  function toggleView(v: ViewMode) {
    setViewModeState(v);
    setViewMode(v);
  }

  // ─── Painel esquerdo — lista ──
  const ListaPanel = useCallback(() => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
        <span className="text-xs text-text-muted font-medium flex-1">
          {viewMode === "lista"
            ? `${listRows.length} contrato${listRows.length !== 1 ? "s" : ""}`
            : `${cards.length} card${cards.length !== 1 ? "s" : ""}`}
        </span>
        {/* Toggle view */}
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <button
            onClick={() => toggleView("lista")}
            className={`p-1 rounded transition-colors ${viewMode === "lista" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"}`}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toggleView("kanban")}
            className={`p-1 rounded transition-colors ${viewMode === "kanban" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
        {isAdmin && (
          <Button size="sm" variant="default" asChild>
            <a href="/contratos/importar" className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Importar
            </a>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <FileText className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary mb-1">Nenhum contrato ainda</p>
          {isAdmin && (
            <p className="text-xs text-text-muted">Use "Importar" para adicionar o primeiro contrato.</p>
          )}
        </div>
      )}

      {/* ── Modo PLANILHA ─────────────────────────────────────────────────── */}
      {!isLoading && viewMode === "lista" && cards.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Header sticky */}
          <div
            className="sticky top-0 grid bg-accent-light px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted z-10 gap-x-2"
            style={{ gridTemplateColumns: PLANILHA_COLS }}
          >
            <div>Cód.</div>
            <div>Nome cliente</div>
            <div>Nº contrato</div>
            <div>Etapa</div>
            <div className="text-right pr-2">Amb.</div>
            <div>Consultor</div>
            <div>Vendedor</div>
            <div className="text-right">Valor</div>
            <div>Fechamento</div>
            <div>Prev. medição</div>
          </div>
          {listRows.map((row) => {
            const isActive = selectedId === row.contrato_id;
            const codigo = formatCodigoCliente(row.cliente_codigo);
            const valorFmt = row.valor_total_declarado != null
              ? `R$ ${row.valor_total_declarado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—";
            const dataFmt = row.data_contrato
              ? new Date(row.data_contrato).toLocaleDateString("pt-BR")
              : "—";
            const prevFmt = row.data_prevista_max
              ? new Date(row.data_prevista_max).toLocaleDateString("pt-BR")
              : "—";
            return (
              <button
                key={row.contrato_id}
                onClick={() => selectContrato(row.contrato_id)}
                className={`w-full text-left grid px-3 py-2.5 border-b border-border items-center transition-colors gap-x-2 ${
                  isActive ? "bg-accent-light" : "bg-surface hover:bg-accent-light/60"
                }`}
                style={{ gridTemplateColumns: PLANILHA_COLS }}
              >
                {/* Código */}
                <div className="font-mono text-xs font-bold text-text-primary truncate min-w-0">
                  {codigo || "—"}
                </div>
                {/* Nome cliente */}
                <div className="text-xs text-text-secondary truncate min-w-0">
                  {row.cliente_nome}
                </div>
                {/* Nº contrato */}
                <div className="font-mono text-xs text-text-primary truncate min-w-0">
                  {row.contrato_numero}
                </div>
                {/* Etapa (+ indicador "+N" e tooltip) */}
                <div
                  className="flex items-center gap-1 min-w-0 overflow-hidden"
                  title={row.etapa_tooltip || undefined}
                >
                  <div className="flex-shrink-0 min-w-0 overflow-hidden">
                    <EtapaBadge etapa={row.etapa_principal} />
                  </div>
                  {row.etapas_extras_count > 0 && (
                    <span className="flex-shrink-0 text-[9px] text-text-muted font-mono leading-none">
                      +{row.etapas_extras_count}
                    </span>
                  )}
                </div>
                {/* Amb. */}
                <div className="font-mono text-xs text-text-muted text-right pr-2">
                  {row.qtd_ambientes > 0 ? row.qtd_ambientes : "—"}
                </div>
                {/* Consultor */}
                <div className="text-xs text-text-secondary truncate min-w-0">
                  {row.consultor_nome || "—"}
                </div>
                {/* Vendedor */}
                <div className="text-xs text-text-secondary truncate min-w-0">
                  {row.vendedor_nome || "—"}
                </div>
                {/* Valor */}
                <div className="text-xs text-text-secondary text-right truncate min-w-0">
                  {valorFmt}
                </div>
                {/* Fechamento */}
                <div className="text-xs text-text-muted truncate min-w-0">
                  {dataFmt}
                </div>
                {/* Prev. medição */}
                <div className="text-xs text-text-muted truncate min-w-0">
                  {prevFmt}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && viewMode === "kanban" && (
        /* Desktop ≥1024px: overflow hidden, 8 cols dividem o espaço (flex-1).
           Mobile <1024px: overflow-x-auto, cada col tem min-w-[150px] (scroll). */
        <div className="flex-1 overflow-x-auto lg:overflow-x-hidden overflow-y-hidden">
          <div className="flex h-full gap-0 min-w-max lg:min-w-0">
            {KANBAN_COLUNAS.map((col) => {
              const colCards = cards.filter((c) => c.etapa === col.etapa);
              return (
                <div
                  key={col.etapa}
                  className="flex flex-col h-full border-r border-border last:border-r-0 min-w-[150px] lg:min-w-0 lg:flex-1"
                >
                  {/* Cabeçalho */}
                  <div className="flex-shrink-0 px-2 py-2 border-b border-border bg-accent-light">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted truncate">{col.label}</p>
                    <p className="text-xs text-text-secondary font-medium">{colCards.length}</p>
                  </div>
                  {/* Cards — sempre renderiza */}
                  <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5">
                    {colCards.length === 0 ? (
                      <div className="text-[10px] text-text-muted text-center py-5 px-1 leading-relaxed">
                        Vazio
                      </div>
                    ) : (
                      colCards.map((c) => {
                        const id = c.contrato_id;
                        const isActive = selectedId === id;
                        return c.tipo_card === "contrato" ? (
                          <KanbanContratoCard
                            key={c.contrato_id}
                            card={c}
                            isActive={isActive}
                            onClick={() => selectContrato(id)}
                          />
                        ) : (
                          <KanbanLoteCard
                            key={c.lote_id}
                            card={c}
                            isActive={isActive}
                            onClick={() => selectContrato(id)}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ), [cards, listRows, isLoading, viewMode, selectedId, isAdmin]);

  return (
    <div className="h-[calc(100vh-4rem)]">
      {selectedId ? (
        <div className="h-full bg-surface overflow-hidden">
          <ContratoPanel
            key={selectedId}
            contratoId={selectedId}
            onClose={() => navigate({ to: "/contratos", search: {} })}
          />
        </div>
      ) : (
        <div className="h-full bg-background">
          <ListaPanel />
        </div>
      )}
    </div>
  );
}
