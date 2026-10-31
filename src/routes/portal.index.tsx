import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { PedidosPagina } from "@/components/portal/PedidosPagina";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Pedidos — Portal Mowig" }] }),
  component: () => (
    <PortalCasca aba="pedidos">
      <PedidosPagina />
    </PortalCasca>
  ),
});
