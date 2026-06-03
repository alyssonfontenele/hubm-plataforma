import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

// ─── Design Tokens (same palette as Moveria routes) ───────────────────────────
const M = {
  bg: "#0f1115",
  panel: "#171a21",
  panel2: "#1d212a",
  panel3: "#20242e",
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

const PROGRESS_STAGES = [
  "medido", "apresentacao_tecnica", "em_aprovacao", "aprovado", "pedidos_fornecedores", "documentacao_tecnica_completa",
] as const;

const STATUS_CFG: Record<string, { label: string; color: string; soft: string }> = {
  aberto:                       { label: "Aberto",         color: M.textFaint, soft: "#1a1d24"    },
  conformado:                   { label: "Conformado",     color: M.textFaint, soft: "#1a1d24"    },
  em_medicao:                   { label: "Em Medição",     color: M.amber,     soft: M.amberSoft  },
  medido:                       { label: "Medido",         color: M.accent,    soft: M.accentSoft },
  apresentacao_tecnica:         { label: "Apresentação",   color: M.purple,    soft: M.purpleSoft },
  em_aprovacao:                 { label: "Em Aprovação",   color: M.purple,    soft: M.purpleSoft },
  aprovado:                     { label: "Aprovado",       color: M.green,     soft: M.greenSoft  },
  pedidos_fornecedores:         { label: "Ped. Fornec.",   color: M.amber,     soft: M.amberSoft  },
  documentacao_tecnica_completa:{ label: "Doc. Técnica",   color: M.amber,     soft: M.amberSoft  },
  cancelado:                    { label: "Cancelado",      color: M.red,       soft: M.redSoft    },
  concluido:                    { label: "Concluído",      color: M.green,     soft: M.greenSoft  },
};
const STATUS_CFG_DEFAULT = { label: "—", color: M.textFaint, soft: "#1a1d24" };

const APT_CFG: Record<string, { label: string; color: string }> = {
  apto:          { label: "Apto",             color: M.green     },
  apto_ressalva: { label: "Apto c/ ressalva", color: M.amber     },
  inapto:        { label: "Inapto",           color: M.red       },
  pendente:      { label: "Pendente",         color: M.textFaint },
};

// ─── Exported types ───────────────────────────────────────────────────────────
export type KanbanCard = {
  tipo_card: "contrato" | "lote";
  etapa: string;
  contrato_id: string;
  contrato_numero: string;
  cliente_nome: string;
  lote_id: string | null;
  lote_numero: string | null;
  consultor_id: string | null;
  consultor_nome: string | null;
  status: string | null;
  conformado_em: string | null;
  tem_ressalva: boolean;
  qtd_itens: number;
  qtd_ambientes_sem_lote: number;
};

type BacklogItem = {
  item_id: string;
  codigo: string;
  descricao: string;
  aptidao: string | null;
};

type LoteRow = {
  id: string;
  numero: string;
  status: string;
  qtd_itens: number;
  tem_ressalva: boolean;
  criado_em: string;
};

type ItemRow = {
  id: string;
  codigo: string;
  descricao: string;
  ambiente: string | null;
  status_item: string;
};

// ─── Shared primitives ────────────────────────────────────────────────────────
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
  if (status === "cancelado") return <span style={{ color: M.red, fontSize: 11, fontWeight: 600 }}>● Cancelado</span>;
  const idx    = PROGRESS_STAGES.indexOf(status as typeof PROGRESS_STAGES[number]);
  const isPost = status === "concluido";
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {PROGRESS_STAGES.map((s, i) => {
        const cfg    = STATUS_CFG[s];
        const filled = isPost || (idx >= 0 && i <= idx);
        return (
          <div key={s} title={STATUS_CFG[s]?.label ?? s} style={{
            width: 18, height: 4, borderRadius: 3,
            background: filled ? cfg.color : M.border,
            opacity: filled ? 1 : 0.5,
          }} />
        );
      })}
    </div>
  );
}

function Spinner() {
  return <LoaderCircle style={{ color: M.textMute, width: 16, height: 16 }} className="animate-spin" />;
}

