// Este arquivo foi supersedido por contrato-panel.tsx na Fase 6 (reforma UX/UI).
// Mantido apenas para não quebrar imports legados; re-exporta os tipos necessários.

export type KanbanCard = {
  tipo_card: "contrato" | "lote";
  etapa: string;
  contrato_id: string;
  contrato_numero: string;
  cliente_nome: string;
  lote_id: string | null;
  lote_numero: string | null;
  consultor_id: string | null;
  consultor_nome: string | null;
  status: string | null;
  conformado_em: string | null;
  tem_ressalva: boolean;
  qtd_itens: number;
  qtd_ambientes_sem_lote: number;
  sub_estado: "designado" | "em_rodadas" | null;
  data_prevista_max: string | null;
  tem_atraso: boolean;
};

export function MoveriaDetailPanel(_: { children?: React.ReactNode }) { return null; }
export function KanbanContratoDrawerContent(_: Record<string, unknown>) { return null; }
export function KanbanLoteDrawerContent(_: Record<string, unknown>) { return null; }
