import { createFileRoute } from "@tanstack/react-router";
import { CheckSquare, LoaderCircle } from "lucide-react";
import { useTarefasAtribuidas, type TarefasStatus, type TarefasTipo } from "@/hooks/useTarefas";
import { useTarefasFeature } from "@/hooks/useCompanyFeatures";
import { NovaTarefaModal } from "@/components/tarefas/NovaTarefaModal";

export const Route = createFileRoute("/_authenticated/tarefas/")({
  ssr: false,
  component: TarefasPage,
});

const STATUS_LABEL: Record<TarefasStatus, string> = {
  solicitada: "Solicitada",
  aceita: "Aceita",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  validada: "Validada",
  devolvida: "Devolvida",
  ajuste_solicitado: "Ajuste solicitado",
  rejeitada: "Rejeitada",
  rejeitada_final: "Rejeitada (final)",
  cancelamento_solicitado: "Canc. solicitado",
  cancelada: "Cancelada",
};

function statusCls(s: TarefasStatus): string {
  if (s === "concluida" || s === "validada") return "bg-green-100 text-green-700";
  if (s === "rejeitada" || s === "rejeitada_final" || s === "cancelada")
    return "bg-red-100 text-red-700";
  if (s === "devolvida" || s === "ajuste_solicitado" || s === "cancelamento_solicitado")
    return "bg-orange-100 text-orange-700";
  if (s === "em_andamento") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function tipoLabel(t: TarefasTipo): string {
  return t === "propria" ? "Própria" : "Requisitada";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function TarefasPage() {
  const { data: tarefas, isLoading } = useTarefasAtribuidas();
  const { hasAccess } = useTarefasFeature();
  const now = new Date();

  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
        <h1 className="text-sm font-semibold text-text-primary">Minhas Tarefas</h1>
        {tarefas && tarefas.length > 0 && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-text-primary/10 text-text-secondary">
            {tarefas.length}
          </span>
        )}
        <div className="ml-auto">
          {hasAccess && <NovaTarefaModal size="sm" />}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : !tarefas || tarefas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <CheckSquare className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary mb-1">
            Nenhuma tarefa atribuída
          </p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Quando tarefas forem atribuídas a você, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary w-[40%]">
                  Tarefa
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">
                  Tipo
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">
                  Prazo
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">
                  SLA execução
                </th>
              </tr>
            </thead>
            <tbody>
              {tarefas.map((t) => {
                const slaVencido =
                  t.sla_execucao_due_at != null && new Date(t.sla_execucao_due_at) < now;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-0 hover:bg-accent-light transition-colors"
                  >
                    <td
                      className="px-4 py-3 text-text-primary max-w-xs truncate"
                      title={t.objetivo}
                    >
                      {t.objetivo}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {tipoLabel(t.tipo)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(t.status)}`}
                      >
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {fmtDate(t.prazo)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {t.sla_execucao_due_at != null ? (
                        <span
                          className={
                            slaVencido ? "text-red-600 font-medium" : "text-text-secondary"
                          }
                        >
                          {fmtDate(t.sla_execucao_due_at)}
                          {slaVencido && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
