// Portal Mowig (J661) — cliente tipado da API do ERP (/v1/portal/*). Contrato: mowig-api docs/api-portal.md (J330 + J557 + J660).
// Regras: o front NUNCA manda valor (só quais pedidos e quanto crédito); dinheiro das cobranças vem em CENTAVOS inteiros;
// o quadro e o detalhe trazem dinheiro como texto "1234.50" (reais). POST sempre com Idempotency-Key.

import { PORTAL_API_URL } from "@/lib/portal";

// ---------------------------------------------------------------------------------------------------------------------
// Tipos do contrato
// ---------------------------------------------------------------------------------------------------------------------
export type PapelPortal = "GESTOR" | "FINANCEIRO" | "IMPLANTADOR" | "CONSULTA";

export interface CapacidadesPortal {
  verValores: boolean;
  cobranca: boolean;
  implantar: boolean;
  gerirLoja: boolean;
}

export interface PortalMe {
  ok: true;
  usuario: { email: string; papel: PapelPortal };
  capacidades: CapacidadesPortal;
  cliente: {
    numero: number;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    cnpj: string | null;
  };
}

export const COLUNAS_QUADRO = [
  "AGUARDANDO_CONFIRMACAO_COMERCIAL",
  "AGUARDANDO_LIBERACAO_FINANCEIRA",
  "EM_PRODUCAO",
  "FINALIZADOS",
  "AGUARDANDO_COLETA",
  "COLETA_AGENDADA",
  "DESPACHADO",
] as const;
export type ColunaQuadroId = (typeof COLUNAS_QUADRO)[number];

export interface CartaoPedido {
  numero: number;
  oc: string | null;
  emitidoEm: string | null;
  entregaPrevista: string | null;
  marca: "SALDO A PAGAR" | "SUSPENSO" | string | null;
  /** Só existe com "Ver valores": reais em texto ("1234.50"). Ausente = o papel não vê valores. */
  valorTotal?: string | null;
  saldoAPagar?: string | null;
}

export interface ColunaDoQuadro {
  id: ColunaQuadroId;
  rotulo: string;
  semFonte: boolean;
  aviso: string | null;
  pedidos: CartaoPedido[];
}

export interface Quadro {
  ok: true;
  colunas: ColunaDoQuadro[];
  foraDoQuadro: number;
}

export interface ValorEPercentual {
  valor: string | null;
  percentual: string | null;
  derivado: boolean;
}

export interface DetalhePedido {
  ok: true;
  cabecalho: {
    numero: number;
    oc: string | null;
    tipo: string | null;
    ambiente: string | null;
    emitidoEm: string | null;
  };
  situacao: {
    coluna: ColunaQuadroId | null;
    rotulo: string | null;
    marca: string | null;
    statusCanonico: string;
    saldoAPagar?: string | null;
  };
  entrega: { data: string | null; origem: "COMPROMETIDA" | "PREVISTA" | null };
  linhaDoTempo: { evento: string; quando: string }[];
  valores?: {
    bruto: string | null;
    desconto: ValorEPercentual;
    produtos: string | null;
    ipi: ValorEPercentual;
    total: string | null;
    faturado: string | null;
    cancelado: string | null;
    saldo: string | null;
  };
}

export type SituacaoCobranca =
  "ABERTA" | "PAGA" | "SUBSTITUIDA" | "VENCIDA" | "CANCELADA" | "EM_ANALISE";

export type SituacaoPagamento =
  | "AGUARDANDO"
  | "PAGA_AGUARDANDO_CREDITO"
  | "PAGA"
  | "VENCIDA"
  | "CANCELADA"
  | "SUBSTITUIDA"
  | "EM_ANALISE";

export type FormaPagamento = "PIX" | "BOLETO";

export interface PedidoCobravel {
  numero: number;
  oc: string | null;
  natureza: "ENTRADA" | "SALDO";
  valorCentavos: number;
  valorFinalCentavos: number;
  entregaPrevista: string | null;
}

export interface Cobravel {
  ok: true;
  pedidos: PedidoCobravel[];
  credito: { elegivelCentavos: number; reservadoCentavos: number; disponivelCentavos: number };
}

export interface Cobranca {
  id: number;
  numero: string;
  versao: number;
  situacao: SituacaoCobranca;
  situacaoPagamento: SituacaoPagamento | null;
  validade: string | null;
  pedidos: { numero: number; natureza: string; valorCentavos: number }[];
  brutoCentavos: number;
  creditoCentavos: number;
  liquidoCentavos: number;
  forma: FormaPagamento | null;
  invoiceUrl: string | null;
  criadoEm: string;
}

export interface ListaCobrancas {
  ok: true;
  disponivel: boolean;
  itens: Cobranca[];
  aviso: string | null;
}

