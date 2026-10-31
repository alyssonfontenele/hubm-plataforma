// Portal Mowig (J661) — DUBLÊ para o Playwright: um único servidor Node que imita (a) o Supabase Auth mínimo usado pelo login
// e (b) a API /v1/portal do ERP (contrato: mowig-api docs/api-portal.md, J330 + J557 + J660).
// 100% sintético (repo público, POR-H11): nenhum dado de cliente real, nenhum segredo. Não fala com a internet.
// J664: coletas (GET /coletas, /coletas/:id, /coletas/:id/documentos/:doc, /slots, /transportadoras; POST /coletas, /remarcar, /cancelar),
// contrato mowig-api docs/api-expedicao.md §Portal. As datas dos horários são relativas a "hoje" (a janela de 24 h = só vale de hoje+2 em diante).
// Controle pelos testes: POST /__test/reset, POST /__test/confirmar?id=&como=PAGA|BOLETO_CONFIRMED|VENCIDA, POST /__test/ocupar?slot=ID
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const PORTA = Number(process.env.FAKE_PORT ?? 4399);
const SENHA_OK = "senha-de-teste-123";

// ------------------------------------------------------------------ PNG sintético (pseudo QR) sem dependências
function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
function pngQrSintetico() {
  const modulos = 29, escala = 6, lado = modulos * escala;
  let semente = 20261031;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const grade = Array.from({ length: modulos }, () => Array.from({ length: modulos }, () => aleatorio() > 0.5));
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const borda = x === 0 || y === 0 || x === 6 || y === 6;
      const miolo = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      grade[y0 + y][x0 + x] = borda || miolo;
    }
  };
  finder(0, 0); finder(modulos - 7, 0); finder(0, modulos - 7);
  const linhas = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x++) {
      const escuro = grade[Math.floor(y / escala)][Math.floor(x / escala)];
      const v = escuro ? 0x1c : 0xff;
      linha[1 + x * 3] = v; linha[2 + x * 3] = v; linha[3 + x * 3] = v;
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(linhas))),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
const QR_BASE64 = pngQrSintetico();

// ------------------------------------------------------------------ dados sintéticos
const PEDIDOS = [
  { numero: 5101, oc: "OC-A101", col: "AGUARDANDO_CONFIRMACAO_COMERCIAL", total: 4200.0, entrega: "2026-12-02" },
  { numero: 5102, oc: "OC-A102", col: "AGUARDANDO_LIBERACAO_FINANCEIRA", total: 1000.0, entrega: "2026-12-05", cobravel: 100000 },
  { numero: 5103, oc: "OC-A103", col: "AGUARDANDO_LIBERACAO_FINANCEIRA", total: 500.5, entrega: "2026-12-07", cobravel: 50050 },
  { numero: 5104, oc: "OC-A104", col: "AGUARDANDO_LIBERACAO_FINANCEIRA", total: 2300.0, entrega: "2026-12-09", cobravel: 230000 },
  { numero: 5105, oc: "OC-A105", col: "EM_PRODUCAO", total: 8800.0, entrega: "2026-11-25" },
  { numero: 5106, oc: "OC-A106", col: "EM_PRODUCAO", total: 3150.9, entrega: "2026-11-27" },
  { numero: 5107, oc: "OC-A107", col: "FINALIZADOS", total: 6400.0, entrega: "2026-11-10", marca: "SALDO A PAGAR" },
  { numero: 5108, oc: "OC-A108", col: "FINALIZADOS", total: 1290.0, entrega: "2026-11-12" },
  // J664: prontos para coleta (AGUARDANDO COLETA) e pedidos que já estão em coleta (estado em `estado.coletas`)
  { numero: 5109, oc: "OC-A109", col: "AGUARDANDO_COLETA", total: 2100.0, entrega: "2026-11-14" },
  { numero: 5110, oc: "OC-A110", col: "AGUARDANDO_COLETA", total: 980.0, entrega: "2026-11-14" },
  { numero: 5111, oc: "OC-A111", col: "AGUARDANDO_COLETA", total: 4410.0, entrega: "2026-11-15" },
  { numero: 5112, oc: "OC-A112", col: "AGUARDANDO_COLETA", total: 760.0, entrega: "2026-11-15" },
  { numero: 5113, oc: "OC-A113", col: "AGUARDANDO_COLETA", total: 3300.0, entrega: "2026-11-13" },
  { numero: 5114, oc: "OC-A114", col: "AGUARDANDO_COLETA", total: 1520.0, entrega: "2026-11-13" },
  { numero: 5115, oc: "OC-A115", col: "AGUARDANDO_COLETA", total: 2750.0, entrega: "2026-11-08" },
  { numero: 5116, oc: "OC-A116", col: "AGUARDANDO_COLETA", total: 640.0, entrega: "2026-11-08" },
];
const ROTULOS = {
  AGUARDANDO_CONFIRMACAO_COMERCIAL: "AGUARDANDO CONFIRMAÇÃO COMERCIAL",
  AGUARDANDO_LIBERACAO_FINANCEIRA: "AGUARDANDO LIBERAÇÃO FINANCEIRA",
  EM_PRODUCAO: "EM PRODUÇÃO",
  FINALIZADOS: "FINALIZADOS",
  AGUARDANDO_COLETA: "AGUARDANDO COLETA",
  COLETA_AGENDADA: "COLETA AGENDADA",
  DESPACHADO: "DESPACHADO",
};
const SEM_FONTE = new Set(); // J664: as colunas de coleta têm fonte
const CREDITO_ELEGIVEL = 30000;

