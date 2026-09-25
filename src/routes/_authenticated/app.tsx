import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  return <Outlet />;
}
