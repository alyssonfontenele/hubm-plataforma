import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { AgendarPagina } from "@/components/portal/ColetasPaginas";
import { pedidosDeBusca } from "@/lib/portal-coletas";

export const Route = createFileRoute("/portal/agendar")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { pedidos?: string } => {
    const lista = pedidosDeBusca(s.pedidos);
    return lista.length > 0 ? { pedidos: lista.join(",") } : {};
  },
  head: () => ({ meta: [{ title: "Agendar coleta — Portal Mowig" }] }),
  component: AgendarRota,
});

function AgendarRota() {
  const { pedidos } = Route.useSearch();
  return (
    <PortalCasca aba="pedidos">
      <AgendarPagina pedidos={pedidosDeBusca(pedidos)} />
    </PortalCasca>
  );
}
