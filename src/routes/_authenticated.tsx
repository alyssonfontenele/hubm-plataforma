import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const href = useRouterState({ select: (r) => r.location.href });

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/login", search: { redirect: href } as never });
    }
  }, [loading, session, href, navigate]);

  useEffect(() => {
    if (!loading && session && profile?.must_change_password) {
      void navigate({ to: "/change-password" });
    }
  }, [loading, session, profile, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Conta sem perfil</h1>
          <p className="text-sm text-text-secondary">
            Seu acesso ainda não foi vinculado a um perfil no HubM. Procure um administrador.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="h-10 px-4 rounded-md border border-border text-sm hover:bg-accent-light"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0 flex-1">
          <AppTopbar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
