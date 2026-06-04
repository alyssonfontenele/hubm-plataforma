import { useState, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export type AfetadoItem = {
  itemId: string;
  itemNome: string;
  consultorAnteriorId: string | null;
  consultorAnteriorNome: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "todos" | "item";
  consultorNovoNome: string;
  dataPrevista: string;
  // scope="todos"
  afetados?: AfetadoItem[];
  afetadosLoading?: boolean;
  // scope="item"
  itemNome?: string;
  consultorAnteriorNome?: string | null;
  // ação
  onConfirm: () => void;
  isPending: boolean;
};

function fmtData(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export function DialogDesignacaoCerimoniosa({
  open, onOpenChange,
  scope,
  consultorNovoNome, dataPrevista,
  afetados = [], afetadosLoading = false,
  itemNome, consultorAnteriorNome,
  onConfirm, isPending,
}: Props) {
  const [confirmado, setConfirmado] = useState(false);

  // Reset checkbox ao abrir
  useEffect(() => { if (open) setConfirmado(false); }, [open]);

  // ── Breakdown para scope="todos" ──────────────────────────────────────────
  const semDesig    = afetados.filter((a) => !a.consultorAnteriorId);
  const redesig     = afetados.filter((a) => !!a.consultorAnteriorId);
  // Agrupa redesignados por consultor anterior
  const porAnterior = redesig.reduce<Record<string, { nome: string; count: number }>>((acc, a) => {
    const key = a.consultorAnteriorId!;
    if (!acc[key]) acc[key] = { nome: a.consultorAnteriorNome ?? key, count: 0 };
    acc[key].count++;
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {scope === "todos" ? "Designar consultor — todos os ambientes" : "Designar consultor — ambiente específico"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ── Consultor novo ── */}
          <div className="rounded-lg border border-border bg-accent-light px-4 py-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Novo consultor</p>
            <p className="text-sm font-semibold text-text-primary">{consultorNovoNome || "—"}</p>
            {dataPrevista && (
              <p className="text-xs text-text-secondary">Previsão de medição: <strong>{fmtData(dataPrevista)}</strong></p>
            )}
          </div>

          {/* ── O que vai mudar ── */}
          {scope === "todos" && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Ambientes afetados</p>
              {afetadosLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Carregando…
                </div>
              ) : afetados.length === 0 ? (
                <p className="text-xs text-text-muted">Nenhum ambiente pendente encontrado.</p>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  {semDesig.length > 0 && (
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Sem designação prévia</span>
                      <span className="font-mono font-semibold text-text-primary">{semDesig.length}</span>
                    </div>
                  )}
                  {Object.values(porAnterior).map((g) => (
                    <div key={g.nome} className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-text-secondary">
                        <span className="line-through text-text-muted">{g.nome}</span>
                        {" → "}
                        <span className="font-medium text-text-primary">{consultorNovoNome}</span>
                      </span>
                      <span className="font-mono font-semibold text-text-primary">{g.count}</span>
                    </div>
                  ))}
                  <div className="px-3 py-2 flex items-center justify-between gap-2 bg-accent-light">
                    <span className="font-semibold text-text-primary">Total</span>
                    <span className="font-mono font-bold text-text-primary">{afetados.length}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {scope === "item" && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Ambiente</p>
              <div className="rounded-lg border border-border px-3 py-2.5 space-y-1.5">
                <p className="text-sm font-medium text-text-primary">{itemNome || "—"}</p>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className={consultorAnteriorNome ? "line-through text-text-muted" : "text-text-muted"}>
                    {consultorAnteriorNome ?? "Sem designação"}
                  </span>
                  <span className="text-text-muted">→</span>
                  <span className="font-medium text-text-primary">{consultorNovoNome}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Checkbox de confirmação explícita ── */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <Checkbox
              id="confirm-desig"
              checked={confirmado}
              onCheckedChange={(v) => setConfirmado(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="confirm-desig" className="text-sm text-text-secondary cursor-pointer select-none leading-snug">
              Confirmo esta designação. Estou ciente que designações anteriores serão substituídas e que a ação fica registrada na trilha de auditoria.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!confirmado || isPending || (scope === "todos" && afetadosLoading)}
          >
            {isPending && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Confirmar designação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
