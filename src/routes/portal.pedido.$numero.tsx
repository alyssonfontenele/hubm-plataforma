import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { PedidoPagina } from "@/components/portal/PedidosPagina";

export const Route = createFileRoute("/portal/pedido/$numero")({
  ssr: false,
  head: () => ({ meta: [{ title: "Pedido — Portal Mowig" }] }),
  component: PedidoRota,
});

function PedidoRota() {
  const { numero } = Route.useParams();
  const n = Number(numero);
  return (
    <PortalCasca aba="pedidos">
      {Number.isInteger(n) && n > 0 ? (
        <PedidoPagina numero={n} />
      ) : (
        <p className="portal-meta">Pedido não encontrado.</p>
      )}
    </PortalCasca>
  );
}
