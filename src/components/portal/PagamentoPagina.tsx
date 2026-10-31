// Portal Mowig (J661) — tela "Pagamento": PIX (QR + COPIAR CÓDIGO) e boleto (linha digitável + BAIXAR BOLETO).
// Consulta a situação a cada 10 s enquanto a tela está aberta. Mensagem de sucesso SÓ quando a API disser `PAGA`
// (boleto CONFIRMED = PAGA_AGUARDANDO_CREDITO: pago, mas ainda sem liberar os pedidos).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { usePortalApi } from "@/components/portal/PortalCasca";
import { Aviso, BotaoCopiar, Pilula } from "@/components/portal/ui";
import {
  brlDeCentavos,
  dataHoraBr,
  mensagemDeErro,
  novaChaveIdempotencia,
  podePagar,
  situacaoTerminal,
  tomDaSituacao,
  type FormaPagamento,
  type Pagamento,
  type SituacaoPagamento,
} from "@/lib/portal-api";

export const INTERVALO_SITUACAO_MS = 10_000;

/** Só links https saem para fora (nunca javascript:/data: vindo de uma resposta). */
export function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const ROTULO_SITUACAO: Record<SituacaoPagamento, string> = {
  AGUARDANDO: "Aguardando pagamento",
  PAGA_AGUARDANDO_CREDITO: "Pago, aguardando compensação",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  SUBSTITUIDA: "Substituída",
  EM_ANALISE: "Em análise",
};

function MensagemDaSituacao({ s }: { s: SituacaoPagamento }) {
  switch (s) {
    case "PAGA":
      return (
        <Aviso tipo="ok">
          Pagamento confirmado. Seus pedidos foram liberados.{" "}
          <Link to="/portal" className="portal-link">
            Voltar aos pedidos
          </Link>
        </Aviso>
      );
    case "PAGA_AGUARDANDO_CREDITO":
      return (
        <Aviso tipo="info">
          Recebemos a confirmação do boleto. Seus pedidos são liberados assim que o banco concluir a
          compensação — você não precisa pagar de novo.
        </Aviso>
      );
    case "VENCIDA":
      return (
        <Aviso tipo="erro">
          Esta cobrança venceu. Volte às cobranças e crie uma nova versão para gerar outro
          pagamento.
        </Aviso>
      );
    case "CANCELADA":
    case "SUBSTITUIDA":
      return (
        <Aviso tipo="erro">
          Esta cobrança foi {s === "CANCELADA" ? "cancelada" : "substituída por uma nova versão"}.
          Não pague por ela.
        </Aviso>
      );
    case "EM_ANALISE":
      return (
        <Aviso tipo="info">
          Seu pagamento está em análise pela Mowig. Avisaremos quando terminar.
        </Aviso>
      );
    default:
      return null;
  }
}

function DadosPix({ p }: { p: Pagamento }) {
  const pix = p.pix;
  if (!pix) return null;
  return (
    <div className="portal-pagto-bloco" data-testid="bloco-pix">
      {pix.qrCodeBase64 && (
        <img
          className="portal-qr"
          alt="QR Code do PIX"
          width={220}
          height={220}
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
        />
      )}
      <p className="portal-meta">PIX copia e cola</p>
      <code className="portal-codigo" data-testid="codigo-pix">
        {pix.copiaECola}
      </code>
      <div className="portal-acoes">
        <BotaoCopiar texto={pix.copiaECola} rotulo="Copiar código" />
      </div>
      {pix.expiraEm && <p className="portal-meta">Válido até {dataHoraBr(pix.expiraEm)}</p>}
    </div>
  );
}

function DadosBoleto({ p }: { p: Pagamento }) {
  const b = p.boleto;
  if (!b) return null;
  const pdf = urlSegura(b.pdfUrl);
  return (
    <div className="portal-pagto-bloco" data-testid="bloco-boleto">
      <p className="portal-meta">Linha digitável</p>
      <code className="portal-codigo" data-testid="linha-digitavel">
        {b.linhaDigitavel}
      </code>
      <div className="portal-acoes">
        <BotaoCopiar texto={b.linhaDigitavel} rotulo="Copiar linha" />
        {pdf && (
          <a
            className="portal-botao portal-botao-secundario portal-botao-link"
            href={pdf}
            target="_blank"
            rel="noopener noreferrer"
          >
            Baixar boleto
          </a>
        )}
      </div>
    </div>
  );
}

