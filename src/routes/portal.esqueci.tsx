import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroAuth } from "@/lib/portal";

export const Route = createFileRoute("/portal/esqueci")({
  ssr: false,
  head: () => ({ meta: [{ title: "Esqueci a senha — Portal Mowig" }] }),
  component: PortalEsqueci,
});

function PortalEsqueci() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setEnviando(false);
    // só falha de limite/rede aparece; e-mail inexistente recebe a mesma confirmação (não revela contas)
    if (
      error &&
      (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")
    ) {
      setErro(mensagemErroAuth(error));
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="portal-centro">
      <form className="portal-cartao" onSubmit={enviar} noValidate>
        <h1>Esqueci a senha</h1>
        <p className="portal-sub">
          Informe o e-mail do seu acesso e enviaremos um link para criar uma nova senha.
        </p>

        {erro && (
          <div className="portal-aviso portal-aviso-erro" role="alert">
            {erro}
          </div>
        )}
        {enviado ? (
          <div className="portal-aviso portal-aviso-ok" role="status">
            Se o e-mail estiver cadastrado, você receberá o link em instantes. Confira também a
            caixa de spam.
          </div>
        ) : (
          <>
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
            <button className="portal-botao" type="submit" disabled={enviando || !email}>
              {enviando ? "Enviando…" : "Enviar link"}
            </button>
          </>
        )}

        <p className="portal-rodape-cartao">
          <Link to="/portal/entrar" className="portal-link">
            Voltar para entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
