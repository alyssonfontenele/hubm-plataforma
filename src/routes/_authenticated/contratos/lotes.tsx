import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  MoveriaDetailPanel,
  KanbanContratoDrawerContent,
  KanbanLoteDrawerContent,
  type KanbanCard,
} from "@/components/moveria/detail-panel";

// ─── Moveria Design Tokens ─────────────────────────────────────────────────────
const M = {
  bg: "#0f1115",
  panel: "#171a21",
  panel2: "#1d212a",
  border: "#272c38",
  borderSoft: "#1f2530",
  text: "#e7e9ee",
  textMute: "#9aa1b1",
  textFaint: "#646b7d",
  accent: "#5b8cff",
  accentSoft: "#1e2942",
  green: "#3fb968",  greenSoft: "#16301f",
  amber: "#e0a52b",  amberSoft: "#332811",
  red:   "#e0573f",  redSoft:   "#331813",
  purple: "#9a7bff", purpleSoft: "#241d3a",
} as const;

// Progression stages for ProgressTrack (display order matters — never sort by enum value)
const PROGRESS_STAGES = [
  "medido", "apresentacao_tecnica", "em_aprovacao", "aprovado", "pedidos_fornecedores", "documentacao_tecnica_completa",
] as const;

// Full display order for kanban columns and status dropdowns
const STATUS_DISPLAY_ORDER = [
  "aberto", "conformado", "em_medicao",
  "medido", "apresentacao_tecnica", "em_aprovacao", "aprovado", "pedidos_fornecedores", "documentacao_tecnica_completa",
  "cancelado", "concluido",
] as const;

const STATUS_CFG: Record<string, { label: string; color: string; soft: string }> = {
  aberto:                       { label: "Aberto",       color: M.textFaint, soft: "#1a1d24"   },
  conformado:                   { label: "Conformado",   color: M.textFaint, soft: "#1a1d24"   },
  em_medicao:                   { label: "Em Medição",   color: M.amber,     soft: M.amberSoft },
  medido:                       { label: "Medido",       color: M.accent,    soft: M.accentSoft},
  apresentacao_tecnica:         { label: "Apresentação",   color: M.purple,    soft: M.purpleSoft},
  em_aprovacao:                 { label: "Em Aprovação",   color: M.purple,    soft: M.purpleSoft},
  aprovado:                     { label: "Aprovado",       color: M.green,     soft: M.greenSoft },
  pedidos_fornecedores:         { label: "Ped. Fornec.",   color: M.amber,     soft: M.amberSoft },
  documentacao_tecnica_completa:{ label: "Doc. Técnica",   color: M.amber,     soft: M.amberSoft },
  cancelado:                    { label: "Cancelado",    color: M.red,       soft: M.redSoft   },
  concluido:                    { label: "Concluído",    color: M.green,     soft: M.greenSoft },
};
const STATUS_CFG_DEFAULT = { label: "—", color: M.textFaint, soft: "#1a1d24" };

const darkSelectCss: React.CSSProperties = {
  background: M.panel2, color: M.text,
  border: `1px solid ${M.border}`, borderRadius: 7,
  padding: "7px 10px", fontSize: 12.5, outline: "none",
  fontFamily: "'DM Sans', system-ui, sans-serif", cursor: "pointer",
};

function useMoveria() {
  useEffect(() => {
    if (!document.getElementById("moveria-fonts")) {
      const link = Object.assign(document.createElement("link"), {
        id: "moveria-fonts", rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap",
      });
      document.head.appendChild(link);
    }
  }, []);
}

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_authenticated/contratos/lotes")({
  ssr: false,
  component: LotesPage,
});

// ─── Types (unchanged) ────────────────────────────────────────────────────────
type LoteRow = {
  id: string;
  numero: string;
  status: string;
  conformado_em: string | null;
  criado_em: string;
  contrato_id: string | null;
  contrato_numero: string | null;
  cliente_nome: string | null;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
};

type ContratoOption = { id: string; numero: string };

type ItemRow = {
  id: string;
  codigo: string;
  descricao: string;
  status_item: string;
  consultor_designado: string | null;
};

type ConsultorOption = {
  id: string;
  profile_id: string;
  full_name: string | null;
};