export interface DetalheCobranca {
  ok: true;
  cobranca: Cobranca;
  gateway: {
    forma: FormaPagamento;
    situacao: string;
    situacaoGateway: string | null;
    invoiceUrl: string | null;
    pagoEm: string | null;
  } | null;
  versoes: {
    versao: number;
    situacao: SituacaoCobranca;
    validade: string | null;
    brutoCentavos: number;
    creditoCentavos: number;
    liquidoCentavos: number;
    pedidos: number[];
    criadoEm: string;
    criadoPor: string | null;
    fim: string | null;
  }[];
}

export interface Pagamento {
  ok: true;
  cobrancaId: number;
  numero: string;
  versao: number;
  forma: FormaPagamento | null;
  situacao: SituacaoPagamento;
  liquidoCentavos: number;
  validade: string | null;
  invoiceUrl: string | null;
  pix: { copiaECola: string; qrCodeBase64: string; expiraEm: string | null } | null;
  boleto: { linhaDigitavel: string; pdfUrl: string | null } | null;
  aviso: string | null;
}

export interface SituacaoDoPagamento {
  ok: true;
  cobrancaId: number;
  numero: string;
  versao: number;
  situacao: SituacaoPagamento;
  situacaoCobranca: SituacaoCobranca;
  forma: FormaPagamento | null;
  liquidoCentavos: number;
  validade: string | null;
  pagoEm: string | null;
}

export interface CorpoCobranca {
  pedidos: number[];
  creditoCentavos?: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------------------------------------------------
export class PortalApiErro extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | null,
    message: string,
  ) {
    super(message);
    this.name = "PortalApiErro";
  }
}

/** Textos humanos por código de erro da API; sem código conhecido cai no texto da API (já humano) ou no genérico. */
const MENSAGENS: Record<string, string> = {
  NAO_ENCONTRADA: "Não encontramos este item.",
  PEDIDO_NAO_COBRAVEL: "Um dos pedidos não pode mais entrar em cobrança. Atualize a lista.",
  CREDITO_INSUFICIENTE: "O crédito informado é maior que o saldo disponível.",
  PEDIDOS_MUDARAM: "Os pedidos mudaram desde que a cobrança foi montada. Monte uma nova versão.",
  FORMA_DIFERENTE: "Para trocar entre PIX e boleto é preciso montar uma nova versão da cobrança.",
  PAGAMENTO_INDISPONIVEL: "Pagamento indisponível no momento. Tente de novo em alguns minutos.",
  GATEWAY_FALHA: "Não conseguimos falar com o meio de pagamento. Tente de novo em instantes.",
  COBRANCA_INDISPONIVEL: "Cobranças ainda não estão disponíveis para a sua loja.",
  EM_ANDAMENTO: "Esta ação já está em andamento. Aguarde um instante.",
  IDEMPOTENCIA_CONFLITO: "Esta ação mudou desde o último envio. Tente de novo.",
};

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof PortalApiErro) {
    if (erro.codigo && MENSAGENS[erro.codigo]) return MENSAGENS[erro.codigo];
    if (erro.status === 429) return "Muitas tentativas. Aguarde um instante e tente de novo.";
    if (erro.status === 403) return "Seu perfil não tem permissão para esta ação.";
    if (erro.status === 503) return "Esta função ainda não está disponível. Volte em breve.";
    if (erro.status >= 400 && erro.status < 500 && erro.message) return erro.message;
  }
  return "Não foi possível concluir. Tente novamente.";
}

export type ObterToken = () => Promise<string | null>;

export interface PortalApi {
  me(): Promise<PortalMe>;
  quadro(): Promise<Quadro>;
  pedido(numero: number): Promise<DetalhePedido>;
  cobrancas(): Promise<ListaCobrancas>;
  cobravel(): Promise<Cobravel>;
  cobranca(id: number): Promise<DetalheCobranca>;
  situacao(id: number): Promise<SituacaoDoPagamento>;
  criarCobranca(corpo: CorpoCobranca, chave: string): Promise<Cobranca>;
  novaVersao(id: number, corpo: CorpoCobranca, chave: string): Promise<Cobranca>;
  pagar(id: number, forma: FormaPagamento, chave: string): Promise<Pagamento>;
}

