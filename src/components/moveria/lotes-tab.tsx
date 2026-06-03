import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
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

export function LotesTab({ contratoId }: { contratoId: string }) {
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
      <div className="grid bg-accent-light px-4 py-2.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted"
        style={{ gridTemplateColumns: "64px 1fr 120px 56px 100px" }}>
        <div>Lote</div>
        <div>Status</div>
        <div>Consultor</div>
        <div>Amb.</div>
        <div>Conformado</div>
      </div>
      {lotes.map((l) => {
        const dia = l.conformado_em
          ? new Date(l.conformado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
          : new Date(l.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
        return (
          <div
            key={l.id}
            className="grid px-4 py-3 border-b border-border last:border-0 items-center text-sm hover:bg-accent-light/60 transition-colors"
            style={{ gridTemplateColumns: "64px 1fr 120px 56px 100px" }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-text-primary">{l.numero}</span>
              {l.tem_ressalva && <span className="text-[var(--color-warning)] text-xs">⚠</span>}
            </div>
            <div><EtapaBadge etapa={l.status} /></div>
            <div className="text-text-secondary text-xs truncate">{l.consultor_nome ?? "—"}</div>
            <div className="font-mono text-text-secondary">{l.qtd_itens}</div>
            <div className="font-mono text-xs text-text-muted">{dia}</div>
          </div>
        );
      })}
    </div>
  );
}