type DesignacaoRow = {
  id: string;
  item_id: string;
  consultor_id: string;
  ativo: boolean;
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function MBadge({ children, color, soft, dot }: { children: React.ReactNode; color: string; soft: string; dot?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: soft, color, border: `1px solid ${color}33`,
      padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: color, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

function ProgressTrack({ status }: { status: string }) {
  if (status === "cancelado") {
    return <span style={{ color: M.red, fontSize: 11, fontWeight: 600 }}>● Cancelado</span>;
  }
  const idx = PROGRESS_STAGES.indexOf(status as typeof PROGRESS_STAGES[number]);
  const isPost = status === "concluido";
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {PROGRESS_STAGES.map((s, i) => {
        const cfg = STATUS_CFG[s];
        const filled = isPost || (idx >= 0 && i <= idx);
        return (
          <div key={s} title={STATUS_CFG[s]?.label ?? s} style={{
            width: 22, height: 5, borderRadius: 3,
            background: filled ? cfg.color : M.border,
            opacity: filled ? 1 : 0.5,
          }} />
        );
      })}
    </div>
  );
}

function Spinner() {
  return <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />;
}

function EmptyState({ message = "Nenhum lote encontrado." }: { message?: string }) {
  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel,
      padding: "40px 24px", textAlign: "center", fontSize: 13, color: M.textFaint,
    }}>{message}</div>
  );
}

