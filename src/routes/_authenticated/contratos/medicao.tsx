import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LoaderCircle, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
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
} as const;

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
export const Route = createFileRoute("/_authenticated/contratos/medicao")({
  ssr: false,
  component: MedicaoPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type MembroRow   = { id: string; papel: string };
type ContratoOpt = { id: string; numero: string };
type AmbienteRow = {
  id: string; codigo: string; descricao: string;
  ambiente: string | null;
  aptidao: "pendente" | "apto" | "apto_ressalva" | "inapto";
  aptidao_obs: string | null; ordem: number | null;
};
type MedicaoRow = { id: string; contrato_id: string; consultor_id: string; data_visita: string; status: string };
type QBloco     = { id: string; chave: string; label: string; ordem: number };
type QOpcao     = { id: string; bloco_id: string; label: string; tem_campo_valor: boolean; ordem: number };
type Questionario = {
  pedireito_opcao_id:   string | null; pedireito_valor:   string | null;
  bancadas_opcao_id:    string | null; bancadas_valor:    string | null;
  instalacoes_opcao_id: string | null; instalacoes_valor: string | null;
  eletros_opcao_id:     string | null; eletros_valor:     string | null;
  observacoes: string | null;
};
type Desenho      = { id: string; item_id: string; path: string };
type ContratoInfo = { numero: string; clienteNome: string; tipo: "PF" | "PJ" | "—" };

// ─── Constants ────────────────────────────────────────────────────────────────
type Aptidao    = "pendente" | "apto" | "apto_ressalva" | "inapto";
type BlocoChave = "pedireito" | "bancadas" | "instalacoes" | "eletros";
const BLOCO_CHAVES: BlocoChave[] = ["pedireito", "bancadas", "instalacoes", "eletros"];
type FormQ = Record<BlocoChave, { opcao_id: string; valor: string }>;
const EMPTY_FORM: FormQ = {
  pedireito:   { opcao_id: "", valor: "" },
  bancadas:    { opcao_id: "", valor: "" },
  instalacoes: { opcao_id: "", valor: "" },
  eletros:     { opcao_id: "", valor: "" },
};

function rpcFriendly(msg: string): string {
  if (/sem itens aptos/i.test(msg))
    return "Nenhum ambiente apto ou apto com ressalva. Marque a aptidão antes de conformar.";
  if (/questionário completo|blocos obrigatórios/i.test(msg))
    return "Há ambientes aptos com questionário incompleto. Preencha todas as opções obrigatórias.";
  return msg;
}

function Spinner() {
  return <LoaderCircle style={{ color: M.textMute }} className="w-5 h-5 animate-spin" />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ─── MedicaoPage ──────────────────────────────────────────────────────────────
function MedicaoPage() {
  useMoveria();
  const { profile } = useAuth();
  const [activeMedicao, setActiveMedicao] = useState<MedicaoRow | null>(null);

  const { data: membro, isLoading } = useQuery<MembroRow | null>({
    queryKey: ["meu_membro_moveria", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_membros")
        .select("id, papel")
        .eq("profile_id", profile!.id)
        .eq("ativo", true)
        .maybeSingle();
      return (data as MembroRow | null) ?? null;
    },
  });

  if (isLoading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <Spinner />
    </div>
  );

  if (!membro || membro.papel === "vendedor") {
    return (
      <div style={{
        borderRadius: 10, border: `1px solid ${M.border}`,
        background: M.panel, padding: "40px 24px",
        textAlign: "center", fontSize: 13, color: M.textMute,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        Acesso restrito. Exclusivo para consultores técnicos e administradores do módulo Moveria.
      </div>
    );
  }

  return activeMedicao ? (
    <MedicaoWorkspace medicao={activeMedicao} membro={membro} onExit={() => setActiveMedicao(null)} />
  ) : (
    <SessionStarter membro={membro} onSession={setActiveMedicao} />
  );
}

// ─── SessionStarter ───────────────────────────────────────────────────────────
function SessionStarter({ membro, onSession }: { membro: MembroRow; onSession: (m: MedicaoRow) => void }) {
  const [contratoId, setContratoId] = useState("");
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const { data: contratos = [] } = useQuery<ContratoOpt[]>({
    queryKey: ["medicao_contratos_disponiveis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero")
        .eq("status", "em_andamento")
        .order("numero");
      if (error) throw error;
      return (data ?? []) as ContratoOpt[];
    },
  });

  const { data: sessaoExistente, isLoading: checkingSession } = useQuery<MedicaoRow | null>({
    queryKey: ["medicao_em_andamento", contratoId],
    enabled: !!contratoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_medicoes")
        .select("id, contrato_id, consultor_id, data_visita, status")
        .eq("contrato_id", contratoId)
        .eq("status", "em_andamento")
        .maybeSingle();
      return (data as MedicaoRow | null) ?? null;
    },
  });

  async function handleStart() {
    if (!contratoId) return;
    setBusy(true);
    try {
      if (sessaoExistente) { onSession(sessaoExistente); return; }
      const { data, error } = await supabase
        .from("moveria_medicoes")
        .insert({ contrato_id: contratoId, consultor_id: membro.id, data_visita: dataVisita })
        .select("id, contrato_id, consultor_id, data_visita, status")
        .single();
      if (error) throw error;
      onSession(data as MedicaoRow);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao iniciar medição");
    } finally {
      setBusy(false);
    }
  }

  const inputCss: React.CSSProperties = {
    width: "100%", background: M.panel2, color: M.text,
    border: `1px solid ${M.border}`, borderRadius: 7,
    padding: "8px 12px", fontSize: 13, outline: "none",
    fontFamily: "inherit",
  };

  const disabled = !contratoId || busy || checkingSession;

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", maxWidth: 440 }}>
      <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.panel, padding: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: M.text, marginBottom: 20 }}>
          Nova medição / Retomar sessão
        </p>

        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Contrato</FieldLabel>
          <select value={contratoId} onChange={e => setContratoId(e.target.value)} style={{ ...inputCss, cursor: "pointer" }}>
            <option value="">Selecione um contrato…</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </div>

        {contratoId && checkingSession && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: M.textMute, marginBottom: 10 }}>
            <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Verificando sessão…
          </div>
        )}

        {contratoId && !checkingSession && sessaoExistente && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            borderRadius: 8, border: `1px solid ${M.amber}44`,
            background: M.amberSoft, padding: "8px 12px",
            fontSize: 12, color: M.amber, marginBottom: 14,
          }}>
            <span>⚠</span>
            Sessão em andamento desde{" "}
            {new Date(sessaoExistente.data_visita + "T12:00:00").toLocaleDateString("pt-BR")}.
          </div>
        )}

        {contratoId && !checkingSession && !sessaoExistente && (
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Data da visita</FieldLabel>
            <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)}
              style={{ ...inputCss, colorScheme: "dark" } as React.CSSProperties} />
          </div>
        )}

        <div
          onClick={!disabled ? handleStart : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "9px 16px", borderRadius: 8,
            border: `1px solid ${M.accent}`,
            background: disabled ? M.accentSoft : M.accent,
            color: disabled ? M.accent : "#fff",
            fontSize: 13, fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.7 : 1,
            transition: "all .12s",
          }}
        >
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
          {sessaoExistente ? "Continuar medição" : "Iniciar medição"}
        </div>
      </div>
    </div>
  );
}

