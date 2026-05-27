import { useEffect, useRef } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/superadmin")({
  ssr: false,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { session, loading, globalRole, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  console.log('superadmin guard:', { loading, hasSession: !!session, globalRole, profile: profile?.global_role });

  // Guard: no session after load → /login
  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  // Guard: wrong role after load → /app
  useEffect(() => {
    if (!loading && session && globalRole !== null && globalRole !== "superadmin") {
      void navigate({ to: "/app" });
    }
  }, [loading, session, globalRole, navigate]);

  // Fallback: profile still null 500ms after auth loaded → /login
  useEffect(() => {
    if (!loading && session && globalRole === null) {
      fallbackRef.current = setTimeout(() => {
        void navigate({ to: "/login" });
      }, 500);
    }
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [loading, session, globalRole, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  if (!session) return null;

  if (globalRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  if (globalRole !== "superadmin") return null;

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
