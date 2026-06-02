import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/client-portal")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal do Cliente — HubM" }] }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { session, profile, company, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/login" });
      return;
    }
    if (profile && profile.global_role !== "cliente") {
      void navigate({ to: "/app" });
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
          <p className="text-sm text-text-secondary">Carregando perfil…</p>
        </div>
      </div>
    );
  }

  if (profile.global_role !== "cliente") return null;

  const primaryColor = company?.primary_color ?? "#111111";
  const companyName  = company?.name ?? "HubM";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header com identidade visual da empresa */}
      <header
        className="w-full py-4 px-6 flex items-center justify-between shadow-sm"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={companyName}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-white">{companyName}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-white/80 hover:text-white transition-colors"
        >
          Sair
        </button>
      </header>

      {/* Conteúdo do portal */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center space-y-6">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt={companyName}
              className="h-16 mx-auto object-contain"
            />
          )}

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-text-primary">
              Olá, {profile.display_name ?? profile.full_name}
            </h1>
            <p className="text-sm text-text-secondary">
              Bem-vindo ao portal do cliente {companyName}.
            </p>
          </div>

          {/* Placeholder — conteúdo do portal será implementado conforme necessidade */}
          <div
            className="rounded-xl border border-border bg-surface p-8 space-y-3"
            style={{ borderColor: `${primaryColor}30` }}
          >
            <div
              className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <span className="text-xl" style={{ color: primaryColor }}>✓</span>
            </div>
            <p className="text-sm font-medium text-text-primary">Acesso verificado</p>
            <p className="text-xs text-text-muted">
              Em breve você terá acesso a documentos e informações disponibilizados por {companyName}.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Encerrar sessão
          </button>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-text-muted border-t border-border">
        {companyName} · Portal do cliente
      </footer>
    </div>
  );
}
