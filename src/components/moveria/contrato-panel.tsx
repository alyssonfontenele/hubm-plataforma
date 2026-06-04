import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, ChevronRight, X, UserPlus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AptidaoBadge, EtapaBadge, type Aptidao } from "./status-badge";
import { formatCodigoCliente } from "@/lib/moveria";
import { AmbienteDrawer } from "./ambiente-drawer";
import { LotesTab } from "./lotes-tab";
import { ComentariosTab } from "./comentarios-tab";
import { DialogDesignacaoCerimoniosa, type EntradaRascunho } from "./dialog-designacao-cerimon";

// ─── Types ────────────────────────────────────────────────────────────────────
type ContratoRow = {
  id: string; numero: string; numero_base: string; status: string;
  cliente_id: string | null; vendedor_id: string | null; data_contrato: string | null;
};
type AmbienteRow = {
  id: string; codigo: string; descricao: string;
  ambiente: string | null; aptidao: Aptidao; aptidao_obs: string | null;
  ordem: number | null; consultor_designado: string | null; lote_id: string | null;
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

function podeDesignar(a: AmbienteRow) {
  return !a.lote_id && (a.aptidao === "pendente" || a.aptidao === "inapto");
}

// ─── Bloco "Aplicar a todos" (preenchimento de rascunho) ──────────────────────
function DesignacaoBlock({
  consultores, dataPrevista, onDataPrevistaChange, onAplicarTodos,
}: {
  consultores: ConsultorItem[];
  dataPrevista: string;
  onDataPrevistaChange: (v: string) => void;
  onAplicarTodos: (consultorId: string) => void;
}) {
  const [consultorId, setConsultorId] = useState("");

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
            onChange={(e) => onDataPrevistaChange(e.target.value)}
            className="h-8 text-sm border border-border rounded-md px-2 bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!consultorId}
          onClick={() => { onAplicarTodos(consultorId); }}
        >
          Aplicar a todos
        </Button>
      </div>
    </div>
  );
}

