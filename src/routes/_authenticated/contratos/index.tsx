import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LoaderCircle, LayoutList, LayoutGrid, Plus, FileText, User,
  ChevronRight, X, Check, ChevronsUpDown, ArrowUp, ArrowDown, Rows2,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ContratoPanel } from "@/components/moveria/contrato-panel";
import { EtapaBadge } from "@/components/moveria/status-badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from "@/components/ui/resizable";
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
  cliente_id: string | null;
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

type SubLinhaSemLote = {
  tipo: "sem_lote";
  etapa: string;
  qtd_ambientes: number;
  sub_estado: "designado" | "em_rodadas" | null;
  data_prevista_max: string | null;
  tem_atraso: boolean;
  consultor_id: string | null;
  consultor_nome: string | null;
};

type SubLinhaLote = {
  tipo: "lote";
  lote_id: string;
  lote_numero: string;
  etapa: string;
  consultor_id: string | null;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
  conformado_em: string | null;
};

type SubLinha = SubLinhaSemLote | SubLinhaLote;

type ContratoMae = {
  contrato_id: string;
  contrato_numero: string;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_codigo: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor_total_declarado: number | null;
  data_contrato: string | null;
  etapa_principal: string;
  etapas_extras_count: number;
  etapa_tooltip: string;
  qtd_ambientes: number;
  data_prevista_max: string | null;
  subLinhas: SubLinha[];
};

type SortField = "prazo_critico" | "data_contrato";
type SortDir   = "asc" | "desc";

type FilterState = {
  etapas:            string[];
  consultor_id:      string | null;
  vendedor_id:       string | null;
  cliente_id:        string | null;
  data_contrato_de:  string | null;
  data_contrato_ate: string | null;
  sort_field:        SortField | null;
  sort_dir:          SortDir;
};

type ViewMode = "lista" | "kanban" | "misto";

// ─── Constants ────────────────────────────────────────────────────────────────
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

// 11 cols: chevron + 10 originais
const PLANILHA_COLS =
  "20px 80px minmax(0,2fr) 110px 140px 48px minmax(0,1fr) minmax(0,1fr) 100px 96px 100px";

const DEFAULT_FILTERS: FilterState = {
  etapas:            [],
  consultor_id:      null,
  vendedor_id:       null,
  cliente_id:        null,
  data_contrato_de:  null,
  data_contrato_ate: null,
  sort_field:        null,
  sort_dir:          "asc",
};

// ─── buildGerencialRows ───────────────────────────────────────────────────────
function buildGerencialRows(cards: KanbanCard[]): ContratoMae[] {
  const byContrato = new Map<string, KanbanCard[]>();
  for (const c of cards) {
    const arr = byContrato.get(c.contrato_id) ?? [];
    arr.push(c);
    byContrato.set(c.contrato_id, arr);
  }

  return Array.from(byContrato.values()).map((group) => {
    // Etapa mais avançada (lógica preservada)
    let maxPriority = 0;
    let etapaPrincipal = group[0].etapa;
    for (const c of group) {
      const p = ETAPA_PRIORITY[c.etapa] ?? 0;
      if (p > maxPriority) { maxPriority = p; etapaPrincipal = c.etapa; }
    }

    const distinctEtapas = [...new Set(group.map((c) => c.etapa))];
    const etapasExtras = distinctEtapas.filter(
      (e) => (ETAPA_PRIORITY[e] ?? 0) < maxPriority
    );

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

    // Totais de ambientes (lógica preservada)
    const qtdSemLote =
      group.find((c) => c.tipo_card === "contrato")?.qtd_ambientes_sem_lote ?? 0;
    const qtdEmLotes = group
      .filter((c) => c.tipo_card === "lote")
      .reduce((s, c) => s + (c.qtd_itens ?? 0), 0);

    // data_prevista_max vem do card aguardando_medicao (sort de prazo crítico)
    const aguardando = group.find((c) => c.etapa === "aguardando_medicao");

    // Sub-linhas
    const subLinhas: SubLinha[] = [];
    const cardContrato = group.find((c) => c.tipo_card === "contrato");
    if (cardContrato) {
      subLinhas.push({
        tipo:              "sem_lote",
        etapa:             cardContrato.etapa,
        qtd_ambientes:     cardContrato.qtd_ambientes_sem_lote ?? 0,
        sub_estado:        cardContrato.sub_estado,
        data_prevista_max: cardContrato.data_prevista_max,
        tem_atraso:        cardContrato.tem_atraso,
        consultor_id:      cardContrato.consultor_id,
        consultor_nome:    cardContrato.consultor_nome,
      });
    }
    for (const c of group.filter((c) => c.tipo_card === "lote")) {
      subLinhas.push({
        tipo:          "lote",
        lote_id:       c.lote_id!,
        lote_numero:   c.lote_numero ?? "",
        etapa:         c.etapa,
        consultor_id:  c.consultor_id,
        consultor_nome: c.consultor_nome,
        qtd_itens:     c.qtd_itens ?? 0,
        tem_ressalva:  c.tem_ressalva,
        conformado_em: c.conformado_em,
      });
    }

    const ref = group[0];
    return {
      contrato_id:           ref.contrato_id,
      contrato_numero:       ref.contrato_numero,
      cliente_id:            ref.cliente_id,
      cliente_nome:          ref.cliente_nome,
      cliente_codigo:        ref.cliente_codigo,
      vendedor_id:           ref.vendedor_id,
      vendedor_nome:         ref.vendedor_nome,
      valor_total_declarado: ref.valor_total_declarado,
      data_contrato:         ref.data_contrato,
      etapa_principal:       etapaPrincipal,
      etapas_extras_count:   etapasExtras.length,
      etapa_tooltip:         tooltipParts.length > 1 ? tooltipParts.join(" · ") : "",
      qtd_ambientes:         qtdSemLote + qtdEmLotes,
      data_prevista_max:     aguardando?.data_prevista_max ?? null,
      subLinhas,
    };
  });
}

