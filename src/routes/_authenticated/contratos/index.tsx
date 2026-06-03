import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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
} as const;

const CONTRATO_STATUS_CFG: Record<string, { label: string; color: string; soft: string }> = {
  importado:    { label: "Importado",    color: M.textFaint, soft: "#1a1d24"    },
  em_andamento: { label: "Em andamento", color: M.accent,    soft: M.accentSoft },
  concluido:    { label: "Concluído",    color: M.green,     soft: M.greenSoft  },
  cancelado:    { label: "Cancelado",    color: M.red,       soft: M.redSoft    },
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
export const Route = createFileRoute("/_authenticated/contratos/")({
  ssr: false,
  component: ContratosIndexPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type EnrichedContrato = {
  id: string;
  numero: string;
  status: string;
  data_contrato: string | null;
  clienteNome: string;
  clienteTipo: "PF" | "PJ" | "—";
  vendedorNome: string;
  qtdAmbientes: number;
};

// ─── Primitives ───────────────────────────────────────────────────────────────
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

// ─── ContratosIndexPage ───────────────────────────────────────────────────────
function ContratosIndexPage() {
  useMoveria();
  const navigate = useNavigate();

  const { data: contratos = [], isLoading } = useQuery<EnrichedContrato[]>({
    queryKey: ["moveria_contratos_enriquecidos"],
    queryFn: async (): Promise<EnrichedContrato[]> => {
      // 1. Contracts
      const { data: rawContratos, error: ce } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero, status, cliente_id, vendedor_id, data_contrato")
        .order("numero");
      if (ce) throw ce;
      if (!rawContratos?.length) return [];

      const contratoList = rawContratos as {
        id: string; numero: string; status: string;
        cliente_id: string | null; vendedor_id: string | null; data_contrato: string | null;
      }[];

      const clienteIds  = [...new Set(contratoList.map(c => c.cliente_id).filter(Boolean) as string[])];
      const vendedorIds = [...new Set(contratoList.map(c => c.vendedor_id).filter(Boolean) as string[])];

      // 2. Parallel: clients + vendedor members + item counts
      const [
        { data: clientes },
        { data: membros },
        { data: allItems },
      ] = await Promise.all([
        clienteIds.length > 0
          ? supabase.from("moveria_clientes_v").select("id, nome_completo, cpf_mascarado, cnpj_hash").in("id", clienteIds)
          : Promise.resolve({ data: [] as any[] }),
        vendedorIds.length > 0
          ? supabase.from("moveria_membros").select("id, profile_id").in("id", vendedorIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("moveria_itens_contrato").select("contrato_id").is("deletado_em", null),
      ]);

      // 3. Profile names for vendedores
      const profileIds = (membros ?? []).map((m: any) => m.profile_id as string);
      const { data: profs } = profileIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
        : { data: [] as any[] };

      // 4. Build item count map
      const itemCountMap = new Map<string, number>();
      (allItems ?? []).forEach((item: any) => {
        if (item.contrato_id) {
          itemCountMap.set(item.contrato_id, (itemCountMap.get(item.contrato_id) ?? 0) + 1);
        }
      });

      // 5. Enrich
      return contratoList.map(c => {
        const cl   = (clientes ?? []).find((x: any) => x.id === c.cliente_id);
        const mb   = (membros  ?? []).find((x: any) => x.id === c.vendedor_id);
        const prof = mb ? (profs ?? []).find((x: any) => x.id === mb.profile_id) : null;
        return {
          id:            c.id,
          numero:        c.numero,
          status:        c.status,
          data_contrato: c.data_contrato,
          clienteNome:  (cl   as any)?.nome_completo ?? "—",
          clienteTipo:  (cl   as any)?.cnpj_hash ? "PJ" : (cl as any)?.cpf_mascarado ? "PF" : "—",
          vendedorNome: (prof as any)?.full_name ?? "—",
          qtdAmbientes: itemCountMap.get(c.id) ?? 0,
        } as EnrichedContrato;
      });
    },
  });

  return (
    <div
      className="-m-6 md:-m-8"
      style={{ background: M.bg, minHeight: "calc(100vh - 4rem)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ padding: "24px 32px" }}>
        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: M.text, margin: 0 }}>Contratos</h2>
          {!isLoading && (
            <span style={{ fontSize: 12.5, color: M.textFaint }}>
              {contratos.length} contrato{contratos.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && contratos.length === 0 && (
          <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel, padding: "40px 24px", textAlign: "center", fontSize: 13, color: M.textFaint }}>
            Nenhum contrato encontrado.
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && contratos.length > 0 && (
          <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "140px 1.4fr 64px 68px 1fr 100px",
              padding: "10px 18px", background: M.panel2,
              borderBottom: `1px solid ${M.border}`,
              fontSize: 10.5, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
            }}>
              <div>Número</div>
              <div>Cliente</div>
              <div>Tipo</div>
              <div>Ambientes</div>
              <div>Consultor</div>
              <div>Status</div>
            </div>

            {/* Rows */}
            {contratos.map(c => {
              const st = CONTRATO_STATUS_CFG[c.status] ?? { label: c.status, color: M.textFaint, soft: "#1a1d24" };
              const dataFmt = c.data_contrato
                ? new Date(c.data_contrato).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                : null;
              return (
                <div
                  key={c.id}
                  onClick={() => navigate({ to: "/contratos/contrato/$contratoId", params: { contratoId: c.id } })}
                  style={{
                    display: "grid", gridTemplateColumns: "140px 1.4fr 64px 68px 1fr 100px",
                    padding: "13px 18px", borderBottom: `1px solid ${M.borderSoft}`,
                    alignItems: "center", fontSize: 13, cursor: "pointer",
                    transition: "background .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = M.panel2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Número */}
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: M.text }}>
                      {c.numero}
                    </div>
                    {dataFmt && (
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: M.textFaint, marginTop: 1 }}>
                        {dataFmt}
                      </div>
                    )}
                  </div>
                  {/* Cliente */}
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: M.text }}>
                    {c.clienteNome}
                  </div>
                  {/* Tipo PF/PJ */}
                  <div>
                    {c.clienteTipo !== "—" && (
                      <span style={{
                        display: "inline-flex", background: M.panel2, color: M.textMute,
                        border: `1px solid ${M.border}`, padding: "1px 8px",
                        borderRadius: 5, fontSize: 11, fontWeight: 600,
                      }}>{c.clienteTipo}</span>
                    )}
                  </div>
                  {/* Nº ambientes */}
                  <div style={{ fontFamily: "'DM Mono', monospace", color: M.textMute }}>
                    {c.qtdAmbientes > 0 ? c.qtdAmbientes : <span style={{ color: M.textFaint }}>—</span>}
                  </div>
                  {/* Consultor */}
                  <div style={{ color: M.textMute, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.vendedorNome}
                  </div>
                  {/* Status */}
                  <div>
                    <MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