/** Chave de idempotência: um UUID novo por ação do usuário (a API pede 8–200 caracteres [A-Za-z0-9_.:-]). */
export function novaChaveIdempotencia(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function criarPortalApi(
  obterToken: ObterToken,
  opcoes: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): PortalApi {
  const base = (opcoes.baseUrl ?? PORTAL_API_URL).replace(/\/$/, "");
  const f = opcoes.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function chamar<T>(
    caminho: string,
    init: { metodo?: "GET" | "POST"; corpo?: unknown; chave?: string } = {},
  ): Promise<T> {
    const token = await obterToken();
    if (!token) throw new PortalApiErro(401, null, "Sessão expirada. Entre novamente.");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.corpo !== undefined) headers["Content-Type"] = "application/json";
    if (init.chave) headers["Idempotency-Key"] = init.chave;
    let resp: Response;
    try {
      resp = await f(`${base}/v1/portal${caminho}`, {
        method: init.metodo ?? "GET",
        headers,
        body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
      });
    } catch {
      throw new PortalApiErro(0, null, "Sem conexão com o servidor.");
    }
    let json: unknown = null;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    if (!resp.ok) {
      const o = (json ?? {}) as { codigo?: string; erro?: string };
      throw new PortalApiErro(resp.status, o.codigo ?? null, o.erro ?? "Erro na solicitação.");
    }
    return json as T;
  }

  const post = <T>(caminho: string, corpo: unknown, chave: string) =>
    chamar<T>(caminho, { metodo: "POST", corpo, chave });

  return {
    me: () => chamar<PortalMe>("/me"),
    quadro: () => chamar<Quadro>("/pedidos"),
    pedido: (n) => chamar<DetalhePedido>(`/pedidos/${n}`),
    cobrancas: () => chamar<ListaCobrancas>("/cobrancas"),
    cobravel: () => chamar<Cobravel>("/cobravel"),
    cobranca: (id) => chamar<DetalheCobranca>(`/cobrancas/${id}`),
    situacao: (id) => chamar<SituacaoDoPagamento>(`/cobrancas/${id}/situacao`),
    criarCobranca: async (corpo, chave) =>
      normalizarCobranca(await post<CobrancaResposta>("/cobrancas", corpo, chave)),
    novaVersao: async (id, corpo, chave) =>
      normalizarCobranca(await post<CobrancaResposta>(`/cobrancas/${id}/versoes`, corpo, chave)),
    pagar: (id, forma, chave) => post<Pagamento>(`/cobrancas/${id}/pagar`, { forma }, chave),
  };
}

/** POST de cobrança devolve a Cobranca (às vezes embrulhada em `cobranca`); aceitamos as duas formas. */
type CobrancaResposta = Cobranca | { ok: true; cobranca: Cobranca };
function normalizarCobranca(r: CobrancaResposta): Cobranca {
  return "cobranca" in r && r.cobranca ? r.cobranca : (r as Cobranca);
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatação e regras de apresentação (puras, testáveis)
// ---------------------------------------------------------------------------------------------------------------------
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brlDeCentavos(centavos: number): string {
  return BRL.format(centavos / 100);
}

/** "1234.50" (reais em texto, como o quadro devolve) -> "R$ 1.234,50". */
export function brlDeTexto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  return Number.isFinite(n) ? BRL.format(n) : "—";
}

/** Entrada do usuário ("1.234,56" ou "1234,56") -> centavos inteiros; inválido = null. Nunca usa ponto flutuante. */
export function centavosDeEntrada(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/, "");
  if (limpo === "") return 0;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, frac = ""] = limpo.replace(/\./g, "").split(",");
  const c = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(c) ? c : null;
}

export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const ROTULO_PAPEL: Record<PapelPortal, string> = {
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  IMPLANTADOR: "Implantador",
  CONSULTA: "Consulta",
};

export const ROTULO_SITUACAO_COBRANCA: Record<SituacaoCobranca, string> = {
  ABERTA: "Aberta",
  PAGA: "Paga",
  SUBSTITUIDA: "Substituída",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  EM_ANALISE: "Em análise",
};

export type TomPilula = "neutro" | "ok" | "atencao" | "critico";

export function tomDaSituacao(s: SituacaoCobranca | SituacaoPagamento): TomPilula {
  switch (s) {
    case "PAGA":
      return "ok";
    case "ABERTA":
    case "AGUARDANDO":
    case "PAGA_AGUARDANDO_CREDITO":
    case "EM_ANALISE":
      return "atencao";
    case "VENCIDA":
    case "CANCELADA":
      return "critico";
    default:
      return "neutro";
  }
}

/** Situação em que a tela de pagamento para de consultar a API. */
export function situacaoTerminal(s: SituacaoPagamento): boolean {
  return s === "PAGA" || s === "VENCIDA" || s === "CANCELADA" || s === "SUBSTITUIDA";
}

/** Nova versão só de cobrança ABERTA, VENCIDA ou CANCELADA (API: ESP-0). */
export function podeNovaVersao(s: SituacaoCobranca): boolean {
  return s === "ABERTA" || s === "VENCIDA" || s === "CANCELADA";
}

/** PAGAR só enquanto a cobrança está aberta e há valor líquido a pagar. */
export function podePagar(c: Pick<Cobranca, "situacao" | "liquidoCentavos">): boolean {
  return c.situacao === "ABERTA" && c.liquidoCentavos > 0;
}

/** Prévia do total no navegador — só para o usuário se orientar; o valor que vale é sempre o recalculado pela API. */
export function previaTotais(
  pedidos: Pick<PedidoCobravel, "valorCentavos">[],
  creditoCentavos: number,
): { brutoCentavos: number; creditoCentavos: number; liquidoCentavos: number } {
  const bruto = pedidos.reduce((s, p) => s + p.valorCentavos, 0);
  const credito = Math.min(Math.max(creditoCentavos, 0), bruto);
  return { brutoCentavos: bruto, creditoCentavos: credito, liquidoCentavos: bruto - credito };
}
