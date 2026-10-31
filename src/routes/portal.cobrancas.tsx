import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { CobrancasPagina } from "@/components/portal/CobrancasPagina";

export const Route = createFileRoute("/portal/cobrancas")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { pedido?: number } => {
    const n = Number(s.pedido);
    return Number.isInteger(n) && n > 0 ? { pedido: n } : {};
  },
  head: () => ({ meta: [{ title: "Cobranças — Portal Mowig" }] }),
  component: CobrancasRota,
});

function CobrancasRota() {
  const { pedido } = Route.useSearch();
  return (
    <PortalCasca aba="cobrancas">
      <CobrancasPagina pedidoInicial={pedido} />
    </PortalCasca>
  );
}