// ─── Lista de ambientes inline com aptidão + Select de rascunho (admin) ───────
function AmbientesInline({
  ambientes, isLoading, canEdit, isAdmin, isVendedor, consultores, contratoId,
  draft, onDraftChange, redesignando, onRedesignarConfirm, refetch,
}: {
  ambientes: AmbienteRow[];
  isLoading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  isVendedor: boolean;
  consultores: ConsultorItem[];
  contratoId: string;
  draft: Record<string, string>;
  onDraftChange: (itemId: string, consultorId: string) => void;
  redesignando: Set<string>;
  onRedesignarConfirm: (itemId: string) => void;
  refetch: () => void;
}) {
  const [selectedItem, setSelectedItem] = useState<AmbienteRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingRedesignarItem, setPendingRedesignarItem] = useState<AmbienteRow | null>(null);

  const aptMut = useMutation({
    mutationFn: async ({ id, aptidao }: { id: string; aptidao: Aptidao }) => {
      const { error } = await supabase.from("moveria_itens_contrato")
        .update({ aptidao }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar aptidão"),
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
          // Valor exibido no Select: draft local > salvo no banco
          const consultorExibido = draft[a.id] ?? a.consultor_designado ?? "";
          const temRascunho = draft[a.id] !== undefined && draft[a.id] !== (a.consultor_designado ?? "");
          const showDesc = a.descricao && a.descricao !== a.codigo;
          const jaDesignado = !!a.consultor_designado && !redesignando.has(a.id);

          return (
            <div
              key={a.id}
              className={`grid px-3 py-2.5 border-b border-border last:border-0 items-center transition-colors ${
                temRascunho ? "bg-[var(--color-info-light)]/30" : "hover:bg-accent-light/50"
              }`}
              style={{ gridTemplateColumns: gridCols }}
            >
              {/* Col 1: código · descrição */}
              <div className="min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-text-primary truncate">
                  <span className="font-mono">{a.codigo}</span>
                  {showDesc && (
                    <span className="font-normal text-text-secondary"> · {a.descricao}</span>
                  )}
                </p>
              </div>

              {/* Col 2: consultor (só admin) */}
              {isAdmin && (
                <div className="pr-2">
                  {podeDesignar(a) ? (
                    jaDesignado ? (
                      // Já designado e salvo → READ-ONLY + botão Redesignar
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-text-secondary truncate">
                          {consultores.find((c) => c.id === a.consultor_designado)?.full_name ?? "—"}
                        </span>
                        <button
                          onClick={() => setPendingRedesignarItem(a)}
                          className="flex-shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-accent-light transition-colors"
                          title="Redesignar"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      // Não designado ou desbloqueado para redesignação → Select editável
                      <Select
                        value={consultorExibido}
                        onValueChange={(newId) => {
                          if (!newId) return;
                          onDraftChange(a.id, newId);
                        }}
                      >
                        <SelectTrigger className={`h-7 text-xs w-full ${temRascunho ? "border-[var(--color-info)] ring-1 ring-[var(--color-info)]" : ""}`}>
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
                    )
                  ) : (
                    // Item em lote ou apto/ressalva: mostra nome do consultor sem Select
                    <span className="text-xs text-text-muted truncate block">
                      {consultorExibido
                        ? (consultores.find((c) => c.id === consultorExibido)?.full_name ?? "—")
                        : "—"}
                    </span>
                  )}
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
        onAptidaoChange={refetch}
      />

      <AlertDialog open={!!pendingRedesignarItem} onOpenChange={(o) => { if (!o) setPendingRedesignarItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redesignar ambiente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que quer alterar a designação já definida para{" "}
              <span className="font-semibold">
                {pendingRedesignarItem?.codigo}
                {pendingRedesignarItem?.descricao && pendingRedesignarItem.descricao !== pendingRedesignarItem.codigo
                  ? ` · ${pendingRedesignarItem.descricao}` : ""}
              </span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingRedesignarItem) onRedesignarConfirm(pendingRedesignarItem.id);
              setPendingRedesignarItem(null);
            }}>
              Sim, redesignar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    const { error } = await supabase.from("moveria_medicoes")
      .insert({ contrato_id: contratoId, consultor_id: membroId, data_visita: new Date().toISOString().slice(0, 10) })
      .select("id").single();
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

// ─── Dialog cerimonioso de exclusão de contrato ───────────────────────────────
function DialogExcluirContrato({
  open, onOpenChange, contrato, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contrato: ContratoRow;
  onSuccess: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [inputNumero, setInputNumero] = useState("");

  useEffect(() => {
    if (!open) { setChecked(false); setInputNumero(""); }
  }, [open]);

  const canConfirm = checked && inputNumero === contrato.numero_base;

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("moveria_fn_excluir_contrato", {
        p_contrato_id: contrato.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Contrato ${contrato.numero} excluído com sucesso.`);
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir contrato"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-danger)]">
            <Trash2 className="w-4 h-4" />
            Excluir contrato {contrato.numero}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2.5 text-sm text-text-secondary pt-1">
              <p>
                Esta ação é <strong>permanente e irreversível</strong>. Todos os dados serão apagados:
                itens, lotes, designações, medições, questionários e documentos.{" "}
                <strong>O cliente não é apagado.</strong>
              </p>
              <p className="text-[var(--color-warning-text)] bg-[var(--color-warning-light)] border border-[var(--color-warning)] rounded px-3 py-2 text-xs">
                ⚠ Para recuperar, será necessário reimportar o PDF do início.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-[var(--color-danger)]"
            />
            <span className="text-sm">Entendo que esta ação é irreversível</span>
          </label>

          <div className="space-y-1.5">
            <p className="text-xs text-text-muted">
              Digite o número do contrato{" "}
              <span className="font-mono font-semibold">{contrato.numero_base}</span>{" "}
              para confirmar:
            </p>
            <input
              type="text"
              value={inputNumero}
              onChange={(e) => setInputNumero(e.target.value)}
              placeholder={contrato.numero_base}
              className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Excluir contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ContratoPanel ────────────────────────────────────────────────────────────
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

  // ── Draft de designação (estado local, não salvo no banco ainda) ──
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [redesignando, setRedesignando] = useState<Set<string>>(new Set());
  const [dataPrevista, setDataPrevista] = useState("");
  const [confirmDesigOpen, setConfirmDesigOpen] = useState(false);
  const [alertSairOpen, setAlertSairOpen] = useState(false);
  const [excluirOpen, setExcluirOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: contrato, isLoading: loadingC } = useQuery<ContratoRow | null>({
    queryKey: ["moveria_contrato", contratoId],
    queryFn: async () => {
      const { data } = await supabase.from("moveria_contratos_v")
        .select("id, numero, numero_base, status, cliente_id, vendedor_id, data_contrato")
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

  // Ambientes — lifted aqui para hasDraft e batch confirm
  const { data: ambientes = [], isLoading: loadingAmb, refetch: refetchAmbientes } = useQuery<AmbienteRow[]>({
    queryKey: ["moveria_ambientes", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_contrato")
        .select("id, codigo, descricao, ambiente, aptidao, aptidao_obs, ordem, consultor_designado, lote_id")
        .eq("contrato_id", contratoId).is("deletado_em", null)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as AmbienteRow[];
    },
  });

  // Etapa do contrato (para controle de permissão de exclusão — só admin)
  const { data: contratoStage, isLoading: loadingStage } = useQuery<{
    temLoteAvancado: boolean; statusAvancado: string | null;
  }>({
    queryKey: ["moveria_contrato_stage", contratoId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("moveria_lotes")
        .select("status").eq("contrato_id", contratoId)
        .neq("status", "aberto").neq("status", "cancelado")
        .limit(1).maybeSingle();
      return { temLoteAvancado: !!data, statusAvancado: (data as any)?.status ?? null };
    },
  });
  const temLoteAvancado = contratoStage?.temLoteAvancado ?? false;

  // Consultores ativos (só admin)
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

  // ── Draft helpers ──────────────────────────────────────────────────
  const hasDraft = Object.entries(draft).some(([itemId, consultorId]) => {
    const saved = ambientes.find((a) => a.id === itemId)?.consultor_designado ?? null;
    return consultorId !== saved;
  });

  function aplicarTodos(consultorId: string) {
    const updates: Record<string, string> = { ...draft };
    ambientes
      .filter((a) => podeDesignar(a) && (!a.consultor_designado || redesignando.has(a.id)))
      .forEach((a) => { updates[a.id] = consultorId; });
    setDraft(updates);
  }

  function setItemDraft(itemId: string, consultorId: string) {
    setDraft((prev) => ({ ...prev, [itemId]: consultorId }));
  }

  // Entradas para o dialog cerimonioso — só items com mudança real
  const entradasDialog: EntradaRascunho[] = ambientes
    .filter((a) => {
      const draftVal = draft[a.id];
      return draftVal !== undefined && draftVal !== (a.consultor_designado ?? "");
    })
    .map((a) => ({
      itemId: a.id,
      itemNome: a.ambiente || a.descricao || a.codigo,
      consultorNovoId: draft[a.id],
      consultorNovoNome: consultores.find((c) => c.id === draft[a.id])?.full_name ?? "",
      consultorAnteriorId: a.consultor_designado,
      consultorAnteriorNome: a.consultor_designado
        ? (consultores.find((c) => c.id === a.consultor_designado)?.full_name ?? null)
        : null,
    }));

  // ── Mutation batch ─────────────────────────────────────────────────
  const designarLote = useMutation({
    mutationFn: async () => {
      const payload = entradasDialog.map((e) => ({
        item_id: e.itemId,
        consultor_id: e.consultorNovoId,
        data_prevista: dataPrevista || null,
      }));
      const { data, error } = await supabase.rpc("moveria_fn_designar_itens_lote", {
        p_designacoes: payload,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (qtd) => {
      // Evento consolidado de auditoria
      await supabase.from("moveria_eventos").insert({
        tipo: "designacao_registrada",
        contrato_id: contratoId,
        autor_id: profile?.id ?? "",
        payload: {
          scope: "lote",
          data_prevista: dataPrevista || null,
          alteracoes: entradasDialog.map((e) => ({
            item_id: e.itemId,
            item_nome: e.itemNome,
            de: e.consultorAnteriorId,
            de_nome: e.consultorAnteriorNome,
            para: e.consultorNovoId,
            para_nome: e.consultorNovoNome,
          })),
        },
      });

      const dataStr = dataPrevista
        ? new Date(dataPrevista + "T12:00:00").toLocaleDateString("pt-BR") : "sem previsão";
      toast.success(`${qtd} ambiente(s) designado(s) — previsão: ${dataStr}`);

      qc.invalidateQueries({ queryKey: ["moveria_ambientes", contratoId] });
      qc.invalidateQueries({ queryKey: ["moveria_kanban"] });

      setDraft({});
      setRedesignando(new Set());
      setConfirmDesigOpen(false);
      onClose?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao designar"),
  });

  // ── Fechar com proteção de rascunho ───────────────────────────────
  function handleClose() {
    if (hasDraft) {
      setAlertSairOpen(true);
    } else {
      onClose?.();
    }
  }

  // ── Roles ─────────────────────────────────────────────────────────
  const isSuperadmin = globalRole === "superadmin";
  const isVendedor   = membro?.papel === "vendedor";
  const isConsultor  = membro?.papel === "consultor_tecnico";
  const canEdit      = isAdmin || isConsultor;
  const podeDeletar  = isAdmin && (isSuperadmin || !temLoteAvancado) && !loadingStage;

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
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {isAdmin && (
            <button
              onClick={() => setExcluirOpen(true)}
              disabled={!podeDeletar}
              title={
                loadingStage ? "Verificando permissão..." :
                !isSuperadmin && temLoteAvancado
                  ? `Somente superadmin pode excluir (etapa: ${contratoStage?.statusAvancado})`
                  : "Excluir contrato"
              }
              className="p-1.5 rounded transition-colors text-text-muted hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded hover:bg-border transition-colors text-text-muted"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
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
          {/* Bloco de designação (só admin) */}
          {isAdmin && (
            <DesignacaoBlock
              consultores={consultores}
              dataPrevista={dataPrevista}
              onDataPrevistaChange={setDataPrevista}
              onAplicarTodos={aplicarTodos}
            />
          )}

          {/* Botão de confirmação do rascunho (só quando há mudanças) */}
          {isAdmin && hasDraft && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--color-info)] bg-[var(--color-info-light)] px-4 py-3">
              <p className="text-xs text-[var(--color-info-text)] font-medium">
                {entradasDialog.length} designação{entradasDialog.length !== 1 ? "ões" : ""} não salva{entradasDialog.length !== 1 ? "s" : ""}
              </p>
              <Button size="sm" onClick={() => setConfirmDesigOpen(true)}>
                Confirmar designações →
              </Button>
            </div>
          )}

          {/* Sessão de medição (consultor ou admin) */}
          {!isVendedor && (
            <MedicaoBlock
              contratoId={contratoId}
              membroId={membro?.id ?? ""}
              papel={membro?.papel ?? ""}
              onConformado={refetchAmbientes}
            />
          )}

          {/* Lista de ambientes */}
          <AmbientesInline
            ambientes={ambientes}
            isLoading={loadingAmb}
            canEdit={canEdit}
            isAdmin={isAdmin}
            isVendedor={isVendedor}
            consultores={consultores}
            contratoId={contratoId}
            draft={draft}
            onDraftChange={setItemDraft}
            redesignando={redesignando}
            onRedesignarConfirm={(id) => setRedesignando((prev) => new Set([...prev, id]))}
            refetch={refetchAmbientes}
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

      {/* ── Dialog cerimonioso de confirmação do lote ── */}
      <DialogDesignacaoCerimoniosa
        open={confirmDesigOpen}
        onOpenChange={setConfirmDesigOpen}
        entradas={entradasDialog}
        dataPrevista={dataPrevista}
        onConfirm={() => designarLote.mutate()}
        isPending={designarLote.isPending}
      />

      {/* ── Dialog de exclusão cerimonioso ── */}
      {contrato && (
        <DialogExcluirContrato
          open={excluirOpen}
          onOpenChange={setExcluirOpen}
          contrato={contrato}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
            onClose?.();
          }}
        />
      )}

      {/* ── AlertDialog de proteção de rascunho não salvo ── */}
      <AlertDialog open={alertSairOpen} onOpenChange={setAlertSairOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Designações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem {entradasDialog.length} designação{entradasDialog.length !== 1 ? "ões" : ""} não confirmada{entradasDialog.length !== 1 ? "s" : ""}. Sair mesmo? As alterações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAlertSairOpen(false); onClose?.(); }}>
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
