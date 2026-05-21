import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/setup-mfa")({
  component: SetupMfaPage,
});

function SetupMfaPage() {
  const { session, loading, profile, signOut, refreshMfa, mfaState } = useAuth();
  const navigate = useNavigate();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enrolling, setEnrolling] = useState(true);

  // Guards: must be authenticated admin needing enrollment
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
    if (mfaState === "verified" || mfaState === "not_required") {
      void navigate({ to: "/app" });
    }
  }, [loading, session, profile, mfaState, navigate]);

  // Enroll a fresh factor on mount
  useEffect(() => {
    let cancelled = false;
    async function enroll() {
      setEnrolling(true);
      try {
        // Clean stale unverified factors to avoid "factor already exists" errors
        const { data: existing } = await supabase.auth.mfa.listFactors();
        const stale = existing?.totp?.filter((f) => f.status !== "verified") ?? [];
        for (const f of stale) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
        });
        if (cancelled) return;
        if (enrollErr || !data) {
          setError(enrollErr?.message ?? "Não foi possível iniciar o cadastro.");
          return;
        }
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
      } finally {
        if (!cancelled) setEnrolling(false);
      }
    }
    if (session && profile?.global_role === "admin") {
      void enroll();
    }
    return () => {
      cancelled = true;
    };
  }, [session, profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Código inválido. Tente novamente.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    setSubmitting(false);
    if (verifyErr) {
      setError("Código inválido. Tente novamente.");
      return;
    }
    await refreshMfa();
    toast.success("Autenticação em duas etapas ativada com sucesso.");
    void navigate({ to: "/app" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4 py-8 overflow-auto">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h1 className="text-xl font-semibold text-text-primary">
          Configurar autenticação em duas etapas
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Obrigatório para administradores do HubM
        </p>

        <div className="mt-6 space-y-4">
          {enrolling ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
            </div>
          ) : qrCode ? (
            <>
              <div className="flex justify-center">
                <div className="rounded-md border border-border bg-white p-3">
                  <img
                    src={qrCode}
                    alt="QR code de autenticação"
                    className="h-48 w-48"
                  />
                </div>
              </div>
              <p className="text-sm text-text-secondary text-center">
                Escaneie o QR code com Google Authenticator, Authy ou similar
              </p>
              {secret ? (
                <p className="text-xs text-text-muted text-center break-all">
                  Código manual:{" "}
                  <span className="font-mono text-text-primary">{secret}</span>
                </p>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-3 pt-2">
                <label className="block text-sm text-text-primary">
                  Código de verificação (6 dígitos)
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
                  />
                </label>
                {error ? (
                  <p className="text-sm text-text-primary">{error}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Verificando..." : "Verificar e ativar"}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-text-secondary text-center">
              {error ?? "Não foi possível carregar o QR code."}
            </p>
          )}

          <div className="pt-2 text-center">
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
    </div>
  );
}
