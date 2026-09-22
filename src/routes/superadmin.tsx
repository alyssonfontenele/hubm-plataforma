import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/superadmin")({
  ssr: false,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // A checagem de superadmin lê app_metadata direto da sessão (claim do JWT,
  // síncrono, nunca editável pelo próprio usuário) — não depende de nenhum
  // fetch a profiles. Isso evita a corrida que causava o loop:
  // /superadmin (globalRole via profiles ainda não carregado) -> timeout ->
  // /login -> login.tsx manda de volta pro /superadmin incondicionalmente em
  // modo superadmin -> remonta -> fetch de profiles reinicia -> nunca termina
  // a tempo -> loop infinito.
  const isSuperadmin = session?.user?.app_metadata?.global_role === "superadmin";

  // Guard: sem sessão -> /login (única navegação deste guard; usuário
  // autenticado mas sem permissão nunca navega, só vê a tela de acesso
  // restrito abaixo — sem loop, sem tela em branco).
  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </div>
    );
  }

  if (!session) return null;

  if (!isSuperadmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-text-secondary">
          Acesso restrito a superadmin. Sua conta ({session.user.email}) não tem essa permissão.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-10 px-4 rounded-md border border-border text-sm text-text-primary hover:bg-accent-light transition-colors"
        >
          Sair
        </button>
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