// ─── MedicaoWorkspace ─────────────────────────────────────────────────────────
function MedicaoWorkspace({
  medicao, membro, onExit,
}: {
  medicao: MedicaoRow; membro: MembroRow; onExit: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"aptidao" | "questionario">("aptidao");

  const { data: contratoInfo } = useQuery<ContratoInfo | null>({
    queryKey: ["moveria_contrato_info", medicao.contrato_id],
    queryFn: async () => {
      const { data: c } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero, cliente_id")
        .eq("id", medicao.contrato_id)
        .maybeSingle();
      if (!c) return null;
      const row = c as unknown as { numero: string; cliente_id: string };
      const { data: cl } = await supabase
        .from("moveria_clientes_v")
        .select("nome_completo, cpf_mascarado, cnpj_hash")
        .eq("id", row.cliente_id)
        .maybeSingle();
      const cli = cl as unknown as { nome_completo: string; cpf_mascarado: string | null; cnpj_hash: string | null } | null;
      return {
        numero: row.numero,
        clienteNome: cli?.nome_completo ?? "—",
        tipo: cli?.cnpj_hash ? "PJ" : cli?.cpf_mascarado ? "PF" : "—",
      } as ContratoInfo;
    },
  });

  const { data: ambientes = [], isLoading, refetch: refetchItems } = useQuery<AmbienteRow[]>({
    queryKey: ["medicao_ambientes", medicao.contrato_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_contrato")
        .select("id, codigo, descricao, ambiente, aptidao, aptidao_obs, ordem")
        .eq("contrato_id", medicao.contrato_id)
        .is("deletado_em", null)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as AmbienteRow[];
    },
  });

  const { data: questData } = useQuery({
    queryKey: ["moveria_q_blocos_opcoes"],
    queryFn: async () => {
      const [{ data: bl }, { data: op }] = await Promise.all([
        supabase.from("moveria_q_blocos").select("id, chave, label, ordem").eq("ativo", true).order("ordem"),
        supabase.from("moveria_q_opcoes").select("id, bloco_id, label, tem_campo_valor, ordem").eq("ativo", true).order("ordem"),
      ]);
      return { blocos: (bl ?? []) as QBloco[], opcoes: (op ?? []) as QOpcao[] };
    },
  });

  const selectedItem = ambientes.find(a => a.id === selectedId) ?? null;
  const nAptos    = ambientes.filter(a => a.aptidao === "apto" || a.aptidao === "apto_ressalva").length;
  const nPendente = ambientes.filter(a => a.aptidao === "pendente").length;

  return (
    <div
      className="-m-6 md:-m-8"
      style={{
        display: "flex", flexDirection: "column",
        height: "calc(100vh - 4rem)",
        background: M.bg,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Contract banner ── */}
      <div style={{
        background: `linear-gradient(180deg, ${M.accentSoft}, ${M.panel})`,
        borderBottom: `1px solid ${M.accent}44`,
        padding: "10px 24px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
          {/* Left: contract info */}
          <div>
            <div style={{ fontSize: 10.5, color: M.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>
              ● Contexto isolado · Medição em campo
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: M.text }}>
                {contratoInfo?.numero ?? "…"}
              </span>
              {contratoInfo?.clienteNome && contratoInfo.clienteNome !== "—" && (
                <span style={{ fontSize: 13, color: M.text }}>{contratoInfo.clienteNome}</span>
              )}
              {contratoInfo?.tipo && contratoInfo.tipo !== "—" && (
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  background: M.panel2, color: M.textMute,
                  border: `1px solid ${M.border}`,
                  padding: "1px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                }}>{contratoInfo.tipo}</span>
              )}
              <span style={{ fontSize: 11, color: M.textFaint }}>
                · Visita: {new Date(medicao.data_visita + "T12:00:00").toLocaleDateString("pt-BR")}
              </span>
            </div>
          </div>
          {/* Right: stats + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: M.textMute }}>
              <span style={{ color: M.green, fontWeight: 600 }}>{nAptos}</span> apto(s)
              {nPendente > 0 && (
                <> · <span style={{ color: M.amber, fontWeight: 600 }}>{nPendente}</span> pendente(s)</>
              )}
            </span>
            <ConformarButton medicao={medicao} membro={membro} ambientes={ambientes} onSuccess={onExit} />
            <div
              onClick={onExit}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, color: M.textMute, cursor: "pointer",
                padding: "6px 10px", borderRadius: 7,
                border: `1px solid ${M.border}`,
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Sair
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column content ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left: environments sidebar */}
        <div style={{
          width: 230, flexShrink: 0,
          borderRight: `1px solid ${M.border}`,
          background: M.panel,
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${M.borderSoft}`, flexShrink: 0 }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, color: M.textFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Ambientes ({ambientes.length})
            </p>
          </div>

          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
          ) : (
            ambientes.map(a => {
              const apt = APT_CFG[a.aptidao] ?? APT_CFG.pendente;
              const active = selectedId === a.id;
              return (
                <div
                  key={a.id}
                  onClick={() => { setSelectedId(a.id); setTab("aptidao"); }}
                  style={{
                    padding: "11px 16px",
                    borderBottom: `1px solid ${M.borderSoft}`,
                    background: active ? M.panel2 : "transparent",
                    borderLeft: `2px solid ${active ? M.accent : "transparent"}`,
                    cursor: "pointer",
                    transition: "background .1s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: 12.5, fontWeight: active ? 600 : 500,
                        color: active ? M.text : M.textMute,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {a.ambiente || a.descricao || a.codigo}
                      </p>
                      <p style={{ fontSize: 11, color: M.textFaint, marginTop: 1 }}>{a.codigo}</p>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: apt.color }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: detail panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: M.bg }}>
          {!selectedItem ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: M.textFaint }}>
              Selecione um ambiente à esquerda.
            </div>
          ) : (
            // key forces remount when switching items — preserves same behavior as original
            <div key={selectedItem.id} style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
              {/* Custom dark tab bar */}
              <div style={{
                display: "flex", background: M.panel2,
                borderBottom: `1px solid ${M.border}`, flexShrink: 0,
              }}>
                {(["aptidao", "questionario"] as const).map((k) => {
                  const label = k === "aptidao" ? "Aptidão & Desenhos" : "Questionário do ambiente";
                  return (
                    <div
                      key={k}
                      onClick={() => setTab(k)}
                      style={{
                        padding: "12px 18px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        color: tab === k ? M.text : M.textMute,
                        borderBottom: tab === k ? `2px solid ${M.accent}` : "2px solid transparent",
                        transition: "all .1s",
                      }}
                    >{label}</div>
                  );
                })}
                <div style={{ flex: 1 }} />
                <div style={{ padding: "12px 18px", fontSize: 12, color: M.textFaint, fontStyle: "italic" }}>
                  {selectedItem.ambiente || selectedItem.descricao || selectedItem.codigo}
                </div>
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, padding: 24 }}>
                {tab === "aptidao" ? (
                  <AptidaoTab item={selectedItem} onUpdate={() => void refetchItems()} />
                ) : questData ? (
                  <QuestionarioTab item={selectedItem} blocos={questData.blocos} opcoes={questData.opcoes} />
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AptidaoTab ───────────────────────────────────────────────────────────────
function AptidaoTab({ item, onUpdate }: { item: AmbienteRow; onUpdate: () => void }) {
  const { profile } = useAuth();
  const [obs, setObs] = useState(item.aptidao_obs ?? "");
  const [savingObs, setSavingObs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const aptMut = useMutation({
    mutationFn: async (aptidao: Aptidao) => {
      const { error } = await supabase
        .from("moveria_itens_contrato")
        .update({ aptidao })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { onUpdate(); toast.success("Aptidão salva"); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar aptidão"),
  });

  async function saveObs() {
    if (obs === (item.aptidao_obs ?? "")) return;
    setSavingObs(true);
    const { error } = await supabase
      .from("moveria_itens_contrato")
      .update({ aptidao_obs: obs || null })
      .eq("id", item.id);
    setSavingObs(false);
    if (error) toast.error(error.message);
    else onUpdate();
  }

  const { data: desenhos = [], refetch: refetchDesenhos } = useQuery<Desenho[]>({
    queryKey: ["moveria_desenhos", item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_desenhos_medicao")
        .select("id, item_id, path")
        .eq("item_id", item.id)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as Desenho[];
    },
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    let n = 0;
    try {
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${item.id}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("moveria-medicoes").upload(path, file);
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase
          .from("moveria_desenhos_medicao")
          .insert({ item_id: item.id, path, enviado_por: profile!.id });
        if (dbErr) throw dbErr;
        n++;
      }
      await refetchDesenhos();
      toast.success(`${n} desenho(s) enviado(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(d: Desenho) {
    await supabase.storage.from("moveria-medicoes").remove([d.path]);
    await supabase.from("moveria_desenhos_medicao").delete().eq("id", d.id);
    await refetchDesenhos();
    toast.success("Desenho removido");
  }

  async function handleView(path: string) {
    const { data, error } = await supabase.storage.from("moveria-medicoes").createSignedUrl(path, 300);
    if (error) { toast.error("Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Aptidão buttons */}
      <div>
        <FieldLabel>Aptidão do ambiente</FieldLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {(["apto", "apto_ressalva", "inapto"] as Aptidao[]).map(a => {
            const cfg = APT_CFG[a];
            const active = item.aptidao === a;
            return (
              <div
                key={a}
                onClick={() => !aptMut.isPending && aptMut.mutate(a)}
                style={{
                  flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 7,
                  fontSize: 12, fontWeight: 600,
                  cursor: aptMut.isPending ? "not-allowed" : "pointer",
                  background: active ? cfg.soft : M.panel2,
                  color: active ? cfg.color : M.textMute,
                  border: `1px solid ${active ? cfg.color + "66" : M.border}`,
                  transition: "all .12s",
                }}
              >{cfg.label}</div>
            );
          })}
          <div
            onClick={() => !aptMut.isPending && aptMut.mutate("pendente")}
            style={{
              padding: "8px 14px", borderRadius: 7,
              fontSize: 12, fontWeight: 600,
              cursor: aptMut.isPending ? "not-allowed" : "pointer",
              background: item.aptidao === "pendente" ? "#1a1d24" : "transparent",
              color: M.textFaint,
              border: `1px solid ${item.aptidao === "pendente" ? M.border : "transparent"}`,
              transition: "all .12s",
            }}
          >Pendente</div>
        </div>
        {aptMut.isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: M.textFaint, marginTop: 5 }}>
            <LoaderCircle className="w-3 h-3 animate-spin" /> Salvando…
          </div>
        )}
      </div>

      {/* Observação */}
      <div>
        <FieldLabel>Observação</FieldLabel>
        <textarea
          rows={3}
          placeholder="Observação sobre a aptidão…"
          value={obs}
          onChange={e => setObs(e.target.value)}
          onBlur={saveObs}
          style={{
            width: "100%", background: M.panel2, color: M.text,
            border: `1px solid ${M.border}`, borderRadius: 8,
            padding: "9px 12px", fontSize: 13, outline: "none",
            resize: "vertical", fontFamily: "inherit",
          }}
        />
        {savingObs && (
          <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: M.textFaint, marginTop: 4 }}>
            <LoaderCircle className="w-3 h-3 animate-spin" /> Salvando…
          </p>
        )}
        {item.aptidao_obs && (
          <p style={{ fontSize: 11, color: M.amber, marginTop: 4 }}>↳ {item.aptidao_obs}</p>
        )}
      </div>

      {/* Desenhos */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <FieldLabel>Desenhos de medição</FieldLabel>
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 7,
              border: `1px solid ${M.border}`, background: M.panel2,
              color: M.textMute, fontSize: 12, fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading
              ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            Enviar
          </div>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.dwg" style={{ display: "none" }} onChange={handleUpload} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {desenhos.map(d => {
            const name = d.path.split("/").slice(1).join("/") || d.path;
            return (
              <div
                key={d.id}
                style={{ width: 82, borderRadius: 7, border: `1px solid ${M.border}`, background: M.panel2, overflow: "hidden" }}
              >
                <div
                  onClick={() => handleView(d.path)}
                  style={{
                    width: "100%", height: 62,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: M.textMute, cursor: "pointer",
                  }}
                >✎</div>
                <div style={{ padding: "4px 6px", borderTop: `1px solid ${M.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: M.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 54 }}>{name}</span>
                  <div onClick={() => handleDelete(d)} style={{ cursor: "pointer", color: M.red, fontSize: 12 }}>✕</div>
                </div>
              </div>
            );
          })}
          {/* Dashed "add" slot */}
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              width: 82, height: 82, borderRadius: 7,
              border: `1.5px dashed ${M.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, color: M.textMute, cursor: "pointer",
            }}
          >+</div>
        </div>

        {desenhos.length === 0 && (
          <p style={{ fontSize: 12, color: M.textFaint, marginTop: 4 }}>Nenhum desenho enviado.</p>
        )}
      </div>
    </div>
  );
}

// ─── QuestionarioTab ──────────────────────────────────────────────────────────
function QuestionarioTab({ item, blocos, opcoes }: { item: AmbienteRow; blocos: QBloco[]; opcoes: QOpcao[] }) {
  const { profile } = useAuth();
  const [form, setForm] = useState<FormQ>(EMPTY_FORM);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: saved, refetch } = useQuery<Questionario | null>({
    queryKey: ["moveria_questionario", item.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_questionario_ambiente")
        .select("*")
        .eq("item_id", item.id)
        .maybeSingle();
      return (data as Questionario | null) ?? null;
    },
  });

  useEffect(() => {
    if (saved === undefined) return;
    if (!saved) { setForm(EMPTY_FORM); setObservacoes(""); return; }
    setForm({
      pedireito:   { opcao_id: saved.pedireito_opcao_id   ?? "", valor: saved.pedireito_valor   ?? "" },
      bancadas:    { opcao_id: saved.bancadas_opcao_id    ?? "", valor: saved.bancadas_valor    ?? "" },
      instalacoes: { opcao_id: saved.instalacoes_opcao_id ?? "", valor: saved.instalacoes_valor ?? "" },
      eletros:     { opcao_id: saved.eletros_opcao_id     ?? "", valor: saved.eletros_valor     ?? "" },
    });
    setObservacoes(saved.observacoes ?? "");
  }, [saved]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        item_id:              item.id,
        pedireito_opcao_id:   form.pedireito.opcao_id   || null,
        pedireito_valor:      form.pedireito.valor       || null,
        bancadas_opcao_id:    form.bancadas.opcao_id     || null,
        bancadas_valor:       form.bancadas.valor        || null,
        instalacoes_opcao_id: form.instalacoes.opcao_id  || null,
        instalacoes_valor:    form.instalacoes.valor     || null,
        eletros_opcao_id:     form.eletros.opcao_id      || null,
        eletros_valor:        form.eletros.valor         || null,
        observacoes:          observacoes || null,
        preenchido_por:       profile!.id,
        atualizado_em:        new Date().toISOString(),
      };
      const { error } = await supabase
        .from("moveria_questionario_ambiente")
        .upsert(payload, { onConflict: "item_id" });
      if (error) throw error;
      await refetch();
      toast.success("Questionário salvo");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const needsQ = item.aptidao === "apto" || item.aptidao === "apto_ressalva";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Status notice */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
        color: needsQ ? M.amber : M.textFaint,
        background: needsQ ? M.amberSoft : M.panel2,
        border: `1px solid ${needsQ ? M.amber + "44" : M.border}`,
        borderRadius: 8, padding: "10px 14px",
      }}>
        {needsQ
          ? <><span>⚠</span> Obrigatório — este ambiente está marcado como apto.</>
          : <>Opcional — ambiente sem aptidão apto definida.</>}
      </div>

      {/* Blocos in 2-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {blocos.map(bloco => {
          const chave = bloco.chave as BlocoChave;
          if (!BLOCO_CHAVES.includes(chave)) return null;
          const blocoOpcoes = opcoes.filter(o => o.bloco_id === bloco.id);
          return (
            <div key={bloco.id}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: M.text, marginBottom: 9 }}>
                {bloco.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {blocoOpcoes.map(o => {
                  const on = form[chave].opcao_id === o.id;
                  return (
                    <div key={o.id}>
                      <div
                        onClick={() => setForm(f => ({ ...f, [chave]: { opcao_id: o.id, valor: "" } }))}
                        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      >
                        <div style={{
                          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${on ? M.accent : M.border}`,
                          background: on ? M.accent : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, color: "#fff",
                        }}>{on ? "✕" : ""}</div>
                        <span style={{ fontSize: 12.5, color: on ? M.text : M.textMute }}>
                          {o.label}
                          {o.tem_campo_valor && <span style={{ color: M.textFaint }}> =</span>}
                        </span>
                      </div>
                      {o.tem_campo_valor && on && (
                        <input
                          value={form[chave].valor}
                          onChange={e => setForm(f => ({ ...f, [chave]: { ...f[chave], valor: e.target.value } }))}
                          placeholder="valor"
                          style={{
                            marginLeft: 23, marginTop: 5, width: 130,
                            background: M.panel2, color: M.text,
                            border: `1px solid ${M.border}`, borderRadius: 5,
                            padding: "4px 8px", fontSize: 12, outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Free-text observations */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: M.text, marginBottom: 8 }}>
          Observações sobre o ambiente{" "}
          <span style={{ fontSize: 10.5, color: M.textFaint, fontWeight: 400 }}>(pode citar itens específicos)</span>
        </div>
        <textarea
          placeholder="Anotações livres do ambiente…"
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          style={{
            width: "100%", minHeight: 72, background: M.panel2, color: M.text,
            border: `1px solid ${M.border}`, borderRadius: 8,
            padding: "9px 11px", fontSize: 12.5, outline: "none",
            resize: "vertical", fontFamily: "inherit",
          }}
        />
      </div>

      {/* Save actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <div style={{
          padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          background: "transparent", color: M.textMute, border: `1px solid ${M.border}`,
        }}>
          Salvar rascunho
        </div>
        <div
          onClick={!saving ? handleSave : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            background: M.accent, color: "#fff", border: `1px solid ${M.accent}`,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
          Salvar questionário do ambiente
        </div>
      </div>
    </div>
  );
}

// ─── ConformarButton ──────────────────────────────────────────────────────────
function ConformarButton({
  medicao, membro, ambientes, onSuccess,
}: {
  medicao: MedicaoRow; membro: MembroRow; ambientes: AmbienteRow[]; onSuccess: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [conforming, setConforming] = useState(false);

  const nApto     = ambientes.filter(a => a.aptidao === "apto").length;
  const nRessalva = ambientes.filter(a => a.aptidao === "apto_ressalva").length;
  const nInapto   = ambientes.filter(a => a.aptidao === "inapto").length;
  const nPendente = ambientes.filter(a => a.aptidao === "pendente").length;
  const canConformar = nApto + nRessalva > 0;

  async function doConformar() {
    setConforming(true);
    try {
      const { error } = await supabase.rpc("moveria_fn_conformar_lote", {
        p_contrato_id:  medicao.contrato_id,
        p_consultor_id: membro.id,
        p_medicao_id:   medicao.id,
      });
      if (error) throw error;
      toast.success("Lote conformado com sucesso!");
      setOpen(false);
      onSuccess();
      void navigate({ to: "/contratos/lotes" });
    } catch (e: any) {
      toast.error(rpcFriendly(e.message ?? ""));
    } finally {
      setConforming(false);
    }
  }

  return (
    <>
      <div
        onClick={canConformar ? () => setOpen(true) : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
          cursor: canConformar ? "pointer" : "not-allowed",
          background: canConformar ? M.accent : M.panel2,
          color: canConformar ? "#fff" : M.textFaint,
          border: `1px solid ${canConformar ? M.accent : M.border}`,
          opacity: canConformar ? 1 : 0.6,
        }}
      >
        Revisar e conformar lote →
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          style={{ background: M.panel, border: `1px solid ${M.border}`, color: M.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: M.text }}>Conformar lote</DialogTitle>
            <DialogDescription style={{ color: M.textMute }}>
              Revise o resumo. A operação é irreversível.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "8px 0" }}>
            {([
              { label: "Aptos",       value: nApto,     color: M.green },
              { label: "c/ ressalva", value: nRessalva, color: M.amber },
              { label: "Inaptos",     value: nInapto,   color: M.red   },
              { label: "Pendentes",   value: nPendente, color: M.textFaint },
            ] as const).map(({ label, value, color }) => (
              <div key={label} style={{ borderRadius: 8, border: `1px solid ${M.border}`, padding: "10px 6px", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0 }}>{value}</p>
                <p style={{ fontSize: 11, color: M.textFaint, marginTop: 2 }}>{label}</p>
              </div>
            ))}
          </div>

          {nPendente > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: M.amber,
              background: M.amberSoft, border: `1px solid ${M.amber}44`,
              borderRadius: 7, padding: "8px 12px",
            }}>
              <span>⚠</span> {nPendente} ambiente(s) pendente(s) não serão incluídos no lote.
            </div>
          )}

          <p style={{ fontSize: 12, color: M.textMute }}>
            {nApto + nRessalva} ambiente(s) entrarão no lote conformado.
          </p>

          <DialogFooter>
            <div
              onClick={() => setOpen(false)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: "transparent", color: M.textMute, border: `1px solid ${M.border}`,
              }}
            >Cancelar</div>
            <div
              onClick={!conforming ? doConformar : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: conforming ? "not-allowed" : "pointer",
                background: M.accent, color: "#fff", border: `1px solid ${M.accent}`,
                opacity: conforming ? 0.7 : 1,
              }}
            >
              {conforming && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
              Conformar
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
