import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

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
export const Route = createFileRoute("/_authenticated/contratos/contrato/$contratoId")({
  ssr: false,
  component: ContratoDetalhePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type ContratoRow = {
  id: string;
  numero: string;
  status: string;
  cliente_id: string | null;
  vendedor_id: string | null;
  data_contrato: string | null;
};

type LoteRow = {
  id: string;
  numero: string;
  status: string;
  criado_em: string;
  contrato_id: string | null;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
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

function ProgressTrack({ status }: { status: string }) {
  if (status === "cancelado") {
    return <span style={{ color: M.red, fontSize: 11, fontWeight: 600 }}>● Cancelado</span>;
  }
  const idx    = PROGRESS_STAGES.indexOf(status as typeof PROGRESS_STAGES[number]);
  const isPost = status === "concluido";
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {PROGRESS_STAGES.map((s, i) => {
        const cfg    = STATUS_CFG[s];
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

// ─── DesignacaoEmMassaBlock ───────────────────────────────────────────────────
function DesignacaoEmMassaBlock({ contratoId }: { contratoId: string }) {
  const queryClient                         = useQueryClient();
  const [consultorId, setConsultorId]       = useState("");
  const [dataPrevista, setDataPrevista]     = useState("");
  const [confirmOpen, setConfirmOpen]       = useState(false);

  const selectCss: React.CSSProperties = {
    background: M.panel2, color: M.text,
    border: `1px solid ${M.border}`, borderRadius: 7,
    padding: "7px 10px", fontSize: 12.5, outline: "none",
    fontFamily: "'DM Sans', system-ui, sans-serif", cursor: "pointer",
    width: "100%",
  };

  const { data: consultores = [] } = useQuery<{ id: string; full_name: string | null }[]>({
    queryKey: ["moveria_consultores_massa"],
    queryFn: async () => {
      const { data: membros } = await supabase
        .from("moveria_membros")
        .select("id, profile_id")
        .eq("papel", "consultor_tecnico")
        .eq("ativo", true);
      const ids = (membros ?? []).map((m: any) => m.profile_id as string);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      return (membros ?? []).map((m: any) => ({
        id: m.id as string,
        full_name: (profs ?? []).find((p: any) => p.id === m.profile_id)?.full_name ?? null,
      }));
    },
  });

  const { data: qtdAmbientes = 0 } = useQuery<number>({
    queryKey: ["moveria_ambientes_count_massa", contratoId],
    queryFn: async () => {
      const { count } = await supabase
        .from("moveria_itens_contrato")
        .select("id", { count: "exact", head: true })
        .eq("contrato_id", contratoId)
        .is("deletado_em", null);
      return count ?? 0;
    },
  });

  const consultorNome = consultores.find(c => c.id === consultorId)?.full_name ?? "";

  const designar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("moveria_fn_designar_contrato", {
        p_contrato_id:   contratoId,
        p_consultor_id:  consultorId,
        p_data_prevista: dataPrevista || null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (qtd) => {
      const dataStr = dataPrevista
        ? new Date(dataPrevista + "T12:00:00").toLocaleDateString("pt-BR")
        : "sem previsão";
      toast.success(
        `${qtd} ambiente${qtd !== 1 ? "s" : ""} designado${qtd !== 1 ? "s" : ""} para ${consultorNome} — previsão de medição: ${dataStr}`
      );
      queryClient.invalidateQueries({ queryKey: ["moveria_designacoes_ativas"] });
      setConfirmOpen(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Erro ao designar"),
  });

  return (
    <div style={{
      marginTop: 24, background: M.panel, border: `1px solid ${M.border}`,
      borderRadius: 12, padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 14 }}>
        Designação em Massa
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 220px" }}>
          <label style={{ fontSize: 11.5, color: M.textMute }}>Consultor Técnico</label>
          <select value={consultorId} onChange={e => setConsultorId(e.target.value)} style={selectCss}>
            <option value="">Selecionar…</option>
            {consultores.map(c => (
              <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "0 0 auto" }}>
          <label style={{ fontSize: 11.5, color: M.textMute }}>Previsão de medição (opcional)</label>
          <input
            type="date"
            value={dataPrevista}
            onChange={e => setDataPrevista(e.target.value)}
            style={{ ...selectCss, width: "auto", cursor: "default" }}
          />
        </div>
        <button
          disabled={!consultorId}
          onClick={() => setConfirmOpen(true)}
          style={{
            flexShrink: 0, padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: consultorId ? M.accent : M.panel2,
            color: consultorId ? "#fff" : M.textFaint,
            border: `1px solid ${consultorId ? M.accent : M.border}`,
            cursor: consultorId ? "pointer" : "not-allowed",
            transition: "all .1s",
          }}
        >
          Atribuir a todos os ambientes
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="border-none"
          style={{ background: M.panel, border: `1px solid ${M.border}`, color: M.text,
                   fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: M.text }}>Confirmar designação em massa</DialogTitle>
            <DialogDescription style={{ color: M.textMute }}>
              {qtdAmbientes} ambiente{qtdAmbientes !== 1 ? "s" : ""} serão designados para{" "}
              <strong style={{ color: M.text }}>{consultorNome || "—"}</strong>
              {dataPrevista && (
                <> com previsão de medição em{" "}
                  <strong style={{ color: M.text }}>
                    {new Date(dataPrevista + "T12:00:00").toLocaleDateString("pt-BR")}
                  </strong>
                </>
              )}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                background: "transparent", color: M.textMute,
                border: `1px solid ${M.border}`, cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => designar.mutate()}
              disabled={designar.isPending}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                background: M.accent, color: "#fff",
                border: `1px solid ${M.accent}`,
                cursor: designar.isPending ? "not-allowed" : "pointer",
                opacity: designar.isPending ? 0.7 : 1,
              }}
            >
              {designar.isPending ? "Aguarde…" : "Confirmar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ContratoDetalhePage ──────────────────────────────────────────────────────
function ContratoDetalhePage() {
  useMoveria();
  const navigate      = useNavigate();
  const { contratoId } = Route.useParams();
  const { profile, globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";

  // ── Contrato ──
  const { data: contrato, isLoading: loadingContrato } = useQuery<ContratoRow | null>({
    queryKey: ["moveria_contrato_detalhe", contratoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero, status, cliente_id, vendedor_id, data_contrato")
        .eq("id", contratoId)
        .maybeSingle();
      return (data as ContratoRow | null) ?? null;
    },
  });

  // ── Client info (nome + tipo PF/PJ) ──
  const { data: clienteInfo } = useQuery<{ nome: string; tipo: "PF" | "PJ" | "—" } | null>({
    queryKey: ["moveria_cliente_info_contrato", contrato?.cliente_id],
    enabled: !!contrato?.cliente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_clientes_v")
        .select("nome_completo, cpf_mascarado, cnpj_hash")
        .eq("id", contrato!.cliente_id!)
        .maybeSingle();
      const cl = data as { nome_completo: string; cpf_mascarado: string | null; cnpj_hash: string | null } | null;
      if (!cl) return null;
      return {
        nome: cl.nome_completo,
        tipo: cl.cnpj_hash ? "PJ" : cl.cpf_mascarado ? "PF" : "—",
      };
    },
  });

  // ── Vendedor name ──
  const { data: vendedorNome = "—" } = useQuery<string>({
    queryKey: ["moveria_vendedor_nome", contrato?.vendedor_id],
    enabled: !!contrato?.vendedor_id,
    queryFn: async () => {
      const { data: mb } = await supabase
        .from("moveria_membros")
        .select("profile_id")
        .eq("id", contrato!.vendedor_id!)
        .maybeSingle();
      if (!mb) return "—";
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", (mb as any).profile_id)
        .maybeSingle();
      return (prof as any)?.full_name ?? "—";
    },
  });

  // ── User's Moveria papel (for access control) ──
  const { data: membro } = useQuery<{ id: string; papel: string } | null>({
    queryKey: ["meu_membro_moveria", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_membros")
        .select("id, papel")
        .eq("profile_id", profile!.id)
        .eq("ativo", true)
        .maybeSingle();
      return (data as { id: string; papel: string } | null) ?? null;
    },
  });

  // ── Lotes for this contract (ordered by criado_em — never by status enum) ──
  const { data: lotes = [], isLoading: loadingLotes } = useQuery<LoteRow[]>({
    queryKey: ["moveria_lotes_do_contrato", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_lotes_v")
        .select("id, numero, status, criado_em, contrato_id, consultor_nome, qtd_itens, tem_ressalva")
        .eq("contrato_id", contratoId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  const isVendedor = membro?.papel === "vendedor";

  // ── Loading ──
  if (loadingContrato) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 64, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // ── Not found ──
  if (!contrato) {
    return (
      <div
        className="-m-6 md:-m-8"
        style={{ background: M.bg, minHeight: "calc(100vh - 4rem)", padding: "24px 32px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div onClick={() => navigate({ to: "/contratos" })} style={{ color: M.textMute, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
          ← Contratos
        </div>
        <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel, padding: 32, textAlign: "center", fontSize: 13, color: M.textFaint }}>
          Contrato não encontrado.
        </div>
      </div>
    );
  }

  return (
    <div
      className="-m-6 md:-m-8"
      style={{ background: M.bg, minHeight: "calc(100vh - 4rem)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ padding: "24px 32px" }}>
        {/* ── Back link ── */}
        <div
          onClick={() => navigate({ to: "/contratos" })}
          style={{ color: M.textMute, fontSize: 13, marginBottom: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          ← Contratos
        </div>

        {/* ── Contract Banner (contexto isolado) ── */}
        <div style={{
          background: `linear-gradient(180deg, ${M.accentSoft}, ${M.panel})`,
          border: `1px solid ${M.accent}44`,
          borderRadius: 12, padding: "16px 20px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 10.5, color: M.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            ● Contexto isolado
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 21, fontWeight: 700, color: M.text }}>
              {contrato.numero}
            </span>
            {clienteInfo?.nome && (
              <span style={{ fontSize: 15, color: M.text }}>{clienteInfo.nome}</span>
            )}
            {clienteInfo?.tipo && clienteInfo.tipo !== "—" && (
              <span style={{
                display: "inline-flex", background: M.panel2, color: M.textMute,
                border: `1px solid ${M.border}`, padding: "1px 8px",
                borderRadius: 5, fontSize: 11, fontWeight: 600,
              }}>{clienteInfo.tipo}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: M.textMute, marginTop: 6 }}>
            {lotes.length} lote{lotes.length !== 1 ? "s" : ""}
            {vendedorNome !== "—" && <> · consultor {vendedorNome}</>}
            {contrato.data_contrato && (
              <> · {new Date(contrato.data_contrato).toLocaleDateString("pt-BR")}</>
            )}
          </div>
        </div>

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {/* Vendedores não têm acesso à tela de medição */}
          {!isVendedor && (
            <div
              onClick={() => navigate({ to: "/contratos/medicao" })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                background: M.accent, color: "#fff", border: `1px solid ${M.accent}`,
                cursor: "pointer",
              }}
            >
              ⊹ Abrir medição
            </div>
          )}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: "transparent", color: M.textMute, border: `1px solid ${M.border}`,
            cursor: "default",
          }}>
            Gerenciar interessados
            <span style={{ fontSize: 10, background: M.panel2, border: `1px solid ${M.border}`, padding: "0 6px", borderRadius: 4, color: M.textFaint }}>em breve</span>
          </div>
        </div>

        {/* ── Lotes deste contrato ── */}
        <div style={{ fontSize: 11, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
          Lotes deste contrato
        </div>

        {loadingLotes ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />
          </div>
        ) : lotes.length === 0 ? (
          <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel, padding: 28, textAlign: "center", fontSize: 13, color: M.textFaint }}>
            Nenhum lote conformado para este contrato ainda.
          </div>
        ) : (
          <div style={{ background: M.panel, border: `1px solid ${M.border}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "56px 1fr 150px 44px 72px",
              padding: "10px 18px", background: M.panel2,
              borderBottom: `1px solid ${M.border}`,
              fontSize: 10.5, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
            }}>
              <div>Lote</div>
              <div>Status</div>
              <div>Progresso</div>
              <div>Amb.</div>
              <div>Criado</div>
            </div>
            {/* Rows */}
            {lotes.map(l => {
              const st  = STATUS_CFG[l.status] ?? { label: l.status, color: M.textFaint, soft: "#1a1d24" };
              const dia = new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              return (
                <div
                  key={l.id}
                  onClick={() => navigate({ to: "/contratos/lote/$loteId", params: { loteId: l.id } })}
                  style={{
                    display: "grid", gridTemplateColumns: "56px 1fr 150px 44px 72px",
                    padding: "12px 18px", borderBottom: `1px solid ${M.borderSoft}`,
                    alignItems: "center", fontSize: 13, cursor: "pointer",
                    transition: "background .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = M.panel2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: M.text }}>
                      {l.numero}
                    </span>
                    {l.tem_ressalva && <span style={{ color: M.amber, fontSize: 12 }}>⚠</span>}
                  </div>
                  <div><MBadge color={st.color} soft={st.soft} dot>{st.label}</MBadge></div>
                  <div><ProgressTrack status={l.status} /></div>
                  <div style={{ fontFamily: "'DM Mono', monospace", color: M.textMute }}>{l.qtd_itens}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: M.textFaint }}>{dia}</div>
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && <DesignacaoEmMassaBlock contratoId={contratoId} />}
      </div>
    </div>
  );
}
