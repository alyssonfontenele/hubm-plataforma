import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — HubM" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { globalRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && globalRole !== "admin") {
      void navigate({ to: "/app" });
    }
  }, [loading, globalRole, navigate]);

  if (globalRole !== "admin") return null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Administração</h1>
        <p className="text-sm text-text-secondary mt-1">
          Painel completo chega na Etapa 7.
        </p>
      </header>

      <div className="border border-border rounded-lg bg-surface p-6">
        <p className="text-sm text-text-muted">Sem conteúdo ainda.</p>
      </div>
    </div>
  );
}
