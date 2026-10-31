// Portal Mowig (J664) — componentes de coleta: quadro (selecionar, remarcar, cancelar com confirmação, documentos), agendar e coleta.
// API em dublê; Link do router substituído por <a>. Dados 100% sintéticos (repo público, POR-H11).
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...resto
  }: Record<string, unknown> & { children?: ReactNode }) => {
    let href = String(to);
    for (const [k, v] of Object.entries((params ?? {}) as Record<string, string>))
      href = href.replace(`$${k}`, v);
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
import { AgendarPagina, ColetaPagina } from "@/components/portal/ColetasPaginas";
import {
  COLUNAS_QUADRO,
  type CapacidadesPortal,
  type ColetaPortal,
  type PortalApi,
  type PortalMe,
  type Quadro,
} from "@/lib/portal-api";

const CAP_GESTOR: CapacidadesPortal = {
  verValores: true,
  cobranca: true,
  implantar: false,
  gerirLoja: true,
  coleta: true,
};
const CAP_CONSULTA: CapacidadesPortal = {
  verValores: false,
  cobranca: false,
  implantar: false,
  gerirLoja: false,
};

const meCom = (capacidades: CapacidadesPortal): PortalMe => ({
  ok: true,
  usuario: { email: "gestor@loja-teste.example", papel: "GESTOR" },
  capacidades,
  cliente: {
    numero: 9001,
    razaoSocial: "Loja Teste Ltda",
    nomeFantasia: "Loja Teste",
    cnpj: "00.000.000/0001-00",
  },
});

const cartao = (numero: number) => ({
  numero,
  oc: `OC-${numero}`,
  emitidoEm: "2026-10-01",
  entregaPrevista: "2026-11-20",
  marca: null,
});

const quadro: Quadro = {
  ok: true,
  foraDoQuadro: 0,
  colunas: COLUNAS_QUADRO.map((id) => ({
    id,
    rotulo: id.replace(/_/g, " "),
    semFonte: false,
    aviso: null,
    pedidos:
      id === "AGUARDANDO_COLETA"
        ? [cartao(201), cartao(202)]
        : id === "COLETA_AGENDADA"
          ? [cartao(203), cartao(204)]
          : id === "DESPACHADO"
            ? [cartao(205)]
            : [],
  })),
};

function coleta(id: number, extra: Partial<ColetaPortal> = {}): ColetaPortal {
  return {
    id,
    situacao: "AGENDADA",
    slot: { id: 10, data: "2026-11-05", turno: "MANHA", rotuloTurno: "Manhã" },
    quemBusca: { tipo: "TRANSPORTADORA", codigo: "T1", nome: "Transportes Exemplo" },
    observacao: null,
    motivo: null,
    pedidos: [],
    solicitadaEm: "2026-10-31T12:00:00Z",
    confirmadaEm: null,
    despachadaEm: null,
    documentos: 0,
    podeRemarcarOuCancelar: true,
    ...extra,
  };
}

const coletas: ColetaPortal[] = [
  coleta(31, { pedidos: [203] }),
  coleta(32, { pedidos: [204], podeRemarcarOuCancelar: false }),
  coleta(33, { situacao: "DESPACHADA", pedidos: [205], documentos: 2 }),
];

function apiDuble(sobrescritas: Partial<PortalApi> = {}): PortalApi {
  return {
    cancelarColeta: vi.fn(async () => ({ situacao: "CANCELADA" as const })),
    solicitarColeta: vi.fn(async () => ({ coletaId: 77, situacao: "SOLICITADA" as const })),
    slots: vi.fn(async () => ({
      horizonteDias: 14,
      slots: [
        { id: 1, data: "2026-11-02", turno: "MANHA", rotuloTurno: "Manhã" },
        { id: 2, data: "2026-11-02", turno: "TARDE", rotuloTurno: "Tarde" },
      ],
    })),
    transportadoras: vi.fn(async () => [{ id: "T1", nome: "Transportes Exemplo" }]),
    ...sobrescritas,
  } as unknown as PortalApi;
}

function montar(ui: ReactNode, api: PortalApi, cap: CapacidadesPortal = CAP_GESTOR) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortalApiProvider api={api}>
        <PortalMeProvider me={meCom(cap)}>{ui}</PortalMeProvider>
      </PortalApiProvider>
    </QueryClientProvider>,
  );
}