// `coleta` ausente em CONSULTA de propósito: capacidade ausente = sem permissão (o front não pode quebrar nem liberar)
const CAP = {
  GESTOR: { verValores: true, cobranca: true, implantar: false, gerirLoja: true, coleta: true },
  FINANCEIRO: { verValores: true, cobranca: true, implantar: false, gerirLoja: false, coleta: false },
  IMPLANTADOR: { verValores: false, cobranca: false, implantar: true, gerirLoja: false, coleta: true },
  CONSULTA: { verValores: false, cobranca: false, implantar: false, gerirLoja: false },
};
const USUARIOS = {
  "gestor@loja-teste.example": { sub: "00000000-0000-4000-8000-000000000001", papel: "GESTOR" },
  "consulta@loja-teste.example": { sub: "00000000-0000-4000-8000-000000000002", papel: "CONSULTA" },
  "implantador@loja-teste.example": { sub: "00000000-0000-4000-8000-000000000003", papel: "IMPLANTADOR" },
  "financeiro@loja-teste.example": { sub: "00000000-0000-4000-8000-000000000004", papel: "FINANCEIRO" },
};

// ------------------------------------------------------------------ coletas sintéticas (J664)
const TURNOS = [["MANHA", "Manhã"], ["TARDE", "Tarde"]];
const hojeMais = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
function criarSlots() {
  const slots = [];
  for (let d = 1; d <= 7; d++) {
    TURNOS.forEach(([turno, rotuloTurno], i) => {
      slots.push({ id: d * 10 + i + 1, data: hojeMais(d), turno, rotuloTurno, vagas: d === 5 && turno === "TARDE" ? 1 : 3, ocupadas: 0 });
    });
  }
  return slots;
}
const SLOT_ULTIMA_VAGA = 52; // dia +5, tarde: 1 vaga (os testes a tomam com /__test/ocupar)
const TRANSPORTADORAS = [{ id: "T1", nome: "Transportes Exemplo" }, { id: "T2", nome: "Fretes Teste" }];
const PDF_SINTETICO = Buffer.from(["%PDF-1.1", "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj", "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj", "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 80]>>endobj", "trailer<</Root 1 0 R>>", "%%EOF", ""].join(String.fromCharCode(10)));
const slotPorId = (id) => estado.slots.find((s) => s.id === id);
const slotTela = (s) => ({ id: s.id, data: s.data, turno: s.turno, rotuloTurno: s.rotuloTurno });
/** A janela de 24 h (LOG-4) é decidida AQUI, como a API real: só dá para alterar coleta de hoje+2 em diante. */
const dentroDaJanela = (c) => c.slot.data >= hojeMais(2);
const coletaTela = (c) => ({
  id: c.id, situacao: c.situacao, slot: c.slot, quemBusca: c.quemBusca, observacao: c.observacao, motivo: c.motivo, pedidos: c.pedidos,
  solicitadaEm: c.solicitadaEm, confirmadaEm: c.confirmadaEm, despachadaEm: c.despachadaEm, documentos: c.documentos.length,
  podeRemarcarOuCancelar: (c.situacao === "SOLICITADA" || c.situacao === "AGENDADA") && dentroDaJanela(c),
});
const ATIVAS = ["SOLICITADA", "AGENDADA", "DESPACHADA"];
const coletaAtivaDoPedido = (n) => estado.coletas.find((c) => ATIVAS.includes(c.situacao) && c.pedidos.includes(n));
function colunaDe(p) {
  const c = coletaAtivaDoPedido(p.numero);
  if (c) return c.situacao === "DESPACHADA" ? "DESPACHADO" : c.situacao === "AGENDADA" ? "COLETA_AGENDADA" : "AGUARDANDO_COLETA";
  return p.col === "COLETA_AGENDADA" || p.col === "DESPACHADO" ? "AGUARDANDO_COLETA" : p.col;
}
function coletasIniciais() {
  const agora = new Date().toISOString();
  return [
    { id: 301, situacao: "AGENDADA", slot: slotTela(slotPorId(31)), quemBusca: { tipo: "TRANSPORTADORA", codigo: "T1", nome: "Transportes Exemplo" }, observacao: null, motivo: null, pedidos: [5113], solicitadaEm: agora, confirmadaEm: agora, despachadaEm: null, documentos: [] },
    { id: 302, situacao: "AGENDADA", slot: slotTela(slotPorId(11)), quemBusca: { tipo: "VEICULO_PROPRIO", placa: "ABC1D23", motorista: "Motorista Teste" }, observacao: null, motivo: null, pedidos: [5114], solicitadaEm: agora, confirmadaEm: agora, despachadaEm: null, documentos: [] },
    { id: 303, situacao: "DESPACHADA", slot: slotTela(slotPorId(21)), quemBusca: { tipo: "TRANSPORTADORA", codigo: "T2", nome: "Fretes Teste" }, observacao: "Doca 2", motivo: null, pedidos: [5115, 5116], solicitadaEm: agora, confirmadaEm: agora, despachadaEm: agora,
      documentos: [
        { id: 3001, tipo: "NFE", automatico: true, pedidoNumero: 5115, nfeChave: "35261000000000000100550010000012341000012349", nfeNumero: "1234", nomeArquivo: null, contentType: null, tamanho: null, criadoEm: agora },
        { id: 3002, tipo: "ROMANEIO", automatico: false, pedidoNumero: null, nfeChave: null, nfeNumero: null, nomeArquivo: "romaneio-303.pdf", contentType: "application/pdf", tamanho: PDF_SINTETICO.length, criadoEm: agora },
      ] },
  ];
}

