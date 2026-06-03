import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EtapaBadge, AptidaoBadge, type Aptidao } from "@/components/moveria/status-badge";

export const Route = createFileRoute("/_authenticated/contratos/lote/$loteId")({
  ssr: false,
  component: LoteDetalhePage,
});

type LoteInfo = {
  id: string; numero: string; status: string;
  contrato_numero: string; cliente_nome: string;
  consultor_nome: string | null; conformado_em: string | null;
  qtd_itens: number; tem_ressalva: boolean;
};

type ItemLote = {
  item_id: string; codigo: string; descricao: string;
  ambiente: string | null; aptidao: Aptidao;
};

function LoteDetalhePage() {
  const { loteId } = Route.useParams();
  const navigate   = useNavigate();

  const { data: lote, isLoading } = useQuery<LoteInfo | null>({
    queryKey: ["moveria_lote_detalhe", loteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_lotes_v")
        .select("id, numero, status, contrato_numero, cliente_nome, consultor_nome, conformado_em, qtd_itens, tem_ressalva")
        .eq("id", loteId).maybeSingle();
      return (data as LoteInfo | null) ?? null;
    },
  });

  const { data: itens = [], isLoading: loadingItens } = useQuery<ItemLote[]>({
    queryKey: ["moveria_lote_itens", loteId],
    enabled: !!lote,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_lote_itens")
        .select("item_id, moveria_itens_contrato(codigo, descricao, ambiente, aptidao)")
        .eq("lote_id", loteId);
      return (data ?? []).map((d: any) => ({
        item_id:  d.item_id,
        codigo:   d.moveria_itens_contrato?.codigo ?? "",
        descricao: d.moveria_itens_contrato?.descricao ?? "",
        ambiente: d.moveria_itens_contrato?.ambiente ?? null,
        aptidao:  d.moveria_itens_contrato?.aptidao ?? "pendente",
      })) as ItemLote[];
    },
  });

  if (isLoading) return (
    <div className="p-8 flex justify-center">
      <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
    </div>
  );

  if (!lote) return (
    <div className="p-8 text-center text-sm text-text-muted">Lote não encontrado.</div>
  );

  const conformadoDia = lote.conformado_em
    ? new Date(lote.conformado_em).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <button
        onClick={() => navigate({ to: "/contratos" })}
        className="flex items-center gap-1.5 text-sm text-text-secondary mb-5 hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Contratos
      </button>

      {/* Banner */}
      <div className="rounded-lg border border-border bg-surface px-5 py-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-bold text-xl text-text-primary">Lote {lote.numero}</span>
          {lote.tem_ressalva && <span className="text-sm text-[var(--color-warning-text)]">⚠ com ressalva</span>}
          <EtapaBadge etapa={lote.status} />
        </div>
        <div className="text-sm text-text-secondary mt-1">
          {lote.contrato_numero} · {lote.cliente_nome}
        </div>
        <div className="text-xs text-text-muted mt-1 flex gap-3">
          {lote.consultor_nome && <span>Consultor: {lote.consultor_nome}</span>}
          <span>Conformado em: {conformadoDia}</span>
          <span>{lote.qtd_itens} ambiente(s)</span>
        </div>
      </div>

      {/* Itens */}
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">Ambientes do lote</p>
      {loadingItens ? (
        <div className="flex justify-center py-8"><LoaderCircle className="w-5 h-5 animate-spin text-text-muted" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid bg-accent-light px-4 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            style={{ gridTemplateColumns: "1fr 120px" }}>
            <div>Ambiente</div>
            <div>Aptidão</div>
          </div>
          {itens.map((item) => (
            <div key={item.item_id}
              className="grid px-4 py-3 border-b border-border last:border-0 items-center"
              style={{ gridTemplateColumns: "1fr 120px" }}>
              <div>
                <p className="text-sm font-medium text-text-primary">{item.ambiente || item.descricao}</p>
                <p className="text-xs text-text-muted">{item.codigo}</p>
              </div>
              <AptidaoBadge aptidao={item.aptidao} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