describe("quadro com coletas", () => {
  it("GESTOR: marca pedidos prontos e AGENDAR COLETA leva os números para a tela de agendar", () => {
    montar(
      <QuadroPedidos quadro={quadro} capacidades={CAP_GESTOR} coletas={coletas} />,
      apiDuble(),
    );
    expect((screen.getByTestId("agendar-coleta") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /pedido 201 para coleta/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /pedido 202 para coleta/ }));
    const botao = screen.getByTestId("agendar-coleta");
    expect(botao.textContent).toContain("AGENDAR COLETA (2)");
    expect(botao.getAttribute("href")).toBe("/portal/agendar?pedidos=201%2C202");
  });

  it("papel sem a capacidade (ausente): nenhum botão de coleta, mas segue vendo a coleta", () => {
    montar(
      <QuadroPedidos quadro={quadro} capacidades={CAP_CONSULTA} coletas={coletas} />,
      apiDuble(),
      CAP_CONSULTA,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("agendar-coleta")).toBeNull();
    expect(screen.queryByText("REMARCAR")).toBeNull();
    expect(screen.queryByText("CANCELAR")).toBeNull();
    expect(within(screen.getByTestId("pedido-203")).getByText("Ver coleta")).toBeTruthy();
  });

  it("COLETA AGENDADA: REMARCAR/CANCELAR só quando a API autoriza (podeRemarcarOuCancelar)", () => {
    montar(
      <QuadroPedidos quadro={quadro} capacidades={CAP_GESTOR} coletas={coletas} />,
      apiDuble(),
    );
    const dentro = screen.getByTestId("pedido-203");
    expect(within(dentro).getByText("REMARCAR").getAttribute("href")).toBe("/portal/remarcar/31");
    expect(within(dentro).getByText("CANCELAR")).toBeTruthy();
    const fora = screen.getByTestId("pedido-204");
    expect(within(fora).queryByText("REMARCAR")).toBeNull();
    expect(within(fora).queryByText("CANCELAR")).toBeNull();
    expect(fora.textContent).toContain("menos de 24 h");
  });

  it("CANCELAR pede confirmação: Voltar não chama a API; Confirmar chama uma vez com Idempotency-Key", async () => {
    const api = apiDuble();
    montar(<QuadroPedidos quadro={quadro} capacidades={CAP_GESTOR} coletas={coletas} />, api);
    const c = screen.getByTestId("pedido-203");
    fireEvent.click(within(c).getByText("CANCELAR"));
    expect(within(c).getByText(/Cancelar esta coleta\?/)).toBeTruthy();
    fireEvent.click(within(c).getByText("Voltar"));
    expect(api.cancelarColeta).not.toHaveBeenCalled();

    fireEvent.click(within(c).getByText("CANCELAR"));
    fireEvent.click(within(c).getByText("Confirmar cancelamento"));
    await waitFor(() => expect(api.cancelarColeta).toHaveBeenCalledTimes(1));
    const [id, motivo, chave] = (api.cancelarColeta as ReturnType<typeof vi.fn>).mock.calls[0];
    expect([id, motivo]).toEqual([31, null]);
    expect(String(chave).length).toBeGreaterThanOrEqual(8);
  });

  it("erro do cancelamento mostra a mensagem da API", async () => {
    const { PortalApiErro } = await import("@/lib/portal-api");
    const api = apiDuble({
      cancelarColeta: vi.fn(async () => {
        throw new PortalApiErro(
          409,
          "dentro_da_antecedencia",
          "Faltam menos de 24 horas para esta coleta.",
        );
      }),
    });
    montar(<QuadroPedidos quadro={quadro} capacidades={CAP_GESTOR} coletas={coletas} />, api);
    const c = screen.getByTestId("pedido-203");
    fireEvent.click(within(c).getByText("CANCELAR"));
    fireEvent.click(within(c).getByText("Confirmar cancelamento"));
    expect((await within(c).findByRole("alert")).textContent).toContain(
      "Faltam menos de 24 horas para esta coleta.",
    );
  });

  it("DESPACHADO: atalho para os documentos, também para quem não tem a capacidade", () => {
    montar(
      <QuadroPedidos quadro={quadro} capacidades={CAP_CONSULTA} coletas={coletas} />,
      apiDuble(),
      CAP_CONSULTA,
    );
    const link = screen.getByTestId("documentos-205");
    expect(link.textContent).toContain("Documentos (2)");
    expect(link.getAttribute("href")).toBe("/portal/coleta/33");
  });

  it("sem coletas carregadas (API de coletas fora): o quadro das 7 colunas segue igual", () => {
    montar(<QuadroPedidos quadro={quadro} capacidades={CAP_GESTOR} />, apiDuble());
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(7);
  });
});

