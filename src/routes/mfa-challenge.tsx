import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/mfa-challenge")({
  component: MfaChallengePage,
});

function MfaChallengePage() {
  const { session, loading, profile, signOut, refreshMfa, mfaState } = useAuth();
  const navigate = useNavigate();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/login" });
      return;
    }
    if (profile && profile.global_role !== "admin") {
      void navigate({ to: "/app" });
      return;
    }
    if (mfaState === "needs_enrollment") {
      void navigate({ to: "/setup-mfa" });
      return;
    }
    if (mfaState === "verified" || mfaState === "not_required") {
      void navigate({ to: "/app" });
    }
  }, [loading, session, profile, mfaState, navigate]);

  useEffect(() => {
    let cancelled = false;
    async function loadFactor() {
      setBootstrapping(true);
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (err) {
        setError("Não foi possível carregar o fator de autenticação.");
        setBootstrapping(false);
        return;
      }
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (!verified) {
        void navigate({ to: "/setup-mfa" });
        return;
      }
      setFactorId(verified.id);
      setBootstrapping(false);
    }
    if (session && profile?.global_role === "admin") {
      void loadFactor();
    }
    return () => {
      cancelled = true;
    };
  }, [session, profile, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Código inválido. Tente novamente.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) {
      setSubmitting(false);
      setError("Código inválido. Tente novamente.");
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    setSubmitting(false);
    if (verifyErr) {
      setError("Código inválido. Tente novamente.");
      return;
    }
    await refreshMfa();
    void navigate({ to: "/app" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4 py-8 overflow-auto">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h1 className="text-xl font-semibold text-text-primary">
          Verificação em duas etapas
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Informe o código gerado pelo seu aplicativo autenticador.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-text-primary">
            Código (6 dígitos)
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="mt-1 w-full h-11 px-3 rounded-md border border-border bg-background text-text-primary tracking-[0.4em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-text-primary"
              placeholder="000000"
              disabled={bootstrapping}
              autoFocus
            />
          </label>
          {error ? <p className="text-sm text-text-primary">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting || bootstrapping || code.length !== 6}
            className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Verificando..." : "Verificar"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-xs text-text-muted hover:text-text-primary underline"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
