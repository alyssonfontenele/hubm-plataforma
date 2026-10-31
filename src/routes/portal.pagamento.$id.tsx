import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { PagamentoPagina } from "@/components/portal/PagamentoPagina";

export const Route = createFileRoute("/portal/pagamento/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Pagamento — Portal Mowig" }] }),
  component: PagamentoRota,
});

function PagamentoRota() {
  const { id } = Route.useParams();
  const n = Number(id);
  return (
    <PortalCasca aba="cobrancas">
      {Number.isInteger(n) && n > 0 ? (
        <PagamentoPagina id={n} />
      ) : (
        <p className="portal-meta">Cobrança não encontrada.</p>
      )}
    </PortalCasca>
  );
}