describe("tela de agendar", () => {
  it("sem a capacidade: aviso humano e nenhuma chamada de horários", () => {
    const api = apiDuble();
    montar(<AgendarPagina pedidos={[201]} />, api, CAP_CONSULTA);
    expect(screen.getByText(/Seu perfil só acompanha as coletas/)).toBeTruthy();
    expect(api.slots).not.toHaveBeenCalled();
  });

  it("envia só pedidos, horário e quem busca; o botão só liga com tudo preenchido", async () => {
    const api = apiDuble();
    montar(<AgendarPagina pedidos={[201, 202]} />, api);
    const enviar = await screen.findByRole("button", { name: "Solicitar coleta" });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("radio", { name: "Tarde" }));
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    await screen.findByRole("option", { name: "Transportes Exemplo" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "T1" } });
    expect((enviar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enviar);
    await waitFor(() => expect(api.solicitarColeta).toHaveBeenCalledTimes(1));
    const [corpo] = (api.solicitarColeta as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(corpo).toEqual({
      slotId: 2,
      pedidos: [201, 202],
      quemBusca: { transportadoraCodigo: "T1" },
    });
  });

  it("sem vaga: mostra a mensagem da API e recarrega os horários", async () => {
    const { PortalApiErro } = await import("@/lib/portal-api");
    const api = apiDuble({
      solicitarColeta: vi.fn(async () => {
        throw new PortalApiErro(
          409,
          "sem_vaga",
          "Este horário acabou de ficar sem vaga. Escolha outro.",
        );
      }),
    });
    montar(<AgendarPagina pedidos={[201]} />, api);
    fireEvent.click(await screen.findByRole("radio", { name: "Manhã" }));
    await screen.findByRole("option", { name: "Transportes Exemplo" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "T1" } });
    fireEvent.click(screen.getByRole("button", { name: "Solicitar coleta" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Este horário acabou de ficar sem vaga.",
    );
    await waitFor(() => expect(api.slots).toHaveBeenCalledTimes(2));
  });
});

describe("tela da coleta", () => {
  const agora = "2026-10-31T12:00:00Z";
  const detalhe = {
    coleta: coleta(33, {
      situacao: "DESPACHADA",
      pedidos: [205],
      documentos: 2,
      despachadaEm: agora,
    }),
    documentos: [
      {
        id: 1,
        tipo: "NFE",
        automatico: true,
        pedidoNumero: 205,
        nfeChave: "3526100000000000010055001000001234100001234",
        nfeNumero: "1234",
        nomeArquivo: null,
        contentType: null,
        tamanho: null,
        criadoEm: agora,
      },
      {
        id: 2,
        tipo: "ROMANEIO",
        automatico: false,
        pedidoNumero: null,
        nfeChave: null,
        nfeNumero: null,
        nomeArquivo: "romaneio.pdf",
        contentType: "application/pdf",
        tamanho: 2048,
        criadoEm: agora,
      },
    ],
  };

  it("lista documentos: NF-e ligada pela chave (sem botão) e arquivo com Baixar; CONSULTA também baixa", async () => {
    const baixar = vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" }));
    URL.createObjectURL = vi.fn(() => "blob:sintetico");
    URL.revokeObjectURL = vi.fn();
    const api = apiDuble({
      coleta: vi.fn(async () => detalhe),
      baixarDocumento: baixar,
    } as Partial<PortalApi>);
    montar(<ColetaPagina id={33} />, api, CAP_CONSULTA);
    const nfe = await screen.findByTestId("documento-1");
    expect(nfe.textContent).toContain("nº 1234");
    expect(within(nfe).queryByRole("button")).toBeNull();
    fireEvent.click(
      within(screen.getByTestId("documento-2")).getByRole("button", {
        name: /Baixar romaneio\.pdf/,
      }),
    );
    await waitFor(() => expect(baixar).toHaveBeenCalledWith(33, 2));
    expect(screen.queryByText("CANCELAR")).toBeNull();
  });

  it("coleta inexistente (ou de outra loja): mesma mensagem", async () => {
    const { PortalApiErro } = await import("@/lib/portal-api");
    const api = apiDuble({
      coleta: vi.fn(async () => {
        throw new PortalApiErro(404, "nao_encontrada", "x");
      }),
    } as Partial<PortalApi>);
    montar(<ColetaPagina id={999} />, api);
    expect(await screen.findByText("Coleta não encontrada.")).toBeTruthy();
  });
});
