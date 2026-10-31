// Portal Mowig (J661) — cliente da API e regras de apresentação. Dados sintéticos.
import { describe, it, expect, vi } from "vitest";
import {
  brlDeCentavos,
  brlDeTexto,
  centavosDeEntrada,
  criarPortalApi,
  dataBr,
  mensagemDeErro,
  novaChaveIdempotencia,
  podeNovaVersao,
  podePagar,
  PortalApiErro,
  previaTotais,
  situacaoTerminal,
  tomDaSituacao,
} from "@/lib/portal-api";

const norm = (s: string) => s.replace(/ /g, " ");

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

describe("dinheiro", () => {
  it("formata centavos e reais em texto no padrão brasileiro", () => {
    expect(norm(brlDeCentavos(123456))).toBe("R$ 1.234,56");
    expect(norm(brlDeCentavos(0))).toBe("R$ 0,00");
    expect(norm(brlDeTexto("1234.50"))).toBe("R$ 1.234,50");
    expect(brlDeTexto(null)).toBe("—");
    expect(brlDeTexto("abc")).toBe("—");
  });

  it("centavosDeEntrada converte sem ponto flutuante e rejeita lixo", () => {
    expect(centavosDeEntrada("")).toBe(0);
    expect(centavosDeEntrada("150")).toBe(15000);
    expect(centavosDeEntrada("150,5")).toBe(15050);
    expect(centavosDeEntrada("1.234,56")).toBe(123456);
    expect(centavosDeEntrada("R$ 10,00")).toBe(1000);
    expect(centavosDeEntrada("0,07")).toBe(7);
    expect(centavosDeEntrada("19,99")).toBe(1999); // 19.99*100 = 1998.999… em float
    expect(centavosDeEntrada("-5")).toBeNull();
    expect(centavosDeEntrada("1,234")).toBeNull();
    expect(centavosDeEntrada("12a")).toBeNull();
    expect(centavosDeEntrada("1.23")).toBeNull();
  });

  it("previaTotais limita o crédito ao bruto e nunca deixa líquido negativo", () => {
    const pedidos = [{ valorCentavos: 10000 }, { valorCentavos: 5050 }];
    expect(previaTotais(pedidos, 0)).toEqual({ brutoCentavos: 15050, creditoCentavos: 0, liquidoCentavos: 15050 });
    expect(previaTotais(pedidos, 5000)).toEqual({ brutoCentavos: 15050, creditoCentavos: 5000, liquidoCentavos: 10050 });
    expect(previaTotais(pedidos, 99999)).toEqual({ brutoCentavos: 15050, creditoCentavos: 15050, liquidoCentavos: 0 });
    expect(previaTotais(pedidos, -10).creditoCentavos).toBe(0);
    expect(previaTotais([], 100)).toEqual({ brutoCentavos: 0, creditoCentavos: 0, liquidoCentavos: 0 });
  });

  it("datas ISO viram dd/mm/aaaa", () => {
    expect(dataBr("2026-11-16")).toBe("16/11/2026");
    expect(dataBr("2026-11-16T10:00:00Z")).toBe("16/11/2026");
    expect(dataBr(null)).toBe("—");
    expect(dataBr("lixo")).toBe("—");
  });
});

describe("regras de situação", () => {
  it("só PAGA, VENCIDA, CANCELADA e SUBSTITUIDA encerram a consulta", () => {
    expect(situacaoTerminal("AGUARDANDO")).toBe(false);
    expect(situacaoTerminal("PAGA_AGUARDANDO_CREDITO")).toBe(false);
    expect(situacaoTerminal("EM_ANALISE")).toBe(false);
    for (const s of ["PAGA", "VENCIDA", "CANCELADA", "SUBSTITUIDA"] as const) expect(situacaoTerminal(s)).toBe(true);
  });

  it("nova versão só de ABERTA, VENCIDA, CANCELADA; pagar só de ABERTA com valor", () => {
    expect(podeNovaVersao("ABERTA")).toBe(true);
    expect(podeNovaVersao("VENCIDA")).toBe(true);
    expect(podeNovaVersao("CANCELADA")).toBe(true);
    expect(podeNovaVersao("PAGA")).toBe(false);
    expect(podeNovaVersao("SUBSTITUIDA")).toBe(false);
    expect(podeNovaVersao("EM_ANALISE")).toBe(false);
    expect(podePagar({ situacao: "ABERTA", liquidoCentavos: 100 })).toBe(true);
    expect(podePagar({ situacao: "ABERTA", liquidoCentavos: 0 })).toBe(false);
    expect(podePagar({ situacao: "PAGA", liquidoCentavos: 100 })).toBe(false);
  });

  it("tom da pílula", () => {
    expect(tomDaSituacao("PAGA")).toBe("ok");
    expect(tomDaSituacao("VENCIDA")).toBe("critico");
    expect(tomDaSituacao("ABERTA")).toBe("atencao");
    expect(tomDaSituacao("SUBSTITUIDA")).toBe("neutro");
  });
});

