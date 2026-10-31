// Portal Mowig (J661) — componentes: quadro, cobranças, pagamento. API em dublê; Link do router substituído por <a>.
// Dados 100% sintéticos (repo público, POR-H11).
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search, children, ...resto }: Record<string, unknown> & { children?: ReactNode }) => {
    let href = String(to);
    for (const [k, v] of Object.entries((params ?? {}) as Record<string, string>)) href = href.replace(`$${k}`, v);
    if (search) href += `?${new URLSearchParams(search as Record<string, string>).toString()}`;
    return (
      <a href={href} {...(resto as object)}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signOut: vi.fn(async () => {}) }) }));

import { PortalApiProvider, PortalMeProvider } from "@/components/portal/PortalCasca";
import { QuadroPedidos } from "@/components/portal/Quadro";
import { CobrancasPagina } from "@/components/portal/CobrancasPagina";
import { PagamentoPagina, urlSegura } from "@/components/portal/PagamentoPagina";
import { UsuarioPagina } from "@/components/portal/UsuarioPagina";
import {
  COLUNAS_QUADRO,
  type Cobranca,
  type CapacidadesPortal,
  type PortalApi,
  type PortalMe,
  type Quadro,
} from "@/lib/portal-api";

const norm = (s: string | null) => (s ?? "").replace(/ /g, " ");

const CAP_GESTOR: CapacidadesPortal = { verValores: true, cobranca: true, implantar: false, gerirLoja: true };
const CAP_CONSULTA: CapacidadesPortal = { verValores: false, cobranca: false, implantar: false, gerirLoja: false };

function meCom(capacidades: CapacidadesPortal, papel: PortalMe["usuario"]["papel"] = "GESTOR"): PortalMe {
  return {
    ok: true,
    usuario: { email: "gestor@loja-teste.example", papel },
    capacidades,
    cliente: { numero: 9001, razaoSocial: "Loja Teste Ltda", nomeFantasia: "Loja Teste", cnpj: "00.000.000/0001-00" },
  };
}

function quadroDe(comValores: boolean): Quadro {
  const cartao = (numero: number, extra = {}) => ({
    numero,
    oc: `OC-${numero}`,
    emitidoEm: "2026-10-01",
    entregaPrevista: "2026-11-20",
    marca: null,
    ...(comValores ? { valorTotal: "1500.00", saldoAPagar: null } : {}),
    ...extra,
  });
  return {
    ok: true,
    foraDoQuadro: 2,
    colunas: COLUNAS_QUADRO.map((id) => ({
      id,
      rotulo: id.replace(/_/g, " "),
      semFonte: id === "COLETA_AGENDADA",
      aviso: null,
      pedidos:
        id === "AGUARDANDO_LIBERACAO_FINANCEIRA"
          ? [cartao(101), cartao(102)]
          : id === "FINALIZADOS"
            ? [cartao(103, { marca: "SALDO A PAGAR" })]
            : [],
    })),
  };
}

function cobrancaDe(p: Partial<Cobranca> = {}): Cobranca {
  return {
    id: 1000000001,
    numero: "P-2026-000001",
    versao: 1,
    situacao: "ABERTA",
    situacaoPagamento: "AGUARDANDO",
    validade: "2026-11-05",
    pedidos: [{ numero: 101, natureza: "ENTRADA", valorCentavos: 100000 }],
    brutoCentavos: 100000,
    creditoCentavos: 0,
    liquidoCentavos: 100000,
    forma: null,
    invoiceUrl: null,
    criadoEm: "2026-10-31T12:00:00Z",
    ...p,
  };
}

function apiDuble(sobrescritas: Partial<PortalApi> = {}): PortalApi {
  return {
    me: vi.fn(async () => meCom(CAP_GESTOR)),
    quadro: vi.fn(async () => quadroDe(true)),
    pedido: vi.fn(),
    cobrancas: vi.fn(async () => ({ ok: true as const, disponivel: true, itens: [], aviso: null })),
    cobravel: vi.fn(async () => ({
      ok: true as const,
      pedidos: [
        { numero: 101, oc: "OC-101", natureza: "ENTRADA" as const, valorCentavos: 100000, valorFinalCentavos: 100000, entregaPrevista: "2026-11-20" },
        { numero: 102, oc: null, natureza: "ENTRADA" as const, valorCentavos: 50050, valorFinalCentavos: 50050, entregaPrevista: null },
      ],
      credito: { elegivelCentavos: 30000, reservadoCentavos: 0, disponivelCentavos: 30000 },
    })),
    cobranca: vi.fn(),
    situacao: vi.fn(),
    criarCobranca: vi.fn(async () => cobrancaDe()),
    novaVersao: vi.fn(async () => cobrancaDe({ versao: 2 })),
    pagar: vi.fn(),
    ...sobrescritas,
  } as PortalApi;
}