// ─── View mode persistence ────────────────────────────────────────────────────
function getViewMode(): ViewMode {
  try { return (localStorage.getItem("moveria.viewMode") as ViewMode) ?? "lista"; }
  catch { return "lista"; }
}
function persistViewMode(v: ViewMode) {
  try { localStorage.setItem("moveria.viewMode", v); } catch { /* ignore */ }
}

// ─── SubEstadoMini ────────────────────────────────────────────────────────────
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

// ─── KanbanContratoCard ───────────────────────────────────────────────────────
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

// ─── KanbanLoteCard ───────────────────────────────────────────────────────────
function KanbanLoteCard({
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
      {card.consultor_nome && (
        <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5 border-t border-border/50 min-w-0">
          <User className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
          <span className="text-[10px] text-text-muted truncate">{card.consultor_nome}</span>
        </div>
      )}
    </button>
  );
}

// ─── SortHeaderBtn ────────────────────────────────────────────────────────────
function SortHeaderBtn({
  field, label, filters, onToggle,
}: {
  field: SortField;
  label: string;
  filters: FilterState;
  onToggle: (f: SortField) => void;
}) {
  const isActive = filters.sort_field === field;
  return (
    <button
      onClick={() => onToggle(field)}
      className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        isActive ? "text-foreground" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {label}
      {isActive && (
        filters.sort_dir === "asc"
          ? <ArrowUp className="w-2.5 h-2.5" />
          : <ArrowDown className="w-2.5 h-2.5" />
      )}
    </button>
  );
}

