import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, ChevronRight, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AptidaoBadge, EtapaBadge, type Aptidao } from "./status-badge";
import { formatCodigoCliente } from "@/lib/moveria";
import { AmbienteDrawer } from "./ambiente-drawer";
import { LotesTab } from "./lotes-tab";
import { ComentariosTab } from "./comentarios-tab";
import { DialogDesignacaoCerimoniosa, type AfetadoItem } from "./dialog-designacao-cerimon";

// ─── Types ────────────────────────────────────────────────────────────────────
type ContratoRow = {
  id: string; numero: string; status: string;
  cliente_id: string | null; vendedor_id: string | null; data_contrato: string | null;
};
type AmbienteRow = {
  id: string; codigo: string; descricao: string;
  ambiente: string | null; aptidao: Aptidao; aptidao_obs: string | null; ordem: number | null;
  consultor_designado: string | null;
};
type MedicaoRow = { id: string; contrato_id: string; consultor_id: string; data_visita: string; status: string; sequencia: string };
type ConsultorItem = { id: string; full_name: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rpcFriendly(msg: string) {
  if (/sem itens aptos/i.test(msg)) return "Nenhum ambiente apto. Marque a aptidão antes de conformar.";
  if (/questionário/i.test(msg)) return "Há ambientes aptos com questionário incompleto.";
  if (/desenho/i.test(msg)) return "Há ambientes aptos sem desenho de medição.";
  if (/sessão.*finalizada/i.test(msg)) return "Finalize a sessão de medição antes de conformar.";
  return msg;
}

async function gravarEventoDesignacao(payload: {
  scope: "todos" | "item";
  contratoId: string;
  itemId?: string;
  profileId: string;
  consultorNovoId: string;
  consultorNovoNome: string;
  afetados?: AfetadoItem[];
  consultorAnteriorId?: string | null;
  consultorAnteriorNome?: string | null;
  dataPrevista: string;
}) {
  const eventPayload: Record<string, unknown> = {
    scope: payload.scope,
    consultor_novo_id: payload.consultorNovoId,
    consultor_novo_nome: payload.consultorNovoNome,
    data_prevista: payload.dataPrevista || null,
  };

  if (payload.scope === "todos" && payload.afetados) {
    eventPayload.ambientes_afetados = payload.afetados.map((a) => a.itemId);
    eventPayload.alteracoes = payload.afetados
      .filter((a) => a.consultorAnteriorId && a.consultorAnteriorId !== payload.consultorNovoId)
      .map((a) => ({
        item_id: a.itemId,
        de: a.consultorAnteriorId,
        de_nome: a.consultorAnteriorNome,
        para: payload.consultorNovoId,
      }));
  }

  if (payload.scope === "item") {
    eventPayload.consultor_anterior_id = payload.consultorAnteriorId ?? null;
    eventPayload.consultor_anterior_nome = payload.consultorAnteriorNome ?? null;
  }

  await supabase.from("moveria_eventos").insert({
    tipo: "designacao_registrada",
    contrato_id: payload.contratoId,
    ...(payload.itemId ? { item_id: payload.itemId } : {}),
    autor_id: payload.profileId,
    payload: eventPayload,
  });
}

// ─── Designação em massa ──────────────────────────────────────────────────────
function DesignacaoBlock({
  contratoId, isAdmin, profileId, consultores, onClose,
}: {
  contratoId: string; isAdmin: boolean; profileId: string; consultores: ConsultorItem[];
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const [consultorId, setConsultorId] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const consultorNome = consultores.find((c) => c.id === consultorId)?.full_name ?? "";

  // Carrega afetados somente quando o dialog está aberto
  const { data: afetados = [], isLoading: afetadosLoading } = useQuery<AfetadoItem[]>({
    queryKey: ["moveria_afetados_desig", contratoId, confirmOpen],
    enabled: confirmOpen && !!consultorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_itens_contrato")
        .select("id, ambiente, descricao, codigo, consultor_designado")
        .eq("contrato_id", contratoId)
        .is("deletado_em", null)
        .is("lote_id", null)
        .in("aptidao", ["pendente", "inapto"]);
      return (data ?? []).map((item: any) => ({
        itemId: item.id as string,
        itemNome: (item.ambiente || item.descricao || item.codigo) as string,
        consultorAnteriorId: (item.consultor_designado as string | null) ?? null,
        consultorAnteriorNome: consultores.find((c) => c.id === item.consultor_designado)?.full_name ?? null,
      }));
    },
  });

  const designar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("moveria_fn_designar_contrato", {
        p_contrato_id: contratoId, p_consultor_id: consultorId,
        p_data_prevista: dataPrevista || null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (qtd) => {
      await gravarEventoDesignacao({
        scope: "todos",
        contratoId,
        profileId,
        consultorNovoId: consultorId,
        consultorNovoNome: consultorNome,
        afetados,
        dataPrevista,
      });
      const dataStr = dataPrevista
        ? new Date(dataPrevista + "T12:00:00").toLocaleDateString("pt-BR") : "sem previsão";
      toast.success(`${qtd} ambiente(s) designado(s) para ${consultorNome} — previsão: ${dataStr}`);
      qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
      qc.invalidateQueries({ queryKey: ["moveria_ambientes", contratoId] });
      setConfirmOpen(false);
      onClose?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao designar"),
  });

  if (!isAdmin) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 mb-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">Designar Consultor</p>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Consultor Técnico</Label>
          <Select value={consultorId} onValueChange={setConsultorId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar…" />
            </SelectTrigger>
            <SelectContent>
              {consultores.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Previsão de medição (opcional)</Label>
          <input
            type="date"
            value={dataPrevista}
            onChange={(e) => setDataPrevista(e.target.value)}
            className="h-8 text-sm border border-border rounded-md px-2 bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button size="sm" disabled={!consultorId} onClick={() => setConfirmOpen(true)}>
          Aplicar a todos
        </Button>
      </div>

      <DialogDesignacaoCerimoniosa
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        scope="todos"
        consultorNovoNome={consultorNome}
        dataPrevista={dataPrevista}
        afetados={afetados}
        afetadosLoading={afetadosLoading}
        onConfirm={() => designar.mutate()}
        isPending={designar.isPending}
      />
    </div>
  );
}

// ─── Lista de ambientes inline com aptidão + designação por linha (admin) ─────
function AmbientesInline({
  contratoId, canEdit, isAdmin, isVendedor, profileId, consultores, onClose,
}: {
  contratoId: string; canEdit: boolean; isAdmin: boolean; isVendedor: boolean;
  profileId: string; consultores: ConsultorItem[]; onClose?: () => void;
}) {
  const qc = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<AmbienteRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Designação por linha: item pendente de confirmação
  const [pendingDesig, setPendingDesig] = useState<{
    item: AmbienteRow;
    consultorNovoId: string;
    dataPrevista: string;
  } | null>(null);

  const { data: ambientes = [], isLoading, refetch } = useQuery<AmbienteRow[]>({
    queryKey: ["moveria_ambientes", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_contrato")
        .select("id, codigo, descricao, ambiente, aptidao, aptidao_obs, ordem, consultor_designado")
        .eq("contrato_id", contratoId).is("deletado_em", null)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as AmbienteRow[];
    },
  });

  const aptMut = useMutation({
    mutationFn: async ({ id, aptidao }: { id: string; aptidao: Aptidao }) => {
      const { error } = await supabase.from("moveria_itens_contrato")
        .update({ aptidao }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar aptidão"),
  });

  const designarItem = useMutation({
    mutationFn: async ({ itemId, consultorId, dataPrev }: { itemId: string; consultorId: string; dataPrev: string }) => {
      const { data, error } = await supabase.rpc("moveria_fn_designar_item", {
        p_item_id: itemId,
        p_consultor_id: consultorId,
        p_data_prevista: dataPrev || null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (_qtd, vars) => {
      const item = pendingDesig?.item;
      const consultorNome = consultores.find((c) => c.id === vars.consultorId)?.full_name ?? "";
      const antId = item?.consultor_designado ?? null;
      const antNome = antId ? (consultores.find((c) => c.id === antId)?.full_name ?? null) : null;

      await gravarEventoDesignacao({
        scope: "item",
        contratoId,
        itemId: vars.itemId,
        profileId,
        consultorNovoId: vars.consultorId,
        consultorNovoNome: consultorNome,
        consultorAnteriorId: antId,
        consultorAnteriorNome: antNome,
        dataPrevista: vars.dataPrev,
      });

      toast.success(`Ambiente designado para ${consultorNome}`);
      qc.invalidateQueries({ queryKey: ["moveria_ambientes", contratoId] });
      qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
      setPendingDesig(null);
      onClose?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao designar ambiente"),
  });

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
    </div>
  );

  if (ambientes.length === 0) return (
    <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center text-sm text-text-muted">
      Nenhum ambiente encontrado neste contrato.
    </div>
  );

  // Colunas: [nome] [consultor — só admin] [aptidão] [seta]
  const gridCols = isAdmin
    ? "minmax(0,1fr) minmax(120px,180px) auto auto"
    : "minmax(0,1fr) auto auto";

  const pendingConsultorNome = pendingDesig
    ? (consultores.find((c) => c.id === pendingDesig.consultorNovoId)?.full_name ?? "")
    : "";
  const pendingAntNome = pendingDesig?.item.consultor_designado
    ? (consultores.find((c) => c.id === pendingDesig.item.consultor_designado)?.full_name ?? null)
    : null;

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div
          className="grid bg-accent-light px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div>Ambiente</div>
          {isAdmin && <div>Consultor</div>}
          {!isVendedor && <div className="text-right pr-2">Aptidão</div>}
          <div />
        </div>

        {ambientes.map((a) => {
          const nome = a.ambiente || a.descricao || a.codigo;
          return (
            <div
              key={a.id}
              className="grid px-3 py-2.5 border-b border-border last:border-0 items-center hover:bg-accent-light/50 transition-colors"
              style={{ gridTemplateColumns: gridCols }}
            >
              {/* Col 1: nome + código */}
              <div className="min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-text-primary truncate">{nome}</p>
                <p className="text-xs text-text-muted truncate">{a.codigo}</p>
              </div>

              {/* Col 2: Select consultor (só admin) */}
              {isAdmin && (
                <div className="pr-2">
                  <Select
                    value={a.consultor_designado ?? ""}
                    onValueChange={(newId) => {
                      if (!newId || newId === a.consultor_designado) return;
                      setPendingDesig({ item: a, consultorNovoId: newId, dataPrevista: "" });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-full">
                      <SelectValue placeholder={
                        <span className="flex items-center gap-1 text-text-muted">
                          <UserPlus className="w-3 h-3" /> Designar
                        </span>
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {consultores.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.full_name ?? c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Col 3: Aptidão inline ou badge */}
              {!isVendedor && canEdit ? (
                <div className="flex gap-1 pr-2">
                  {(["apto", "apto_ressalva", "inapto"] as Aptidao[]).map((apt) => {
                    const labels: Record<Aptidao, string> = { apto: "Apto", apto_ressalva: "Ressalva", inapto: "Inapto", pendente: "—" };
                    const active = a.aptidao === apt;
                    const colorMap: Record<string, string> = {
                      apto:          "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]",
                      apto_ressalva: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]",
                      inapto:        "bg-[var(--color-danger-light)]  text-[var(--color-danger-text)]  border-[var(--color-danger)]",
                    };
                    return (
                      <button
                        key={apt}
                        onClick={() => aptMut.mutate({ id: a.id, aptidao: apt })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                          active ? colorMap[apt] : "border-border bg-surface text-text-muted hover:bg-accent-light"
                        }`}
                      >
                        {labels[apt]}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="pr-2">
                  <AptidaoBadge aptidao={a.aptidao} />
                </div>
              )}

              {/* Col 4: Seta → detalhe */}
              {!isVendedor && (
                <button
                  onClick={() => { setSelectedItem(a); setDrawerOpen(true); }}
                  className="p-1.5 rounded hover:bg-border transition-colors text-text-muted"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AmbienteDrawer
        item={selectedItem}
        canEdit={canEdit}
        isAdmin={isAdmin}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAptidaoChange={() => refetch()}
      />

      {/* Dialog cerimonioso para designação por linha */}
      {pendingDesig && (
        <DialogDesignacaoCerimoniosa
          open={!!pendingDesig}
          onOpenChange={(v) => { if (!v) setPendingDesig(null); }}
          scope="item"
          consultorNovoNome={pendingConsultorNome}
          dataPrevista={pendingDesig.dataPrevista}
          itemNome={pendingDesig.item.ambiente || pendingDesig.item.descricao || pendingDesig.item.codigo}
          consultorAnteriorNome={pendingAntNome}
          onConfirm={() =>
            designarItem.mutate({
              itemId: pendingDesig.item.id,
              consultorId: pendingDesig.consultorNovoId,
              dataPrev: pendingDesig.dataPrevista,
            })
          }
          isPending={designarItem.isPending}
        />
      )}
    </>
  );
}

// ─── Bloco de sessão de medição + conformar ───────────────────────────────────
function MedicaoBlock({
  contratoId, membroId, papel, onConformado,
}: {
  contratoId: string; membroId: string; papel: string; onConformado: () => void;
}) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [conforming, setConforming] = useState(false);

  const { data: sessao, isLoading: checkingSessao, refetch: refetchSessao } = useQuery<MedicaoRow | null>({
    queryKey: ["moveria_sessao_ativa", contratoId, membroId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_medicoes")
        .select("id, contrato_id, consultor_id, data_visita, status, sequencia")
        .eq("contrato_id", contratoId)
        .eq("consultor_id", membroId)
        .eq("status", "em_andamento")
        .maybeSingle();
      return (data as MedicaoRow | null) ?? null;
    },
  });

  const { data: ambientes = [] } = useQuery<AmbienteRow[]>({
    queryKey: ["moveria_ambientes", contratoId],
  });

  const nApto     = ambientes.filter((a) => a.aptidao === "apto").length;
  const nRessalva = ambientes.filter((a) => a.aptidao === "apto_ressalva").length;
  const nInapto   = ambientes.filter((a) => a.aptidao === "inapto").length;
  const nPendente = ambientes.filter((a) => a.aptidao === "pendente").length;
  const canConformar = nApto + nRessalva > 0;

  async function criarSessao() {
    const { data, error } = await supabase.from("moveria_medicoes")
      .insert({ contrato_id: contratoId, consultor_id: membroId, data_visita: new Date().toISOString().slice(0, 10) })
      .select("id, contrato_id, consultor_id, data_visita, status, sequencia").single();
    if (error) { toast.error(error.message); return; }
    refetchSessao();
    toast.success("Sessão de medição iniciada");
  }

  async function finalizarSessao() {
    if (!sessao) return;
    const { error } = await supabase.rpc("moveria_fn_finalizar_medicao", { p_medicao_id: sessao.id });
    if (error) { toast.error(error.message); return; }
    refetchSessao();
    qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
    toast.success("Sessão finalizada");
  }

  async function doConformar() {
    if (!sessao) return;
    setConforming(true);
    try {
      const { error } = await supabase.rpc("moveria_fn_conformar_lote", {
        p_contrato_id: contratoId, p_consultor_id: membroId, p_medicao_id: sessao.id,
      });
      if (error) throw error;
      toast.success("Lote conformado com sucesso!");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["moveria_lotes_tab", contratoId] });
      qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
      onConformado();
    } catch (e: any) {
      toast.error(rpcFriendly(e.message ?? ""));
    } finally {
      setConforming(false);
    }
  }

  if (checkingSessao) return (
    <div className="flex items-center gap-2 text-sm text-text-muted py-2">
      <LoaderCircle className="w-4 h-4 animate-spin" /> Verificando sessão…
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4 mb-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">Sessão de Medição</p>

      <div className="flex gap-3 text-xs mb-3 text-text-secondary">
        <span><span className="font-semibold text-[var(--color-success-text)]">{nApto}</span> apto(s)</span>
        <span><span className="font-semibold text-[var(--color-warning-text)]">{nRessalva}</span> c/ ressalva</span>
        <span><span className="font-semibold text-[var(--color-danger-text)]">{nInapto}</span> inapto(s)</span>
        {nPendente > 0 && <span><span className="font-semibold text-text-muted">{nPendente}</span> pendente(s)</span>}
      </div>

      {!sessao ? (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={criarSessao}>Iniciar nova medição</Button>
          <span className="text-xs text-text-muted">Ou retome uma sessão salva acima.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="font-mono font-semibold">Sessão {sessao.sequencia}</span>
            <span className="text-text-muted">· em andamento ·</span>
            <span>{new Date(sessao.data_visita + "T12:00:00").toLocaleDateString("pt-BR")}</span>
          </div>
          <Button size="sm" variant="outline" onClick={finalizarSessao}>Salvar e finalizar</Button>
          <Button size="sm" disabled={!canConformar || sessao.status !== "finalizada"} onClick={() => setConfirmOpen(true)}>
            Conformar lote →
          </Button>
          {!canConformar && (
            <span className="text-xs text-text-muted">Marque aptidão e finalize a sessão para conformar.</span>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conformar lote</DialogTitle>
            <DialogDescription>Revise o resumo. A operação é irreversível.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 py-2">
            {([
              { label: "Aptos", value: nApto, cls: "text-[var(--color-success-text)]" },
              { label: "c/ ressalva", value: nRessalva, cls: "text-[var(--color-warning-text)]" },
              { label: "Inaptos", value: nInapto, cls: "text-[var(--color-danger-text)]" },
              { label: "Pendentes", value: nPendente, cls: "text-text-muted" },
            ] as const).map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg border border-border p-2.5 text-center">
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {nPendente > 0 && (
            <p className="text-xs text-[var(--color-warning-text)] bg-[var(--color-warning-light)] border border-[var(--color-warning)] rounded px-3 py-2">
              ⚠ {nPendente} ambiente(s) pendente(s) não entrarão no lote.
            </p>
          )}
          <p className="text-sm text-text-secondary">{nApto + nRessalva} ambiente(s) entrarão no lote conformado.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={doConformar} disabled={conforming}>
              {conforming && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Conformar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ContratoPanel (painel direito) ──────────────────────────────────────────
export function ContratoPanel({
  contratoId,
  onClose,
}: {
  contratoId: string;
  onClose?: () => void;
}) {
  const { profile, globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";
  const qc = useQueryClient();

  const { data: contrato, isLoading: loadingC } = useQuery<ContratoRow | null>({
    queryKey: ["moveria_contrato", contratoId],
    queryFn: async () => {
      const { data } = await supabase.from("moveria_contratos_v")
        .select("id, numero, status, cliente_id, vendedor_id, data_contrato")
        .eq("id", contratoId).maybeSingle();
      return (data as ContratoRow | null) ?? null;
    },
  });

  const { data: clienteInfo } = useQuery<{ nome: string; tipo: "PF" | "PJ" | "—"; codigo: string | null } | null>({
    queryKey: ["moveria_cliente", contrato?.cliente_id],
    enabled: !!contrato?.cliente_id,
    queryFn: async () => {
      const { data } = await supabase.from("moveria_clientes_v")
        .select("nome_completo, cpf_mascarado, cnpj_hash, codigo_cliente")
        .eq("id", contrato!.cliente_id!).maybeSingle();
      const cl = data as any;
      if (!cl) return null;
      return {
        nome:   cl.nome_completo,
        tipo:   cl.cnpj_hash ? "PJ" : cl.cpf_mascarado ? "PF" : "—",
        codigo: cl.codigo_cliente ?? null,
      };
    },
  });

  const { data: membro } = useQuery<{ id: string; papel: string } | null>({
    queryKey: ["meu_membro_moveria", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase.from("moveria_membros")
        .select("id, papel").eq("profile_id", profile!.id).eq("ativo", true).maybeSingle();
      return (data as any) ?? null;
    },
  });

  // Consultores ativos — compartilhado entre DesignacaoBlock e AmbientesInline
  const { data: consultores = [] } = useQuery<ConsultorItem[]>({
    queryKey: ["moveria_consultores"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: membros } = await supabase.from("moveria_membros")
        .select("id, profile_id").eq("papel", "consultor_tecnico").eq("ativo", true);
      const ids = (membros ?? []).map((m: any) => m.profile_id as string);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (membros ?? []).map((m: any) => ({
        id: m.id as string,
        full_name: (profs ?? []).find((p: any) => p.id === m.profile_id)?.full_name ?? null,
      }));
    },
  });

  const isVendedor  = membro?.papel === "vendedor";
  const isConsultor = membro?.papel === "consultor_tecnico";
  const canEdit     = isAdmin || isConsultor;
  const profileId   = profile?.id ?? "";

  if (loadingC) return (
    <div className="flex-1 flex items-center justify-center">
      <LoaderCircle className="w-6 h-6 animate-spin text-text-muted" />
    </div>
  );

  if (!contrato) return (
    <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
      Contrato não encontrado.
    </div>
  );

  const dataFmt = contrato.data_contrato
    ? new Date(contrato.data_contrato).toLocaleDateString("pt-BR") : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Banner de contexto ── */}
      <div className="flex-shrink-0 px-5 py-3.5 border-b border-border bg-surface flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-lg text-text-primary">{contrato.numero}</span>
            {clienteInfo?.codigo && (
              <span className="font-mono text-xs font-semibold text-text-muted bg-accent-light border border-border px-1.5 py-0.5 rounded">
                {formatCodigoCliente(clienteInfo.codigo)}
              </span>
            )}
            {clienteInfo?.nome && (
              <span className="text-text-secondary text-sm truncate">{clienteInfo.nome}</span>
            )}
            {clienteInfo?.tipo !== "—" && clienteInfo?.tipo && (
              <span className="text-[10px] font-semibold border border-border px-1.5 py-0.5 rounded text-text-muted">
                {clienteInfo.tipo}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-muted flex-wrap">
            <EtapaBadge etapa={contrato.status} />
            {dataFmt && <span>{dataFmt}</span>}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded hover:bg-border transition-colors text-text-muted flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Abas ── */}
      <Tabs defaultValue="ambientes" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="flex-shrink-0 rounded-none border-b border-border bg-transparent h-auto px-5 py-0 gap-0 justify-start">
          <TabsTrigger value="ambientes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-3 py-2.5 text-sm">
            Ambientes
          </TabsTrigger>
          <TabsTrigger value="lotes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-3 py-2.5 text-sm">
            Lotes
          </TabsTrigger>
          <TabsTrigger value="comercial" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-3 py-2.5 text-sm">
            Conexão com o Comercial
          </TabsTrigger>
        </TabsList>

        {/* ── Ambientes ── */}
        <TabsContent value="ambientes" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          {isAdmin && (
            <DesignacaoBlock
              contratoId={contratoId}
              isAdmin={isAdmin}
              profileId={profileId}
              consultores={consultores}
              onClose={onClose}
            />
          )}

          {!isVendedor && (
            <MedicaoBlock
              contratoId={contratoId}
              membroId={membro?.id ?? ""}
              papel={membro?.papel ?? ""}
              onConformado={() => {
                qc.invalidateQueries({ queryKey: ["moveria_ambientes", contratoId] });
              }}
            />
          )}

          <AmbientesInline
            contratoId={contratoId}
            canEdit={canEdit}
            isAdmin={isAdmin}
            isVendedor={isVendedor}
            profileId={profileId}
            consultores={consultores}
            onClose={onClose}
          />
        </TabsContent>

        {/* ── Lotes ── */}
        <TabsContent value="lotes" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          <LotesTab contratoId={contratoId} />
        </TabsContent>

        {/* ── Conexão com o Comercial ── */}
        <TabsContent value="comercial" className="flex-1 overflow-y-auto px-5 py-4 mt-0 flex flex-col">
          <ComentariosTab contratoId={contratoId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
