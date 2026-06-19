import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { LoaderCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EtapaBadge } from "./status-badge";

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
};

const LOTE_GRID = "20px 48px minmax(80px,120px) minmax(0,1fr) 36px 80px";

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
}: {
  contratoId: string;
  initialExpandedId?: string;
}) {
  const [expandedLoteIds, setExpandedLoteIds] = useState<Set<string>>(
    () => new Set(initialExpandedId ? [initialExpandedId] : [])
  );

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
        .select("id, codigo, descricao, aptidao, lote_id")
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
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div
        className="grid gap-x-2 bg-accent-light px-4 py-2.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted"
        style={{ gridTemplateColumns: LOTE_GRID }}
      >
        <div />
        <div>Lote</div>
        <div>Status</div>
        <div>Consultor</div>
        <div>Amb.</div>
        <div>Conformado</div>
      </div>

      {lotes.map((l) => {
        const isExpanded = expandedLoteIds.has(l.id);
        const dia = l.conformado_em
          ? new Date(l.conformado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
          : new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
        const loteItens = itensByLote.get(l.id) ?? [];

        return (
          <div key={l.id} className="border-b border-border last:border-0">
            {/* Lote row */}
            <div
              className="grid gap-x-2 px-4 py-3 items-center text-sm hover:bg-accent-light/60 transition-colors cursor-pointer select-none"
              style={{ gridTemplateColumns: LOTE_GRID }}
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
              <div className="font-mono text-text-secondary">{l.qtd_itens}</div>
              <div className="font-mono text-xs text-text-muted">{dia}</div>
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
                      className="flex items-center gap-3 px-4 pl-10 py-1.5 border-b border-border/30 last:border-b-0 text-[11px]"
                    >
                      <span className="font-mono text-[10px] text-text-muted flex-shrink-0 w-14 truncate">
                        {item.codigo}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-text-secondary">
                        {item.descricao || "—"}
                      </span>
                      <AptidaoMini aptidao={item.aptidao} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