function montar(ui: ReactNode, api: PortalApi, me: PortalMe = meCom(CAP_GESTOR)) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortalApiProvider api={api}>
        <PortalMeProvider me={me}>{ui}</PortalMeProvider>
      </PortalApiProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

async function abrirMontagem() {
  const botao = (await screen.findByRole("button", { name: /^montar cobrança$/i })) as HTMLButtonElement;
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
}

describe("Quadro de 7 colunas", () => {
  it("mostra as 7 colunas na mesma tela, com contagem e cartões", () => {
    render(<QuadroPedidos quadro={quadroDe(true)} capacidades={CAP_GESTOR} />);
    const quadro = screen.getByTestId("quadro");
    expect(within(quadro).getAllByRole("heading", { level: 3 })).toHaveLength(7);
    const fin = screen.getByTestId("coluna-AGUARDANDO_LIBERACAO_FINANCEIRA");
    expect(within(fin).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("coluna-COLETA_AGENDADA").textContent).toContain("Em breve");
    expect(screen.getByTestId("coluna-EM_PRODUCAO").textContent).toContain("Nenhum pedido");
  });

  it("com Ver valores mostra o valor em R$; sem, o campo não existe na tela", () => {
    const { unmount } = render(<QuadroPedidos quadro={quadroDe(true)} capacidades={CAP_GESTOR} />);
    expect(norm(screen.getByTestId("pedido-101").textContent)).toContain("R$ 1.500,00");
    unmount();
    render(<QuadroPedidos quadro={quadroDe(false)} capacidades={CAP_CONSULTA} />);
    expect(screen.getByTestId("pedido-101").textContent).not.toMatch(/R\$|Valor/);
  });

  it("botão Pagar só para quem tem cobrança e só na coluna AGUARDANDO LIBERAÇÃO FINANCEIRA", () => {
    const { unmount } = render(<QuadroPedidos quadro={quadroDe(true)} capacidades={CAP_GESTOR} />);
    const pagar = within(screen.getByTestId("pedido-101")).getByRole("link", { name: "Pagar" });
    expect(pagar.getAttribute("href")).toBe("/portal/cobrancas?pedido=101");
    // pedido finalizado não tem Pagar, só Ver
    expect(within(screen.getByTestId("pedido-103")).queryByRole("link", { name: "Pagar" })).toBeNull();
    expect(within(screen.getByTestId("pedido-103")).getByRole("link", { name: "Ver" })).toBeTruthy();
    expect(within(screen.getByTestId("pedido-103")).getByText("SALDO A PAGAR")).toBeTruthy();
    unmount();
    render(<QuadroPedidos quadro={quadroDe(false)} capacidades={CAP_CONSULTA} />);
    expect(screen.queryByRole("link", { name: "Pagar" })).toBeNull();
  });
});

