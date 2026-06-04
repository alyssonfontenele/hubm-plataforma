import { useState, useEffect } from "react";
import { LoaderCircle, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export type EntradaRascunho = {
  itemId: string;
  itemNome: string;
  consultorNovoId: string;
  consultorNovoNome: string;
  consultorAnteriorId: string | null;
  consultorAnteriorNome: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entradas: EntradaRascunho[];
  dataPrevista: string;
  onConfirm: () => void;
  isPending: boolean;
};

function fmtData(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export function DialogDesignacaoCerimoniosa({
  open, onOpenChange,
  entradas,
  dataPrevista,
  onConfirm, isPending,
}: Props) {
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => { if (open) setConfirmado(false); }, [open]);

  const novas      = entradas.filter((e) => !e.consultorAnteriorId);
  const redesig    = entradas.filter((e) =>  e.consultorAnteriorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar designações</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ── Resumo de contagem ── */}
          <div className="flex gap-3 text-xs text-text-secondary">
            {novas.length > 0 && (
              <span>
                <span className="font-semibold text-text-primary">{novas.length}</span> nova{novas.length !== 1 ? "s" : ""}
              </span>
            )}
            {redesig.length > 0 && (
              <span>
                <span className="font-semibold text-text-primary">{redesig.length}</span> redesignação{redesig.length !== 1 ? "ões" : ""}
              </span>
            )}
            {dataPrevista && (
              <span className="ml-auto text-text-muted">
                Previsão de medição: <strong className="text-text-secondary">{fmtData(dataPrevista)}</strong>
              </span>
            )}
          </div>

          {/* ── Lista item a item ── */}
          <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
            {entradas.length === 0 ? (
              <p className="text-xs text-text-muted px-3 py-4 text-center">Nenhuma alteração pendente.</p>
            ) : (
              <div className="divide-y divide-border">
                {entradas.map((e) => (
                  <div key={e.itemId} className="px-3 py-2 flex items-center gap-2 min-w-0">
                    {/* Nome do ambiente */}
                    <p className="text-xs font-medium text-text-primary truncate flex-1 min-w-0">{e.itemNome}</p>
                    {/* De → Para */}
                    <div className="flex items-center gap-1 flex-shrink-0 text-xs">
                      {e.consultorAnteriorNome ? (
                        <>
                          <span className="line-through text-text-muted">{e.consultorAnteriorNome}</span>
                          <ArrowRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                        </>
                      ) : (
                        <span className="text-text-muted italic mr-1">novo</span>
                      )}
                      <span className="font-medium text-text-primary">{e.consultorNovoNome}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Checkbox de confirmação explícita ── */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <Checkbox
              id="confirm-desig"
              checked={confirmado}
              onCheckedChange={(v) => setConfirmado(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="confirm-desig" className="text-sm text-text-secondary cursor-pointer select-none leading-snug">
              Confirmo estas designações. Estou ciente que designações anteriores serão substituídas e que a ação fica registrada na trilha de auditoria.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!confirmado || isPending || entradas.length === 0}
          >
            {isPending && <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Confirmar designações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