// ─── LotesPage ────────────────────────────────────────────────────────────────
function LotesPage() {
  useMoveria();
  const { globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";
  const [mainTab, setMainTab] = useState<"lotes" | "designacoes">("lotes");

  return (
    <div
      className="-m-6 md:-m-8"
      style={{
        background: M.bg,
        minHeight: "calc(100vh - 4rem)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Outer tab bar — only shown for admins */}
      {isAdmin && (
        <div style={{
          display: "flex", borderBottom: `1px solid ${M.border}`,
          background: M.panel, padding: "0 32px",
        }}>
          {(["lotes", "designacoes"] as const).map((k) => {
            const label = k === "lotes" ? "Lotes" : "Designações";
            return (
              <div
                key={k}
                onClick={() => setMainTab(k)}
                style={{
                  padding: "14px 0", marginRight: 28,
                  fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                  color: mainTab === k ? M.text : M.textMute,
                  borderBottom: mainTab === k ? `2px solid ${M.accent}` : "2px solid transparent",
                  transition: "all .1s",
                }}
              >{label}</div>
            );
          })}
        </div>
      )}

      <div style={{ padding: "24px 32px" }}>
        {(mainTab === "lotes" || !isAdmin) && <LotesTab />}
        {mainTab === "designacoes" && isAdmin && <DesignacoesTab />}
      </div>
    </div>
  );
}

// ─── LotesTab ─────────────────────────────────────────────────────────────────
function LotesTab() {
  const [view, setView]         = useState<"lista" | "kanban" | "cards">("lista");
  const [q, setQ]               = useState("");
  const [fStatus, setFStatus]   = useState("todos");
  const [fConsultor, setFConsultor] = useState("todos");
  const [fFlag, setFFlag]       = useState<"todos" | "ressalva">("todos");

  const { data: lotes = [], isLoading } = useQuery<LoteRow[]>({
    queryKey: ["moveria_lotes_v"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_lotes_v")
        .select("*")
        .order("criado_em", { ascending: false });   // never sort by status enum
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  const consultores = useMemo(() => {
    const names = lotes.map(l => l.consultor_nome).filter(Boolean) as string[];
    return ["todos", ...Array.from(new Set(names)).sort()];
  }, [lotes]);

  const filtered = useMemo(() => lotes.filter(l => {
    if (q) {
      const hay = [l.numero, l.contrato_numero, l.cliente_nome, l.consultor_nome]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (fStatus !== "todos" && l.status !== fStatus) return false;
    if (fConsultor !== "todos" && l.consultor_nome !== fConsultor) return false;
    if (fFlag === "ressalva" && !l.tem_ressalva) return false;
    return true;
  }), [lotes, q, fStatus, fConsultor, fFlag]);

  if (isLoading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Spinner />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Filters ── */}
      <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Text search */}
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: M.textFaint, fontSize: 14, pointerEvents: "none" }}>⌕</span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por contrato, cliente, consultor, nº do lote…"
              style={{
                width: "100%", background: M.panel2, color: M.text,
                border: `1px solid ${M.border}`, borderRadius: 8,
                padding: "7px 12px 7px 30px", fontSize: 12.5, outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          {/* Status */}
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={darkSelectCss}>
            <option value="todos">Etapa: todas</option>
            {STATUS_DISPLAY_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>
            ))}
          </select>
          {/* Consultor */}
          <select value={fConsultor} onChange={e => setFConsultor(e.target.value)} style={darkSelectCss}>
            {consultores.map(c => (
              <option key={c} value={c}>{c === "todos" ? "Consultor: todos" : c}</option>
            ))}
          </select>
          {/* Flag pills */}
          <div style={{ display: "flex", gap: 5 }}>
            {([["todos", "Tudo"], ["ressalva", "Ressalva"]] as const).map(([k, l]) => (
              <div
                key={k}
                onClick={() => setFFlag(k)}
                style={{
                  padding: "7px 11px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: fFlag === k ? M.accentSoft : M.panel2,
                  border: `1px solid ${fFlag === k ? M.accent + "66" : M.border}`,
                  color: fFlag === k ? M.accent : M.textMute,
                  transition: "all .1s",
                }}
              >{l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── View switcher + count ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 3, background: M.panel, border: `1px solid ${M.border}`, borderRadius: 9, padding: 3 }}>
          {(["lista", "kanban", "cards"] as const).map(k => (
            <div
              key={k}
              onClick={() => setView(k)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                background: view === k ? M.accentSoft : "transparent",
                color: view === k ? M.accent : M.textMute,
                textTransform: "capitalize",
                transition: "all .1s",
              }}
            >{k.charAt(0).toUpperCase() + k.slice(1)}</div>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: M.textFaint }}>
          {filtered.length} de {lotes.length} lote{lotes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Views ── */}
      {view === "lista"  && <LotesTableView data={filtered} />}
      {view === "kanban" && <LotesKanban />}
      {view === "cards"  && <LotesCards data={filtered} />}
    </div>
  );
}

// ─── LotesTableView (lista) ───────────────────────────────────────────────────
function LotesTableView({ data }: { data: LoteRow[] }) {
  const navigate = useNavigate();
  const gt = "1fr 1.4fr 60px 1.1fr 150px 130px 52px 70px";
  const cols = ["Contrato", "Cliente", "Lote", "Consultor", "Progresso", "Status", "Amb.", "Criado"];
  return (
    <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: gt,
        padding: "10px 18px", borderBottom: `1px solid ${M.border}`,
        fontSize: 10.5, color: M.textFaint, textTransform: "uppercase",
        letterSpacing: 0.4, fontWeight: 600, background: M.panel2,
      }}>
        {cols.map(c => <div key={c}>{c}</div>)}
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div style={{ padding: "28px 18px", textAlign: "center", color: M.textFaint, fontSize: 13 }}>
          Nenhum lote com esses filtros.
        </div>
      )}

      {/* Rows */}
      {data.map(l => {
        const st  = STATUS_CFG[l.status] ?? STATUS_CFG_DEFAULT;
        const dia = new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return (
          <div
            key={l.id}
            onClick={() => navigate({ to: "/contratos/lote/$loteId", params: { loteId: l.id } })}
            style={{
              display: "grid", gridTemplateColumns: gt,
              padding: "12px 18px", borderBottom: `1px solid ${M.borderSoft}`,
              alignItems: "center", fontSize: 13,
              cursor: "pointer",
              transition: "background .1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = M.panel2)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textMute }}>
              {l.contrato_numero ?? "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.cliente_nome ?? "—"}</span>
              {l.tem_ressalva && <span title="Contém ressalva" style={{ color: M.amber, flexShrink: 0 }}>⚠</span>}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: M.text }}>
              {l.numero}
            </div>
            <div style={{ color: M.textMute, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.consultor_nome ?? "—"}
            </div>
            <div><ProgressTrack status={l.status} /></div>
            <div><MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge></div>
            <div style={{ fontFamily: "'DM Mono', monospace", color: M.textMute }}>{l.qtd_itens}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textFaint }}>{dia}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Kanban columns config (Modelo 2 — 8 fixed columns, always visible) ───────
const KANBAN_COLS = [
  { etapa: "backlog",                       label: "Backlog",              color: "#646b7d" },
  { etapa: "aguardando_medicao",            label: "Ag. Medição",          color: "#9aa1b1" },
  { etapa: "medido",                        label: "Medido",               color: "#5b8cff" },
  { etapa: "apresentacao_tecnica",          label: "Apresentação",         color: "#9a7bff" },
  { etapa: "em_aprovacao",                  label: "Em Aprovação",         color: "#9a7bff" },
  { etapa: "aprovado",                      label: "Aprovado",             color: "#3fb968" },
  { etapa: "pedidos_fornecedores",          label: "Ped. Fornecedores",    color: "#e0a52b" },
  { etapa: "documentacao_tecnica_completa", label: "Doc. Completa",        color: "#e0a52b" },
] as const;

// ─── LotesKanban (Modelo 2) ───────────────────────────────────────────────────
function LotesKanban() {
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);

  const { data: kanbanData = [], isLoading } = useQuery<KanbanCard[]>({
    queryKey: ["moveria_kanban_v"],
    queryFn: async () => {
      const { data, error } = await supabase.from("moveria_kanban_v").select("*");
      if (error) throw error;
      return (data ?? []) as KanbanCard[];
    },
  });

  const openCard = (card: KanbanCard) => { setSelectedCard(card); setDrawerOpen(true); };

  return (
    <>
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", alignItems: "flex-start", paddingBottom: 8 }}>
          {KANBAN_COLS.map(col => {
            const cards = kanbanData.filter(c => c.etapa === col.etapa);
            return (
              <div
                key={col.etapa}
                style={{
                  minWidth: 200, flexShrink: 0,
                  background: M.panel, border: `1px solid ${M.border}`,
                  borderRadius: 12, overflow: "hidden",
                }}
              >
                <div style={{
                  padding: "11px 14px", borderBottom: `1px solid ${M.borderSoft}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: M.text }}>{col.label}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", color: M.textFaint, fontSize: 12 }}>{cards.length}</span>
                </div>
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                  {cards.map((card, i) =>
                    card.tipo_card === "contrato"
                      ? <KanbanContratoCard key={`${card.contrato_id}-${i}`} card={card} onClick={() => openCard(card)} />
                      : <KanbanLoteCard    key={card.lote_id ?? i}          card={card} onClick={() => openCard(card)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MoveriaDetailPanel
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={
          selectedCard?.tipo_card === "contrato"
            ? (selectedCard.contrato_numero ?? "Contrato")
            : `Lote ${selectedCard?.lote_numero ?? ""}`
        }
      >
        {selectedCard?.tipo_card === "contrato" ? (
          <KanbanContratoDrawerContent card={selectedCard} open={drawerOpen} />
        ) : selectedCard ? (
          <KanbanLoteDrawerContent card={selectedCard} open={drawerOpen} />
        ) : null}
      </MoveriaDetailPanel>
    </>
  );
}

// ─── Kanban card sub-components ───────────────────────────────────────────────
function KanbanContratoCard({ card, onClick }: { card: KanbanCard; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: M.panel2, border: `1px solid ${M.border}`, borderRadius: 9, padding: "11px 12px", cursor: "pointer" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#232733")}
      onMouseLeave={e => (e.currentTarget.style.background = M.panel2)}
    >
      <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: M.text, marginBottom: 3 }}>
        {card.contrato_numero}
      </div>
      <div style={{ fontSize: 12.5, color: M.textMute, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {card.cliente_nome}
      </div>
      {card.qtd_ambientes_sem_lote > 0 && (
        <span style={{
          display: "inline-flex", alignItems: "center",
          background: M.amberSoft, color: M.amber, border: `1px solid ${M.amber}33`,
          padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
        }}>
          {card.qtd_ambientes_sem_lote} amb. sem lote
        </span>
      )}
    </div>
  );
}

function KanbanLoteCard({ card, onClick }: { card: KanbanCard; onClick: () => void }) {
  const st = STATUS_CFG[card.status ?? ""] ?? STATUS_CFG_DEFAULT;
  return (
    <div
      onClick={onClick}
      style={{ background: M.panel2, border: `1px solid ${M.border}`, borderRadius: 9, padding: "11px 12px", cursor: "pointer" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#232733")}
      onMouseLeave={e => (e.currentTarget.style.background = M.panel2)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: M.text }}>
          Lote {card.lote_numero}
        </span>
        {card.tem_ressalva && <span style={{ color: M.amber, fontSize: 13 }}>⚠</span>}
      </div>
      <div style={{ fontSize: 12.5, color: M.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {card.cliente_nome}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: M.textFaint, marginBottom: 7 }}>
        {card.contrato_numero} · {card.qtd_itens} amb.
      </div>
      {card.consultor_nome && (
        <div style={{ fontSize: 11.5, color: M.textMute, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.consultor_nome}
        </div>
      )}
      <MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge>
    </div>
  );
}

// ─── LotesCards ───────────────────────────────────────────────────────────────
function LotesCards({ data }: { data: LoteRow[] }) {
  const navigate = useNavigate();
  if (data.length === 0) return <EmptyState message="Nenhum lote com esses filtros." />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
      {data.map(l => {
        const st  = STATUS_CFG[l.status] ?? STATUS_CFG_DEFAULT;
        const dia = new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return (
          <div
            key={l.id}
            onClick={() => navigate({ to: "/contratos/lote/$loteId", params: { loteId: l.id } })}
            style={{
              background: M.panel, border: `1px solid ${M.border}`,
              borderRadius: 12, padding: 18,
              borderTop: `3px solid ${st.color}`,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: M.text }}>
                Lote {l.numero}
              </span>
              <MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: M.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.cliente_nome ?? "—"}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textFaint, marginBottom: 14 }}>
              {l.contrato_numero ?? "—"}
            </div>
            <ProgressTrack status={l.status} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${M.borderSoft}` }}>
              <span style={{ fontSize: 12, color: M.textMute }}>
                {l.qtd_itens} ambiente{l.qtd_itens !== 1 ? "s" : ""}
                {l.tem_ressalva && <span style={{ color: M.amber, marginLeft: 6 }}>⚠ ressalva</span>}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: M.textFaint }}>{dia}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DesignacoesTab ───────────────────────────────────────────────────────────
function DesignacoesTab() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedContratoId, setSelectedContratoId] = useState<string>("");

  const { data: contratos = [] } = useQuery<ContratoOption[]>({
    queryKey: ["moveria_contratos_para_designacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero")
        .eq("status", "em_andamento")
        .order("numero");
      if (error) throw error;
      return (data ?? []) as ContratoOption[];
    },
  });

  const { data: consultorMembros = [] } = useQuery<ConsultorOption[]>({
    queryKey: ["moveria_consultores_membros"],
    queryFn: async () => {
      const { data: membros, error } = await supabase
        .from("moveria_membros")
        .select("id, profile_id")
        .eq("papel", "consultor_tecnico")
        .eq("ativo", true);
      if (error) throw error;
      const profileIds = (membros ?? []).map((m: any) => m.profile_id as string);
      if (profileIds.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      return (membros ?? []).map((m: any) => ({
        id: m.id as string,
        profile_id: m.profile_id as string,
        full_name: (profs ?? []).find((p: any) => p.id === m.profile_id)?.full_name ?? null,
      }));
    },
  });

  const { data: itens = [], isLoading: loadingItens } = useQuery<ItemRow[]>({
    queryKey: ["moveria_itens_para_designacao", selectedContratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_v")
        .select("id, codigo, descricao, status_item, consultor_designado")
        .eq("contrato_id", selectedContratoId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: !!selectedContratoId,
  });

  const { data: designacoes = [] } = useQuery<DesignacaoRow[]>({
    queryKey: ["moveria_designacoes_ativas", selectedContratoId],
    queryFn: async () => {
      if (!itens.length) return [];
      const { data, error } = await supabase
        .from("moveria_designacoes")
        .select("id, item_id, consultor_id, ativo")
        .eq("ativo", true)
        .in("item_id", itens.map(i => i.id));
      if (error) throw error;
      return (data ?? []) as DesignacaoRow[];
    },
    enabled: !!selectedContratoId && itens.length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["moveria_designacoes_ativas", selectedContratoId] });
    queryClient.invalidateQueries({ queryKey: ["moveria_itens_para_designacao", selectedContratoId] });
  };

  const assign = useMutation({
    mutationFn: async ({ itemId, consultorMembroId }: { itemId: string; consultorMembroId: string }) => {
      await supabase.from("moveria_designacoes").update({ ativo: false }).eq("item_id", itemId).eq("ativo", true);
      const { error } = await supabase.from("moveria_designacoes").insert({
        item_id: itemId, consultor_id: consultorMembroId,
        designado_por: profile?.id, ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Consultor designado"); },
    onError: (err: any) => toast.error(err.message ?? "Erro ao designar consultor"),
  });

  const revoke = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("moveria_designacoes").update({ ativo: false }).eq("item_id", itemId).eq("ativo", true);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Designação removida"); },
    onError: (err: any) => toast.error(err.message ?? "Erro ao remover designação"),
  });

  const getDesignacao  = (itemId: string) => designacoes.find(d => d.item_id === itemId);
  const getConsultorNome = (membroId: string) => consultorMembros.find(c => c.id === membroId)?.full_name ?? "—";
  const isBusy = assign.isPending || revoke.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Contract selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: M.textMute, whiteSpace: "nowrap" }}>Contrato</span>
        <select
          value={selectedContratoId}
          onChange={e => setSelectedContratoId(e.target.value)}
          style={{ ...darkSelectCss, minWidth: 260 }}
        >
          <option value="">Selecione um contrato…</option>
          {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
        </select>
      </div>

      {/* Empty / loading states */}
      {!selectedContratoId && (
        <div style={{
          borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel,
          padding: "32px 24px", textAlign: "center", fontSize: 13, color: M.textFaint,
        }}>
          Selecione um contrato para gerenciar as designações.
        </div>
      )}

      {selectedContratoId && loadingItens && (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
      )}

      {selectedContratoId && !loadingItens && itens.length === 0 && (
        <EmptyState message="Nenhum ambiente encontrado para este contrato." />
      )}

      {/* Items list */}
      {selectedContratoId && !loadingItens && itens.length > 0 && (
        <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 1fr 260px",
            padding: "10px 18px", borderBottom: `1px solid ${M.border}`,
            fontSize: 10.5, color: M.textFaint, textTransform: "uppercase",
            letterSpacing: 0.4, fontWeight: 600, background: M.panel2,
          }}>
            <div>Código</div><div>Descrição</div><div>Designação</div>
          </div>

          {itens.map(item => {
            const desg = getDesignacao(item.id);
            return (
              <div
                key={item.id}
                style={{
                  display: "grid", gridTemplateColumns: "80px 1fr 260px",
                  padding: "12px 18px", borderBottom: `1px solid ${M.borderSoft}`,
                  alignItems: "center", fontSize: 13,
                }}
              >
                {/* Código */}
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textMute }}>
                  {item.codigo}
                </div>
                {/* Descrição */}
                <div style={{ color: M.text }}>{item.descricao}</div>
                {/* Designação state */}
                <div>
                  {desg ? (
                    /* ── DESIGNADO ── */
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <MBadge color={M.green} soft={M.greenSoft} dot>
                        {getConsultorNome(desg.consultor_id)}
                      </MBadge>
                      <span
                        onClick={() => !isBusy && revoke.mutate(item.id)}
                        style={{
                          fontSize: 11.5, color: M.red, cursor: isBusy ? "not-allowed" : "pointer",
                          opacity: isBusy ? 0.5 : 1, fontWeight: 500,
                        }}
                      >
                        × Remover
                      </span>
                    </div>
                  ) : (
                    /* ── A DESIGNAR — save-on-select ── */
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <MBadge color={M.amber} soft={M.amberSoft} dot>A designar</MBadge>
                      <select
                        defaultValue=""
                        disabled={isBusy}
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            e.target.value = "";   // reset to placeholder after selection
                            assign.mutate({ itemId: item.id, consultorMembroId: val });
                          }
                        }}
                        style={{
                          ...darkSelectCss,
                          padding: "5px 8px", fontSize: 12, opacity: isBusy ? 0.5 : 1,
                        }}
                      >
                        <option value="">Designar…</option>
                        {consultorMembros.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.full_name ?? c.profile_id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
