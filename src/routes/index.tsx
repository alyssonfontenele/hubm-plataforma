import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, profile, company, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto bg-surface border border-border rounded-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">HubM</h1>
        <p className="text-sm text-text-secondary">
          Autenticado como{" "}
          <strong className="text-text-primary">
            {profile?.full_name ?? session.user.email}
          </strong>
          {company ? ` · ${company.name}` : ""}
        </p>
        <p className="text-xs text-text-muted">
          Próxima etapa: AppShell + Home (avisos + grid de setores).
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-10 px-4 rounded-md border border-border text-sm hover:bg-accent-light"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
