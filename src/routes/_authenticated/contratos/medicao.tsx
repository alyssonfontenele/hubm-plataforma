import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Ruler, LoaderCircle, ArrowLeft, Upload, Trash2,
  CheckCircle2, AlertCircle, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/contratos/medicao")({
  ssr: false,
  component: MedicaoPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type MembroRow    = { id: string; papel: string };
type ContratoOpt  = { id: string; numero: string };
type AmbienteRow  = {
  id: string; codigo: string; descricao: string;
  ambiente: string | null;
  aptidao: "pendente" | "apto" | "apto_ressalva" | "inapto";
  aptidao_obs: string | null; ordem: number | null;
};
type MedicaoRow   = { id: string; contrato_id: string; consultor_id: string; data_visita: string; status: string };
type QBloco       = { id: string; chave: string; label: string; ordem: number };
type QOpcao       = { id: string; bloco_id: string; label: string; tem_campo_valor: boolean; ordem: number };
type Questionario = {
  pedireito_opcao_id: string | null; pedireito_valor: string | null;
  bancadas_opcao_id: string | null;  bancadas_valor: string | null;
  instalacoes_opcao_id: string | null; instalacoes_valor: string | null;
  eletros_opcao_id: string | null;   eletros_valor: string | null;
  observacoes: string | null;
};
type Desenho = { id: string; item_id: string; path: string };

// ─── Constants ────────────────────────────────────────────────────────────────

type Aptidao = "pendente" | "apto" | "apto_ressalva" | "inapto";

const APTIDAO_CFG: Record<Aptidao, { label: string; Icon: React.ElementType; textColor: string; activeClass: string }> = {
  apto:          { label: "Apto",            Icon: CheckCircle2, textColor: "text-green-600", activeClass: "bg-green-600 hover:bg-green-700 text-white border-green-700" },
  apto_ressalva: { label: "Apto c/ ressalva",Icon: AlertCircle,  textColor: "text-amber-500", activeClass: "bg-amber-500 hover:bg-amber-600 text-white border-amber-600" },
  inapto:        { label: "Inapto",          Icon: XCircle,      textColor: "text-red-500",   activeClass: "bg-red-600 hover:bg-red-700 text-white border-red-700" },
  pendente:      { label: "Pendente",        Icon: Clock,        textColor: "text-text-muted", activeClass: "bg-slate-400 hover:bg-slate-500 text-white border-slate-500" },
};

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
  return <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />;
}

// ─── MedicaoPage ──────────────────────────────────────────────────────────────

