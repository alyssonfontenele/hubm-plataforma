import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isLojistaUser, mensagemErroAuth, SENHA_MIN, validarSenha } from "@/lib/portal";

export const Route = createFileRoute("/portal/definir-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Definir senha — Portal Mowig" }] }),
  component: PortalDefinirSenha,
});

/** Destino do link do convite e da recuperação: a sessão chega pelo /auth/callback. */
function PortalDefinirSenha() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [esperou, setEsperou] = useState(false);

  // dá um tempo para a sessão do link ser estabelecida antes de declarar o link inválido
  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const lojista = isLojistaUser(session?.user);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const invalida = validarSenha(senha);
    if (invalida) return setErro(invalida);
    if (senha !== confirma) return setErro("As senhas não são iguais.");
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(mensagemErroAuth(error));
      setEnviando(false);
      return;
    }
    void navigate({ to: "/portal", replace: true });
  }

  if (loading || (!lojista && !esperou)) {
    return (
      <main className="portal-centro">
        <p className="portal-meta" role="status">
          Verificando o link…
        </p>
      </main>
    );
  }

  if (!lojista) {
    return (
      <main className="portal-centro">
        <div className="portal-cartao">
          <h1>Link inválido ou expirado</h1>
          <p className="portal-sub">Peça um novo link para criar sua senha.</p>
          <Link
            to="/portal/esqueci"
            className="portal-botao"
            style={{
              display: "block",
              textAlign: "center",
              lineHeight: "42px",
              textDecoration: "none",
            }}
          >
            Receber novo link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-centro">
      <form className="portal-cartao" onSubmit={salvar} noValidate>
        <h1>Definir senha</h1>
        <p className="portal-sub">
          Crie a senha de acesso ao Portal Mowig ({session?.user.email}). Mínimo de {SENHA_MIN}{" "}
          caracteres, com letras e números.
        </p>

        {erro && (
          <div className="portal-aviso portal-aviso-erro" role="alert">
            {erro}
          </div>
        )}

        <label className="portal-campo">
          <span>Nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={senha}
            onChange={(ev) => setSenha(ev.target.value)}
          />
        </label>
        <label className="portal-campo">
          <span>Repita a senha</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirma}
            onChange={(ev) => setConfirma(ev.target.value)}
          />
        </label>

        <button className="portal-botao" type="submit" disabled={enviando || !senha || !confirma}>
          {enviando ? "Salvando…" : "Salvar e entrar"}
        </button>
      </form>
    </main>
  );
}
