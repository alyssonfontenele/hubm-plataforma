import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  cpfToDigits,
  isValidCpf,
  maskCpf,
  recoverPasswordByCpf,
  signInWithCpf,
  signInWithGoogle,
} from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — HubM" },
      { name: "description", content: "Acesse o hub operacional da Mowig." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (!loading && session && pathname === "/login") {
      void navigate({ to: "/" });
    }
  }, [loading, session, pathname, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary">
            HubM
          </h1>
          <p className="mt-1 text-sm text-text-secondary">Mowig</p>
        </header>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
          <GoogleSection />
          <Divider />
          <CpfSection />
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          Acesso restrito. Solicite cadastro a um administrador.
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
        <span className="bg-surface px-3 text-xs uppercase tracking-wider text-text-muted">
          ou
        </span>
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
      await signInWithGoogle(`${window.location.origin}/`);
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
        <span>
          {loading ? "Redirecionando…" : "Entrar com Google (@mowig.com.br)"}
        </span>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

function CpfSection() {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido (11 dígitos).");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter ao menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await signInWithCpf(cpf, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "CPF ou senha incorretos.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    setError(null);
    setInfo(null);
    if (!isValidCpf(cpf)) {
      setError("Informe seu CPF para recuperar a senha.");
      return;
    }
    setLoading(true);
    try {
      const email = await recoverPasswordByCpf(
        cpf,
        `${window.location.origin}/reset-password`,
      );
      const masked = email.replace(/(.{2}).+(@.+)/, "$1•••$2");
      setInfo(`Enviamos um link para ${masked}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar a recuperação.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Acesso operacional</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="cpf"
            className="block text-xs font-medium text-text-secondary mb-1"
          >
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
          <label
            htmlFor="password"
            className="block text-xs font-medium text-text-secondary mb-1"
          >
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
        {info && <p className="text-xs text-text-secondary">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-md bg-accent text-surface text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <button
          type="button"
          onClick={handleForgot}
          disabled={loading || cpfToDigits(cpf).length === 0}
          className="w-full text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Esqueci minha senha
        </button>
      </form>
    </section>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
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
