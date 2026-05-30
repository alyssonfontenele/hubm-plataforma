import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cpfToDigits, isGoogleDomainAllowed, isValidCpf, maskCpf, signInWithCpf, signInWithGoogle } from "@/lib/auth";
import { COMPANY_SLUG } from "@/lib/company";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — HubM" },
      { name: "description", content: `Acesse o hub operacional${COMPANY_SLUG ? ` da ${COMPANY_SLUG}` : ""}.` },
    ],
  }),
  component: LoginPage,
});

/** Runs after a successful Supabase Auth login; returns true if user is allowed in. */
async function enforceLoginRules(): Promise<boolean | "request-access"> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const user = sessionRes.session?.user;
  if (!user) return false;

  const isGoogleUser = user.app_metadata?.provider === "google";
  const userDomain = (user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
  const isDomainAllowed = await isGoogleDomainAllowed(userDomain);

  const { data: prof, error } = await supabase
    .from("profiles")
    .select("id, active, auth_type, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !prof) {
    if (isGoogleUser && isDomainAllowed) {
      return "request-access";
    }
    await supabase.auth.signOut();
    toast.error("Não foi possível realizar o login. Entre em contato com o administrador.");
    return false;
  }

  if (prof.auth_type === "google" && !prof.active && !prof.deleted_at) {
    await supabase.auth.signOut();
    toast.info("Seu acesso ainda está pendente de aprovação.");
    return false;
  }

  if (!prof.active || prof.deleted_at) {
    await supabase.auth.signOut();
    toast.error("Não foi possível realizar o login. Entre em contato com o administrador.");
    return false;
  }

  if (prof.auth_type === "google" && !isDomainAllowed) {
    await supabase.auth.signOut();
    toast.error("Acesso restrito a domínios corporativos autorizados.");
    return false;
  }

  return true;
}

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [enforced, setEnforced] = useState(false);
  const [loginCompany, setLoginCompany] = useState<{ name: string; logo_url: string | null } | null>(null);

  useEffect(() => {
    if (!COMPANY_SLUG) return;
    void supabase
      .from("companies")
      .select("name, logo_url")
      .eq("slug", COMPANY_SLUG)
      .maybeSingle()
      .then(({ data }) => { if (data) setLoginCompany(data); });
  }, []);

  useEffect(() => {
    if (loading || pathname !== "/login" || !session || enforced) return;
    setEnforced(true);

    // No modo SuperAdmin ignoramos as regras de domínio/perfil da empresa;
    // o guard em superadmin.tsx se encarrega de verificar o global_role.
    if (import.meta.env.VITE_IS_SUPERADMIN === 'true') {
      void navigate({ to: "/superadmin/dashboard" });
      return;
    }

    void enforceLoginRules().then((result) => {
      if (result === true) void navigate({ to: "/app" });
      else if (result === "request-access") void navigate({ to: "/request-access", search: { cargo: undefined } });
      else setEnforced(false);
    });
  }, [loading, session, pathname, navigate, enforced]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          {loginCompany?.logo_url ? (
            <img src={loginCompany.logo_url} alt={loginCompany.name} className="h-12 mx-auto" />
          ) : (
            <h1 className="text-4xl font-bold tracking-tight text-text-primary">
              {loginCompany?.name ?? COMPANY_SLUG ?? "HubM"}
            </h1>
          )}
          {COMPANY_SLUG && <p className="mt-1 text-sm text-text-secondary">{COMPANY_SLUG}</p>}
        </header>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
          <GoogleSection />
          <Divider />
          <CpfSection />
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          Acesso restrito. Solicite cadastro a um administrador.
        </p>

        {/* DEBUG TEMPORÁRIO — remover após diagnóstico */}
        <p style={{ fontSize: '10px', color: 'red', marginTop: '8px', wordBreak: 'break-all' }}>
          IS_SUPERADMIN: {import.meta.env.VITE_IS_SUPERADMIN ?? 'undefined'} |
          CORE_URL: {import.meta.env.VITE_SUPABASE_CORE_URL ?? 'undefined'}
        </p>
      </div>
    </main>
  );
}