describe("Cobranças", () => {
  it("papel sem a capacidade cobranca vê o aviso e nada de ação", () => {
    const api = apiDuble();
    montar(<CobrancasPagina />, api, meCom(CAP_CONSULTA, "CONSULTA"));
    expect(screen.getByText(/não tem acesso às cobranças/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /montar cobrança/i })).toBeNull();
    expect(api.cobrancas).not.toHaveBeenCalled();
  });

  it("monta a cobrança: total líquido, crédito e corpo enviado só com pedidos + creditoCentavos", async () => {
    const api = apiDuble();
    montar(<CobrancasPagina />, api);
    await abrirMontagem();
    fireEvent.click(await screen.findByRole("checkbox", { name: /101/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /102/ }));
    expect(norm(screen.getByTestId("total-liquido").textContent)).toBe("R$ 1.500,50");
    fireEvent.change(screen.getByLabelText(/crédito a usar/i), { target: { value: "100,50" } });
    expect(norm(screen.getByTestId("total-liquido").textContent)).toBe("R$ 1.400,00");
    fireEvent.click(screen.getByRole("button", { name: /criar cobrança/i }));
    await waitFor(() => expect(api.criarCobranca).toHaveBeenCalledTimes(1));
    const [corpo, chave] = (api.criarCobranca as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(corpo).toEqual({ pedidos: [101, 102], creditoCentavos: 10050 });
    expect(chave).toMatch(/^[A-Za-z0-9_.:-]{8,200}$/);
    expect(await screen.findByText(/P-2026-000001 criada/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /pagar agora/i })).toBeTruthy();
  });

  it("crédito maior que o disponível bloqueia o envio com mensagem", async () => {
    const api = apiDuble();
    montar(<CobrancasPagina />, api);
    await abrirMontagem();
    fireEvent.click(await screen.findByRole("checkbox", { name: /101/ }));
    fireEvent.change(screen.getByLabelText(/crédito a usar/i), { target: { value: "300,01" } });
    expect(screen.getByRole("alert").textContent).toMatch(/crédito disponível é R\$\s*300,00/);
    expect((screen.getByRole("button", { name: /criar cobrança/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/crédito a usar/i), { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: /criar cobrança/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.criarCobranca).not.toHaveBeenCalled();
  });

  it("sem pedido marcado o botão de criar fica desabilitado", async () => {
    montar(<CobrancasPagina />, apiDuble());
    await abrirMontagem();
    await screen.findByRole("checkbox", { name: /101/ });
    expect((screen.getByRole("button", { name: /criar cobrança/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("repetir após falha reaproveita a mesma Idempotency-Key; mudar o conteúdo gera outra", async () => {
    const criar = vi
      .fn()
      .mockRejectedValueOnce(new Error("rede"))
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValue(cobrancaDe());
    montar(<CobrancasPagina />, apiDuble({ criarCobranca: criar }));
    await abrirMontagem();
    fireEvent.click(await screen.findByRole("checkbox", { name: /101/ }));
    const enviar = () => fireEvent.click(screen.getByRole("button", { name: /criar cobrança/i }));
    enviar();
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    await screen.findByText(/não foi possível concluir/i);
    enviar();
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(2));
    expect(criar.mock.calls[1][1]).toBe(criar.mock.calls[0][1]);
    await screen.findByText(/não foi possível concluir/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /102/ }));
    enviar();
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(3));
    expect(criar.mock.calls[2][1]).not.toBe(criar.mock.calls[0][1]);
  });

  it("vindo do botão Pagar do quadro, abre a montagem com o pedido já marcado", async () => {
    montar(<CobrancasPagina pedidoInicial={102} />, apiDuble());
    const cb = (await screen.findByRole("checkbox", { name: /102/ })) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /101/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("lista: PAGAR só em ABERTA com valor; ALTERAR só em versões editáveis", async () => {
    const itens = [
      cobrancaDe({ id: 1, numero: "P-1", situacao: "ABERTA" }),
      cobrancaDe({ id: 2, numero: "P-2", situacao: "PAGA", liquidoCentavos: 0 }),
      cobrancaDe({ id: 3, numero: "P-3", situacao: "VENCIDA" }),
    ];
    montar(<CobrancasPagina />, apiDuble({ cobrancas: vi.fn(async () => ({ ok: true as const, disponivel: true, itens, aviso: null })) }));
    const l1 = await screen.findByTestId("cobranca-1");
    expect(within(l1).getByRole("link", { name: "Pagar" }).getAttribute("href")).toBe("/portal/pagamento/1");
    expect(within(l1).getByRole("button", { name: "Alterar" })).toBeTruthy();
    const l2 = screen.getByTestId("cobranca-2");
    expect(within(l2).queryByRole("link", { name: "Pagar" })).toBeNull();
    expect(within(l2).queryByRole("button", { name: "Alterar" })).toBeNull();
    const l3 = screen.getByTestId("cobranca-3");
    expect(within(l3).queryByRole("link", { name: "Pagar" })).toBeNull();
    expect(within(l3).getByRole("button", { name: "Alterar" })).toBeTruthy();
  });

  it("nova versão envia a composição COMPLETA para /versoes da cobrança", async () => {
    const itens = [cobrancaDe({ id: 55, numero: "P-55", pedidos: [{ numero: 101, natureza: "ENTRADA", valorCentavos: 100000 }] })];
    const api = apiDuble({ cobrancas: vi.fn(async () => ({ ok: true as const, disponivel: true, itens, aviso: null })) });
    montar(<CobrancasPagina />, api);
    fireEvent.click(await screen.findByRole("button", { name: "Alterar" }));
    expect((await screen.findByRole("checkbox", { name: /101/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /102/ }));
    fireEvent.click(screen.getByRole("button", { name: /criar nova versão/i }));
    await waitFor(() => expect(api.novaVersao).toHaveBeenCalledTimes(1));
    const [id, corpo] = (api.novaVersao as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe(55);
    expect(corpo).toEqual({ pedidos: [101, 102] });
  });

  it("módulo indisponível (disponivel:false) mostra o aviso da API", async () => {
    montar(
      <CobrancasPagina />,
      apiDuble({ cobrancas: vi.fn(async () => ({ ok: true as const, disponivel: false, itens: [], aviso: "Em breve." })) }),
    );
    expect(await screen.findByText("Em breve.")).toBeTruthy();
  });
});

describe("Pagamento", () => {
  const detalhe = (c: Cobranca, forma: "PIX" | "BOLETO" | null = null) => ({
    ok: true as const,
    cobranca: c,
    gateway: forma ? { forma, situacao: "AGUARDANDO", situacaoGateway: "PENDING", invoiceUrl: null, pagoEm: null } : null,
    versoes: [],
  });
  const situacao = (s: string) => ({
    ok: true as const,
    cobrancaId: 1,
    numero: "P-2026-000001",
    versao: 1,
    situacao: s as never,
    situacaoCobranca: "ABERTA" as const,
    forma: "PIX" as const,
    liquidoCentavos: 100000,
    validade: null,
    pagoEm: null,
  });
  const pix = {
    ok: true as const,
    cobrancaId: 1,
    numero: "P-2026-000001",
    versao: 1,
    forma: "PIX" as const,
    situacao: "AGUARDANDO" as const,
    liquidoCentavos: 100000,
    validade: null,
    invoiceUrl: "https://sandbox.exemplo.test/i/abc",
    pix: { copiaECola: "00020126PIX-SINTETICO-0000", qrCodeBase64: "iVBORw0KGgo=", expiraEm: null },
    boleto: null,
    aviso: null,
  };

  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
  });

  it("escolhe PIX, mostra QR + código e COPIAR CÓDIGO copia o código", async () => {
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe())),
      situacao: vi.fn(async () => situacao("AGUARDANDO")),
      pagar: vi.fn(async () => pix),
    });
    montar(<PagamentoPagina id={1} />, api);
    fireEvent.click(await screen.findByRole("button", { name: /pagar com pix/i }));
    expect((await screen.findByTestId("codigo-pix")).textContent).toBe("00020126PIX-SINTETICO-0000");
    expect(screen.getByAltText("QR Code do PIX").getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect((api.pagar as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("PIX");
    fireEvent.click(screen.getByRole("button", { name: /copiar código/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("00020126PIX-SINTETICO-0000"));
    expect(await screen.findByText("Código copiado.")).toBeTruthy();
    // ainda aguardando: nenhuma mensagem de sucesso
    expect(screen.queryByText(/pagamento confirmado/i)).toBeNull();
  });

  it("boleto mostra a linha digitável e BAIXAR BOLETO; link http é descartado", async () => {
    const boleto = (pdfUrl: string) => ({
      ...pix,
      forma: "BOLETO" as const,
      pix: null,
      boleto: { linhaDigitavel: "00190.00009 01234.567890 12345.678901 1 99990000100000", pdfUrl },
    });
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe())),
      situacao: vi.fn(async () => situacao("AGUARDANDO")),
      pagar: vi.fn(async () => boleto("https://sandbox.exemplo.test/boleto.pdf")),
    });
    const { unmount } = montar(<PagamentoPagina id={1} />, api);
    fireEvent.click(await screen.findByRole("button", { name: /pagar com boleto/i }));
    expect((await screen.findByTestId("linha-digitavel")).textContent).toContain("00190.00009");
    const baixar = screen.getByRole("link", { name: /baixar boleto/i });
    expect(baixar.getAttribute("href")).toBe("https://sandbox.exemplo.test/boleto.pdf");
    expect(baixar.getAttribute("rel")).toContain("noopener");
    unmount();
    const ruim = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe())),
      situacao: vi.fn(async () => situacao("AGUARDANDO")),
      pagar: vi.fn(async () => boleto("javascript:alert(1)")),
    });
    montar(<PagamentoPagina id={1} />, ruim);
    fireEvent.click(await screen.findByRole("button", { name: /pagar com boleto/i }));
    await screen.findByTestId("linha-digitavel");
    expect(screen.queryByRole("link", { name: /baixar boleto/i })).toBeNull();
  });

  it("consulta a situação a cada 10 s e só mostra sucesso quando a API diz PAGA (e para de consultar)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sit = vi
      .fn()
      .mockResolvedValueOnce(situacao("AGUARDANDO"))
      .mockResolvedValueOnce(situacao("AGUARDANDO"))
      .mockResolvedValue(situacao("PAGA"));
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe(), "PIX")),
      situacao: sit,
      pagar: vi.fn(async () => pix),
    });
    montar(<PagamentoPagina id={1} />, api);
    await screen.findByTestId("codigo-pix");
    await waitFor(() => expect(sit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/pagamento confirmado/i)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(sit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/pagamento confirmado/i)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(await screen.findByText(/pagamento confirmado/i)).toBeTruthy();
    const n = sit.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(sit.mock.calls.length).toBe(n); // terminal: parou de consultar
  });

  it("boleto CONFIRMED (PAGA_AGUARDANDO_CREDITO) NÃO é sucesso: pedidos ainda não liberados", async () => {
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe(), "BOLETO")),
      situacao: vi.fn(async () => situacao("PAGA_AGUARDANDO_CREDITO")),
      pagar: vi.fn(async () => ({ ...pix, forma: "BOLETO" as const, pix: null, boleto: { linhaDigitavel: "123", pdfUrl: null } })),
    });
    montar(<PagamentoPagina id={1} />, api);
    expect(await screen.findByText(/recebemos a confirmação do boleto/i)).toBeTruthy();
    expect(screen.queryByText(/pagamento confirmado/i)).toBeNull();
    expect(screen.queryByText(/pedidos foram liberados/i)).toBeNull();
  });

  it("cobrança vencida orienta a nova versão e não oferece pagar", async () => {
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe({ situacao: "VENCIDA" }))),
      situacao: vi.fn(async () => situacao("VENCIDA")),
    });
    montar(<PagamentoPagina id={1} />, api);
    expect(await screen.findByText(/esta cobrança venceu/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /pagar com/i })).toBeNull();
  });

  it("recarregar com pagamento já emitido recupera o QR pelo mesmo POST idempotente", async () => {
    const api = apiDuble({
      cobranca: vi.fn(async () => detalhe(cobrancaDe(), "PIX")),
      situacao: vi.fn(async () => situacao("AGUARDANDO")),
      pagar: vi.fn(async () => pix),
    });
    montar(<PagamentoPagina id={1} />, api);
    expect(await screen.findByTestId("codigo-pix")).toBeTruthy();
    expect(api.pagar).toHaveBeenCalledTimes(1);
    expect((api.pagar as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("PIX");
    expect(screen.queryByRole("button", { name: /pagar com pix/i })).toBeNull();
  });

  it("erro ao gerar o pagamento mostra mensagem humana e permite tentar de novo", async () => {
    const { PortalApiErro } = await import("@/lib/portal-api");
    const pagar = vi
      .fn()
      .mockRejectedValueOnce(new PortalApiErro(503, "PAGAMENTO_INDISPONIVEL", "x"))
      .mockResolvedValue(pix);
    montar(
      <PagamentoPagina id={1} />,
      apiDuble({ cobranca: vi.fn(async () => detalhe(cobrancaDe())), situacao: vi.fn(async () => situacao("AGUARDANDO")), pagar }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /pagar com pix/i }));
    expect(await screen.findByText(/indisponível no momento/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByTestId("codigo-pix")).toBeTruthy();
    expect(pagar.mock.calls[1][2]).toBe(pagar.mock.calls[0][2]); // mesma chave no reenvio
  });

  it("urlSegura só aceita https", () => {
    expect(urlSegura("https://a.example/x")).toBe("https://a.example/x");
    expect(urlSegura("http://a.example/x")).toBeNull();
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("data:text/html,<b>")).toBeNull();
    expect(urlSegura(null)).toBeNull();
    expect(urlSegura("não é url")).toBeNull();
  });
});

describe("Usuário", () => {
  it("mostra a loja, o papel e o aviso de gestão só para quem gere a loja", () => {
    const { unmount } = montar(<UsuarioPagina />, apiDuble(), meCom(CAP_GESTOR, "GESTOR"));
    expect(screen.getByText("Loja Teste Ltda")).toBeTruthy();
    expect(screen.getByText("Gestor")).toBeTruthy();
    expect(screen.getByText(/fale com a mowig/i)).toBeTruthy();
    unmount();
    montar(<UsuarioPagina />, apiDuble(), meCom(CAP_CONSULTA, "CONSULTA"));
    expect(screen.getByText("Consulta")).toBeTruthy();
    expect(screen.queryByText(/incluir ou excluir usuários/i)).toBeNull();
  });
});
