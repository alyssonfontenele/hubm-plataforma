// Portal Mowig (J664) — regras de apresentação das coletas e cliente da API de coletas. Dados sintéticos.
import { describe, expect, it, vi } from "vitest";
import { criarPortalApi, mensagemDeErro, PortalApiErro, type ColetaPortal } from "@/lib/portal-api";
import {
  agruparSlotsPorDia,
  coletaAtiva,
  coletaPorPedido,
  montarCorpoColeta,
  pedidosDeBusca,
  podeAlterarColeta,
  podeGerirColeta,
  quemBuscaCorpo,
  rotuloSlot,
  tamanhoLegivel,
  textoQuemBusca,
  tomDaColeta,
} from "@/lib/portal-coletas";

function coleta(extra: Partial<ColetaPortal> = {}): ColetaPortal {
  return {
    id: 1,
    situacao: "AGENDADA",
    slot: { id: 10, data: "2026-11-05", turno: "MANHA", rotuloTurno: "Manhã" },
    quemBusca: { tipo: "TRANSPORTADORA", codigo: "T1", nome: "Transportes Exemplo" },
    observacao: null,
    motivo: null,
    pedidos: [5101, 5102],
    solicitadaEm: "2026-10-31T12:00:00Z",
    confirmadaEm: null,
    despachadaEm: null,
    documentos: 0,
    podeRemarcarOuCancelar: true,
    ...extra,
  };
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("capacidade coleta", () => {
  it("só com coleta === true; ausente ou false = sem permissão", () => {
    expect(podeGerirColeta({ coleta: true })).toBe(true);
    expect(podeGerirColeta({ coleta: false })).toBe(false);
    expect(podeGerirColeta({})).toBe(false);
  });

  it("remarcar/cancelar: só em andamento E dentro da janela que a API autorizou", () => {
    expect(podeAlterarColeta(coleta())).toBe(true);
    expect(podeAlterarColeta(coleta({ situacao: "SOLICITADA" }))).toBe(true);
    expect(podeAlterarColeta(coleta({ podeRemarcarOuCancelar: false }))).toBe(false);
    expect(podeAlterarColeta(coleta({ situacao: "DESPACHADA" }))).toBe(false);
    expect(podeAlterarColeta(coleta({ situacao: "CANCELADA" }))).toBe(false);
  });
});

describe("mapa pedido -> coleta", () => {
  it("só coletas ativas entram; cancelada e recusada liberam o pedido", () => {
    const mapa = coletaPorPedido([
      coleta({ id: 1, pedidos: [1, 2] }),
      coleta({ id: 2, situacao: "CANCELADA", pedidos: [3] }),
      coleta({ id: 3, situacao: "RECUSADA", pedidos: [4] }),
      coleta({ id: 4, situacao: "DESPACHADA", pedidos: [5] }),
    ]);
    expect([...mapa.keys()].sort()).toEqual([1, 2, 5]);
    expect(mapa.get(2)?.id).toBe(1);
    expect(coletaAtiva({ situacao: "SOLICITADA" })).toBe(true);
    expect(coletaAtiva({ situacao: "CANCELADA" })).toBe(false);
  });
});

describe("apresentação", () => {
  it("rótulos e tons", () => {
    expect(rotuloSlot({ data: "2026-11-05", rotuloTurno: "Tarde" })).toBe("05/11/2026 · Tarde");
    expect(textoQuemBusca({ tipo: "TRANSPORTADORA", codigo: "T1", nome: null })).toBe("T1");
    expect(textoQuemBusca({ tipo: "VEICULO_PROPRIO", placa: "ABC1D23", motorista: "Fulano" })).toBe(
      "Fulano · ABC1D23",
    );
    expect(textoQuemBusca({ tipo: "VEICULO_PROPRIO", placa: null, motorista: null })).toBe(
      "Veículo próprio",
    );
    expect(tomDaColeta("AGENDADA")).toBe("ok");
    expect(tomDaColeta("SOLICITADA")).toBe("atencao");
    expect(tomDaColeta("CANCELADA")).toBe("critico");
    expect(tamanhoLegivel(512)).toBe("512 B");
    expect(tamanhoLegivel(2048)).toBe("2 KB");
    expect(tamanhoLegivel(null)).toBe("");
  });

  it("agrupa os horários por dia mantendo a ordem da API", () => {
    const g = agruparSlotsPorDia([
      { id: 1, data: "2026-11-02", turno: "MANHA", rotuloTurno: "Manhã" },
      { id: 2, data: "2026-11-02", turno: "TARDE", rotuloTurno: "Tarde" },
      { id: 3, data: "2026-11-03", turno: "MANHA", rotuloTurno: "Manhã" },
    ]);
    expect(g.map((d) => [d.data, d.slots.length])).toEqual([
      ["2026-11-02", 2],
      ["2026-11-03", 1],
    ]);
  });
});

describe("corpo do POST /coletas", () => {
  const transportadora = { tipo: "TRANSPORTADORA", transportadoraCodigo: "T1" } as const;

  it("transportadora: manda só o código; falta algo = null (botão desligado)", () => {
    expect(quemBuscaCorpo(transportadora)).toEqual({ transportadoraCodigo: "T1" });
    expect(quemBuscaCorpo({ tipo: "TRANSPORTADORA", transportadoraCodigo: "" })).toBeNull();
    expect(
      montarCorpoColeta({ slotId: null, pedidos: [1], quemBusca: transportadora, observacao: "" }),
    ).toBeNull();
    expect(
      montarCorpoColeta({ slotId: 5, pedidos: [], quemBusca: transportadora, observacao: "" }),
    ).toBeNull();
  });

  it("veículo próprio: placa limpa e em caixa alta; vazios viram null; observação só se houver", () => {
    expect(
      quemBuscaCorpo({ tipo: "VEICULO_PROPRIO", placa: " abc-1d23 ", motorista: "  " }),
    ).toEqual({ veiculo: { placa: "ABC1D23", motorista: null } });
    expect(
      montarCorpoColeta({
        slotId: 5,
        pedidos: [1, 1, 2],
        quemBusca: transportadora,
        observacao: "  Doca 2 ",
      }),
    ).toEqual({
      slotId: 5,
      pedidos: [1, 2],
      quemBusca: { transportadoraCodigo: "T1" },
      observacao: "Doca 2",
    });
    expect(
      montarCorpoColeta({ slotId: 5, pedidos: [1], quemBusca: transportadora, observacao: " " }),
    ).not.toHaveProperty("observacao");
  });

  it("nunca manda valor, cliente nem situação (o servidor decide)", () => {
    const corpo = montarCorpoColeta({
      slotId: 5,
      pedidos: [1],
      quemBusca: transportadora,
      observacao: "",
    });
    expect(Object.keys(corpo ?? {}).sort()).toEqual(["pedidos", "quemBusca", "slotId"]);
  });

  it("lê ?pedidos= só com inteiros positivos e sem repetição", () => {
    expect(pedidosDeBusca("5109,5110,5109")).toEqual([5109, 5110]);
    expect(pedidosDeBusca("a,-1,0,2.5,7")).toEqual([7]);
    expect(pedidosDeBusca(undefined)).toEqual([]);
    expect(pedidosDeBusca(42)).toEqual([42]);
  });
});

describe("cliente da API de coletas", () => {
  const base = "https://api.exemplo.test";
  const apiCom = (f: typeof fetch) =>
    criarPortalApi(async () => "jwt-sintetico", { baseUrl: base, fetchImpl: f });

  it("lista coletas, slots e transportadoras com o JWT e no caminho /v1/portal", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/coletas")) return respostaJson({ ok: true, coletas: [coleta()] });
      if (u.endsWith("/slots")) return respostaJson({ ok: true, horizonteDias: 14, slots: [] });
      return respostaJson({ ok: true, itens: [{ id: "T1", nome: "Transportes Exemplo" }] });
    });
    const api = apiCom(f as unknown as typeof fetch);
    expect((await api.coletas())[0].id).toBe(1);
    expect((await api.slots()).horizonteDias).toBe(14);
    expect((await api.transportadoras())[0].id).toBe("T1");
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      `${base}/v1/portal/coletas`,
      `${base}/v1/portal/slots`,
      `${base}/v1/portal/transportadoras`,
    ]);
    for (const c of f.mock.calls) {
      expect((c[1] as RequestInit).headers).toMatchObject({
        Authorization: "Bearer jwt-sintetico",
      });
    }
  });

  it("POST de coleta leva Idempotency-Key e JSON; remarcar e cancelar idem", async () => {
    const f = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      respostaJson({ ok: true, coletaId: 9, situacao: "SOLICITADA" }, 201),
    );
    const api = apiCom(f as unknown as typeof fetch);
    await api.solicitarColeta(
      { slotId: 5, pedidos: [1], quemBusca: { transportadoraCodigo: "T1" } },
      "chave-de-teste-1",
    );
    await api.remarcarColeta(9, 6, "chave-de-teste-2");
    await api.cancelarColeta(9, null, "chave-de-teste-3");
    const [[u1, i1], [u2, i2], [u3, i3]] = f.mock.calls as unknown as [string, RequestInit][];
    expect(u1).toBe(`${base}/v1/portal/coletas`);
    expect(u2).toBe(`${base}/v1/portal/coletas/9/remarcar`);
    expect(u3).toBe(`${base}/v1/portal/coletas/9/cancelar`);
    expect(i1.method).toBe("POST");
    expect(JSON.parse(String(i1.body))).toEqual({
      slotId: 5,
      pedidos: [1],
      quemBusca: { transportadoraCodigo: "T1" },
    });
    expect(JSON.parse(String(i2.body))).toEqual({ slotId: 6 });
    expect(JSON.parse(String(i3.body))).toEqual({});
    expect(i1.headers).toMatchObject({ "Idempotency-Key": "chave-de-teste-1" });
    expect(i3.headers).toMatchObject({ "Idempotency-Key": "chave-de-teste-3" });
  });

  it("mostra a mensagem da API em 409/422 (a tela não reescreve a regra)", async () => {
    const f = vi.fn(async () =>
      respostaJson(
        { ok: false, codigo: "dentro_da_antecedencia", erro: "Faltam menos de 24 horas." },
        409,
      ),
    );
    const api = apiCom(f as unknown as typeof fetch);
    const erro = await api.cancelarColeta(9, null, "chave-de-teste-4").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(PortalApiErro);
    expect(mensagemDeErro(erro)).toBe("Faltam menos de 24 horas.");
  });

  it("baixa o documento com o JWT; erro vira mensagem humana", async () => {
    const ok = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response("%PDF-1.1", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const blob = await apiCom(ok as unknown as typeof fetch).baixarDocumento(3, 7);
    expect(blob.size).toBe(8);
    expect(String(ok.mock.calls[0][0])).toBe(`${base}/v1/portal/coletas/3/documentos/7`);
    expect((ok.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer jwt-sintetico",
    });

    const nao = vi.fn(async () => respostaJson({ ok: false, erro: "x" }, 404));
    const erro = await apiCom(nao as unknown as typeof fetch)
      .baixarDocumento(3, 8)
      .catch((e: unknown) => e);
    expect(mensagemDeErro(erro)).toBe("Não foi possível baixar o documento.");
  });
});
