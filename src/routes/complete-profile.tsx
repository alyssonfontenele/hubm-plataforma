import { useState, type FormEvent, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cellphoneToDigits, isValidCellphone, maskCellphone } from "@/lib/auth";
import { sanitize } from "@/lib/sanitize";

export const Route = createFileRoute("/complete-profile")({
  head: () => ({ meta: [{ title: "Complete seu perfil — HubM" }] }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const { session, profile, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [cellphone, setCellphone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (profile?.cellphone) {
      void navigate({ to: "/app" });
    }
  }, [profile, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCellphone(cellphone)) {
      setError("Celular inválido. Use o formato (00) 00000-0000.");
      return;
    }
    if (!session?.user) return;
    setSaving(true);
    try {
      const cleanDisplay = sanitize(displayName.trim());
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          cellphone: cellphoneToDigits(cellphone),
          ...(cleanDisplay ? { display_name: cleanDisplay } : {}),
        })
        .eq("id", session.user.id);
      if (updErr) throw updErr;
      await refresh();
      toast.success("Perfil completado com sucesso. Bem-vindo ao HubM!");
      void navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Complete seu perfil
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Precisamos de mais alguns dados para liberar seu acesso.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-surface border border-border rounded-lg p-6 space-y-5"
        >
          <div>
            <label htmlFor="cell" className="block text-xs font-medium text-text-secondary mb-1">
              Celular
            </label>
            <input
              id="cell"
              inputMode="numeric"
              value={cellphone}
              onChange={(e) => {
                setCellphone(maskCellphone(e.target.value));
                if (error) setError(null);
              }}
              placeholder="(00) 00000-0000"
              maxLength={16}
              className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>

          <div>
            <label htmlFor="disp" className="block text-xs font-medium text-text-secondary mb-1">
              Nome de exibição <span className="text-text-muted">(opcional)</span>
            </label>
            <input
              id="disp"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como prefere ser chamado?"
              maxLength={80}
              className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar e continuar"}
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full text-xs text-text-muted hover:text-text-primary"
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