// ─── MoveriaDetailPanel ───────────────────────────────────────────────────────
// Reutilizável: base arquitetural para o workspace master-detail (12.6).
export function MoveriaDetailPanel({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 border-none focus:outline-none"
        style={{
          width: 480,
          maxWidth: "90vw",
          background: M.panel,
          borderLeft: `1px solid ${M.border}`,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <SheetHeader style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${M.border}` }}>
          <SheetTitle style={{ color: M.text, fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700 }}>
            {title}
          </SheetTitle>
        </SheetHeader>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── KanbanContratoDrawerContent ──────────────────────────────────────────────
export function KanbanContratoDrawerContent({ card, open }: { card: KanbanCard; open: boolean }) {
  const navigate = useNavigate();
  const [expandedLoteId, setExpandedLoteId] = useState<string | null>(null);

  const { data: backlog = [], isLoading: loadingBacklog } = useQuery<BacklogItem[]>({
    queryKey: ["drawer_backlog", card.contrato_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_backlog_v")
        .select("item_id, codigo, descricao, aptidao")
        .eq("contrato_id", card.contrato_id);
      if (error) throw error;
      return (data ?? []) as BacklogItem[];
    },
    enabled: open && !!card.contrato_id,
  });

  const { data: lotes = [], isLoading: loadingLotes } = useQuery<LoteRow[]>({
    queryKey: ["drawer_lotes_contrato", card.contrato_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_lotes_v")
        .select("id, numero, status, qtd_itens, tem_ressalva, criado_em")
        .eq("contrato_id", card.contrato_id)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
    enabled: open && !!card.contrato_id,
  });

  const { data: loteItems = [], isLoading: loadingItems } = useQuery<ItemRow[]>({
    queryKey: ["drawer_lote_items", expandedLoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_v")
        .select("id, codigo, descricao, ambiente, status_item")
        .eq("lote_id", expandedLoteId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: !!expandedLoteId,
  });

  return (
    <>
      {/* Contract header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: M.text }}>
            {card.contrato_numero}
          </span>
          <span style={{ fontSize: 13, color: M.textMute, marginLeft: 10 }}>{card.cliente_nome}</span>
        </div>
        <button
          onClick={() => navigate({ to: "/contratos/contrato/$contratoId", params: { contratoId: card.contrato_id } })}
          style={{
            alignSelf: "flex-start", padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: M.accentSoft, color: M.accent,
            border: `1px solid ${M.accent}55`, cursor: "pointer",
          }}
        >
          Abrir contrato →
        </button>
      </div>

      {/* Backlog section */}
      <div>
        <div style={{ fontSize: 11, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Ambientes sem lote {!loadingBacklog && `(${backlog.length})`}
        </div>
        {loadingBacklog ? (
          <div style={{ display: "flex", padding: 12 }}><Spinner /></div>
        ) : backlog.length === 0 ? (
          <div style={{ fontSize: 12.5, color: M.textFaint, padding: "8px 0" }}>Nenhum ambiente sem lote.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {backlog.map(item => {
              const apt = APT_CFG[item.aptidao ?? ""] ?? { label: item.aptidao ?? "—", color: M.textFaint };
              return (
                <div key={item.item_id} style={{
                  background: M.panel2, borderRadius: 7, padding: "8px 12px",
                  border: `1px solid ${M.borderSoft}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textMute, marginRight: 8 }}>{item.codigo}</span>
                    <span style={{ fontSize: 12.5, color: M.text }}>{item.descricao}</span>
                  </div>
                  <span style={{ fontSize: 11, color: apt.color, fontWeight: 600, flexShrink: 0 }}>{apt.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lotes section */}
      <div>
        <div style={{ fontSize: 11, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Lotes {!loadingLotes && `(${lotes.length})`}
        </div>
        {loadingLotes ? (
          <div style={{ display: "flex", padding: 12 }}><Spinner /></div>
        ) : lotes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: M.textFaint, padding: "8px 0" }}>Nenhum lote conformado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lotes.map(lote => {
              const st        = STATUS_CFG[lote.status] ?? STATUS_CFG_DEFAULT;
              const isExpanded = expandedLoteId === lote.id;
              return (
                <div key={lote.id} style={{ border: `1px solid ${M.border}`, borderRadius: 9, overflow: "hidden" }}>
                  {/* Lote row */}
                  <div
                    onClick={() => setExpandedLoteId(isExpanded ? null : lote.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", cursor: "pointer",
                      background: isExpanded ? M.panel3 : M.panel2,
                    }}
                    onMouseEnter={e => !isExpanded && (e.currentTarget.style.background = M.panel3)}
                    onMouseLeave={e => !isExpanded && (e.currentTarget.style.background = M.panel2)}
                  >
                    {isExpanded
                      ? <ChevronDown style={{ width: 14, height: 14, color: M.textFaint, flexShrink: 0 }} />
                      : <ChevronRight style={{ width: 14, height: 14, color: M.textFaint, flexShrink: 0 }} />
                    }
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: M.text }}>
                      Lote {lote.numero}
                    </span>
                    {lote.tem_ressalva && <span style={{ color: M.amber, fontSize: 12 }}>⚠</span>}
                    <MBadge color={st.color} soft={st.soft}>{st.label}</MBadge>
                    <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: M.textFaint }}>
                      {lote.qtd_itens} amb.
                    </span>
                  </div>
                  {/* Level 2: items of this lote */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${M.borderSoft}`, background: M.bg, padding: "8px 12px 8px 36px" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                        <button
                          onClick={() => navigate({ to: "/contratos/lote/$loteId", params: { loteId: lote.id } })}
                          style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                            background: "transparent", color: M.accent,
                            border: `1px solid ${M.accent}55`, cursor: "pointer",
                          }}
                        >
                          Abrir lote →
                        </button>
                      </div>
                      {loadingItems ? (
                        <div style={{ display: "flex", padding: 8 }}><Spinner /></div>
                      ) : loteItems.length === 0 ? (
                        <div style={{ fontSize: 12, color: M.textFaint }}>Sem ambientes neste lote.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {loteItems.map(item => (
                            <div key={item.id} style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "6px 10px", borderRadius: 6, background: M.panel2,
                              border: `1px solid ${M.borderSoft}`,
                            }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: M.textMute, flexShrink: 0 }}>{item.codigo}</span>
                              <span style={{ fontSize: 12, color: M.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descricao}</span>
                              {item.ambiente && (
                                <span style={{ fontSize: 11, color: M.textFaint, flexShrink: 0 }}>{item.ambiente}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── KanbanLoteDrawerContent ──────────────────────────────────────────────────
export function KanbanLoteDrawerContent({ card, open }: { card: KanbanCard; open: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const st = STATUS_CFG[card.status ?? ""] ?? STATUS_CFG_DEFAULT;

  const { data: items = [], isLoading: loadingItems } = useQuery<ItemRow[]>({
    queryKey: ["drawer_lote_items_direct", card.lote_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_v")
        .select("id, codigo, descricao, ambiente, status_item")
        .eq("lote_id", card.lote_id!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: open && expanded && !!card.lote_id,
  });

  return (
    <>
      {/* Lote header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge>
          {card.tem_ressalva && <span style={{ color: M.amber, fontSize: 13 }}>⚠ Ressalva</span>}
        </div>
        <ProgressTrack status={card.status ?? ""} />
        {card.consultor_nome && (
          <div style={{ fontSize: 12.5, color: M.textMute }}>
            Consultor: <span style={{ color: M.text }}>{card.consultor_nome}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: M.textFaint }}>
            <span style={{ fontFamily: "'DM Mono', monospace" }}>{card.contrato_numero}</span>
            <span style={{ marginLeft: 6 }}>· {card.cliente_nome}</span>
          </div>
        </div>
        <button
          onClick={() => navigate({ to: "/contratos/lote/$loteId", params: { loteId: card.lote_id! } })}
          style={{
            alignSelf: "flex-start", padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: M.accentSoft, color: M.accent,
            border: `1px solid ${M.accent}55`, cursor: "pointer",
          }}
        >
          Abrir lote →
        </button>
      </div>

      {/* Ambientes section */}
      <div>
        <div
          onClick={() => setExpanded(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontSize: 11, color: M.textFaint, textTransform: "uppercase",
            letterSpacing: 0.5, fontWeight: 600, marginBottom: 8,
          }}
        >
          {expanded
            ? <ChevronDown style={{ width: 13, height: 13 }} />
            : <ChevronRight style={{ width: 13, height: 13 }} />
          }
          Ambientes ({card.qtd_itens})
        </div>
        {expanded && (
          loadingItems ? (
            <div style={{ display: "flex", padding: 12 }}><Spinner /></div>
          ) : items.length === 0 ? (
            <div style={{ fontSize: 12.5, color: M.textFaint }}>Nenhum ambiente encontrado.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map(item => (
                <div key={item.id} style={{
                  background: M.panel2, borderRadius: 7, padding: "8px 12px",
                  border: `1px solid ${M.borderSoft}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: M.textMute, flexShrink: 0 }}>{item.codigo}</span>
                  <span style={{ fontSize: 12.5, color: M.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descricao}</span>
                  {item.ambiente && (
                    <span style={{ fontSize: 11.5, color: M.textFaint, flexShrink: 0 }}>{item.ambiente}</span>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}
