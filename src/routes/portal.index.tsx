import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buscarPortalMe, isLojistaUser, type PortalMeResultado } from "@/lib/portal";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal Mowig" }] }),
  component: PortalCasca,
});

/** Casca do portal: só o lojista entra; sem navegação do HubM. O quadro de pedidos vem na próxima janela. */
function PortalCasca() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [resultado, setResultado] = useState<PortalMeResultado | "carregando">("carregando");
  const lojista = isLojistaUser(session?.user);
  const token = session?.access_token;

  useEffect(() => {
    if (loading) return;
    if (!session || !lojista) void navigate({ to: "/portal/entrar", replace: true });
  }, [loading, session, lojista, navigate]);

  useEffect(() => {
    if (!lojista || !token) return;
    let ativo = true;
    void (async () => {
      let r = await buscarPortalMe(token);
      if (r.estado === "nao-autenticado") {
        // token vencido: renova uma vez antes de desistir
        const { data } = await supabase.auth.refreshSession();
        r = data.session ? await buscarPortalMe(data.session.access_token) : r;
      }
      if (!ativo) return;
      if (r.estado === "nao-autenticado") {
        await signOut();
        return;
      }
      setResultado(r);
    })();
    return () => {
      ativo = false;
    };
  }, [lojista, token, signOut]);

  if (loading || !lojista) return null;

  const nome =
    resultado !== "carregando" && resultado.estado === "ok"
      ? (resultado.me.cliente.nomeFantasia ??
        resultado.me.cliente.razaoSocial ??
        `cliente ${resultado.me.cliente.numero}`)
      : null;

  return (
    <>
      <header className="portal-topo">
        <span className="portal-marca">Portal Mowig</span>
        <button
          type="button"
          className="portal-botao portal-botao-secundario"
          onClick={() =>
            void signOut().then(() => navigate({ to: "/portal/entrar", replace: true }))
          }
        >
          Sair
        </button>
      </header>
      <main className="portal-conteudo">
        <section className="portal-painel" aria-live="polite">
          {resultado === "carregando" && <p className="portal-meta">Carregando…</p>}
          {resultado !== "carregando" && resultado.estado === "ok" && (
            <>
              <h2>Olá, {nome}</h2>
              <p className="portal-meta">
                {session?.user.email} ·{" "}
                {resultado.me.usuario.papel === "LOJISTA_ADMIN"
                  ? "Administrador da loja"
                  : "Usuário da loja"}
              </p>
              <p style={{ marginTop: 16 }}>
                Em breve você acompanha aqui o andamento dos seus pedidos.
              </p>
            </>
          )}
          {resultado !== "carregando" && resultado.estado === "em-preparacao" && (
            <>
              <h2>Portal em preparação</h2>
              <p className="portal-meta">Estamos finalizando o seu acesso. Volte em breve.</p>
            </>
          )}
          {resultado !== "carregando" && resultado.estado === "sem-acesso" && (
            <>
              <h2>Acesso ainda não liberado</h2>
              <p className="portal-meta">
                Sua conta foi criada, mas ainda não está vinculada a uma loja. Fale com a Mowig.
              </p>
            </>
          )}
        </section>
      </main>
    </>
  );
}
