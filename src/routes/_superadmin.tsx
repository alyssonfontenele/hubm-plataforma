import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_superadmin")({
  ssr: false,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { session, loading, globalRole, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && globalRole !== null && globalRole !== "superadmin") {
      void navigate({ to: "/app" });
    }
  }, [loading, session, globalRole, navigate]);

  if (loading || !session || globalRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  if (globalRole !== "superadmin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-text-primary" />
          <span className="text-base font-semibold text-text-primary">Painel Sistema</span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Sair
        </button>
      </header>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
