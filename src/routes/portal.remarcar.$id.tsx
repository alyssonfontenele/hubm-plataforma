import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { RemarcarPagina } from "@/components/portal/ColetasPaginas";

export const Route = createFileRoute("/portal/remarcar/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Remarcar coleta — Portal Mowig" }] }),
  component: Rota,
});

function Rota() {
  const { id } = Route.useParams();
  const n = Number(id);
  return (
    <PortalCasca aba="pedidos">
      {Number.isInteger(n) && n > 0 ? (
        <RemarcarPagina id={n} />
      ) : (
        <p className="portal-meta">Coleta não encontrada.</p>
      )}
    </PortalCasca>
  );
}
