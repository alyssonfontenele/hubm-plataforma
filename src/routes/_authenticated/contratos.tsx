import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contratos")({
  ssr: false,
  component: ContratosLayout,
});

function ContratosLayout() {
  return <Outlet />;
}
