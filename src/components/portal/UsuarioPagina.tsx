// Portal Mowig (J661) — tela "Usuário": dados da loja, papel, sair.
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalMe } from "@/components/portal/PortalCasca";
import { ROTULO_PAPEL } from "@/lib/portal-api";

export function UsuarioPagina() {
  const me = usePortalMe();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const c = me.cliente;

  return (
    <>
      <h1 className="portal-titulo">Usuário</h1>

      <section className="portal-painel" aria-labelledby="loja">
        <h2 id="loja">Loja</h2>
        <dl className="portal-lista-info">
          <div className="portal-linha-info">
            <dt>Razão social</dt>
            <dd>{c.razaoSocial ?? "—"}</dd>
          </div>
          <div className="portal-linha-info">
            <dt>Nome fantasia</dt>
            <dd>{c.nomeFantasia ?? "—"}</dd>
          </div>
          {c.cnpj && (
            <div className="portal-linha-info">
              <dt>CNPJ</dt>
              <dd className="portal-centro-num">{c.cnpj}</dd>
            </div>
          )}
          <div className="portal-linha-info">
            <dt>Cliente</dt>
            <dd className="portal-centro-num">{c.numero}</dd>
          </div>
        </dl>
      </section>

      <section className="portal-painel" aria-labelledby="acesso">
        <h2 id="acesso">Acesso</h2>
        <dl className="portal-lista-info">
          <div className="portal-linha-info">
            <dt>E-mail</dt>
            <dd>{me.usuario.email}</dd>
          </div>
          <div className="portal-linha-info">
            <dt>Papel</dt>
            <dd>{ROTULO_PAPEL[me.usuario.papel] ?? me.usuario.papel}</dd>
          </div>
        </dl>
        {me.capacidades.gerirLoja && (
          <p className="portal-meta">Para incluir ou excluir usuários da loja, fale com a Mowig.</p>
        )}
        <div className="portal-acoes">
          <button
            type="button"
            className="portal-botao portal-botao-secundario"
            onClick={() =>
              void signOut().then(() => navigate({ to: "/portal/entrar", replace: true }))
            }
          >
            Sair
          </button>
        </div>
      </section>
    </>
  );
}
