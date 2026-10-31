// Portal Mowig (J661) — casca das telas autenticadas: porta do lojista, /me, menu por capacidades, topo com a loja.
// O menu e os botões seguem `capacidades` de GET /v1/portal/me: botão sem permissão não aparece.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isLojistaUser } from "@/lib/portal";
import { criarPortalApi, PortalApiErro, type PortalApi, type PortalMe } from "@/lib/portal-api";

// ---------------------------------------------------------------------------------------------------------------------
// Cliente da API por contexto: o app usa o JWT do Supabase; os testes injetam um dublê.
// ---------------------------------------------------------------------------------------------------------------------
const ApiContext = createContext<PortalApi | null>(null);

export function PortalApiProvider({ api, children }: { api: PortalApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function usePortalApi(): PortalApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("PortalApiProvider ausente");
  return api;
}

async function tokenAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const exp = data.session?.expires_at ?? 0;
  // renova quando faltam menos de 30 s: evita um 401 à toa no meio de uma ação
  if (data.session && exp * 1000 - Date.now() < 30_000) {
    const r = await supabase.auth.refreshSession();
    return r.data.session?.access_token ?? null;
  }
  return data.session?.access_token ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// /me por contexto
// ---------------------------------------------------------------------------------------------------------------------
const MeContext = createContext<PortalMe | null>(null);

export function PortalMeProvider({ me, children }: { me: PortalMe; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function usePortalMe(): PortalMe {
  const me = useContext(MeContext);
  if (!me) throw new Error("PortalMeProvider ausente");
  return me;
}

export function nomeDaLoja(me: PortalMe): string {
  return me.cliente.nomeFantasia ?? me.cliente.razaoSocial ?? `Cliente ${me.cliente.numero}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Casca
// ---------------------------------------------------------------------------------------------------------------------
type Aba = "pedidos" | "cobrancas" | "usuario";

export function PortalMenu({ me, ativa }: { me: PortalMe; ativa: Aba }) {
  // `exact`: o Link de /portal não pode se dizer ativo em /portal/cobrancas; a aba ativa vem da tela (`ativa`), que também vale
  // para subtelas (pedido, pagamento).
  const classe = (aba: Aba) => `portal-menu-item${ativa === aba ? " portal-menu-ativa" : ""}`;
  const atual = (aba: Aba) => (ativa === aba ? ("page" as const) : undefined);
  return (
    <nav className="portal-menu" aria-label="Portal">
      <Link
        to="/portal"
        activeOptions={{ exact: true }}
        className={classe("pedidos")}
        aria-current={atual("pedidos")}
      >
        Pedidos
      </Link>
      {me.capacidades.cobranca && (
        <Link
          to="/portal/cobrancas"
          activeOptions={{ exact: true }}
          className={classe("cobrancas")}
          aria-current={atual("cobrancas")}
        >
          Cobranças
        </Link>
      )}
      <Link
        to="/portal/usuario"
        activeOptions={{ exact: true }}
        className={classe("usuario")}
        aria-current={atual("usuario")}
      >
        Usuário
      </Link>
    </nav>
  );
}

export function PortalCasca({ aba, children }: { aba: Aba; children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const lojista = isLojistaUser(session?.user);
  const api = useMemo(() => criarPortalApi(tokenAtual), []);

  useEffect(() => {
    if (loading) return;
    if (!session || !lojista) void navigate({ to: "/portal/entrar", replace: true });
  }, [loading, session, lojista, navigate]);

  if (loading || !lojista) return null;

  return (
    <PortalApiProvider api={api}>
      <CascaAutenticada aba={aba} sair={signOut}>
        {children}
      </CascaAutenticada>
    </PortalApiProvider>
  );
}

function CascaAutenticada({
  aba,
  sair,
  children,
}: {
  aba: Aba;
  sair: () => Promise<void>;
  children: ReactNode;
}) {
  const api = usePortalApi();
  const navigate = useNavigate();
  const consulta = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 60_000,
  });

  const erro = consulta.error;
  const expirou = erro instanceof PortalApiErro && erro.status === 401;
  useEffect(() => {
    if (expirou) void sair().then(() => navigate({ to: "/portal/entrar", replace: true }));
  }, [expirou, sair, navigate]);

  const me = consulta.data;

  return (
    <>
      <header className="portal-topo">
        <span className="portal-marca">Portal Mowig</span>
        <div className="portal-topo-direita">
          {me && <span className="portal-loja">{nomeDaLoja(me)}</span>}
          <button
            type="button"
            className="portal-botao portal-botao-secundario portal-botao-pequeno"
            onClick={() =>
              void sair().then(() => navigate({ to: "/portal/entrar", replace: true }))
            }
          >
            Sair
          </button>
        </div>
      </header>
      {me && <PortalMenu me={me} ativa={aba} />}
      <main className="portal-conteudo">
        {consulta.isPending && <p className="portal-meta">Carregando…</p>}
        {!consulta.isPending && !me && !expirou && <EstadoSemMe erro={erro} />}
        {me && <PortalMeProvider me={me}>{children}</PortalMeProvider>}
      </main>
    </>
  );
}

function EstadoSemMe({ erro }: { erro: unknown }) {
  const status = erro instanceof PortalApiErro ? erro.status : 0;
  return (
    <section className="portal-painel" aria-live="polite">
      {status === 403 ? (
        <>
          <h2>Acesso</h2>
          <p className="portal-meta">
            Sua conta foi criada, mas ainda não está vinculada a uma loja. Fale com a Mowig.
          </p>
        </>
      ) : (
        <>
          <h2>Preparação</h2>
          <p className="portal-meta">Estamos finalizando o seu acesso. Volte em breve.</p>
        </>
      )}
    </section>
  );
}