export function PagamentoPagina({ id }: { id: number }) {
  const api = usePortalApi();
  const qc = useQueryClient();
  const detalhe = useQuery({
    queryKey: ["portal", "cobranca", id],
    queryFn: () => api.cobranca(id),
    retry: false,
  });
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const chaves = useRef<Partial<Record<FormaPagamento, string>>>({});

  const situacao = useQuery({
    queryKey: ["portal", "situacao", id],
    queryFn: () => api.situacao(id),
    enabled: detalhe.isSuccess,
    retry: false,
    refetchInterval: (q) => {
      const s = q.state.data?.situacao;
      return s && situacaoTerminal(s) ? false : INTERVALO_SITUACAO_MS;
    },
    refetchIntervalInBackground: false,
  });

  const pagar = useMutation({
    mutationFn: (forma: FormaPagamento) => {
      chaves.current[forma] ??= novaChaveIdempotencia();
      return api.pagar(id, forma, chaves.current[forma]!);
    },
    onSuccess: async (p, forma) => {
      delete chaves.current[forma];
      setPagamento(p);
      await qc.invalidateQueries({ queryKey: ["portal", "cobranca", id] });
    },
  });

  // Recarregou a página com o pagamento já emitido: pedir o mesmo (idempotente por cobrança+versão) recupera QR/linha.
  const formaGateway = detalhe.data?.gateway?.forma ?? null;
  const recuperar =
    detalhe.data !== undefined &&
    podePagar(detalhe.data.cobranca) &&
    (situacao.data === undefined || situacao.data.situacao === "AGUARDANDO") &&
    formaGateway !== null &&
    pagamento === null;
  const { mutate: emitir, isIdle: pagarOcioso } = pagar;
  useEffect(() => {
    if (recuperar && formaGateway && pagarOcioso) emitir(formaGateway);
  }, [recuperar, formaGateway, pagarOcioso, emitir]);

  if (detalhe.isPending) return <p className="portal-meta">Carregando…</p>;
  if (detalhe.isError) {
    return (
      <>
        <h1 className="portal-titulo">Pagamento</h1>
        <Aviso tipo="erro">{mensagemDeErro(detalhe.error)}</Aviso>
        <Link to="/portal/cobrancas" className="portal-link">
          Voltar às cobranças
        </Link>
      </>
    );
  }

  const { cobranca, gateway } = detalhe.data;
  const atual: SituacaoPagamento | null = situacao.data?.situacao ?? null;
  const emitido = pagamento ?? null;
  const formaEscolhida = emitido?.forma ?? gateway?.forma ?? null;
  const aguardando = atual === null || atual === "AGUARDANDO";
  const aindaPodeEmitir = podePagar(cobranca) && aguardando;

  return (
    <>
      <p className="portal-migalha">
        <Link to="/portal/cobrancas" className="portal-link">
          Cobranças
        </Link>
      </p>
      <h1 className="portal-titulo">Pagamento</h1>

      <section className="portal-painel" aria-labelledby="resumo">
        <h2 id="resumo">{cobranca.numero}</h2>
        <dl className="portal-lista-info">
          <div className="portal-linha-info">
            <dt>Situação</dt>
            <dd>
              <Pilula tom={tomDaSituacao(atual ?? cobranca.situacao)}>
                {atual ? ROTULO_SITUACAO[atual] : "Consultando…"}
              </Pilula>
            </dd>
          </div>
          <div className="portal-linha-info">
            <dt>Pedidos</dt>
            <dd className="portal-centro-num">
              {cobranca.pedidos.map((p) => p.numero).join(", ")}
            </dd>
          </div>
          <div className="portal-linha-info portal-linha-total">
            <dt>Total a pagar</dt>
            <dd className="portal-dinheiro" data-testid="total-pagar">
              {brlDeCentavos(cobranca.liquidoCentavos)}
            </dd>
          </div>
        </dl>
      </section>

      {atual && <MensagemDaSituacao s={atual} />}
      {situacao.isError && (
        <Aviso tipo="info">Não conseguimos atualizar a situação agora. Tentaremos de novo.</Aviso>
      )}

      {aindaPodeEmitir && (
        <section className="portal-painel" aria-labelledby="forma">
          <h2 id="forma">Forma</h2>
          {formaEscolhida === null && (
            <>
              <p className="portal-meta">Escolha como quer pagar.</p>
              <div className="portal-acoes">
                <button
                  type="button"
                  className="portal-botao"
                  disabled={pagar.isPending}
                  onClick={() => pagar.mutate("PIX")}
                >
                  Pagar com PIX
                </button>
                <button
                  type="button"
                  className="portal-botao portal-botao-secundario"
                  disabled={pagar.isPending}
                  onClick={() => pagar.mutate("BOLETO")}
                >
                  Pagar com boleto
                </button>
              </div>
            </>
          )}
          {pagar.isPending && <p className="portal-meta">Gerando pagamento…</p>}
          {pagar.isError && (
            <>
              <Aviso tipo="erro">{mensagemDeErro(pagar.error)}</Aviso>
              <div className="portal-acoes">
                <button
                  type="button"
                  className="portal-botao portal-botao-secundario"
                  onClick={() => pagar.mutate(formaEscolhida ?? "PIX")}
                >
                  Tentar de novo
                </button>
              </div>
            </>
          )}
          {emitido && (
            <>
              {emitido.aviso && <Aviso tipo="info">{emitido.aviso}</Aviso>}
              <DadosPix p={emitido} />
              <DadosBoleto p={emitido} />
              {urlSegura(emitido.invoiceUrl) && (
                <p>
                  <a
                    className="portal-link"
                    href={urlSegura(emitido.invoiceUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir fatura
                  </a>
                </p>
              )}
              <p className="portal-meta">
                Esta tela confirma sozinha assim que o pagamento chegar.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
