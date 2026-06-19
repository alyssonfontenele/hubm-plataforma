import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Upload, ExternalLink, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Aptidao } from "./status-badge";

type AmbienteRow = {
  id: string;
  codigo: string;
  descricao: string;
  ambiente: string | null;
  aptidao: Aptidao;
  aptidao_obs: string | null;
};

type QBloco = { id: string; chave: string; label: string; ordem: number };
type QOpcao = { id: string; bloco_id: string; label: string; tem_campo_valor: boolean; ordem: number };
type BlocoChave = "pedireito" | "bancadas" | "instalacoes" | "eletros";
const BLOCO_CHAVES: BlocoChave[] = ["pedireito", "bancadas", "instalacoes", "eletros"];
type FormQ = Record<BlocoChave, { opcao_id: string; valor: string }>;
const EMPTY_FORM: FormQ = {
  pedireito:   { opcao_id: "", valor: "" },
  bancadas:    { opcao_id: "", valor: "" },
  instalacoes: { opcao_id: "", valor: "" },
  eletros:     { opcao_id: "", valor: "" },
};

type AnexoRow = { id: string; item_id: string; path: string; tipo: string };

type DrawerProps = {
  item: AmbienteRow | null;
  canEdit: boolean;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  onAptidaoChange: () => void;
};

