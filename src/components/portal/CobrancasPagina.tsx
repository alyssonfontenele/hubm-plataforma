// Portal Mowig (J661) — tela "Cobranças": lista + MONTAR COBRANÇA (pedidos cobráveis, crédito elegível, total líquido) + nova versão.
// O front só diz QUAIS pedidos e QUANTO crédito (centavos inteiros); o servidor recalcula tudo. A prévia do total é orientação.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { usePortalApi, usePortalMe } from "@/components/portal/PortalCasca";
import { Aviso, Pilula } from "@/components/portal/ui";
import {
  brlDeCentavos,
  centavosDeEntrada,
  dataBr,
  mensagemDeErro,
  novaChaveIdempotencia,
  podeNovaVersao,
  podePagar,
  previaTotais,
  ROTULO_SITUACAO_COBRANCA,
  tomDaSituacao,
  type Cobranca,
  type PedidoCobravel,
} from "@/lib/portal-api";

/** Mesma chave enquanto o MESMO pedido de ação falhar (reenvio seguro); chave nova quando o conteúdo muda ou a ação dá certo. */
function useChaveIdempotente() {
  const ultima = useRef<{ conteudo: string; chave: string } | null>(null);
  return {
    obter(conteudo: string): string {
      if (ultima.current?.conteudo !== conteudo) {
        ultima.current = { conteudo, chave: novaChaveIdempotencia() };
      }
      return ultima.current.chave;
    },
    liberar() {
      ultima.current = null;
    },
  };
}

interface Edicao {
  /** null = cobrança nova; número = nova versão dessa cobrança. */
  cobrancaId: number | null;
  numeroCobranca: string | null;
}

function MontarCobranca({
  pedidosCobraveis,
  credito,
  edicao,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  pedidosCobraveis: PedidoCobravel[];
  credito: { disponivelCentavos: number; reservadoCentavos: number; elegivelCentavos: number };
  edicao: Edicao;
  inicial: { pedidos: number[]; creditoCentavos: number };
  aoFechar: () => void;
  aoSalvar: (c: Cobranca) => void;
}) {
  const api = usePortalApi();
  const qc = useQueryClient();
  const chave = useChaveIdempotente();
  const [marcados, setMarcados] = useState<Set<number>>(new Set(inicial.pedidos));
  const [creditoTexto, setCreditoTexto] = useState(
    inicial.creditoCentavos > 0 ? (inicial.creditoCentavos / 100).toFixed(2).replace(".", ",") : "",
  );

  // Na nova versão, o crédito já reservado por esta cobrança volta a estar disponível para ela.
  const tetoCredito =
    credito.disponivelCentavos + (edicao.cobrancaId ? inicial.creditoCentavos : 0);

  const selecionados = pedidosCobraveis.filter((p) => marcados.has(p.numero));
  const creditoCentavos = centavosDeEntrada(creditoTexto);
  const erroCredito =
    creditoCentavos === null
      ? "Informe o crédito em reais, por exemplo 150,00."
      : creditoCentavos > tetoCredito
        ? `O crédito disponível é ${brlDeCentavos(tetoCredito)}.`
        : null;
  const totais = previaTotais(selecionados, erroCredito ? 0 : (creditoCentavos ?? 0));

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = {
        pedidos: [...marcados].sort((a, b) => a - b),
        ...(creditoCentavos && creditoCentavos > 0 ? { creditoCentavos } : {}),
      };
      const k = chave.obter(`${edicao.cobrancaId ?? "nova"}:${JSON.stringify(corpo)}`);
      return edicao.cobrancaId === null
        ? api.criarCobranca(corpo, k)
        : api.novaVersao(edicao.cobrancaId, corpo, k);
    },
    onSuccess: async (cobranca) => {
      chave.liberar();
      await qc.invalidateQueries({ queryKey: ["portal", "cobrancas"] });
      await qc.invalidateQueries({ queryKey: ["portal", "cobravel"] });
      aoSalvar(cobranca);
    },
  });

  const alternar = (n: number) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(n)) novo.delete(n);
      else novo.add(n);
      return novo;
    });

  const podeSalvar = marcados.size > 0 && !erroCredito && !salvar.isPending;

  return (
    <section className="portal-painel" aria-labelledby="montar">
      <h2 id="montar">
        {edicao.cobrancaId === null ? "Montar cobrança" : `Nova versão de ${edicao.numeroCobranca}`}
      </h2>
      {pedidosCobraveis.length === 0 ? (
        <p className="portal-meta">Nenhum pedido aguardando pagamento no momento.</p>
      ) : (
        <>
          <p className="portal-meta">
            Marque os pedidos que quer pagar juntos. O valor final é calculado pela Mowig.
          </p>
          <ul className="portal-lista-selecao">
            {pedidosCobraveis.map((p) => (
              <li key={p.numero}>
                <label className="portal-selecao-linha">
                  <input
                    type="checkbox"
                    checked={marcados.has(p.numero)}
                    onChange={() => alternar(p.numero)}
                  />
                  <span className="portal-centro-num">{p.numero}</span>
                  <span className="portal-meta">{p.oc ? `OC ${p.oc}` : ""}</span>
                  <span className="portal-dinheiro">{brlDeCentavos(p.valorCentavos)}</span>
                </label>
              </li>
            ))}
          </ul>

          {tetoCredito > 0 && (
            <label className="portal-campo">
              <span>Crédito a usar (disponível {brlDeCentavos(tetoCredito)})</span>
              <input
                inputMode="decimal"
                value={creditoTexto}
                onChange={(e) => setCreditoTexto(e.target.value)}
                placeholder="0,00"
                aria-invalid={erroCredito ? true : undefined}
              />
            </label>
          )}
          {erroCredito && <Aviso tipo="erro">{erroCredito}</Aviso>}

          <dl className="portal-lista-info portal-totais" aria-label="Totais">
            <div className="portal-linha-info">
              <dt>Pedidos</dt>
              <dd className="portal-dinheiro">{brlDeCentavos(totais.brutoCentavos)}</dd>
            </div>
            <div className="portal-linha-info">
              <dt>Crédito</dt>
              <dd className="portal-dinheiro">− {brlDeCentavos(totais.creditoCentavos)}</dd>
            </div>
            <div className="portal-linha-info portal-linha-total">
              <dt>Total líquido</dt>
              <dd className="portal-dinheiro" data-testid="total-liquido">
                {brlDeCentavos(totais.liquidoCentavos)}
              </dd>
            </div>
          </dl>
        </>
      )}

      {salvar.isError && <Aviso tipo="erro">{mensagemDeErro(salvar.error)}</Aviso>}

      <div className="portal-acoes">
        <button
          type="button"
          className="portal-botao"
          disabled={!podeSalvar}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending
            ? "Enviando…"
            : edicao.cobrancaId === null
              ? "Criar cobrança"
              : "Criar nova versão"}
        </button>
        <button type="button" className="portal-botao portal-botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