let estado;
function zerar() {
  estado = { seq: 1000000001, cobrancas: [], idem: new Map(), pagamento: new Map(), slots: criarSlots(), coletas: [], seqColeta: 400 };
  estado.coletas = coletasIniciais();
}
zerar();

// ------------------------------------------------------------------ utilidades
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwtDe(email) {
  const u = USUARIOS[email];
  const agora = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: u.sub, email, aud: "authenticated", role: "authenticated", iat: agora, exp: agora + 3600 })}.assinatura-sintetica`;
}
function emailDoToken(req) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization ?? "");
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString());
    return USUARIOS[p.email] ? p.email : null;
  } catch {
    return null;
  }
}
function sessaoDe(email) {
  const u = USUARIOS[email];
  const agora = Math.floor(Date.now() / 1000);
  return {
    access_token: jwtDe(email),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: agora + 3600,
    refresh_token: `refresh-sintetico-${u.papel.toLowerCase()}`,
    user: {
      id: u.sub, aud: "authenticated", role: "authenticated", email,
      email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { tipo: "lojista", provider: "email" },
      user_metadata: {}, created_at: "2026-10-01T00:00:00Z",
    },
  };
}
function cors(res, req) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, idempotency-key, apikey, x-client-info, x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
}
function enviar(res, status, corpo, extra = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}
const erro = (res, status, codigo, msg) => enviar(res, status, { ok: false, codigo, erro: msg });
async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  const txt = Buffer.concat(partes).toString();
  if (!txt) return {};
  try { return JSON.parse(txt); } catch { return null; }
}

// ------------------------------------------------------------------ regras do portal (espelham o contrato)
const pedidosAbertosEmCobranca = () =>
  new Set(estado.cobrancas.filter((c) => ["ABERTA", "EM_ANALISE", "PAGA"].includes(c.situacao)).flatMap((c) => c.pedidos.map((p) => p.numero)));
function reservado() {
  return estado.cobrancas.filter((c) => ["ABERTA", "EM_ANALISE", "PAGA"].includes(c.situacao)).reduce((s, c) => s + c.creditoCentavos, 0);
}
const cobravel = () => PEDIDOS.filter((p) => p.cobravel && !pedidosAbertosEmCobranca().has(p.numero));
const cobravelDe = (n) => PEDIDOS.find((p) => p.numero === n && p.cobravel);

function situacaoPagamento(c) {
  const f = estado.pagamento.get(c.id);
  if (c.situacao === "SUBSTITUIDA") return "SUBSTITUIDA";
  if (c.situacao === "CANCELADA") return "CANCELADA";
  if (f === "PAGA") return "PAGA";
  if (f === "BOLETO_CONFIRMED") return "PAGA_AGUARDANDO_CREDITO";
  if (f === "VENCIDA") return "VENCIDA";
  return c.situacao === "PAGA" ? "PAGA" : "AGUARDANDO";
}
function aplicarConfirmacao(c) {
  const f = estado.pagamento.get(c.id);
  if (f === "PAGA") c.situacao = "PAGA";
  if (f === "VENCIDA" && c.situacao === "ABERTA") c.situacao = "VENCIDA";
}
function novaCobranca(corpo, versaoAnterior) {
  const pedidos = [...new Set(Array.isArray(corpo.pedidos) ? corpo.pedidos.map(Number) : [])];
  if (pedidos.length === 0) return { erro: [422, "PEDIDO_NAO_COBRAVEL", "Informe ao menos um pedido."] };
  const jaEm = pedidosAbertosEmCobranca();
  const daVersao = new Set(versaoAnterior ? versaoAnterior.pedidos.map((p) => p.numero) : []);
  for (const n of pedidos) {
    const p = cobravelDe(n);
    if (!p || (jaEm.has(n) && !daVersao.has(n))) return { erro: [404, "PEDIDO_NAO_COBRAVEL", "Pedido não encontrado."] };
  }
  const bruto = pedidos.reduce((s, n) => s + cobravelDe(n).cobravel, 0);
  const credito = Number.isInteger(corpo.creditoCentavos) ? corpo.creditoCentavos : 0;
  const disponivel = CREDITO_ELEGIVEL - reservado() + (versaoAnterior ? versaoAnterior.creditoCentavos : 0);
  if (credito < 0 || credito > disponivel || credito > bruto) return { erro: [422, "CREDITO_INSUFICIENTE", "Crédito acima do disponível."] };
  const id = versaoAnterior ? versaoAnterior.id : estado.seq++;
  const c = {
    id,
    numero: versaoAnterior ? versaoAnterior.numero : `P-2026-${String(id - 1000000000).padStart(6, "0")}`,
    versao: versaoAnterior ? versaoAnterior.versao + 1 : 1,
    situacao: bruto - credito === 0 ? "PAGA" : "ABERTA",
    situacaoPagamento: bruto - credito === 0 ? "PAGA" : "AGUARDANDO",
    validade: "2026-11-05",
    pedidos: pedidos.map((n) => ({ numero: n, natureza: "ENTRADA", valorCentavos: cobravelDe(n).cobravel })),
    brutoCentavos: bruto, creditoCentavos: credito, liquidoCentavos: bruto - credito,
    forma: null, invoiceUrl: null, criadoEm: new Date().toISOString(),
  };
  return { c };
}
const cobrancaVigente = (id) => estado.cobrancas.filter((c) => c.id === id).at(-1);

// ------------------------------------------------------------------ servidor
async function portal(req, res, caminho, url) {
  const email = emailDoToken(req);
  if (!email) return erro(res, 401, null, "não autenticado");
  const { papel } = USUARIOS[email];
  const cap = CAP[papel];
  const m = (re) => re.exec(caminho);

  if (req.method === "GET" && caminho === "/me") {
    return enviar(res, 200, {
      ok: true, usuario: { email, papel }, capacidades: cap,
      cliente: { numero: 9001, razaoSocial: "Loja Teste Comércio Ltda", nomeFantasia: "Loja Teste", cnpj: "00.000.000/0001-00" },
    });
  }
  if (req.method === "GET" && caminho === "/pedidos") {
    const colunas = Object.keys(ROTULOS).map((id) => ({
      id, rotulo: ROTULOS[id], semFonte: SEM_FONTE.has(id), aviso: SEM_FONTE.has(id) ? "Ainda sem informação." : null,
      pedidos: PEDIDOS.filter((p) => colunaDe(p) === id).map((p) => ({
        numero: p.numero, oc: p.oc, emitidoEm: "2026-10-15", entregaPrevista: p.entrega,
        marca: coletaAtivaDoPedido(p.numero)?.situacao === "SOLICITADA" ? "COLETA SOLICITADA" : (p.marca ?? null),
        ...(cap.verValores ? { valorTotal: p.total.toFixed(2), saldoAPagar: p.marca ? "2560.00" : null } : {}),
      })),
    }));
    return enviar(res, 200, { ok: true, colunas, foraDoQuadro: 3 });
  }
  if (req.method === "GET" && (m(/^\/pedidos\/(\d+)$/))) {
    const p = PEDIDOS.find((x) => x.numero === Number(m(/^\/pedidos\/(\d+)$/)[1]));
    if (!p) return erro(res, 404, "NAO_ENCONTRADA", "não encontrado");
    return enviar(res, 200, {
      ok: true,
      cabecalho: { numero: p.numero, oc: p.oc, tipo: "VENDA", ambiente: null, emitidoEm: "2026-10-15" },
      situacao: { coluna: p.col, rotulo: ROTULOS[p.col], marca: p.marca ?? null, statusCanonico: "ABERTO", ...(cap.verValores ? { saldoAPagar: p.marca ? "2560.00" : null } : {}) },
      entrega: { data: p.entrega, origem: "PREVISTA" },
      linhaDoTempo: [
        { evento: "Pedido recebido", quando: "2026-10-15T13:00:00Z" },
        { evento: "Pedido aprovado", quando: "2026-10-16T14:30:00Z" },
        { evento: "Confirmação comercial", quando: "2026-10-19T09:10:00Z" },
      ],
      ...(cap.verValores ? { valores: {
        bruto: (p.total * 1.1).toFixed(2), desconto: { valor: (p.total * 0.1).toFixed(2), percentual: "10", derivado: false },
        produtos: p.total.toFixed(2), ipi: { valor: "0.00", percentual: "0", derivado: true }, total: p.total.toFixed(2),
        faturado: null, cancelado: null, saldo: p.marca ? "2560.00" : null } } : {}),
    });
  }

  // --- coletas (J664). Ver: todos os papéis. Agendar/remarcar/cancelar/slots/transportadoras: só com a capacidade `coleta`.
  const semColeta = () => erro(res, 403, null, "Seu papel no portal não permite agendar, remarcar ou cancelar coletas. Peça ao gestor da sua loja.");
  let rc;
  if (req.method === "GET" && caminho === "/coletas") return enviar(res, 200, { ok: true, coletas: estado.coletas.map(coletaTela) });
  if (req.method === "GET" && (rc = m(/^\/coletas\/(\d+)$/))) {
    const c = estado.coletas.find((x) => x.id === Number(rc[1]));
    return c ? enviar(res, 200, { ok: true, coleta: coletaTela(c), documentos: c.documentos }) : erro(res, 404, "nao_encontrada", "Coleta não encontrada.");
  }
  if (req.method === "GET" && (rc = m(/^\/coletas\/(\d+)\/documentos\/(\d+)$/))) {
    const c = estado.coletas.find((x) => x.id === Number(rc[1]));
    const d = c?.documentos.find((x) => x.id === Number(rc[2]));
    if (!d || d.automatico) return erro(res, 404, "nao_encontrada", "Documento não encontrado.");
    res.writeHead(200, { "Content-Type": d.contentType, "Content-Disposition": `attachment; filename="${d.nomeArquivo}"`, "Cache-Control": "private, no-store" });
    return res.end(PDF_SINTETICO);
  }
  if (req.method === "GET" && caminho === "/slots") {
    if (!cap.coleta) return semColeta();
    return enviar(res, 200, { ok: true, horizonteDias: 14, slots: estado.slots.filter((s) => s.data >= hojeMais(2) && s.vagas - s.ocupadas > 0).map(slotTela) });
  }
  if (req.method === "GET" && caminho === "/transportadoras") {
    return cap.coleta ? enviar(res, 200, { ok: true, itens: TRANSPORTADORAS }) : semColeta();
  }

  // --- cobrança: só com a capacidade `cobranca`
  const ehCobranca = caminho === "/cobravel" || caminho === "/creditos" || caminho.startsWith("/cobrancas");
  if (ehCobranca && !cap.cobranca) return erro(res, 403, "SEM_PERMISSAO", "Seu perfil não tem acesso à cobrança.");

  if (req.method === "GET" && caminho === "/cobravel") {
    return enviar(res, 200, {
      ok: true,
      pedidos: cobravel().map((p) => ({ numero: p.numero, oc: p.oc, natureza: "ENTRADA", valorCentavos: p.cobravel, valorFinalCentavos: p.cobravel, entregaPrevista: p.entrega })),
      credito: { elegivelCentavos: CREDITO_ELEGIVEL, reservadoCentavos: reservado(), disponivelCentavos: CREDITO_ELEGIVEL - reservado() },
    });
  }
  if (req.method === "GET" && caminho === "/cobrancas") {
    const vigentes = [...new Set(estado.cobrancas.map((c) => c.id))].map(cobrancaVigente);
    vigentes.forEach(aplicarConfirmacao);
    return enviar(res, 200, { ok: true, disponivel: true, itens: vigentes.slice().reverse().map((c) => ({ ...c, situacaoPagamento: situacaoPagamento(c) })), aviso: null });
  }
  let r;
  if (req.method === "GET" && (r = m(/^\/cobrancas\/(\d+)$/))) {
    const c = cobrancaVigente(Number(r[1]));
    if (!c) return erro(res, 404, "NAO_ENCONTRADA", "Cobrança não encontrada.");
    aplicarConfirmacao(c);
    return enviar(res, 200, {
      ok: true, cobranca: { ...c, situacaoPagamento: situacaoPagamento(c) },
      gateway: c.forma ? { forma: c.forma, situacao: situacaoPagamento(c), situacaoGateway: "PENDING", invoiceUrl: c.invoiceUrl, pagoEm: null } : null,
      versoes: estado.cobrancas.filter((x) => x.id === c.id).map((x) => ({
        versao: x.versao, situacao: x.situacao, validade: x.validade, brutoCentavos: x.brutoCentavos, creditoCentavos: x.creditoCentavos,
        liquidoCentavos: x.liquidoCentavos, pedidos: x.pedidos.map((p) => p.numero), criadoEm: x.criadoEm, criadoPor: email, fim: null })),
    });
  }
  if (req.method === "GET" && (r = m(/^\/cobrancas\/(\d+)\/situacao$/))) {
    const c = cobrancaVigente(Number(r[1]));
    if (!c) return erro(res, 404, "NAO_ENCONTRADA", "Cobrança não encontrada.");
    aplicarConfirmacao(c);
    return enviar(res, 200, { ok: true, cobrancaId: c.id, numero: c.numero, versao: c.versao, situacao: situacaoPagamento(c), situacaoCobranca: c.situacao, forma: c.forma, liquidoCentavos: c.liquidoCentavos, validade: c.validade, pagoEm: null });
  }

  if (req.method === "POST") {
    const chave = req.headers["idempotency-key"];
    if (typeof chave !== "string" || !/^[A-Za-z0-9_.:-]{8,200}$/.test(chave)) return erro(res, 400, "IDEMPOTENCY_KEY", "Idempotency-Key obrigatório.");
    const corpo = await lerCorpo(req);
    if (corpo === null) return erro(res, 400, "CORPO", "JSON inválido.");
    const assinatura = createHash("sha256").update(`${email}|${caminho}|${JSON.stringify(corpo)}`).digest("hex");
    const guardado = estado.idem.get(`${email}|${chave}`);
    if (guardado) {
      if (guardado.assinatura !== assinatura) return erro(res, 422, "IDEMPOTENCIA_CONFLITO", "Chave usada com outro corpo.");
      return enviar(res, guardado.status, guardado.corpo, { "idempotent-replayed": "true" });
    }
    const responder = (status, corpoResp) => {
      if (status < 500) estado.idem.set(`${email}|${chave}`, { assinatura, status, corpo: corpoResp });
      return enviar(res, status, corpoResp);
    };

    // --- coletas (J664)
    if (caminho === "/coletas" || /^\/coletas\/\d+\/(remarcar|cancelar)$/.test(caminho)) {
      if (!cap.coleta) return responder(403, { ok: false, erro: "Seu papel no portal não permite agendar, remarcar ou cancelar coletas. Peça ao gestor da sua loja." });
      const falha = (status, codigo, msg) => responder(status, { ok: false, codigo, erro: msg });
      const ocupar = (slot) => { slot.ocupadas += 1; };
      const devolver = (slot) => { slot.ocupadas = Math.max(0, slot.ocupadas - 1); };
      if (caminho === "/coletas") {
        const slot = slotPorId(Number(corpo.slotId));
        if (!slot) return falha(404, "slot_fechado", "Este horário não está mais disponível. Escolha outro.");
        if (slot.data < hojeMais(2)) return falha(409, "dentro_da_antecedencia", "Escolha um horário com pelo menos 24 horas de antecedência.");
        if (slot.vagas - slot.ocupadas <= 0) return falha(409, "sem_vaga", "Este horário acabou de ficar sem vaga. Escolha outro.");
        const pedidos = [...new Set(Array.isArray(corpo.pedidos) ? corpo.pedidos.map(Number) : [])];
        for (const n of pedidos) {
          const ped = PEDIDOS.find((x) => x.numero === n);
          if (!ped) return falha(404, "pedido_nao_encontrado", `Pedido ${n} não encontrado.`);
          if (coletaAtivaDoPedido(n)) return falha(409, "pedido_em_outra_coleta", `O pedido ${n} já está em outra coleta.`);
          if (colunaDe(ped) !== "AGUARDANDO_COLETA") return falha(422, "pedido_inelegivel", `O pedido ${n} ainda não está pronto para coleta.`);
        }
        if (pedidos.length === 0) return falha(422, "pedido_inelegivel", "Informe ao menos um pedido.");
        let quem;
        if (corpo.quemBusca?.transportadoraCodigo) {
          const t = TRANSPORTADORAS.find((x) => x.id === corpo.quemBusca.transportadoraCodigo);
          if (!t) return falha(422, "transportadora_invalida", "Escolha uma transportadora da lista.");
          quem = { tipo: "TRANSPORTADORA", codigo: t.id, nome: t.nome };
        } else if (corpo.quemBusca?.veiculo) {
          const placa = corpo.quemBusca.veiculo.placa ?? null;
          if (placa !== null && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return falha(422, "placa_invalida", "Placa inválida. Confira e tente de novo.");
          quem = { tipo: "VEICULO_PROPRIO", placa, motorista: corpo.quemBusca.veiculo.motorista ?? null };
        } else return falha(422, "transportadora_invalida", "Informe quem busca.");
        ocupar(slot);
        const agora = new Date().toISOString();
        const c = { id: ++estado.seqColeta, situacao: "SOLICITADA", slot: slotTela(slot), quemBusca: quem, observacao: corpo.observacao ?? null, motivo: null, pedidos, solicitadaEm: agora, confirmadaEm: null, despachadaEm: null, documentos: [] };
        estado.coletas.push(c);
        return responder(201, { ok: true, coletaId: c.id, situacao: c.situacao });
      }
      const [, idTxt, acao] = /^\/coletas\/(\d+)\/(remarcar|cancelar)$/.exec(caminho);
      const c = estado.coletas.find((x) => x.id === Number(idTxt));
      if (!c) return falha(404, "nao_encontrada", "Coleta não encontrada.");
      if (!["SOLICITADA", "AGENDADA"].includes(c.situacao)) return falha(409, "situacao_nao_permite", "Esta coleta não pode mais ser alterada.");
      if (!dentroDaJanela(c)) return falha(409, "dentro_da_antecedencia", "Faltam menos de 24 horas para esta coleta. Para alterar, fale com a logística da Mowig.");
      if (acao === "cancelar") {
        devolver(slotPorId(c.slot.id));
        c.situacao = "CANCELADA";
        c.motivo = corpo.motivo ?? null;
        return responder(200, { ok: true, situacao: c.situacao });
      }
      const novo = slotPorId(Number(corpo.slotId));
      if (!novo || novo.data < hojeMais(2)) return falha(409, "slot_fechado", "Este horário não está mais disponível. Escolha outro.");
      if (novo.vagas - novo.ocupadas <= 0) return falha(409, "sem_vaga", "Este horário acabou de ficar sem vaga. Escolha outro.");
      devolver(slotPorId(c.slot.id));
      ocupar(novo);
      c.slot = slotTela(novo);
      c.situacao = "SOLICITADA"; // remarcar pelo lojista volta a SOLICITADA (a logística confirma de novo)
      c.confirmadaEm = null;
      return responder(200, { ok: true, situacao: c.situacao, slotId: novo.id });
    }

    if (caminho === "/cobrancas") {
      const { c, erro: e } = novaCobranca(corpo, null);
      if (e) return responder(e[0], { ok: false, codigo: e[1], erro: e[2] });
      estado.cobrancas.push(c);
      return responder(201, { ok: true, ...c });
    }
    if ((r = m(/^\/cobrancas\/(\d+)\/versoes$/))) {
      const atual = cobrancaVigente(Number(r[1]));
      if (!atual) return responder(404, { ok: false, codigo: "NAO_ENCONTRADA", erro: "Cobrança não encontrada." });
      const { c, erro: e } = novaCobranca(corpo, atual);
      if (e) return responder(e[0], { ok: false, codigo: e[1], erro: e[2] });
      atual.situacao = "SUBSTITUIDA";
      estado.pagamento.delete(atual.id);
      estado.cobrancas.push(c);
      return responder(201, { ok: true, ...c });
    }
    if ((r = m(/^\/cobrancas\/(\d+)\/pagar$/))) {
      const c = cobrancaVigente(Number(r[1]));
      if (!c) return responder(404, { ok: false, codigo: "NAO_ENCONTRADA", erro: "Cobrança não encontrada." });
      if (!["PIX", "BOLETO"].includes(corpo.forma)) return responder(400, { ok: false, codigo: "FORMA", erro: "Forma inválida." });
      if (c.forma && c.forma !== corpo.forma) return responder(409, { ok: false, codigo: "FORMA_DIFERENTE", erro: "Forma diferente." });
      c.forma = corpo.forma;
      c.invoiceUrl = `https://sandbox.exemplo.test/i/${c.id}`;
      const base = { ok: true, cobrancaId: c.id, numero: c.numero, versao: c.versao, forma: c.forma, situacao: "AGUARDANDO", liquidoCentavos: c.liquidoCentavos, validade: c.validade, invoiceUrl: c.invoiceUrl, aviso: null };
      return responder(200, corpo.forma === "PIX"
        ? { ...base, pix: { copiaECola: `00020126580014br.gov.bcb.pix0136sintetico-${c.id}-5204000053039865802BR5909LOJATESTE6009SAO PAULO62070503***6304ABCD`, qrCodeBase64: QR_BASE64, expiraEm: "2026-11-05T23:59:00Z" }, boleto: null }
        : { ...base, pix: null, boleto: { linhaDigitavel: `00190.00009 01234.567890 12345.678901 1 9999${String(c.liquidoCentavos).padStart(10, "0")}`, pdfUrl: `https://sandbox.exemplo.test/boleto/${c.id}.pdf` } });
    }
  }
  return erro(res, 404, "NAO_ENCONTRADA", "rota inexistente");
}

