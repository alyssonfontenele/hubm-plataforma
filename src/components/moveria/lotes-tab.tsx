import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { LoaderCircle, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EtapaBadge } from "./status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type LoteRow = {
  id: string;
  numero: string;
  status: string;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
  conformado_em: string | null;
  criado_em: string;
};

type ItemRow = {
  id: string;
  codigo: string;
  descricao: string | null;
  aptidao: string;
  lote_id: string;
  valor_item: number | null;
};

const LOTE_GRID_BASE = "20px 48px minmax(80px,120px) minmax(0,1fr) 36px minmax(100px,140px) 80px";
const LOTE_GRID_ADMIN = LOTE_GRID_BASE + " 28px";

function AptidaoMini({ aptidao }: { aptidao: string }) {
  const cls =
    aptidao === "apto"
      ? "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]"
      : aptidao === "inapto"
      ? "bg-[var(--color-danger-light)] text-[var(--color-danger-text)] border-[var(--color-danger)]"
      : "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]";
  return (
    <span className={`inline-flex items-center px-1 py-px rounded text-[9px] font-semibold border leading-none flex-shrink-0 ${cls}`}>
      {aptidao}
    </span>
  );
}

export function LotesTab({
  contratoId,
  initialExpandedId,
  valorTotalDeclarado,
  isAdmin = false,
}: {
  contratoId: string;
  initialExpandedId?: string;
  valorTotalDeclarado?: number | null;
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();

  const [expandedLoteIds, setExpandedLoteIds] = useState<Set<string>>(
    () => new Set(initialExpandedId ? [initialExpandedId] : [])
  );
  const [dissolveTarget, setDissolveTarget] = useState<{ id: string; numero: string } | null>(null);
  const [dissolving, setDissolving] = useState(false);

  useEffect(() => {
    if (initialExpandedId) {
      setExpandedLoteIds((prev) => new Set([...prev, initialExpandedId]));
    }
  }, [initialExpandedId]);

  function toggleLote(id: string) {
    setExpandedLoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const { data: lotes = [], isLoading } = useQuery<LoteRow[]>({
    queryKey: ["moveria_lotes_tab", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_lotes_v")
        .select("id, numero, status, consultor_nome, qtd_itens, tem_ressalva, conformado_em, criado_em")
        .eq("contrato_id", contratoId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  const { data: itens = [] } = useQuery<ItemRow[]>({
    queryKey: ["moveria_lote_itens_detail", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_contrato")
        .select("id, codigo, descricao, aptidao, lote_id, valor_item")
        .eq("contrato_id", contratoId)
        .not("lote_id", "is", null)
        .is("deletado_em", null)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const itensByLote = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of itens) {
      const arr = map.get(item.lote_id) ?? [];
      arr.push(item);
      map.set(item.lote_id, arr);
    }
    return map;
  }, [itens]);

  const valorByLote = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of itens) {
      if (item.valor_item != null) {
        map.set(item.lote_id, (map.get(item.lote_id) ?? 0) + item.valor_item);
      }
    }
    return map;
  }, [itens]);

  async function handleDissolve() {
    if (!dissolveTarget) return;
    setDissolving(true);
    try {
      const { error } = await supabase
        .from("moveria_lotes")
        .delete()
        .eq("id", dissolveTarget.id);
      if (error) throw error;
      toast.success(`Lote ${dissolveTarget.numero} desfeito`);
      setDissolveTarget(null);
      qc.invalidateQueries({ queryKey: ["moveria_lotes_tab", contratoId] });
      qc.invalidateQueries({ queryKey: ["moveria_lote_itens_detail", contratoId] });
      qc.invalidateQueries({ queryKey: ["moveria_kanban"] });
      qc.invalidateQueries({ queryKey: ["moveria_ambientes", contratoId] });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao desfazer lote");
    } finally {
      setDissolving(false);
    }
  }

  const loteGrid = isAdmin ? LOTE_GRID_ADMIN : LOTE_GRID_BASE;

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
    </div>
  );

  if (lotes.length === 0) return (
    <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-text-muted">
      Nenhum lote conformado para este contrato ainda.<br />
      <span className="text-xs text-text-muted mt-1 block">Meça os ambientes e conforme o lote para ele aparecer aqui.</span>
    </div>
  );

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div
          className="grid gap-x-2 bg-accent-light px-4 py-2.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted"
          style={{ gridTemplateColumns: loteGrid }}
        >
          <div />
          <div>Lote</div>
          <div>Status</div>
          <div>Consultor</div>
          <div className="text-right">Amb.</div>
          <div className="text-right">Valor</div>
          <div className="text-right">Conformado</div>
          {isAdmin && <div />}
        </div>

        {lotes.map((l) => {
          const isExpanded = expandedLoteIds.has(l.id);
          const dia = l.conformado_em
            ? new Date(l.conformado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
            : new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
          const loteItens = itensByLote.get(l.id) ?? [];
          const loteValor = valorByLote.get(l.id) ?? null;
          const pct = loteValor != null && valorTotalDeclarado != null && valorTotalDeclarado > 0
            ? Math.round(loteValor / valorTotalDeclarado * 100)
            : null;
          const valorFmt = loteValor != null
            ? loteValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : null;

          return (
            <div key={l.id} className="border-b border-border last:border-0">
              {/* Lote row */}
              <div
                className="grid gap-x-2 px-4 py-3 items-center text-sm hover:bg-accent-light/60 transition-colors cursor-pointer select-none"
                style={{ gridTemplateColumns: loteGrid }}
                onClick={() => toggleLote(l.id)}
              >
                <ChevronRight
                  className={`w-3 h-3 text-text-muted transition-transform duration-150 flex-shrink-0 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-text-primary">{l.numero}</span>
                  {l.tem_ressalva && <span className="text-[var(--color-warning)] text-xs">⚠</span>}
                </div>
                <div><EtapaBadge etapa={l.status} /></div>
                <div className="text-text-secondary text-xs truncate min-w-0 overflow-hidden">{l.consultor_nome ?? "—"}</div>
                <div className="font-mono text-right text-text-secondary">{l.qtd_itens}</div>
                <div className="min-w-0 text-right">
                  {valorFmt ? (
                    <span className="font-mono text-[10px] text-text-secondary">
                      {valorFmt}
                      {pct != null && (
                        <span className="text-text-muted"> · {pct}%</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-text-muted text-xs">—</span>
                  )}
                </div>
                <div className="font-mono text-xs text-text-muted text-right">{dia}</div>
                {isAdmin && (
                  <div className="flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDissolveTarget({ id: l.id, numero: l.numero });
                      }}
                      title={`Desfazer Lote ${l.numero}`}
                      className="p-1 rounded text-text-muted hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Ambientes expandidos */}
              {isExpanded && (
                <div className="bg-background/40 border-t border-border/50">
                  {loteItens.length === 0 ? (
                    <div className="px-10 py-2 text-[11px] text-text-muted italic">
                      Nenhum ambiente neste lote.
                    </div>
                  ) : (
                    loteItens.map((item) => (
                      <div
                        key={item.id}
                        className="grid gap-x-2 px-4 py-1.5 border-b border-border/30 last:border-b-0 items-center"
                        style={{ gridTemplateColumns: loteGrid }}
                      >
                        {/* indent — under chevron col */}
                        <div />
                        {/* under Lote col */}
                        <div className="font-mono text-[10px] text-text-muted truncate min-w-0">{item.codigo}</div>
                        {/* under Status col */}
                        <div><AptidaoMini aptidao={item.aptidao} /></div>
                        {/* under Consultor col (widest text col) */}
                        <div className="text-[11px] text-text-secondary truncate min-w-0 overflow-hidden">{item.descricao || "—"}</div>
                        {/* under Amb. col — empty */}
                        <div />
                        {/* under Valor col — right-aligned, sem centavos */}
                        <div className="font-mono text-[10px] text-text-muted text-right">
                          {item.valor_item != null
                            ? item.valor_item.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "—"}
                        </div>
                        {/* under Conformado col — empty */}
                        <div />
                        {/* under admin col — empty */}
                        {isAdmin && <div />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog de confirmação de dissolução — fora do .map(), instância única */}
      <AlertDialog
        open={dissolveTarget !== null}
        onOpenChange={(open) => { if (!open) setDissolveTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desfazer Lote {dissolveTarget?.numero}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-text-secondary">
                <p>
                  Os ambientes deste lote voltarão a ficar <strong>sem lote</strong> e estarão
                  disponíveis para uma nova conformação.
                </p>
                <p>
                  As <strong>medições e aptidões</strong> de cada ambiente são preservadas — nenhum
                  dado de medição é perdido.
                </p>
                <p className="text-[var(--color-danger)] font-medium">
                  Esta ação desfaz o agrupamento e não pode ser desfeita.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dissolving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDissolve}
              disabled={dissolving}
              className="bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90"
            >
              {dissolving && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Desfazer lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
