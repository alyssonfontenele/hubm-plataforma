import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/change-password")({
  head: () => ({ meta: [{ title: "Definir senha — HubM" }] }),
  component: ChangePasswordPage,
});

type Strength = "weak" | "medium" | "strong";

function evaluateStrength(pw: string): Strength | null {
  if (!pw) return null;
  const hasLen = pw.length >= 8;
  const hasNum = /\d/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const hasLong = pw.length >= 12;
  const score = [hasLen, hasNum, hasUpper, hasSymbol, hasLong].filter(Boolean).length;
  if (score <= 2) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}

function ChangePasswordPage() {
  const { session, profile, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const strength = useMemo(() => evaluateStrength(pw), [pw]);

  const validate = (): string | null => {
    if (pw.length < 8) return "A senha deve ter ao menos 8 caracteres.";
    if (!/\d/.test(pw)) return "A senha deve conter pelo menos 1 número.";
    if (!/[A-Z]/.test(pw)) return "A senha deve conter pelo menos 1 letra maiúscula.";
    if (pw !== confirmPw) return "As senhas não conferem.";
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!session?.user || !profile) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pw });
      if (updErr) throw updErr;
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", session.user.id);
      if (profErr) throw profErr;
      await supabase.auth.signOut();
      toast.success("Senha alterada. Faça login novamente.");
      void navigate({ to: "/login" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao definir senha.");
    } finally {
      setSaving(false);
    }
  };

  const barFill =
    strength === "weak"
      ? "w-1/3 bg-text-muted/40"
      : strength === "medium"
        ? "w-2/3 bg-text-muted"
        : strength === "strong"
          ? "w-full bg-text-primary"
          : "w-0 bg-transparent";

  const strengthLabel =
    strength === "weak"
      ? "Fraca"
      : strength === "medium"
        ? "Média"
        : strength === "strong"
          ? "Forte"
          : "—";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Defina sua senha
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Primeiro acesso — crie uma senha para continuar.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-surface border border-border rounded-lg p-6 space-y-5"
        >
          <div>
            <label htmlFor="pw" className="block text-xs font-medium text-text-secondary mb-1">
              Nova senha
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
            />
            <div className="mt-2">
              <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                <div className={`h-full transition-all ${barFill}`} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                <span>Força: {strengthLabel}</span>
                <span>Min. 8, com número e maiúscula</span>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Definir senha"}
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
