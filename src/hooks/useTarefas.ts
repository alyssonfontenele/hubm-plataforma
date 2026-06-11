import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Enum types (espelham os CREATE TYPE da migration 20260610000000)
// ---------------------------------------------------------------------------

export type TarefasStatus =
  | "solicitada"
  | "aceita"
  | "em_andamento"
  | "concluida"
  | "validada"
  | "devolvida"
  | "ajuste_solicitado"
  | "rejeitada"
  | "rejeitada_final"
  | "cancelamento_solicitado"
  | "cancelada";

export type TarefasModo = "unica" | "colaborativo" | "paralelo";

export type TarefasTipo = "propria" | "requisitada";

export type TarefasStatusAtribuicao =
  | "pendente_aceite"
  | "aceita"
  | "recusada"
  | "em_andamento"
  | "concluida";

export type TarefasTipoEvento =
  | "criada"
  | "aceita"
  | "recusada"
  | "devolvida"
  | "resubmetida"
  | "inicio_execucao"
  | "concluida"
  | "validada"
  | "ajuste_solicitado"
  | "rejeitada"
  | "rejeitada_final"
  | "cancelamento_solicitado"
  | "cancelamento_confirmado"
  | "cancelamento_contestado"
  | "cancelada"
  | "prazo_estendido_solicitado"
  | "prazo_estendido_aprovado"
  | "prazo_estendido_recusado"
  | "atribuicao_aceita"
  | "atribuicao_recusada"
  | "atribuicao_recusada_trava"
  | "atribuicao_concluida"
  | "todos_aceitaram"
  | "todos_concluiram"
  | "lote_criado"
  | "reaberta_como"
  | "origem_reaberta"
  | "anexo_adicionado"
  | "checklist_atualizado"
  | "campo_preenchido"
  | "sla_vencido"
  | "escalado";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Tarefa {
  id: string;
  company_id: string;
  tipo: TarefasTipo;
  modo: TarefasModo;
  solicitante_id: string;
  status: TarefasStatus;
  objetivo: string;
  instrucoes: string | null;
  prazo: string;
  campos_personalizados: Record<string, unknown>;
  sla_id: string | null;
  sla_resposta_due_at: string | null;
  sla_execucao_due_at: string | null;
  sla_validacao_due_at: string | null;
  lote_id: string | null;
  reaberta_de: string | null;
  template_id: string | null;
  fechado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface TarefaAtribuicao {
  id: string;
  tarefa_id: string;
  atribuido_id: string;
  status: TarefasStatusAtribuicao;
  aceito_em: string | null;
  concluido_em: string | null;
  criado_em: string;
}

export interface TarefaEvento {
  id: string;
  tarefa_id: string;
  tipo: TarefasTipoEvento;
  autor_id: string;
  atribuicao_id: string | null;
  payload: Record<string, unknown>;
  criado_em: string;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface TarefasFilter {
  /** Retorna apenas tarefas onde o usuário atual está como atribuído. */
  minhaAtribuicao?: boolean;
  /** Filtra por array de status (OR). Vazio = sem filtro. */
  status?: TarefasStatus[];
  /** Filtra pelo id do solicitante. */
  solicitanteId?: string;
}

// ---------------------------------------------------------------------------
// Query: lista de tarefas com filtros opcionais
// ---------------------------------------------------------------------------

export function useTarefas(filters: TarefasFilter = {}) {
  const { profile } = useAuth();
  const userId = profile?.id;

  return useQuery<Tarefa[]>({
    queryKey: ["tarefas", filters, userId ?? ""],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      // Caso minhaAtribuicao: buscar tarefa_ids via tarefas_atribuicoes primeiro
      if (filters.minhaAtribuicao) {
        const { data: atrRows, error: atrErr } = await supabase
          .from("tarefas_atribuicoes")
          .select("tarefa_id")
          .eq("atribuido_id", userId!);
        if (atrErr) throw atrErr;
        const ids = (atrRows ?? []).map(
          (r) => (r as { tarefa_id: string }).tarefa_id,
        );
        if (ids.length === 0) return [];
        let query = supabase
          .from("tarefas")
          .select("*")
          .in("id", ids)
          .order("criado_em", { ascending: false });
        if (filters.status && filters.status.length > 0) {
          query = query.in("status", filters.status);
        }
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Tarefa[];
      }

      // Caso padrão
      let query = supabase
        .from("tarefas")
        .select("*")
        .order("criado_em", { ascending: false });
      if (filters.solicitanteId) {
        query = query.eq("solicitante_id", filters.solicitanteId);
      }
      if (filters.status && filters.status.length > 0) {
        query = query.in("status", filters.status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

/** Retorna apenas tarefas onde o usuário logado é o solicitante. */
export function useTarefasSolicitadas(statusFilter?: TarefasStatus[]) {
  const { profile } = useAuth();
  return useTarefas({
    solicitanteId: profile?.id,
    status: statusFilter,
  });
}

/** Retorna tarefas onde o usuário logado tem uma atribuição. */
export function useTarefasAtribuidas(statusFilter?: TarefasStatus[]) {
  return useTarefas({ minhaAtribuicao: true, status: statusFilter });
}

// ---------------------------------------------------------------------------
// Query: atribuições de uma tarefa
// ---------------------------------------------------------------------------

export function useTarefaAtribuicoes(tarefaId: string | null) {
  return useQuery<TarefaAtribuicao[]>({
    queryKey: ["tarefa-atribuicoes", tarefaId ?? ""],
    enabled: !!tarefaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas_atribuicoes")
        .select("*")
        .eq("tarefa_id", tarefaId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarefaAtribuicao[];
    },
  });
}

// ---------------------------------------------------------------------------
// Query: log de eventos de uma tarefa (append-only)
// ---------------------------------------------------------------------------

export function useTarefaEventos(tarefaId: string | null) {
  return useQuery<TarefaEvento[]>({
    queryKey: ["tarefa-eventos", tarefaId ?? ""],
    enabled: !!tarefaId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas_eventos")
        .select("*")
        .eq("tarefa_id", tarefaId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarefaEvento[];
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: criar tarefa
// ---------------------------------------------------------------------------

export interface CreateTarefaInput {
  objetivo: string;
  instrucoes?: string;
  prazo: string;
  modo?: TarefasModo;
  tipo?: TarefasTipo;
  sla_id?: string;
  atribuido_ids?: string[];
  campos_personalizados?: Record<string, unknown>;
  template_id?: string;
}

export function useCreateTarefa() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTarefaInput) => {
      if (!profile) throw new Error("Usuário não autenticado.");

      const { data: tarefa, error: tarefaErr } = await supabase
        .from("tarefas")
        .insert({
          company_id: profile.company_id,
          solicitante_id: profile.id,
          objetivo: input.objetivo,
          instrucoes: input.instrucoes ?? null,
          prazo: input.prazo,
          modo: input.modo ?? "unica",
          tipo: input.tipo ?? "requisitada",
          sla_id: input.sla_id ?? null,
          campos_personalizados: input.campos_personalizados ?? {},
          template_id: input.template_id ?? null,
        })
        .select("id")
        .single();
      if (tarefaErr) throw tarefaErr;

      const tarefaId = (tarefa as { id: string }).id;

      if (input.atribuido_ids && input.atribuido_ids.length > 0) {
        const rows = input.atribuido_ids.map((atribuido_id) => ({
          tarefa_id: tarefaId,
          atribuido_id,
        }));
        const { error: atrErr } = await supabase
          .from("tarefas_atribuicoes")
          .insert(rows);
        if (atrErr) throw atrErr;
      }

      // Evento inicial append-only
      const { error: evtErr } = await supabase.from("tarefas_eventos").insert({
        tarefa_id: tarefaId,
        tipo: "criada" satisfies TarefasTipoEvento,
        autor_id: profile.id,
        payload: { objetivo: input.objetivo },
      });
      if (evtErr) throw evtErr;

      return tarefaId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tarefas"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: registrar atribuição em tarefa existente
// ---------------------------------------------------------------------------

export interface RegistrarAtribuicaoInput {
  tarefa_id: string;
  atribuido_id: string;
}

export function useRegistrarAtribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegistrarAtribuicaoInput) => {
      const { error } = await supabase.from("tarefas_atribuicoes").insert({
        tarefa_id: input.tarefa_id,
        atribuido_id: input.atribuido_id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tarefa-atribuicoes", variables.tarefa_id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: inserir evento (append-only — nunca UPDATE nem DELETE)
// ---------------------------------------------------------------------------

export interface InsertTarefaEventoInput {
  tarefa_id: string;
  tipo: TarefasTipoEvento;
  atribuicao_id?: string;
  payload?: Record<string, unknown>;
}

export function useInsertTarefaEvento() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: InsertTarefaEventoInput) => {
      if (!profile) throw new Error("Usuário não autenticado.");
      const { error } = await supabase.from("tarefas_eventos").insert({
        tarefa_id: input.tarefa_id,
        tipo: input.tipo,
        autor_id: profile.id,
        atribuicao_id: input.atribuicao_id ?? null,
        payload: input.payload ?? {},
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tarefa-eventos", variables.tarefa_id],
      });
    },
  });
}
