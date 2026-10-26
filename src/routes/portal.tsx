import { createFileRoute, Outlet } from "@tanstack/react-router";
import { COMPANY_SLUG } from "@/lib/company";
import "@/components/portal/portal.css";

export const Route = createFileRoute("/portal")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal Mowig" }, { name: "robots", content: "noindex" }] }),
  component: PortalLayout,
});

function PortalLayout() {
  // Módulo exclusivo do tenant Mowig (build sem slug definido também libera, para o preview).
  if (COMPANY_SLUG && COMPANY_SLUG !== "mowig") {
    return (
      <div className="portal-mowig">
        <div className="portal-centro">
          <div className="portal-cartao">
            <h1>Página não encontrada</h1>
            <p className="portal-sub">Este endereço não existe.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="portal-mowig">
      <Outlet />
    </div>
  );
}