function Divider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-surface px-3 text-xs uppercase tracking-wider text-text-muted">ou</span>
      </div>
    </div>
  );
}

function GoogleSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle(`${window.location.origin}/auth/callback`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar login.");
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Acesso corporativo</h2>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-md border border-border bg-surface text-sm font-medium text-text-primary hover:bg-accent-light transition-colors disabled:opacity-60"
      >
        <GoogleGlyph />
        <span>{loading ? "Redirecionando…" : "Entrar com Google (corporativo)"}</span>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

const MAX_ATTEMPTS = 3;
const WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;
const loginAttempts: { count: number; firstAt: number; lockedUntil: number } = {
  count: 0,
  firstAt: 0,
  lockedUntil: 0,
};

function CpfSection() {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);

  useEffect(() => {
    if (loginAttempts.lockedUntil > Date.now()) {
      setLockRemaining(loginAttempts.lockedUntil - Date.now());
    }
  }, []);

  useEffect(() => {
    if (lockRemaining <= 0) return;
    const id = setInterval(() => {
      const left = loginAttempts.lockedUntil - Date.now();
      setLockRemaining(left > 0 ? left : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [lockRemaining]);

  const isLocked = lockRemaining > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isLocked) return;
    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter ao menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await signInWithCpf(cpf, password);
      loginAttempts.count = 0;
      loginAttempts.firstAt = 0;
      loginAttempts.lockedUntil = 0;
      // post-login enforcement handled in LoginPage effect once session updates.
    } catch (err) {
      const now = Date.now();
      if (now - loginAttempts.firstAt > WINDOW_MS) {
        loginAttempts.count = 1;
        loginAttempts.firstAt = now;
      } else {
        loginAttempts.count += 1;
      }
      if (loginAttempts.count >= MAX_ATTEMPTS) {
        loginAttempts.lockedUntil = now + LOCKOUT_MS;
        setLockRemaining(LOCKOUT_MS);
        const msg = "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
        setError(msg);
        toast.error(msg);
      } else {
        void err;
        setError("CPF ou senha incorretos.");
      }
    } finally {
      setLoading(false);
    }
  };

  const lockMinutes = Math.ceil(lockRemaining / 60000);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Acesso operacional</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="cpf" className="block text-xs font-medium text-text-secondary mb-1">
            CPF
          </label>
          <input
            id="cpf"
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            maxLength={14}
            className="w-full h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1">
            Senha
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading || isLocked}
          className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
        >
          {isLocked ? `Bloqueado (${lockMinutes} min)` : loading ? "Entrando…" : "Entrar"}
        </button>

        <button
          type="button"
          onClick={() => setRecoverOpen(true)}
          className="w-full text-xs text-text-secondary hover:text-text-primary"
        >
          Esqueci minha senha
        </button>
      </form>

      {recoverOpen && <RecoveryModal onClose={() => setRecoverOpen(false)} />}
    </section>
  );
}

function RecoveryModal({ onClose }: { onClose: () => void }) {
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    setBusy(true);
    try {
      await supabase.functions
        .invoke("recover-cpf-password", { body: { cpf: cpfToDigits(cpf) } })
        .catch(() => undefined);
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3 className="text-base font-semibold text-text-primary">Recuperar senha</h3>
          <p className="text-xs text-text-muted mt-1">
            Informe seu CPF e enviaremos as instruções.
          </p>
        </header>

        {sent ? (
          <>
            <p className="text-sm text-text-primary">
              Se este CPF estiver cadastrado, você receberá um e-mail em breve.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-10 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90"
            >
              Fechar
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">CPF</label>
              <input
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                maxLength={14}
                className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-text-primary"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-md border border-border text-sm text-text-primary hover:bg-accent-light"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 h-10 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
              >
                {busy ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.7 0 19.5-7.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5 0 9.5-1.9 12.9-5.1l-6-5.1c-1.9 1.3-4.3 2.2-6.9 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.4 5.3l6 5.1c-.4.4 6.6-4.8 6.6-14.4 0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
