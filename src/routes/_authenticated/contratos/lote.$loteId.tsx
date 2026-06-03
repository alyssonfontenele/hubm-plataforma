import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

// Progression stages — same order as lotes.tsx / prototype
const PROGRESS_STAGES = [
  "medido", "apresentacao_tecnica", "em_aprovacao", "aprovado", "pedidos_fornecedores", "documentacao_tecnica_completa",
] as const;

const STATUS_CFG: Record<string, { label: string; color: string; soft: string }> = {
  aberto:                       { label: "Aberto",       color: M.textFaint, soft: "#1a1d24"    },
  conformado:                   { label: "Conformado",   color: M.textFaint, soft: "#1a1d24"    },
  em_medicao:                   { label: "Em Medição",   color: M.amber,     soft: M.amberSoft  },
  medido:                       { label: "Medido",       color: M.accent,    soft: M.accentSoft },
  apresentacao_tecnica:         { label: "Apresentação",   color: M.purple,    soft: M.purpleSoft },
  em_aprovacao:                 { label: "Em Aprovação",   color: M.purple,    soft: M.purpleSoft },
  aprovado:                     { label: "Aprovado",       color: M.green,     soft: M.greenSoft  },
  pedidos_fornecedores:         { label: "Ped. Fornec.",   color: M.amber,     soft: M.amberSoft  },
  documentacao_tecnica_completa:{ label: "Doc. Técnica",   color: M.amber,     soft: M.amberSoft  },
  cancelado:                    { label: "Cancelado",    color: M.red,       soft: M.redSoft    },
  concluido:                    { label: "Concluído",    color: M.green,     soft: M.greenSoft  },
};

const APT_CFG: Record<string, { label: string; color: string; soft: string }> = {
  apto:          { label: "Apto",             color: M.green,     soft: M.greenSoft },
  apto_ressalva: { label: "Apto c/ ressalva", color: M.amber,     soft: M.amberSoft },
  inapto:        { label: "Inapto",           color: M.red,       soft: M.redSoft   },
  pendente:      { label: "Pendente",         color: M.textFaint, soft: "#1a1d24"   },
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
export const Route = createFileRoute("/_authenticated/contratos/lote/$loteId")({
  ssr: false,
  component: LoteDetalhePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type LoteFullRow = {
  id: string;
  numero: string;
  status: string;
  conformado_em: string | null;
  criado_em: string;
  contrato_id: string | null;
  contrato_numero: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
};

type AmbienteRow = {
  id: string;
  codigo: string;
  descricao: string;
  ambiente: string | null;
  aptidao: string;
  aptidao_obs: string | null;
  ordem: number | null;
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

function PanelHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: `1px solid ${M.border}`, fontSize: 12.5, fontWeight: 600, color: M.textMute, background: M.panel2 }}>
      {children}
    </div>
  );
}

// ─── CycleStepper ─────────────────────────────────────────────────────────────
function CycleStepper({ status }: { status: string }) {
  const idx         = PROGRESS_STAGES.indexOf(status as typeof PROGRESS_STAGES[number]);
  const isPost      = status === "concluido";
  const isCancelled = status === "cancelado";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {PROGRESS_STAGES.map((s, i) => {
          const cfg  = STATUS_CFG[s];
          const done = !isCancelled && (isPost || (idx >= 0 && i < idx));
          const cur  = !isCancelled && !isPost && i === idx;
          return (
            <Fragment key={s}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                {/* Step circle */}
                <div style={{
                  width: 32, height: 32, borderRadius: 99, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? cfg.color : cur ? cfg.soft : M.panel2,
                  border: `2px solid ${(done || cur) ? cfg.color : M.border}`,
                  color: done ? "#fff" : cur ? cfg.color : M.textFaint,
                  fontSize: 13, fontWeight: 700,
                }}>
                  {done ? "✓" : i + 1}
                </div>
                {/* Step label */}
                <span style={{ fontSize: 11.5, color: cur ? M.text : M.textMute, fontWeight: cur ? 600 : 500, whiteSpace: "nowrap" }}>
                  {cfg.label}
                </span>
              </div>
              {/* Connector line */}
              {i < PROGRESS_STAGES.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 8px 20px",
                  background: (!isCancelled && (isPost || (idx >= 0 && i < idx))) ? cfg.color : M.border,
                }} />
              )}
            </Fragment>
          );
        })}
      </div>
      {/* Cancelled banner */}
      {isCancelled && (
        <div style={{
          marginTop: 14, display: "flex", alignItems: "center", gap: 8,
          background: M.redSoft, border: `1px solid ${M.red}44`,
          borderRadius: 8, padding: "10px 14px",
          fontSize: 12.5, color: M.red,
        }}>
          <span>⊘</span> Lote cancelado.
        </div>
      )}
    </div>
  );
}

