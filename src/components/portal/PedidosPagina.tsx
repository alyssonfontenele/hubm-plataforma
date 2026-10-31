// Portal Mowig (J661) — telas "Pedidos" (quadro) e "Pedido" (detalhe).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { usePortalApi, usePortalMe } from "@/components/portal/PortalCasca";
import { QuadroPedidos } from "@/components/portal/Quadro";
import { Aviso, Pilula } from "@/components/portal/ui";
import {
  brlDeTexto,
  dataBr,
  dataHoraBr,
  mensagemDeErro,
  PortalApiErro,
  type DetalhePedido,
} from "@/lib/portal-api";

export function PedidosPagina() {
  const api = usePortalApi();
  const me = usePortalMe();
  const q = useQuery({ queryKey: ["portal", "quadro"], queryFn: () => api.quadro(), retry: false });

  return (
    <>
      <h1 className="portal-titulo">Pedidos</h1>
      {q.isPending && <p className="portal-meta">Carregando…</p>}
      {q.isError && <Aviso tipo="erro">{mensagemDeErro(q.error)}</Aviso>}
      {q.data && (
        <>
          <QuadroPedidos quadro={q.data} capacidades={me.capacidades} />
          {q.data.foraDoQuadro > 0 && (
            <p className="portal-meta portal-rodape-quadro">
              {q.data.foraDoQuadro} pedido(s) cancelado(s) ou arquivado(s) não aparecem no quadro.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="portal-linha-info">
      <dt>{rotulo}</dt>
      <dd className="portal-dinheiro">{valor}</dd>
    </div>
  );
}

function ValoresDoPedido({ v }: { v: NonNullable<DetalhePedido["valores"]> }) {
  const pct = (p: string | null) => (p ? ` (${Number(p).toLocaleString("pt-BR")}%)` : "");
  return (
    <section className="portal-painel" aria-labelledby="valores">
      <h2 id="valores">Valores</h2>
      <dl className="portal-lista-info">
        <Linha rotulo="Bruto" valor={brlDeTexto(v.bruto)} />
        <Linha
          rotulo={`Desconto${pct(v.desconto.percentual)}`}
          valor={brlDeTexto(v.desconto.valor)}
        />
        <Linha rotulo="Produtos" valor={brlDeTexto(v.produtos)} />
        <Linha rotulo={`IPI${pct(v.ipi.percentual)}`} valor={brlDeTexto(v.ipi.valor)} />
        <Linha rotulo="Total" valor={brlDeTexto(v.total)} />
        {v.saldo !== null && Number(v.saldo) > 0 && (
          <Linha rotulo="Saldo a pagar" valor={brlDeTexto(v.saldo)} />
        )}
      </dl>
    </section>
  );
}

export function PedidoPagina({ numero }: { numero: number }) {
  const api = usePortalApi();
  const q = useQuery({
    queryKey: ["portal", "pedido", numero],
    queryFn: () => api.pedido(numero),
    retry: false,
  });

  if (q.isPending) return <p className="portal-meta">Carregando…</p>;
  if (q.isError) {
    const naoAchou = q.error instanceof PortalApiErro && q.error.status === 404;
    return (
      <>
        <h1 className="portal-titulo">Pedido</h1>
        <Aviso tipo="erro">{naoAchou ? "Pedido não encontrado." : mensagemDeErro(q.error)}</Aviso>
        <Link to="/portal" className="portal-link">
          Voltar aos pedidos
        </Link>
      </>
    );
  }
  const d = q.data;
  return (
    <>
      <p className="portal-migalha">
        <Link to="/portal" className="portal-link">
          Pedidos
        </Link>
      </p>
      <h1 className="portal-titulo">Pedido</h1>
      <section className="portal-painel" aria-labelledby="cab">
        <h2 id="cab">{d.cabecalho.numero}</h2>
        <dl className="portal-lista-info">
          <div className="portal-linha-info">
            <dt>Situação</dt>
            <dd>
              <Pilula tom="neutro">{d.situacao.rotulo ?? "Fora do quadro"}</Pilula>{" "}
              {d.situacao.marca && <Pilula tom="atencao">{d.situacao.marca}</Pilula>}
            </dd>
          </div>
          <div className="portal-linha-info">
            <dt>OC</dt>
            <dd className="portal-centro-num">{d.cabecalho.oc ?? "—"}</dd>
          </div>
          <div className="portal-linha-info">
            <dt>Emitido em</dt>
            <dd className="portal-centro-num">{dataBr(d.cabecalho.emitidoEm)}</dd>
          </div>
          <div className="portal-linha-info">
            <dt>
              {d.entrega.origem === "COMPROMETIDA" ? "Entrega comprometida" : "Entrega prevista"}
            </dt>
            <dd className="portal-centro-num">{dataBr(d.entrega.data)}</dd>
          </div>
        </dl>
      </section>

      <section className="portal-painel" aria-labelledby="tempo">
        <h2 id="tempo">Andamento</h2>
        {d.linhaDoTempo.length === 0 ? (
          <p className="portal-meta">Sem eventos registrados.</p>
        ) : (
          <ol className="portal-tempo">
            {d.linhaDoTempo.map((e) => (
              <li key={`${e.evento}-${e.quando}`}>
                <span>{e.evento}</span>
                <span className="portal-meta">{dataHoraBr(e.quando)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {d.valores && <ValoresDoPedido v={d.valores} />}
    </>
  );
}