createServer(async (req, res) => {
  cors(res, req);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  const p = url.pathname;

  // controle dos testes
  if (p === "/__test/reset" && req.method === "POST") { zerar(); return enviar(res, 200, { ok: true }); }
  if (p === "/__test/confirmar" && req.method === "POST") {
    estado.pagamento.set(Number(url.searchParams.get("id")), url.searchParams.get("como"));
    return enviar(res, 200, { ok: true });
  }
  if (p === "/__test/ocupar" && req.method === "POST") {
    const slot = slotPorId(Number(url.searchParams.get("slot")));
    if (slot) slot.ocupadas = slot.vagas;
    return enviar(res, 200, { ok: true });
  }
  if (p === "/__test/saude") return enviar(res, 200, { ok: true });

  // Supabase Auth (mínimo)
  if (p === "/auth/v1/token" && req.method === "POST") {
    const corpo = (await lerCorpo(req)) ?? {};
    const tipo = url.searchParams.get("grant_type");
    if (tipo === "password") {
      const email = String(corpo.email ?? "").toLowerCase();
      if (USUARIOS[email] && corpo.password === SENHA_OK) return enviar(res, 200, sessaoDe(email));
      return enviar(res, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (tipo === "refresh_token") {
      const alvo = String(corpo.refresh_token ?? "").includes("consulta") ? "consulta@loja-teste.example" : "gestor@loja-teste.example";
      return enviar(res, 200, sessaoDe(alvo));
    }
  }
  if (p === "/auth/v1/user") {
    const email = emailDoToken(req);
    return email ? enviar(res, 200, sessaoDe(email).user) : enviar(res, 401, { msg: "invalid JWT" });
  }
  if (p === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  if (p === "/auth/v1/recover") return enviar(res, 200, {});

  if (p.startsWith("/v1/portal")) return portal(req, res, p.slice("/v1/portal".length), url);

  return enviar(res, 404, { ok: false, erro: "fake: rota desconhecida", caminho: p });
}).listen(PORTA, "127.0.0.1", () => console.log(`[servidor-fake] http://127.0.0.1:${PORTA}`));
