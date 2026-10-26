import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isLojistaUser, mensagemErroAuth } from "@/lib/portal";

export const Route = createFileRoute("/portal/entrar")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Portal Mowig" }] }),
  component: PortalEntrar,
});

function PortalEntrar() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isLojistaUser(session?.user)) void navigate({ to: "/portal", replace: true });
  }, [loading, session, navigate]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) {
      setErro(mensagemErroAuth(error));
      setEnviando(false);
      return;
    }
    if (!isLojistaUser(data.user)) {
      // esta porta é só do lojista: mesma mensagem de credencial inválida, sem revelar que a conta existe
      await supabase.auth.signOut();
      setErro("E-mail ou senha incorretos.");
      setEnviando(false);
      return;
    }
    void navigate({ to: "/portal", replace: true });
  }

  return (
    <main className="portal-centro">
      <form className="portal-cartao" onSubmit={entrar} noValidate>
        <h1>Portal Mowig</h1>
        <p className="portal-sub">Acompanhe seus pedidos. Entre com o e-mail do seu convite.</p>

        {erro && (
          <div className="portal-aviso portal-aviso-erro" role="alert">
            {erro}
          </div>
        )}

        <label className="portal-campo">
          <span>E-mail</span>
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
          />
        </label>
        <label className="portal-campo">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(ev) => setSenha(ev.target.value)}
          />
        </label>

        <button className="portal-botao" type="submit" disabled={enviando || !email || !senha}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <p className="portal-rodape-cartao">
          <Link to="/portal/esqueci" className="portal-link">
            Esqueci a senha
          </Link>
        </p>
      </form>
    </main>
  );
}