function LinhaCobranca({ c, aoAlterar }: { c: Cobranca; aoAlterar: (c: Cobranca) => void }) {
  const api = usePortalApi();
  const [aberta, setAberta] = useState(false);
  const detalhe = useQuery({
    queryKey: ["portal", "cobranca", c.id],
    queryFn: () => api.cobranca(c.id),
    enabled: aberta,
    retry: false,
  });

  return (
    <li className="portal-cobranca" data-testid={`cobranca-${c.id}`}>
      <div className="portal-cobranca-linha">
        <span className="portal-centro-num portal-cobranca-numero">
          {c.numero} <span className="portal-meta">v{c.versao}</span>
        </span>
        <Pilula tom={tomDaSituacao(c.situacao)}>{ROTULO_SITUACAO_COBRANCA[c.situacao]}</Pilula>
        <span className="portal-centro-num">{c.pedidos.length} pedido(s)</span>
        <span className="portal-centro-num">{dataBr(c.validade)}</span>
        <span className="portal-dinheiro">{brlDeCentavos(c.liquidoCentavos)}</span>
        <span className="portal-cobranca-acoes">
          {podePagar(c) && (
            <Link
              to="/portal/pagamento/$id"
              params={{ id: String(c.id) }}
              className="portal-botao portal-botao-pequeno portal-botao-link"
            >
              Pagar
            </Link>
          )}
          {podeNovaVersao(c.situacao) && (
            <button
              type="button"
              className="portal-botao portal-botao-secundario portal-botao-pequeno"
              onClick={() => aoAlterar(c)}
            >
              Alterar
            </button>
          )}
          <button
            type="button"
            className="portal-link"
            aria-expanded={aberta}
            onClick={() => setAberta((v) => !v)}
          >
            {aberta ? "Ocultar" : "Detalhes"}
          </button>
        </span>
      </div>
      {aberta && (
        <div className="portal-cobranca-detalhe">
          {detalhe.isPending && <p className="portal-meta">Carregando…</p>}
          {detalhe.isError && <Aviso tipo="erro">{mensagemDeErro(detalhe.error)}</Aviso>}
          {detalhe.data && (
            <>
              <p className="portal-meta">
                Pedidos: {c.pedidos.map((p) => p.numero).join(", ")} · Crédito:{" "}
                {brlDeCentavos(c.creditoCentavos)}
                {detalhe.data.gateway ? ` · ${detalhe.data.gateway.forma}` : ""}
              </p>
              <ul className="portal-tempo">
                {detalhe.data.versoes.map((v) => (
                  <li key={v.versao}>
                    <span>
                      Versão {v.versao} — {ROTULO_SITUACAO_COBRANCA[v.situacao]}
                    </span>
                    <span className="portal-dinheiro">{brlDeCentavos(v.liquidoCentavos)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function CobrancasPagina({ pedidoInicial }: { pedidoInicial?: number }) {
  const api = usePortalApi();
  const me = usePortalMe();
  const habilitado = me.capacidades.cobranca;
  const lista = useQuery({
    queryKey: ["portal", "cobrancas"],
    queryFn: () => api.cobrancas(),
    enabled: habilitado,
    retry: false,
  });
  const cobravel = useQuery({
    queryKey: ["portal", "cobravel"],
    queryFn: () => api.cobravel(),
    enabled: habilitado,
    retry: false,
  });

  const [edicao, setEdicao] = useState<
    | (Edicao & {
        inicial: { pedidos: number[]; creditoCentavos: number };
        extras: PedidoCobravel[];
      })
    | null
  >(null);
  const [criada, setCriada] = useState<Cobranca | null>(null);

  // Vindo do botão PAGAR do quadro: abre a montagem já com o pedido marcado (uma vez).
  const abriuInicial = useRef(false);
  useEffect(() => {
    if (abriuInicial.current || !pedidoInicial || !cobravel.data) return;
    abriuInicial.current = true;
    if (cobravel.data.pedidos.some((p) => p.numero === pedidoInicial)) {
      setEdicao({
        cobrancaId: null,
        numeroCobranca: null,
        inicial: { pedidos: [pedidoInicial], creditoCentavos: 0 },
        extras: [],
      });
    }
  }, [pedidoInicial, cobravel.data]);

  const pedidosDaMontagem = useMemo(() => {
    if (!edicao || !cobravel.data) return [];
    const extras = edicao.extras.filter(
      (e) => !cobravel.data.pedidos.some((p) => p.numero === e.numero),
    );
    return [...extras, ...cobravel.data.pedidos];
  }, [edicao, cobravel.data]);

  if (!habilitado) {
    return (
      <>
        <h1 className="portal-titulo">Cobranças</h1>
        <Aviso tipo="info">Seu perfil não tem acesso às cobranças da loja.</Aviso>
      </>
    );
  }

  function alterar(c: Cobranca) {
    setCriada(null);
    setEdicao({
      cobrancaId: c.id,
      numeroCobranca: c.numero,
      inicial: { pedidos: c.pedidos.map((p) => p.numero), creditoCentavos: c.creditoCentavos },
      extras: c.pedidos.map((p) => ({
        numero: p.numero,
        oc: null,
        natureza: p.natureza === "SALDO" ? "SALDO" : "ENTRADA",
        valorCentavos: p.valorCentavos,
        valorFinalCentavos: p.valorCentavos,
        entregaPrevista: null,
      })),
    });
  }

  const itens = lista.data?.itens ?? [];

  return (
    <>
      <div className="portal-titulo-linha">
        <h1 className="portal-titulo">Cobranças</h1>
        {!edicao && (
          <button
            type="button"
            className="portal-botao portal-botao-pequeno"
            onClick={() => {
              setCriada(null);
              setEdicao({
                cobrancaId: null,
                numeroCobranca: null,
                inicial: { pedidos: [], creditoCentavos: 0 },
                extras: [],
              });
            }}
            disabled={!cobravel.data}
          >
            Montar cobrança
          </button>
        )}
      </div>

      {criada && (
        <Aviso tipo="ok">
          Cobrança {criada.numero} criada — {brlDeCentavos(criada.liquidoCentavos)}.{" "}
          {podePagar(criada) ? (
            <Link
              to="/portal/pagamento/$id"
              params={{ id: String(criada.id) }}
              className="portal-link"
            >
              Pagar agora
            </Link>
          ) : criada.situacao === "PAGA" ? (
            "Coberta pelo crédito: não há nada a pagar."
          ) : null}
        </Aviso>
      )}

      {edicao && cobravel.data && (
        <MontarCobranca
          key={`${edicao.cobrancaId ?? "nova"}`}
          pedidosCobraveis={pedidosDaMontagem}
          credito={cobravel.data.credito}
          edicao={edicao}
          inicial={edicao.inicial}
          aoFechar={() => setEdicao(null)}
          aoSalvar={(c) => {
            setEdicao(null);
            setCriada(c);
          }}
        />
      )}
      {cobravel.isError && <Aviso tipo="erro">{mensagemDeErro(cobravel.error)}</Aviso>}

      <section className="portal-painel" aria-labelledby="lista-cob">
        <h2 id="lista-cob">Suas cobranças</h2>
        {lista.isPending && <p className="portal-meta">Carregando…</p>}
        {lista.isError && <Aviso tipo="erro">{mensagemDeErro(lista.error)}</Aviso>}
        {lista.data && !lista.data.disponivel && (
          <Aviso tipo="info">{lista.data.aviso ?? "Cobranças ainda não disponíveis."}</Aviso>
        )}
        {lista.data?.disponivel && itens.length === 0 && (
          <p className="portal-meta">Nenhuma cobrança ainda.</p>
        )}
        {itens.length > 0 && (
          <ul className="portal-lista-cobrancas">
            {itens.map((c) => (
              <LinhaCobranca key={c.id} c={c} aoAlterar={alterar} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
