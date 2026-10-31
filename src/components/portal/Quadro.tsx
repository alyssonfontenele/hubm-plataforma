// Portal Mowig (J661) — quadro de 7 colunas (POR-H5), todas na mesma tela, sem rolagem horizontal.
// Largura >= 1100 px: 7 colunas lado a lado; abaixo disso as colunas empilham (375 px = uma por linha). Valores só com `verValores`
// (a API simplesmente não manda o campo; aqui só se mostra o que veio).
// J664: AGUARDANDO COLETA ganha seleção + AGENDAR COLETA; COLETA AGENDADA ganha REMARCAR/CANCELAR (com confirmação); DESPACHADO ganha
// o atalho para os documentos. Os botões de coleta só aparecem com a capacidade `coleta` (documentos valem para todos os papéis).
// Elegibilidade, vagas e a janela de 24 h são da API (`podeRemarcarOuCancelar`): a tela só esconde e mostra a mensagem dela.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  brlDeTexto,
  dataBr,
  type CapacidadesPortal,
  type CartaoPedido,
  type ColetaPortal,
  type ColunaDoQuadro,
  type Quadro as QuadroTipo,
} from "@/lib/portal-api";
import { Pilula } from "@/components/portal/ui";
import { BotoesDaColeta } from "@/components/portal/ColetaAcoes";
import { coletaPorPedido, podeGerirColeta, rotuloSlot, textoQuemBusca } from "@/lib/portal-coletas";

const COLUNAS_DA_COLETA = ["AGUARDANDO_COLETA", "COLETA_AGENDADA", "DESPACHADO"];

function AcoesDaColeta({ coleta, cap }: { coleta: ColetaPortal; cap: CapacidadesPortal }) {
  return (
    <div className="portal-coleta-acoes">
      <p className="portal-coleta-resumo" data-testid={`coleta-resumo-${coleta.id}`}>
        {rotuloSlot(coleta.slot)}
        <br />
        <span className="portal-meta">{textoQuemBusca(coleta.quemBusca)}</span>
      </p>
      <Link to="/portal/coleta/$id" params={{ id: String(coleta.id) }} className="portal-link">
        Ver coleta
      </Link>
      <BotoesDaColeta coleta={coleta} cap={cap} />
    </div>
  );
}

function CartaoDoPedido({
  cartao,
  coluna,
  cap,
  coleta,
  selecionado,
  aoSelecionar,
}: {
  cartao: CartaoPedido;
  coluna: ColunaDoQuadro;
  cap: CapacidadesPortal;
  coleta?: ColetaPortal;
  selecionado: boolean;
  aoSelecionar: (numero: number, marcado: boolean) => void;
}) {
  const mostraValor = cartao.valorTotal !== undefined;
  const pagar = coluna.id === "AGUARDANDO_LIBERACAO_FINANCEIRA" && cap.cobranca;
  // seleção: pedido pronto, sem coleta ativa, e papel com a capacidade `coleta`
  const selecionavel = coluna.id === "AGUARDANDO_COLETA" && podeGerirColeta(cap) && !coleta;
  return (
    <li className="portal-cartao-pedido" data-testid={`pedido-${cartao.numero}`}>
      <div className="portal-cartao-linha">
        {selecionavel && (
          <input
            type="checkbox"
            className="portal-cartao-marca"
            aria-label={`Selecionar o pedido ${cartao.numero} para coleta`}
            checked={selecionado}
            onChange={(e) => aoSelecionar(cartao.numero, e.target.checked)}
          />
        )}
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
      {!COLUNAS_DA_COLETA.includes(coluna.id) && (
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
      )}
      {coluna.id === "AGUARDANDO_COLETA" && !coleta && (
        <div className="portal-cartao-acao">
          <Link
            to="/portal/pedido/$numero"
            params={{ numero: String(cartao.numero) }}
            className="portal-link"
          >
            Ver
          </Link>
        </div>
      )}
      {coluna.id === "COLETA_AGENDADA" && !coleta && (
        <div className="portal-cartao-acao">
          <Link
            to="/portal/pedido/$numero"
            params={{ numero: String(cartao.numero) }}
            className="portal-link"
          >
            Ver
          </Link>
        </div>
      )}
      {coluna.id !== "DESPACHADO" && coleta && <AcoesDaColeta coleta={coleta} cap={cap} />}
      {coluna.id === "DESPACHADO" && (
        <div className="portal-coleta-acoes">
          {coleta ? (
            <Link
              to="/portal/coleta/$id"
              params={{ id: String(coleta.id) }}
              className="portal-link"
              data-testid={`documentos-${cartao.numero}`}
            >
              Documentos{coleta.documentos > 0 ? ` (${coleta.documentos})` : ""}
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
      )}
    </li>
  );
}

export function QuadroPedidos({
  quadro,
  capacidades,
  coletas = [],
}: {
  quadro: QuadroTipo;
  capacidades: CapacidadesPortal;
  coletas?: ColetaPortal[];
}) {
  const [marcados, setMarcados] = useState<number[]>([]);
  const porPedido = coletaPorPedido(coletas);
  const alternar = (numero: number, marcado: boolean) =>
    setMarcados((atual) =>
      marcado
        ? atual.includes(numero)
          ? atual
          : [...atual, numero]
        : atual.filter((n) => n !== numero),
    );

  return (
    <div className="portal-quadro" data-testid="quadro">
      {quadro.colunas.map((coluna) => {
        // só vale marcar quem ainda está na coluna (o quadro pode ter sido recarregado)
        const naColuna = new Set(coluna.pedidos.map((p) => p.numero));
        const selecionados =
          coluna.id === "AGUARDANDO_COLETA" ? marcados.filter((n) => naColuna.has(n)) : [];
        const mostraAgendar =
          coluna.id === "AGUARDANDO_COLETA" &&
          podeGerirColeta(capacidades) &&
          coluna.pedidos.some((p) => !porPedido.has(p.numero));
        return (
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
            {mostraAgendar && (
              <div className="portal-coluna-acao">
                {selecionados.length > 0 ? (
                  <Link
                    to="/portal/agendar"
                    search={{ pedidos: selecionados.join(",") }}
                    className="portal-botao portal-botao-pequeno portal-botao-link"
                    data-testid="agendar-coleta"
                  >
                    AGENDAR COLETA ({selecionados.length})
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="portal-botao portal-botao-pequeno"
                    disabled
                    data-testid="agendar-coleta"
                    title="Marque os pedidos que serão buscados"
                  >
                    AGENDAR COLETA
                  </button>
                )}
              </div>
            )}
            {coluna.pedidos.length === 0 ? (
              <p className="portal-coluna-vazia">
                {coluna.semFonte ? "Em breve" : "Nenhum pedido"}
              </p>
            ) : (
              <ul className="portal-coluna-lista">
                {coluna.pedidos.map((c) => (
                  <CartaoDoPedido
                    key={c.numero}
                    cartao={c}
                    coluna={coluna}
                    cap={capacidades}
                    coleta={COLUNAS_DA_COLETA.includes(coluna.id) ? porPedido.get(c.numero) : undefined}
                    selecionado={marcados.includes(c.numero)}
                    aoSelecionar={alternar}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