// ─── SubLinhaRow ──────────────────────────────────────────────────────────────
function SubLinhaRow({ sub, highlight }: { sub: SubLinha; highlight: boolean }) {
  const hlCls = highlight
    ? "border-l-2 border-[var(--color-info)] bg-[var(--color-info-light)]"
    : "border-l-2 border-transparent";

  if (sub.tipo === "sem_lote") {
    const prevFmt = sub.data_prevista_max
      ? new Date(sub.data_prevista_max + "T00:00:00").toLocaleDateString("pt-BR")
      : null;
    return (
      <div className={`flex items-center gap-2.5 pl-6 pr-4 py-1.5 text-[11px] text-text-secondary ${hlCls}`}>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-text-muted bg-surface border border-border rounded px-1.5 py-0.5 flex-shrink-0">
          sem lote
        </span>
        <EtapaBadge etapa={sub.etapa} />
        {sub.sub_estado && <SubEstadoMini sub={sub.sub_estado} />}
        {sub.tem_atraso && (
          <span className="flex-shrink-0 text-[9px] font-semibold text-[var(--color-danger-text)]">
            ⚠ atrasado
          </span>
        )}
        <span className="flex items-center gap-1 min-w-0 truncate">
          <User className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
          <span className="truncate">
            {sub.consultor_nome ?? <span className="italic text-text-muted">sem consultor</span>}
          </span>
        </span>
        <span className="font-mono text-text-muted flex-shrink-0">
          {sub.qtd_ambientes} amb.
        </span>
        {prevFmt && (
          <span className="text-text-muted flex-shrink-0">Prev. {prevFmt}</span>
        )}
      </div>
    );
  }

  // tipo === "lote"
  const conformadoFmt = sub.conformado_em
    ? new Date(sub.conformado_em).toLocaleDateString("pt-BR")
    : null;
  return (
    <div className={`flex items-center gap-2.5 pl-6 pr-4 py-1.5 text-[11px] text-text-secondary ${hlCls}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-text-muted bg-surface border border-border rounded px-1.5 py-0.5 flex-shrink-0">
        {sub.lote_numero || "lote"}
      </span>
      <EtapaBadge etapa={sub.etapa} />
      {sub.tem_ressalva && (
        <span className="text-[var(--color-warning)] font-bold flex-shrink-0" title="Com ressalva">⚠</span>
      )}
      <span className="flex items-center gap-1 min-w-0 truncate">
        <User className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
        <span className="truncate">
          {sub.consultor_nome ?? <span className="italic text-text-muted">sem consultor</span>}
        </span>
      </span>
      <span className="font-mono text-text-muted flex-shrink-0">
        {sub.qtd_itens} amb.
      </span>
      {conformadoFmt && (
        <span className="text-text-muted flex-shrink-0">Conf. {conformadoFmt}</span>
      )}
    </div>
  );
}

// ─── ContratosWorkspace ───────────────────────────────────────────────────────
function ContratosWorkspace() {
  const { id: selectedId } = Route.useSearch();
  const navigate = useNavigate();
  const { globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";

  const [viewMode, setViewModeState] = useState<ViewMode>(getViewMode);
  const [filters, setFilters]        = useState<FilterState>(DEFAULT_FILTERS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [clienteOpen, setClienteOpen] = useState(false);

  const { data: cards = [], isLoading } = useQuery<KanbanCard[]>({
    queryKey: ["moveria_kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_kanban_v")
        .select(
          "tipo_card, etapa, contrato_id, contrato_numero, cliente_nome, cliente_codigo, cliente_id, " +
          "lote_id, lote_numero, consultor_id, consultor_nome, status, conformado_em, tem_ressalva, " +
          "qtd_itens, qtd_ambientes_sem_lote, sub_estado, data_prevista_max, tem_atraso, " +
          "vendedor_id, vendedor_nome, data_contrato, valor_total_declarado"
        );
      if (error) throw error;
      return (data ?? []) as KanbanCard[];
    },
  });

  // ── Dados derivados ───────────────────────────────────────────────────────
  const gerencialRows = useMemo(() => buildGerencialRows(cards), [cards]);

  const consultores = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; nome: string }[] = [];
    for (const c of cards) {
      if (c.consultor_id && !seen.has(c.consultor_id)) {
        seen.add(c.consultor_id);
        result.push({ id: c.consultor_id, nome: c.consultor_nome ?? c.consultor_id });
      }
    }
    return result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cards]);

  const vendedores = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; nome: string }[] = [];
    for (const c of cards) {
      if (c.vendedor_id && !seen.has(c.vendedor_id)) {
        seen.add(c.vendedor_id);
        result.push({ id: c.vendedor_id, nome: c.vendedor_nome ?? c.vendedor_id });
      }
    }
    return result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cards]);

  const clientes = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; nome: string; codigo: string | null }[] = [];
    for (const c of cards) {
      if (c.cliente_id && !seen.has(c.cliente_id)) {
        seen.add(c.cliente_id);
        result.push({ id: c.cliente_id, nome: c.cliente_nome, codigo: c.cliente_codigo });
      }
    }
    return result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cards]);

  const filteredRows = useMemo(() => {
    let rows = gerencialRows;

    // 1. Tags de etapa (OR; [] = sem filtro)
    if (filters.etapas.length > 0)
      rows = rows.filter((r) => filters.etapas.includes(r.etapa_principal));

    // 2. Filtros AND
    if (filters.consultor_id)
      rows = rows.filter((r) =>
        r.subLinhas.some((s) => s.consultor_id === filters.consultor_id)
      );
    if (filters.vendedor_id)
      rows = rows.filter((r) => r.vendedor_id === filters.vendedor_id);
    if (filters.cliente_id)
      rows = rows.filter((r) => r.cliente_id === filters.cliente_id);
    if (filters.data_contrato_de)
      rows = rows.filter((r) => (r.data_contrato ?? "") >= filters.data_contrato_de!);
    if (filters.data_contrato_ate)
      rows = rows.filter((r) => (r.data_contrato ?? "") <= filters.data_contrato_ate!);

    // 3. Ordenação das mães (nulos sempre no fim, indiferente de asc/desc)
    if (filters.sort_field) {
      const dir = filters.sort_dir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = filters.sort_field === "prazo_critico"
          ? a.data_prevista_max
          : a.data_contrato;
        const bv = filters.sort_field === "prazo_critico"
          ? b.data_prevista_max
          : b.data_contrato;
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return dir * av.localeCompare(bv);
      });
    }

    // 4. Sub-linhas: sem_lote primeiro, depois lotes por lote_numero
    rows = rows.map((r) => ({
      ...r,
      subLinhas: [...r.subLinhas].sort((a, b) => {
        if (a.tipo === "sem_lote") return -1;
        if (b.tipo === "sem_lote") return 1;
        const an = a.tipo === "lote" ? a.lote_numero : "";
        const bn = b.tipo === "lote" ? b.lote_numero : "";
        return an.localeCompare(bn, "pt-BR", { numeric: true });
      }),
    }));

    return rows;
  }, [gerencialRows, filters]);

  const hasActiveFilters = useMemo(
    () =>
      filters.etapas.length > 0 ||
      filters.consultor_id != null ||
      filters.vendedor_id != null ||
      filters.cliente_id != null ||
      filters.data_contrato_de != null ||
      filters.data_contrato_ate != null,
    [filters]
  );

  // IDs dos contratos que passaram nos filtros — usado pelo kanban no modo misto
  const filteredContratoIds = useMemo(
    () => new Set(filteredRows.map((r) => r.contrato_id)),
    [filteredRows]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  function updateFilter<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [k]: v }));
  }

  function toggleSort(field: SortField) {
    setFilters((prev) => ({
      ...prev,
      sort_field: field,
      sort_dir:
        prev.sort_field === field
          ? prev.sort_dir === "asc" ? "desc" : "asc"
          : "asc",
    }));
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectContrato(id: string) {
    navigate({ to: "/contratos", search: id === selectedId ? {} : { id } });
  }

  function toggleView(v: ViewMode) {
    setViewModeState(v);
    persistViewMode(v);
  }

  // ── Planilha (compartilhado entre lista e misto) ─────────────────────────
  const planilhaContent = (
    <>
      {/* Header sticky */}
      <div
        className="sticky top-0 grid bg-accent-light px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted z-10 gap-x-2"
        style={{ gridTemplateColumns: PLANILHA_COLS }}
      >
        <div /> {/* chevron */}
        <div>Cód.</div>
        <div>Nome cliente</div>
        <div>Nº contrato</div>
        <div>Etapa</div>
        <div className="text-right pr-2">Amb.</div>
        <div>Consultor</div>
        <div>Vendedor</div>
        <div className="text-right">Valor</div>
        <SortHeaderBtn field="data_contrato" label="Fechamento" filters={filters} onToggle={toggleSort} />
        <SortHeaderBtn field="prazo_critico" label="Prev. medição" filters={filters} onToggle={toggleSort} />
      </div>

      {/* Zero results */}
      {filteredRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <p className="text-sm text-text-muted">
            Nenhum contrato para os filtros selecionados.
          </p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="mt-2 text-xs text-text-muted underline hover:text-text-primary"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* Rows */}
      {filteredRows.map((row) => {
        const isActive   = selectedId === row.contrato_id;
        const isExpanded = expandedIds.has(row.contrato_id);
        const codigo = formatCodigoCliente(row.cliente_codigo);
        const valorFmt = row.valor_total_declarado != null
          ? `R$ ${row.valor_total_declarado.toLocaleString("pt-BR", {
              minimumFractionDigits: 2, maximumFractionDigits: 2,
            })}`
          : "—";
        const dataFmt = row.data_contrato
          ? new Date(row.data_contrato + "T00:00:00").toLocaleDateString("pt-BR")
          : "—";
        const prevFmt = row.data_prevista_max
          ? new Date(row.data_prevista_max + "T00:00:00").toLocaleDateString("pt-BR")
          : "—";
        const consultorMae =
          row.subLinhas.find((s) => s.consultor_nome)?.consultor_nome ?? null;

        return (
          <div key={row.contrato_id} className="border-b border-border last:border-b-0">
            {/* Linha-mãe */}
            <div
              onClick={() => selectContrato(row.contrato_id)}
              className={`cursor-pointer grid px-3 py-2.5 items-center transition-colors gap-x-2 ${
                isActive ? "bg-accent-light" : "bg-surface hover:bg-accent-light/60"
              }`}
              style={{ gridTemplateColumns: PLANILHA_COLS }}
            >
              {/* Chevron */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(row.contrato_id); }}
                className="flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                aria-label={isExpanded ? "Recolher" : "Expandir"}
              >
                <ChevronRight
                  className={`w-3 h-3 transition-transform duration-150 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>
              <div className="font-mono text-xs font-bold text-text-primary truncate min-w-0">
                {codigo || "—"}
              </div>
              <div className="text-xs text-text-secondary truncate min-w-0">
                {row.cliente_nome}
              </div>
              <div className="font-mono text-xs text-text-primary truncate min-w-0">
                {row.contrato_numero}
              </div>
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
              <div className="font-mono text-xs text-text-muted text-right pr-2">
                {row.qtd_ambientes > 0 ? row.qtd_ambientes : "—"}
              </div>
              <div className="text-xs text-text-secondary truncate min-w-0">
                {consultorMae || "—"}
              </div>
              <div className="text-xs text-text-secondary truncate min-w-0">
                {row.vendedor_nome || "—"}
              </div>
              <div className="text-xs text-text-secondary text-right truncate min-w-0">
                {valorFmt}
              </div>
              <div className="text-xs text-text-muted truncate min-w-0">
                {dataFmt}
              </div>
              <div className="text-xs text-text-muted truncate min-w-0">
                {prevFmt}
              </div>
            </div>

            {/* Sub-linhas */}
            {isExpanded && (
              <div className="bg-background/50 divide-y divide-border/50">
                {row.subLinhas.map((sub) => (
                  <SubLinhaRow
                    key={sub.tipo === "lote" ? sub.lote_id : `${row.contrato_id}-sem-lote`}
                    sub={sub}
                    highlight={
                      !!filters.consultor_id &&
                      sub.consultor_id === filters.consultor_id
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  // ── Render: painel de detalhe ─────────────────────────────────────────────
  if (selectedId) {
    return (
      <div className="h-[calc(100vh-4rem)] bg-surface overflow-hidden">
        <ContratoPanel
          key={selectedId}
          contratoId={selectedId}
          onClose={() => navigate({ to: "/contratos", search: {} })}
        />
      </div>
    );
  }

  // ── Render: workspace ─────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
        <span className="text-xs text-text-muted font-medium flex-1">
          {viewMode === "kanban"
            ? `${cards.length} card${cards.length !== 1 ? "s" : ""}`
            : `${filteredRows.length} contrato${filteredRows.length !== 1 ? "s" : ""}`}
        </span>
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <button
            onClick={() => toggleView("lista")}
            className={`p-1 rounded transition-colors ${
              viewMode === "lista" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toggleView("misto")}
            className={`p-1 rounded transition-colors ${
              viewMode === "misto" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Rows2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toggleView("kanban")}
            className={`p-1 rounded transition-colors ${
              viewMode === "kanban" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"
            }`}
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

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && cards.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <FileText className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary mb-1">Nenhum contrato ainda</p>
          {isAdmin && (
            <p className="text-xs text-text-muted">Use "Importar" para adicionar o primeiro contrato.</p>
          )}
        </div>
      )}

      {/* ── Modo LISTA e MISTO — tags + filtros + planilha/split ────────────── */}
      {!isLoading && (viewMode === "lista" || viewMode === "misto") && cards.length > 0 && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tags de etapa */}
          <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
            <button
              onClick={() => updateFilter("etapas", [])}
              className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
                filters.etapas.length === 0
                  ? "bg-foreground text-background"
                  : "bg-surface border border-border text-text-muted hover:text-text-primary"
              }`}
            >
              Todas
            </button>
            {KANBAN_COLUNAS.map(({ etapa, label }) => {
              const isActive = filters.etapas.includes(etapa);
              return (
                <button
                  key={etapa}
                  onClick={() =>
                    updateFilter(
                      "etapas",
                      isActive
                        ? filters.etapas.filter((e) => e !== etapa)
                        : [...filters.etapas, etapa]
                    )
                  }
                  className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-surface border border-border text-text-muted hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
            {/* Consultor */}
            <Select
              value={filters.consultor_id ?? "__all__"}
              onValueChange={(v) => updateFilter("consultor_id", v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 text-[11px] w-36 gap-1">
                <SelectValue placeholder="Consultor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os consultores</SelectItem>
                {consultores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Vendedor */}
            <Select
              value={filters.vendedor_id ?? "__all__"}
              onValueChange={(v) => updateFilter("vendedor_id", v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 text-[11px] w-36 gap-1">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Cliente combobox */}
            <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-7 text-[11px] w-44 justify-between px-2 font-normal"
                >
                  <span className="truncate">
                    {filters.cliente_id
                      ? (clientes.find((c) => c.id === filters.cliente_id)?.nome ?? "Cliente")
                      : "Cliente"}
                  </span>
                  {filters.cliente_id ? (
                    <X
                      className="w-3 h-3 ml-1 text-text-muted flex-shrink-0 hover:text-text-primary"
                      onClick={(e) => { e.stopPropagation(); updateFilter("cliente_id", null); }}
                    />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 ml-1 text-text-muted flex-shrink-0" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-64">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." className="text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs py-3 text-center text-text-muted">
                      Nenhum cliente encontrado.
                    </CommandEmpty>
                    <CommandGroup>
                      {clientes.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.nome}
                          onSelect={() => {
                            updateFilter("cliente_id", filters.cliente_id === c.id ? null : c.id);
                            setClienteOpen(false);
                          }}
                          className="text-xs"
                        >
                          <Check
                            className={`w-3 h-3 mr-1.5 flex-shrink-0 ${
                              filters.cliente_id === c.id ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          {c.codigo ? `[${c.codigo}] ` : ""}{c.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Date range — data de fechamento */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-muted whitespace-nowrap">Fech.</span>
              <input
                type="date"
                value={filters.data_contrato_de ?? ""}
                onChange={(e) => updateFilter("data_contrato_de", e.target.value || null)}
                className="h-7 text-[11px] border border-border rounded px-1.5 bg-surface text-text-primary"
              />
              <span className="text-[10px] text-text-muted">–</span>
              <input
                type="date"
                value={filters.data_contrato_ate ?? ""}
                onChange={(e) => updateFilter("data_contrato_ate", e.target.value || null)}
                className="h-7 text-[11px] border border-border rounded px-1.5 bg-surface text-text-primary"
              />
            </div>

            {/* Limpar */}
            {hasActiveFilters && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="flex items-center gap-0.5 text-[10px] text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>

          {viewMode === "lista" ? (

            /* ── Lista: planilha direta ────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {planilhaContent}
            </div>

          ) : (

            /* ── Misto: planilha + kanban com divisória arrastável ───────────── */
            <ResizablePanelGroup
              direction="vertical"
              autoSaveId="moveria_misto_split"
              className="flex-1"
            >
              <ResizablePanel defaultSize={50} minSize={20}>
                <div className="h-full overflow-y-auto overflow-x-hidden">
                  {planilhaContent}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={50} minSize={15}>
                <div className="h-full overflow-x-auto lg:overflow-x-hidden overflow-y-hidden">
                  <div className="flex h-full gap-0 min-w-max lg:min-w-0">
                    {KANBAN_COLUNAS.map((col) => {
                      const colCards = cards
                        .filter((c) => filteredContratoIds.has(c.contrato_id))
                        .filter((c) => c.etapa === col.etapa);
                      return (
                        <div
                          key={col.etapa}
                          className="flex flex-col h-full border-r border-border last:border-r-0 min-w-[150px] lg:min-w-0 lg:flex-1"
                        >
                          <div className="flex-shrink-0 px-2 py-2 border-b border-border bg-accent-light">
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted truncate">
                              {col.label}
                            </p>
                            <p className="text-xs text-text-secondary font-medium">{colCards.length}</p>
                          </div>
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
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      )}

      {/* ── Modo KANBAN (standalone, sem filtros) ───────────────────────────── */}
      {!isLoading && viewMode === "kanban" && (
        <div className="flex-1 overflow-x-auto lg:overflow-x-hidden overflow-y-hidden">
          <div className="flex h-full gap-0 min-w-max lg:min-w-0">
            {KANBAN_COLUNAS.map((col) => {
              const colCards = cards.filter((c) => c.etapa === col.etapa);
              return (
                <div
                  key={col.etapa}
                  className="flex flex-col h-full border-r border-border last:border-r-0 min-w-[150px] lg:min-w-0 lg:flex-1"
                >
                  <div className="flex-shrink-0 px-2 py-2 border-b border-border bg-accent-light">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted truncate">
                      {col.label}
                    </p>
                    <p className="text-xs text-text-secondary font-medium">{colCards.length}</p>
                  </div>
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
  );
}
