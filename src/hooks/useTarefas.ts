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
  responsavel_id: string | null;
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
  prazo?: string;
  modo?: TarefasModo;
  tipo?: TarefasTipo;
  /** modo=unica: responsável único (FK profiles). Obrigatório nesse modo. */
  responsavel_id?: string;
  /** modo=colaborativo: IDs dos atribuídos (mínimo 1). */
  atribuido_ids?: string[];
  sla_id?: string;
  campos_personalizados?: Record<string, unknown>;
  template_id?: string;
}

export function useCreateTarefa() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTarefaInput) => {
      if (!profile) throw new Error("Usuário não autenticado.");

      const tipo = input.tipo ?? "requisitada";
      const modo = tipo === "propria" ? "unica" : (input.modo ?? "unica");

      // Para tipo=propria o responsavel é sempre o próprio usuário.
      const responsavelId =
        tipo === "propria" ? profile.id : (input.responsavel_id ?? null);

      // prazo: campo NOT NULL no banco — default 30 dias se omitido.
      const prazoDate = input.prazo
        ? input.prazo
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tarefa, error: tarefaErr } = await supabase
        .from("tarefas")
        .insert({
          company_id:            profile.company_id,
          solicitante_id:        profile.id,
          objetivo:              input.objetivo,
          instrucoes:            input.instrucoes ?? null,
          prazo:                 prazoDate,
          modo,
          tipo,
          responsavel_id:        responsavelId,
          sla_id:                input.sla_id ?? null,
          campos_personalizados: input.campos_personalizados ?? {},
          template_id:           input.template_id ?? null,
        })
        .select("id")
        .single();
      if (tarefaErr) throw tarefaErr;

      const tarefaId = (tarefa as { id: string }).id;

      // Atribuições: apenas para modo=colaborativo.
      if (modo === "colaborativo" && input.atribuido_ids && input.atribuido_ids.length > 0) {
        const rows = input.atribuido_ids.map((atribuido_id) => ({
          tarefa_id: tarefaId,
          atribuido_id,
          status: "pendente_aceite" as const,
        }));
        const { error: atrErr } = await supabase
          .from("tarefas_atribuicoes")
          .insert(rows);
        if (atrErr) throw atrErr;
      }

      // Evento 'criada' — sempre o primeiro no log append-only.
      const { error: evtCriadaErr } = await supabase
        .from("tarefas_eventos")
        .insert({
          tarefa_id: tarefaId,
          tipo:      "criada" satisfies TarefasTipoEvento,
          autor_id:  profile.id,
          payload:   { objetivo: input.objetivo, tipo, modo },
        });
      if (evtCriadaErr) throw evtCriadaErr;

      // Auto-aceite: tipo=propria vai direto a em_andamento (1 clique ao usuário).
      if (tipo === "propria") {
        // solicitada → aceita
        const { error: updAceitaErr } = await supabase
          .from("tarefas")
          .update({ status: "aceita" })
          .eq("id", tarefaId);
        if (updAceitaErr) throw updAceitaErr;

        const { error: evtAceitaErr } = await supabase
          .from("tarefas_eventos")
          .insert({
            tarefa_id: tarefaId,
            tipo:      "aceita" satisfies TarefasTipoEvento,
            autor_id:  profile.id,
            payload:   { auto_aceite: true },
          });
        if (evtAceitaErr) throw evtAceitaErr;

        // aceita → em_andamento
        const { error: updEmAndErr } = await supabase
          .from("tarefas")
          .update({ status: "em_andamento" })
          .eq("id", tarefaId);
        if (updEmAndErr) throw updEmAndErr;

        const { error: evtEmAndErr } = await supabase
          .from("tarefas_eventos")
          .insert({
            tarefa_id: tarefaId,
            tipo:      "inicio_execucao" satisfies TarefasTipoEvento,
            autor_id:  profile.id,
            payload:   { auto_aceite: true },
          });
        if (evtEmAndErr) throw evtEmAndErr;
      }

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
