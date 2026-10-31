// Portal Mowig (J661) — quadro de 7 colunas (POR-H5), todas na mesma tela, sem rolagem horizontal.
// Largura >= 1100 px: 7 colunas lado a lado; abaixo disso as colunas empilham (375 px = uma por linha). Valores só com `verValores`
// (a API simplesmente não manda o campo; aqui só se mostra o que veio).
import { Link } from "@tanstack/react-router";
import {
  brlDeTexto,
  dataBr,
  type CapacidadesPortal,
  type CartaoPedido,
  type ColunaDoQuadro,
  type Quadro as QuadroTipo,
} from "@/lib/portal-api";
import { Pilula } from "@/components/portal/ui";

function CartaoDoPedido({
  cartao,
  coluna,
  cap,
}: {
  cartao: CartaoPedido;
  coluna: ColunaDoQuadro;
  cap: CapacidadesPortal;
}) {
  const mostraValor = cartao.valorTotal !== undefined;
  const pagar = coluna.id === "AGUARDANDO_LIBERACAO_FINANCEIRA" && cap.cobranca;
  return (
    <li className="portal-cartao-pedido" data-testid={`pedido-${cartao.numero}`}>
      <div className="portal-cartao-linha">
        <Link
          to="/portal/pedido/$numero"
          params={{ numero: String(cartao.numero) }}
          className="portal-pedido-numero"
        >
          {cartao.numero}
        </Link>
        {cartao.marca && (
          <Pilula tom={cartao.marca === "SUSPENSO" ? "critico" : "atencao"}>{cartao.marca}</Pilula>
        )}
      </div>
      <dl className="portal-cartao-dados">
        <div>
          <dt>OC</dt>
          <dd className="portal-centro-num">{cartao.oc ?? "—"}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd className="portal-centro-num">{dataBr(cartao.entregaPrevista)}</dd>
        </div>
        {mostraValor && (
          <div>
            <dt>Valor</dt>
            <dd className="portal-dinheiro">{brlDeTexto(cartao.valorTotal)}</dd>
          </div>
        )}
      </dl>
      <div className="portal-cartao-acao">
        {pagar ? (
          <Link to="/portal/cobrancas" search={{ pedido: cartao.numero }} className="portal-link">
            Pagar
          </Link>
        ) : (
          <Link
            to="/portal/pedido/$numero"
            params={{ numero: String(cartao.numero) }}
            className="portal-link"
          >
            Ver
          </Link>
        )}
      </div>
    </li>
  );
}

export function QuadroPedidos({
  quadro,
  capacidades,
}: {
  quadro: QuadroTipo;
  capacidades: CapacidadesPortal;
}) {
  return (
    <div className="portal-quadro" data-testid="quadro">
      {quadro.colunas.map((coluna) => (
        <section
          key={coluna.id}
          className="portal-coluna"
          aria-labelledby={`col-${coluna.id}`}
          data-testid={`coluna-${coluna.id}`}
        >
          <h3 id={`col-${coluna.id}`} className="portal-coluna-titulo">
            <span>{coluna.rotulo}</span>
            <span className="portal-coluna-contagem">{coluna.pedidos.length}</span>
          </h3>
          {coluna.pedidos.length === 0 ? (
            <p className="portal-coluna-vazia">{coluna.semFonte ? "Em breve" : "Nenhum pedido"}</p>
          ) : (
            <ul className="portal-coluna-lista">
              {coluna.pedidos.map((c) => (
                <CartaoDoPedido key={c.numero} cartao={c} coluna={coluna} cap={capacidades} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
