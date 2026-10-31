// Portal Mowig (J664) — regras de apresentação das coletas (puras, testáveis). A API decide elegibilidade, vagas e a janela de
// 24 h (`podeRemarcarOuCancelar`); aqui só se escolhe o que mostrar e se monta o corpo do pedido.
import {
  dataBr,
  type CapacidadesPortal,
  type ColetaPortal,
  type CorpoColeta,
  type QuemBusca,
  type QuemBuscaCorpo,
  type SituacaoColeta,
  type SlotColeta,
  type TomPilula,
} from "@/lib/portal-api";

/** Botões de coleta só com a capacidade `coleta` (GESTOR e IMPLANTADOR). Capacidade ausente = sem permissão. */
export function podeGerirColeta(cap: Pick<CapacidadesPortal, "coleta">): boolean {
  return cap.coleta === true;
}

export const ROTULO_SITUACAO_COLETA: Record<SituacaoColeta, string> = {
  SOLICITADA: "Solicitada",
  AGENDADA: "Agendada",
  DESPACHADA: "Despachada",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
};

export function tomDaColeta(s: SituacaoColeta): TomPilula {
  switch (s) {
    case "AGENDADA":
    case "DESPACHADA":
      return "ok";
    case "SOLICITADA":
      return "atencao";
    case "RECUSADA":
    case "CANCELADA":
      return "critico";
  }
}

/** Coleta ainda em andamento (ocupa os pedidos): é a única que o quadro mapeia para um cartão. */
export function coletaAtiva(c: Pick<ColetaPortal, "situacao">): boolean {
  return c.situacao === "SOLICITADA" || c.situacao === "AGENDADA" || c.situacao === "DESPACHADA";
}

/** Pedido -> coleta ativa (um pedido só está em uma coleta ativa: índice único da API). */
export function coletaPorPedido(coletas: ColetaPortal[]): Map<number, ColetaPortal> {
  const mapa = new Map<number, ColetaPortal>();
  for (const c of coletas) if (coletaAtiva(c)) for (const n of c.pedidos) mapa.set(n, c);
  return mapa;
}

/** "ter, 03/11/2026 · Manhã" */
export function rotuloSlot(s: Pick<SlotColeta, "data" | "rotuloTurno">): string {
  return `${dataBr(s.data)} · ${s.rotuloTurno}`;
}

export function textoQuemBusca(q: QuemBusca): string {
  if (q.tipo === "TRANSPORTADORA") return q.nome ?? q.codigo;
  return [q.motorista, q.placa].filter(Boolean).join(" · ") || "Veículo próprio";
}

/** Slots agrupados por dia, na ordem de data/turno em que a API mandou (ela já ordena). */
export function agruparSlotsPorDia(slots: SlotColeta[]): { data: string; slots: SlotColeta[] }[] {
  const grupos = new Map<string, SlotColeta[]>();
  for (const s of slots) grupos.set(s.data, [...(grupos.get(s.data) ?? []), s]);
  return [...grupos.entries()].map(([data, lista]) => ({ data, slots: lista }));
}

export type QuemBuscaForm =
  | { tipo: "TRANSPORTADORA"; transportadoraCodigo: string }
  | { tipo: "VEICULO_PROPRIO"; placa: string; motorista: string };

export function quemBuscaCorpo(f: QuemBuscaForm): QuemBuscaCorpo | null {
  if (f.tipo === "TRANSPORTADORA") {
    return f.transportadoraCodigo ? { transportadoraCodigo: f.transportadoraCodigo } : null;
  }
  const placa = f.placa.trim().toUpperCase().replace(/[\s-]/g, "");
  const motorista = f.motorista.trim();
  // o formato da placa é conferido pela API (placa_invalida); aqui só se limpa o texto
  return { veiculo: { placa: placa || null, motorista: motorista || null } };
}

/** Corpo do POST /coletas; null enquanto faltar algo (sem pedido, sem horário, sem quem busca). */
export function montarCorpoColeta(entrada: {
  slotId: number | null;
  pedidos: number[];
  quemBusca: QuemBuscaForm;
  observacao: string;
}): CorpoColeta | null {
  const quem = quemBuscaCorpo(entrada.quemBusca);
  if (!entrada.slotId || entrada.pedidos.length === 0 || !quem) return null;
  const obs = entrada.observacao.trim();
  return {
    slotId: entrada.slotId,
    pedidos: [...new Set(entrada.pedidos)],
    quemBusca: quem,
    ...(obs ? { observacao: obs } : {}),
  };
}

/** Lê "?pedidos=1,2,3" da tela de agendar: só inteiros positivos, sem repetição. */
export function pedidosDeBusca(texto: unknown): number[] {
  if (typeof texto !== "string" && typeof texto !== "number") return [];
  const itens = String(texto)
    .split(",")
    .map((x) => Number(x.trim()));
  return [...new Set(itens.filter((n) => Number.isInteger(n) && n > 0))];
}

export function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Remarcar/cancelar: coleta ainda em andamento (não despachada) e dentro da janela que a API autorizou. */
export function podeAlterarColeta(
  c: Pick<ColetaPortal, "situacao" | "podeRemarcarOuCancelar">,
): boolean {
  return (c.situacao === "SOLICITADA" || c.situacao === "AGENDADA") && c.podeRemarcarOuCancelar;
}