function MedicaoPage() {
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

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!membro || membro.papel === "vendedor") {
    return (
      <div className="rounded-md border border-border bg-surface px-6 py-10 text-center text-sm text-text-muted">
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

  return (
    <div className="max-w-md">
      <div className="rounded-md border border-border bg-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Nova medição / Retomar sessão</h2>

        <div className="space-y-1.5">
          <Label className="text-xs text-text-muted">Contrato</Label>
          <Select value={contratoId} onValueChange={setContratoId}>
            <SelectTrigger><SelectValue placeholder="Selecione um contrato…" /></SelectTrigger>
            <SelectContent>
              {contratos.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {contratoId && checkingSession && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Verificando sessão…
          </p>
        )}

        {contratoId && !checkingSession && sessaoExistente && (
          <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Sessão em andamento desde{" "}
            {new Date(sessaoExistente.data_visita + "T12:00:00").toLocaleDateString("pt-BR")}.
          </div>
        )}

        {contratoId && !checkingSession && !sessaoExistente && (
          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">Data da visita</Label>
            <Input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} />
          </div>
        )}

        <Button
          className="w-full"
          disabled={!contratoId || busy || checkingSession}
          onClick={handleStart}
        >
          {busy && <LoaderCircle className="w-4 h-4 animate-spin mr-2" />}
          {sessaoExistente ? "Continuar medição" : "Iniciar medição"}
        </Button>
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

  const selectedItem = ambientes.find((a) => a.id === selectedId) ?? null;
  const nAptos    = ambientes.filter((a) => a.aptidao === "apto" || a.aptidao === "apto_ressalva").length;
  const nPendente = ambientes.filter((a) => a.aptidao === "pendente").length;

  return (
    <div className="-m-6 md:-m-8 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Isolated context banner */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 text-xs text-blue-800">
          <Ruler className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">Contexto isolado — Medição em andamento</span>
          <span className="text-blue-300">·</span>
          <span>Visita: {new Date(medicao.data_visita + "T12:00:00").toLocaleDateString("pt-BR")}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onExit}>
          <ArrowLeft className="w-3.5 h-3.5" /> Sair da medição
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: ambiente list */}
        <div className="w-64 shrink-0 border-r border-border overflow-y-auto bg-surface flex flex-col">
          <div className="px-4 py-2.5 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Ambientes ({ambientes.length})
            </p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <ul className="flex-1 divide-y divide-border">
              {ambientes.map((a) => {
                const { Icon, textColor } = APTIDAO_CFG[a.aptidao as Aptidao] ?? APTIDAO_CFG.pendente;
                const active = selectedId === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-surface-elevated transition-colors ${
                        active ? "bg-surface-elevated border-l-2 border-l-primary" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate">
                            {a.ambiente || a.descricao || a.codigo}
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">{a.codigo}</p>
                        </div>
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${textColor}`} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedItem ? (
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
              Selecione um ambiente à esquerda.
            </div>
          ) : (
            // key forces full remount when switching ambientes (clean state)
            <div key={selectedItem.id} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Ambiente</p>
                <h2 className="text-lg font-semibold text-text-primary leading-tight">
                  {selectedItem.ambiente || selectedItem.descricao || selectedItem.codigo}
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {selectedItem.codigo} · {selectedItem.descricao}
                </p>
              </div>

              <Tabs defaultValue="aptidao">
                <TabsList>
                  <TabsTrigger value="aptidao">Aptidão & Desenhos</TabsTrigger>
                  <TabsTrigger value="questionario">Questionário</TabsTrigger>
                </TabsList>
                <TabsContent value="aptidao" className="pt-4">
                  <AptidaoTab item={selectedItem} onUpdate={() => void refetchItems()} />
                </TabsContent>
                <TabsContent value="questionario" className="pt-4">
                  {questData ? (
                    <QuestionarioTab
                      item={selectedItem}
                      blocos={questData.blocos}
                      opcoes={questData.opcoes}
                    />
                  ) : (
                    <div className="flex justify-center py-8"><Spinner /></div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Footer / conformar */}
          <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-4 bg-surface shrink-0">
            <p className="text-xs text-text-muted">
              <span className="font-semibold text-text-primary">{nAptos}</span> apto(s)
              {nPendente > 0 && (
                <span className="ml-3 text-amber-600">
                  <span className="font-semibold">{nPendente}</span> pendente(s)
                </span>
              )}
            </p>
            <ConformarButton
              medicao={medicao}
              membro={membro}
              ambientes={ambientes}
              onSuccess={onExit}
            />
          </div>
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
        // Path convention: {item_id}/{uuid}-{filename} — required by storage INSERT policy
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${item.id}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("moveria-medicoes")
          .upload(path, file);
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
    const { data, error } = await supabase.storage
      .from("moveria-medicoes")
      .createSignedUrl(path, 300);
    if (error) { toast.error("Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Aptidão buttons */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">Aptidão do ambiente</p>
        <div className="flex flex-wrap gap-2">
          {(["apto", "apto_ressalva", "inapto", "pendente"] as Aptidao[]).map((a) => {
            const { label, Icon, activeClass } = APTIDAO_CFG[a];
            const active = item.aptidao === a;
            return (
              <Button
                key={a}
                size="sm"
                variant="outline"
                className={`gap-1.5 ${active ? activeClass : ""}`}
                onClick={() => aptMut.mutate(a)}
                disabled={aptMut.isPending}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Obs */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">Observação</p>
        <Textarea
          rows={3}
          placeholder="Observação sobre a aptidão…"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={saveObs}
        />
        {savingObs && (
          <p className="text-xs text-text-muted flex items-center gap-1">
            <LoaderCircle className="w-3 h-3 animate-spin" /> Salvando…
          </p>
        )}
      </div>

      {/* Desenhos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-primary">Desenhos de medição</p>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading
              ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            Enviar
          </Button>
          <input
            ref={fileRef} type="file" multiple
            accept="image/*,.pdf,.dwg" className="hidden"
            onChange={handleUpload}
          />
        </div>

        {desenhos.length === 0 ? (
          <p className="text-xs text-text-muted">Nenhum desenho enviado.</p>
        ) : (
          <ul className="space-y-1.5">
            {desenhos.map((d) => {
              const name = d.path.split("/").slice(1).join("/") || d.path;
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-xs">
                  <span className="truncate text-text-primary">{name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleView(d.path)}>
                      Abrir
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(d)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── QuestionarioTab ──────────────────────────────────────────────────────────

function QuestionarioTab({
  item, blocos, opcoes,
}: {
  item: AmbienteRow; blocos: QBloco[]; opcoes: QOpcao[];
}) {
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
        item_id: item.id,
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
    <div className="space-y-5">
      {!needsQ && (
        <p className="text-xs text-text-muted rounded border border-border px-4 py-3 bg-surface">
          O questionário é obrigatório para ambientes aptos ou aptos com ressalva.
          Defina a aptidão na aba anterior primeiro.
        </p>
      )}

      {blocos.map((bloco) => {
        const chave = bloco.chave as BlocoChave;
        if (!BLOCO_CHAVES.includes(chave)) return null;
        const blocoOpcoes = opcoes.filter((o) => o.bloco_id === bloco.id);
        const selectedOpcao = blocoOpcoes.find((o) => o.id === form[chave].opcao_id);
        return (
          <div key={bloco.id} className="space-y-1.5">
            <Label className="text-sm font-medium">{bloco.label}</Label>
            <Select
              value={form[chave].opcao_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, [chave]: { opcao_id: v, valor: "" } }))
              }
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {blocoOpcoes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOpcao?.tem_campo_valor && (
              <Input
                placeholder="Informe o valor (ex: 2,80 m)…"
                value={form[chave].valor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [chave]: { ...f[chave], valor: e.target.value } }))
                }
              />
            )}
          </div>
        );
      })}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Observações do ambiente</Label>
        <Textarea
          rows={3}
          placeholder="Observações livres…"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-1.5">
        {saving && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
        Salvar questionário
      </Button>
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

  const nApto     = ambientes.filter((a) => a.aptidao === "apto").length;
  const nRessalva = ambientes.filter((a) => a.aptidao === "apto_ressalva").length;
  const nInapto   = ambientes.filter((a) => a.aptidao === "inapto").length;
  const nPendente = ambientes.filter((a) => a.aptidao === "pendente").length;

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
      <Button
        size="sm"
        disabled={nApto + nRessalva === 0}
        onClick={() => setOpen(true)}
      >
        Revisar e conformar lote
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conformar lote</DialogTitle>
            <DialogDescription>
              Revise o resumo. A operação é irreversível.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-2 py-2">
            {[
              { label: "Aptos",      value: nApto,     color: "text-green-600" },
              { label: "c/ ressalva",value: nRessalva,  color: "text-amber-500" },
              { label: "Inaptos",    value: nInapto,    color: "text-red-500" },
              { label: "Pendentes",  value: nPendente,  color: "text-text-muted" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded border border-border p-2.5 text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {nPendente > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {nPendente} ambiente(s) pendente(s) não serão incluídos no lote.
            </p>
          )}

          <p className="text-xs text-text-muted">
            {nApto + nRessalva} ambiente(s) entrarão no lote conformado.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={doConformar} disabled={conforming}>
              {conforming && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Conformar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
