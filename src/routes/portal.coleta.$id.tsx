import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { ColetaPagina } from "@/components/portal/ColetasPaginas";

export const Route = createFileRoute("/portal/coleta/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Coleta — Portal Mowig" }] }),
  component: Rota,
});

function Rota() {
  const { id } = Route.useParams();
  const n = Number(id);
  return (
    <PortalCasca aba="pedidos">
      {Number.isInteger(n) && n > 0 ? (
        <ColetaPagina id={n} />
      ) : (
        <p className="portal-meta">Coleta não encontrada.</p>
      )}
    </PortalCasca>
  );
}