// ─── ContractBanner ───────────────────────────────────────────────────────────
function ContractBanner({ lote, clienteTipo }: { lote: LoteFullRow; clienteTipo: "PF" | "PJ" | "—" }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${M.accentSoft}, ${M.panel})`,
      border: `1px solid ${M.accent}44`,
      borderRadius: 12, padding: "16px 20px", marginBottom: 18,
    }}>
      <div style={{ fontSize: 10.5, color: M.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        ● Contexto isolado
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 21, fontWeight: 700, color: M.text }}>
          {lote.contrato_numero ?? "—"}
        </span>
        {lote.cliente_nome && (
          <span style={{ fontSize: 15, color: M.text }}>{lote.cliente_nome}</span>
        )}
        {clienteTipo !== "—" && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            background: M.panel2, color: M.textMute,
            border: `1px solid ${M.border}`,
            padding: "1px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
          }}>{clienteTipo}</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: M.textMute, marginTop: 6 }}>
        {lote.qtd_itens} ambiente{lote.qtd_itens !== 1 ? "s" : ""} · consultor {lote.consultor_nome ?? "—"}
        {lote.conformado_em && (
          <> · conformado em {new Date(lote.conformado_em).toLocaleDateString("pt-BR")}</>
        )}
      </div>
    </div>
  );
}

// ─── ComposicaoTable ──────────────────────────────────────────────────────────
function ComposicaoTable({ itens, loading }: { itens: AmbienteRow[]; loading: boolean }) {
  return (
    <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
      <PanelHead>Composição · {itens.length} ambiente{itens.length !== 1 ? "s" : ""}</PanelHead>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && itens.length === 0 && (
        <div style={{ padding: "24px 18px", textAlign: "center", color: M.textFaint, fontSize: 13 }}>
          Sem ambientes associados a este lote.
        </div>
      )}

      {!loading && itens.map((it, i) => {
        const apt = APT_CFG[it.aptidao] ?? APT_CFG.pendente;
        const label = it.ambiente || it.descricao || it.codigo;
        return (
          <div
            key={it.id}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 18px",
              borderBottom: i < itens.length - 1 ? `1px solid ${M.borderSoft}` : "none",
            }}
          >
            {/* Código */}
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 12,
              color: M.textMute, width: 30, flexShrink: 0,
            }}>
              {it.codigo}
            </span>
            {/* Nome do ambiente */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: M.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </div>
              {it.aptidao_obs && (
                <div style={{ fontSize: 11.5, color: M.amber, marginTop: 2 }}>↳ {it.aptidao_obs}</div>
              )}
            </div>
            {/* Aptidão badge */}
            <MBadge color={apt.color} soft={apt.soft}>{apt.label}</MBadge>
          </div>
        );
      })}
    </div>
  );
}

// ─── PlaceholderPanel ─────────────────────────────────────────────────────────
function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
      <PanelHead>{title}</PanelHead>
      <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: M.textFaint }}>
        <span style={{
          display: "inline-flex", alignItems: "center",
          background: M.panel2, border: `1px solid ${M.border}`,
          padding: "2px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, color: M.textFaint,
        }}>em breve</span>
        Esta seção estará disponível em breve.
      </div>
    </div>
  );
}

// ─── LoteDetalhePage ──────────────────────────────────────────────────────────
function LoteDetalhePage() {
  useMoveria();
  const navigate  = useNavigate();
  const { loteId } = Route.useParams();

  // ── Lote details ──
  const { data: lote, isLoading: loadingLote } = useQuery<LoteFullRow | null>({
    queryKey: ["moveria_lote_detalhe", loteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_lotes_v")
        .select("id, numero, status, conformado_em, criado_em, contrato_id, contrato_numero, cliente_id, cliente_nome, consultor_nome, qtd_itens, tem_ressalva")
        .eq("id", loteId)
        .maybeSingle();
      return (data as LoteFullRow | null) ?? null;
    },
  });

  // ── Client tipo (PF/PJ) — only when lote is loaded ──
  const { data: clienteTipo = "—" as const } = useQuery<"PF" | "PJ" | "—">({
    queryKey: ["moveria_cliente_tipo_lote", lote?.cliente_id],
    enabled: !!lote?.cliente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_clientes_v")
        .select("cpf_mascarado, cnpj_hash")
        .eq("id", lote!.cliente_id!)
        .maybeSingle();
      const cl = data as { cpf_mascarado: string | null; cnpj_hash: string | null } | null;
      return cl?.cnpj_hash ? "PJ" : cl?.cpf_mascarado ? "PF" : "—";
    },
  });

  // ── Ambientes (items in this lote, with aptidão info) ──
  const { data: ambientes = [], isLoading: loadingItens } = useQuery<AmbienteRow[]>({
    queryKey: ["moveria_lote_ambientes", loteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_contrato")
        .select("id, codigo, descricao, ambiente, aptidao, aptidao_obs, ordem")
        .eq("lote_id", loteId)
        .is("deletado_em", null)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as AmbienteRow[];
    },
  });

  // ── Loading ──
  if (loadingLote) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 64, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // ── Not found ──
  if (!lote) {
    return (
      <div
        className="-m-6 md:-m-8"
        style={{ background: M.bg, minHeight: "calc(100vh - 4rem)", padding: "24px 32px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div
          onClick={() => navigate({ to: "/contratos/lotes" })}
          style={{ color: M.textMute, fontSize: 13, marginBottom: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          ← Lotes
        </div>
        <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel, padding: 32, textAlign: "center", fontSize: 13, color: M.textFaint }}>
          Lote não encontrado.
        </div>
      </div>
    );
  }

  const st = STATUS_CFG[lote.status] ?? { label: lote.status, color: M.textFaint, soft: "#1a1d24" };

  return (
    <div
      className="-m-6 md:-m-8"
      style={{ background: M.bg, minHeight: "calc(100vh - 4rem)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ padding: "24px 32px" }}>
        {/* ── Back link ── */}
        <div
          onClick={() => navigate({ to: "/contratos/lotes" })}
          style={{ color: M.textMute, fontSize: 13, marginBottom: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          ← Lotes
        </div>

        {/* ── Contract banner ── */}
        <ContractBanner lote={lote} clienteTipo={clienteTipo} />

        {/* ── Header: lote number + badges ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: M.text }}>
            Lote{" "}
            <span style={{ fontFamily: "'DM Mono', monospace", color: M.accent }}>{lote.numero}</span>
          </h2>
          <MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge>
          {lote.tem_ressalva && (
            <MBadge color={M.amber} soft={M.amberSoft}>⚠ Contém ressalva</MBadge>
          )}
        </div>

        {/* ── Cycle progress ruler ── */}
        <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, padding: "20px 28px", marginBottom: 20 }}>
          <CycleStepper status={lote.status} />
        </div>

        {/* ── Two-column body ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
          {/* Left: ambiente composition */}
          <ComposicaoTable itens={ambientes} loading={loadingItens} />

          {/* Right: side panels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PlaceholderPanel title="Apresentação técnica" />
            <PlaceholderPanel title="Interessados" />
          </div>
        </div>
      </div>
    </div>
  );
}
