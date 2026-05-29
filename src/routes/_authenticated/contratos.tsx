import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contratos")({
  ssr: false,
  component: ContratosLayout,
});

function ContratosLayout() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Módulo</p>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileText className="w-6 h-6" /> Contratos
        </h1>
      </header>
      <Outlet />
    </div>
  );
}
