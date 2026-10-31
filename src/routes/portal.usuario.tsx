import { createFileRoute } from "@tanstack/react-router";
import { PortalCasca } from "@/components/portal/PortalCasca";
import { UsuarioPagina } from "@/components/portal/UsuarioPagina";

export const Route = createFileRoute("/portal/usuario")({
  ssr: false,
  head: () => ({ meta: [{ title: "Usuário — Portal Mowig" }] }),
  component: () => (
    <PortalCasca aba="usuario">
      <UsuarioPagina />
    </PortalCasca>
  ),
});