// ── Grid de anexos (desenhos ou fotos) ───────────────────────────────────────
function AnexoGrid({
  items,
  canEdit,
  uploading,
  onUploadClick,
  onView,
  onDelete,
}: {
  items: AnexoRow[];
  canEdit: boolean;
  uploading: boolean;
  onUploadClick: () => void;
  onView: (path: string) => void;
  onDelete: (d: AnexoRow) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((d) => {
        const name = d.path.split("/").slice(1).join("/") || d.path;
        const isPdf = d.path.toLowerCase().endsWith(".pdf");
        return (
          <div key={d.id} className="relative w-20 h-20 rounded-lg border border-border overflow-hidden bg-accent-light flex flex-col">
            <button
              onClick={() => onView(d.path)}
              className="flex-1 flex items-center justify-center text-text-muted hover:bg-border transition-colors"
              title={name}
            >
              {isPdf
                ? <span className="text-[10px] font-bold text-text-muted tracking-wide">PDF</span>
                : <ExternalLink className="w-5 h-5" />
              }
            </button>
            <div className="px-1.5 py-1 border-t border-border flex items-center justify-between gap-1">
              <span className="text-[9px] text-text-muted truncate flex-1">{name}</span>
              {canEdit && (
                <button
                  onClick={() => onDelete(d)}
                  className="text-[var(--color-danger)] hover:opacity-70 flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {canEdit && (
        <button
          onClick={() => !uploading && onUploadClick()}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-text-muted hover:border-text-muted transition-colors text-2xl"
        >
          +
        </button>
      )}
    </div>
  );
}

// ── AmbienteDrawer ───────────────────────────────────────────────────────────
export function AmbienteDrawer({ item, canEdit, isAdmin, open, onClose, onAptidaoChange }: DrawerProps) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const fileRefDesenho = useRef<HTMLInputElement>(null);
  const fileRefFoto    = useRef<HTMLInputElement>(null);

  const [obs, setObs] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [uploading, setUploading] = useState<"desenho" | "foto" | null>(null);
  const [form, setForm] = useState<FormQ>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObs(item?.aptidao_obs ?? "");
  }, [item?.id, item?.aptidao_obs]);

  // ── Questionário ──
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

  const { data: savedQ } = useQuery({
    queryKey: ["moveria_questionario", item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_questionario_ambiente")
        .select("*")
        .eq("item_id", item!.id)
        .maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  useEffect(() => {
    if (!savedQ) { setForm(EMPTY_FORM); return; }
    setForm({
      pedireito:   { opcao_id: savedQ.pedireito_opcao_id   ?? "", valor: savedQ.pedireito_valor   ?? "" },
      bancadas:    { opcao_id: savedQ.bancadas_opcao_id    ?? "", valor: savedQ.bancadas_valor    ?? "" },
      instalacoes: { opcao_id: savedQ.instalacoes_opcao_id ?? "", valor: savedQ.instalacoes_valor ?? "" },
      eletros:     { opcao_id: savedQ.eletros_opcao_id     ?? "", valor: savedQ.eletros_valor     ?? "" },
    });
  }, [savedQ]);

  // ── Aptidão ──
  const aptMut = useMutation({
    mutationFn: async (aptidao: Aptidao) => {
      const { error } = await supabase
        .from("moveria_itens_contrato")
        .update({ aptidao })
        .eq("id", item!.id);
      if (error) throw error;
      if (isAdmin && aptidao !== item?.aptidao) {
        const contrId = await supabase
          .from("moveria_itens_contrato")
          .select("contrato_id")
          .eq("id", item!.id)
          .maybeSingle()
          .then((r) => r.data?.contrato_id);
        if (contrId) {
          await supabase.from("moveria_eventos").insert({
            tipo: "aptidao_corrigida",
            contrato_id: contrId,
            item_id: item!.id,
            autor_id: profile!.id,
            payload: { de: item?.aptidao, para: aptidao },
          });
        }
      }
    },
    onSuccess: () => { onAptidaoChange(); toast.success("Aptidão salva"); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar aptidão"),
  });

  async function saveObs() {
    if (!item || obs === (item.aptidao_obs ?? "")) return;
    setSavingObs(true);
    const { error } = await supabase
      .from("moveria_itens_contrato")
      .update({ aptidao_obs: obs || null })
      .eq("id", item.id);
    setSavingObs(false);
    if (error) toast.error(error.message);
    else onAptidaoChange();
  }

  // ── Anexos: query única, filtrada em render ──
  const { data: todos = [], refetch: refetchAnexos } = useQuery({
    queryKey: ["moveria_desenhos", item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_desenhos_medicao")
        .select("id, item_id, path, tipo")
        .eq("item_id", item!.id)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as AnexoRow[];
    },
  });

  const desenhos = todos.filter((d) => d.tipo === "desenho");
  const fotos    = todos.filter((d) => d.tipo === "foto");

  async function handleUpload(
    tipo: "desenho" | "foto",
    e: React.ChangeEvent<HTMLInputElement>,
    ref: React.RefObject<HTMLInputElement>,
  ) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(tipo);
    let n = 0;
    try {
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${item!.id}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("moveria-medicoes").upload(path, file);
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase
          .from("moveria_desenhos_medicao")
          .insert({ item_id: item!.id, path, enviado_por: profile!.id, tipo });
        if (dbErr) throw dbErr;
        n++;
      }
      await refetchAnexos();
      toast.success(`${n} ${tipo === "foto" ? "foto(s)" : "desenho(s)"} enviado(s)`);
    } catch (err: any) {
      toast.error(err.message ?? "Erro no upload");
    } finally {
      setUploading(null);
      if (ref.current) ref.current.value = "";
    }
  }

  async function handleDelete(d: AnexoRow) {
    await supabase.storage.from("moveria-medicoes").remove([d.path]);
    await supabase.from("moveria_desenhos_medicao").delete().eq("id", d.id);
    await refetchAnexos();
    toast.success(d.tipo === "foto" ? "Foto removida" : "Desenho removido");
  }

  async function handleView(path: string) {
    const { data, error } = await supabase.storage.from("moveria-medicoes").createSignedUrl(path, 300);
    if (error) { toast.error("Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function handleSaveQ() {
    if (!item || !profile) return;
    const isComplete = BLOCO_CHAVES.every((k) => !!form[k].opcao_id);
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
        preenchido_por:       profile.id,
        atualizado_em:        new Date().toISOString(),
      };
      const { error } = await supabase
        .from("moveria_questionario_ambiente")
        .upsert(payload, { onConflict: "item_id" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["moveria_questionario", item.id] });
      toast.success("Questionário salvo");
      if (isComplete) onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!item) return null;

  const isInapto = item.aptidao === "inapto";
  const isApto   = item.aptidao === "apto" || item.aptidao === "apto_ressalva";
  const nomeDisplay = item.ambiente || item.descricao || item.codigo;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="px-5 py-4 border-b border-border flex-shrink-0">
          <SheetTitle className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">{item.codigo}</span>
            {nomeDisplay}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 px-5 py-4 flex flex-col gap-5 overflow-y-auto">

          {/* ── Aptidão ── */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-text-muted mb-2 block">Aptidão do Ambiente</Label>
            {canEdit ? (
              <div className="flex gap-2">
                {(["apto", "apto_ressalva", "inapto"] as Aptidao[]).map((a) => {
                  const labels: Record<Aptidao, string> = { apto: "Apto", apto_ressalva: "Apto c/ ressalva", inapto: "Inapto", pendente: "Pendente" };
                  const active = item.aptidao === a;
                  const colorMap: Record<string, string> = {
                    apto:          "border-[var(--color-success)] bg-[var(--color-success-light)] text-[var(--color-success-text)]",
                    apto_ressalva: "border-[var(--color-warning)] bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
                    inapto:        "border-[var(--color-danger)]  bg-[var(--color-danger-light)]  text-[var(--color-danger-text)]",
                  };
                  return (
                    <button
                      key={a}
                      onClick={() => !aptMut.isPending && aptMut.mutate(a)}
                      disabled={aptMut.isPending}
                      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold border transition-all ${
                        active ? colorMap[a] : "border-border bg-surface text-text-secondary hover:bg-accent-light"
                      }`}
                    >
                      {labels[a]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-text-secondary">{item.aptidao}</div>
            )}
          </div>

          {/* ── Observação / Ressalva ── */}
          {!isInapto && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 block">
                {item.aptidao === "apto_ressalva" ? "Texto da Ressalva" : "Observação"}
                {item.aptidao === "apto_ressalva" && <span className="text-[var(--color-danger)] ml-1">*</span>}
              </Label>
              <Textarea
                rows={3}
                disabled={!canEdit}
                placeholder={item.aptidao === "apto_ressalva" ? "Descreva a ressalva (obrigatório)…" : "Observação sobre a aptidão…"}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                onBlur={saveObs}
              />
              {savingObs && (
                <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                  <LoaderCircle className="w-3 h-3 animate-spin" />Salvando…
                </p>
              )}
            </div>
          )}

          {/* ── Motivo inapto ── */}
          {isInapto && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 block">
                Motivo do Inapto <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <Textarea
                rows={3}
                disabled={!canEdit}
                placeholder="Descreva o motivo da inaptidão (obrigatório)…"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                onBlur={saveObs}
              />
              {!obs.trim() && canEdit && (
                <p className="text-xs text-[var(--color-danger)] mt-1">Motivo obrigatório para ambientes inaptos.</p>
              )}
            </div>
          )}

          <Separator />

          {/* ── Desenhos + Fotos (oculto se inapto) ── */}
          {!isInapto && (
            <>
              {/* Desenhos de medição (image/* + PDF) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                    Desenho de Medição
                    {isApto && <span className="text-[var(--color-danger)] ml-1">*</span>}
                  </Label>
                  {canEdit && (
                    <button
                      onClick={() => uploading !== "desenho" && fileRefDesenho.current?.click()}
                      disabled={uploading === "desenho"}
                      className="flex items-center gap-1.5 text-xs font-medium text-text-secondary border border-border rounded-md px-2.5 py-1 hover:bg-accent-light transition-colors"
                    >
                      {uploading === "desenho"
                        ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        : <Upload className="w-3.5 h-3.5" />
                      }
                      Enviar
                    </button>
                  )}
                  <input
                    ref={fileRefDesenho}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleUpload("desenho", e, fileRefDesenho)}
                  />
                </div>
                {isApto && desenhos.length === 0 && (
                  <p className="text-xs text-[var(--color-danger)] mb-2">Desenho obrigatório para conformar o lote.</p>
                )}
                <AnexoGrid
                  items={desenhos}
                  canEdit={canEdit}
                  uploading={uploading === "desenho"}
                  onUploadClick={() => fileRefDesenho.current?.click()}
                  onView={handleView}
                  onDelete={handleDelete}
                />
              </div>

              {/* Fotos do ambiente (somente image/*) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                    Fotos do Ambiente
                  </Label>
                  {canEdit && (
                    <button
                      onClick={() => uploading !== "foto" && fileRefFoto.current?.click()}
                      disabled={uploading === "foto"}
                      className="flex items-center gap-1.5 text-xs font-medium text-text-secondary border border-border rounded-md px-2.5 py-1 hover:bg-accent-light transition-colors"
                    >
                      {uploading === "foto"
                        ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        : <Camera className="w-3.5 h-3.5" />
                      }
                      Enviar
                    </button>
                  )}
                  <input
                    ref={fileRefFoto}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUpload("foto", e, fileRefFoto)}
                  />
                </div>
                <AnexoGrid
                  items={fotos}
                  canEdit={canEdit}
                  uploading={uploading === "foto"}
                  onUploadClick={() => fileRefFoto.current?.click()}
                  onView={handleView}
                  onDelete={handleDelete}
                />
              </div>
            </>
          )}

          {/* ── Questionário (só se apto ou apto_ressalva) ── */}
          {isApto && questData && (
            <>
              <Separator />
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-text-muted mb-3 block">Questionário do Ambiente</Label>
                <div className="grid grid-cols-2 gap-4">
                  {questData.blocos.map((bloco) => {
                    const chave = bloco.chave as BlocoChave;
                    if (!BLOCO_CHAVES.includes(chave)) return null;
                    const blocoOpcoes = questData.opcoes.filter((o) => o.bloco_id === bloco.id);
                    return (
                      <div key={bloco.id}>
                        <p className="text-xs font-semibold text-text-primary mb-2">{bloco.label}</p>
                        <div className="flex flex-col gap-1.5">
                          {blocoOpcoes.map((o) => {
                            const on = form[chave].opcao_id === o.id;
                            return (
                              <div key={o.id}>
                                <button
                                  disabled={!canEdit}
                                  onClick={() => setForm((f) => ({ ...f, [chave]: { opcao_id: o.id, valor: "" } }))}
                                  className="flex items-center gap-2 w-full text-left"
                                >
                                  <div className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${
                                    on ? "bg-primary border-primary" : "border-border bg-surface"
                                  }`}>
                                    {on && <span className="text-primary-foreground text-[9px]">✓</span>}
                                  </div>
                                  <span className={`text-xs ${on ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                                    {o.label}
                                    {o.tem_campo_valor && <span className="text-text-muted"> =</span>}
                                  </span>
                                </button>
                                {o.tem_campo_valor && on && (
                                  <input
                                    disabled={!canEdit}
                                    value={form[chave].valor}
                                    onChange={(e) => setForm((f) => ({ ...f, [chave]: { ...f[chave], valor: e.target.value } }))}
                                    placeholder="valor"
                                    className="ml-6 mt-1 w-28 text-xs border border-border rounded px-2 py-1 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-ring"
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
                {canEdit && (
                  <Button size="sm" className="mt-4" onClick={handleSaveQ} disabled={saving}>
                    {saving && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Salvar questionário
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