describe("mensagens de erro", () => {
  it("usa o texto humano por código e nunca vaza texto técnico em erro 5xx", () => {
    expect(mensagemDeErro(new PortalApiErro(422, "CREDITO_INSUFICIENTE", "x"))).toMatch(/crédito/i);
    expect(mensagemDeErro(new PortalApiErro(409, "PEDIDOS_MUDARAM", "x"))).toMatch(/nova versão/i);
    expect(mensagemDeErro(new PortalApiErro(403, null, "x"))).toMatch(/permissão/i);
    expect(mensagemDeErro(new PortalApiErro(500, null, "stack trace interno"))).not.toMatch(/stack/);
    expect(mensagemDeErro(new Error("qualquer"))).toBe("Não foi possível concluir. Tente novamente.");
  });
});

describe("chave de idempotência", () => {
  it("gera valores diferentes e aceitos pela API (8–200 caracteres [A-Za-z0-9_.:-])", () => {
    const a = novaChaveIdempotencia();
    const b = novaChaveIdempotencia();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_.:-]{8,200}$/);
  });
});

describe("criarPortalApi", () => {
  const BASE = "https://api.exemplo.test";

  it("manda o JWT no Authorization e usa a base + /v1/portal", async () => {
    const f = vi.fn(async () => respostaJson({ ok: true }));
    const api = criarPortalApi(async () => "jwt-sintetico", { baseUrl: `${BASE}/`, fetchImpl: f as unknown as typeof fetch });
    await api.quadro();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/portal/pedidos`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-sintetico");
    expect(init.method).toBe("GET");
  });

  it("sem sessão não chama a rede e dá 401", async () => {
    const f = vi.fn();
    const api = criarPortalApi(async () => null, { baseUrl: BASE, fetchImpl: f as unknown as typeof fetch });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(f).not.toHaveBeenCalled();
  });

  it("POST leva Idempotency-Key e SÓ pedidos + creditoCentavos no corpo", async () => {
    const f = vi.fn(async () => respostaJson({ ok: true, cobranca: { id: 1 } }, 201));
    const api = criarPortalApi(async () => "t", { baseUrl: BASE, fetchImpl: f as unknown as typeof fetch });
    await api.criarCobranca({ pedidos: [10, 11], creditoCentavos: 500 }, "chave-123456");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/portal/cobrancas`);
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h["Idempotency-Key"]).toBe("chave-123456");
    expect(h["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ pedidos: [10, 11], creditoCentavos: 500 });
  });

  it("aceita a Cobranca solta ou embrulhada em `cobranca`", async () => {
    const solta = { id: 7, numero: "P-2026-000007" };
    const f1 = vi.fn(async () => respostaJson(solta, 201));
    const f2 = vi.fn(async () => respostaJson({ ok: true, cobranca: solta }, 201));
    const a1 = criarPortalApi(async () => "t", { baseUrl: BASE, fetchImpl: f1 as unknown as typeof fetch });
    const a2 = criarPortalApi(async () => "t", { baseUrl: BASE, fetchImpl: f2 as unknown as typeof fetch });
    expect((await a1.criarCobranca({ pedidos: [1] }, "chave-123456")).id).toBe(7);
    expect((await a2.novaVersao(7, { pedidos: [1] }, "chave-123456")).id).toBe(7);
  });

  it("pagar manda { forma } em /cobrancas/:id/pagar", async () => {
    const f = vi.fn(async () => respostaJson({ ok: true }));
    const api = criarPortalApi(async () => "t", { baseUrl: BASE, fetchImpl: f as unknown as typeof fetch });
    await api.pagar(42, "PIX", "chave-123456");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/portal/cobrancas/42/pagar`);
    expect(JSON.parse(init.body as string)).toEqual({ forma: "PIX" });
  });

  it("traduz o erro da API em PortalApiErro (status + código + texto)", async () => {
    const f = vi.fn(async () => respostaJson({ ok: false, codigo: "CREDITO_INSUFICIENTE", erro: "sem saldo" }, 422));
    const api = criarPortalApi(async () => "t", { baseUrl: BASE, fetchImpl: f as unknown as typeof fetch });
    await expect(api.criarCobranca({ pedidos: [1] }, "chave-123456")).rejects.toMatchObject({
      status: 422,
      codigo: "CREDITO_INSUFICIENTE",
      message: "sem saldo",
    });
  });

  it("falha de rede e corpo que não é JSON viram erros tratáveis", async () => {
    const rede = criarPortalApi(async () => "t", {
      baseUrl: BASE,
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    });
    await expect(rede.me()).rejects.toMatchObject({ status: 0 });
    const html = criarPortalApi(async () => "t", {
      baseUrl: BASE,
      fetchImpl: (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch,
    });
    await expect(html.me()).rejects.toMatchObject({ status: 502 });
  });
});
