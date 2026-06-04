import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LayoutList, LayoutGrid, Plus, FileText } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ContratoPanel } from "@/components/moveria/contrato-panel";
import { EtapaBadge, SubEstadoBadge, AtrasoBadge } from "@/components/moveria/status-badge";

// ─── Route ────────────────────────────────────────────────────────────────────
const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/contratos/")({
  ssr: false,
  validateSearch: searchSchema,
  component: ContratosWorkspace,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type KanbanCard = {
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

type ViewMode = "lista" | "kanban";

const KANBAN_COLUNAS = [
  { etapa: "backlog",            label: "Backlog" },
  { etapa: "aguardando_medicao", label: "Aguardando Medição" },
  { etapa: "medido",             label: "Medido" },
  { etapa: "apresentacao_tecnica", label: "Apresentação" },
  { etapa: "em_aprovacao",       label: "Em Aprovação" },
  { etapa: "aprovado",           label: "Aprovado" },
  { etapa: "pedidos_fornecedores", label: "Ped. Fornec." },
  { etapa: "documentacao_tecnica_completa", label: "Doc. Técnica" },
];

function getViewMode(): ViewMode {
  try { return (localStorage.getItem("moveria.viewMode") as ViewMode) ?? "lista"; } catch { return "lista"; }
}
function setViewMode(v: ViewMode) {
  try { localStorage.setItem("moveria.viewMode", v); } catch { /* ignore */ }
}

// ─── Card de contrato (kanban) ────────────────────────────────────────────────
function KanbanContratoCard({
  card, isActive, onClick,
}: { card: KanbanCard; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isActive
          ? "border-foreground bg-accent-light shadow-sm"
          : "border-border bg-surface hover:border-text-muted hover:shadow-sm"
      }`}
    >
      <div className="font-mono font-bold text-sm text-text-primary mb-1">
        {card.contrato_numero}
      </div>
      <div className="text-xs text-text-secondary truncate mb-2">{card.cliente_nome}</div>
      <div className="flex flex-wrap gap-1 items-center">
        {card.qtd_ambientes_sem_lote > 0 && (
          <span className="text-[10px] font-medium text-text-muted bg-accent-light border border-border px-1.5 py-0.5 rounded">
            {card.qtd_ambientes_sem_lote} s/ lote
          </span>
        )}
        {card.sub_estado && <SubEstadoBadge sub={card.sub_estado} />}
        {card.tem_atraso && <AtrasoBadge />}
        {card.consultor_nome && (
          <span className="text-[10px] text-text-muted truncate">{card.consultor_nome}</span>
        )}
      </div>
    </button>
  );
}

// ─── Card de lote (kanban) ────────────────────────────────────────────────────
function KanbanLoteCard({ card, isActive, onClick }: { card: KanbanCard; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isActive
          ? "border-foreground bg-accent-light shadow-sm"
          : "border-border bg-surface hover:border-text-muted hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono font-bold text-sm text-text-primary">{card.lote_numero}</span>
        {card.tem_ressalva && <span className="text-[10px] text-[var(--color-warning)] font-semibold">⚠</span>}
      </div>
      <div className="text-xs text-text-muted truncate">{card.contrato_numero} · {card.cliente_nome}</div>
      {card.consultor_nome && (
        <div className="text-[10px] text-text-muted mt-1 truncate">{card.consultor_nome}</div>
      )}
    </button>
  );
}

// ─── Workspace ────────────────────────────────────────────────────────────────
function ContratosWorkspace() {
  const { id: selectedId } = Route.useSearch();
  const navigate = useNavigate();
  const { globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";

  const [viewMode, setViewModeState] = useState<ViewMode>(getViewMode);

  const { data: cards = [], isLoading } = useQuery<KanbanCard[]>({
    queryKey: ["moveria_kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_kanban_v")
        .select("tipo_card, etapa, contrato_id, contrato_numero, cliente_nome, lote_id, lote_numero, consultor_id, consultor_nome, status, conformado_em, tem_ressalva, qtd_itens, qtd_ambientes_sem_lote, sub_estado, data_prevista_max, tem_atraso");
      if (error) throw error;
      return (data ?? []) as KanbanCard[];
    },
  });

  function selectContrato(id: string) {
    if (id === selectedId) {
      navigate({ to: "/contratos", search: {} });
    } else {
      navigate({ to: "/contratos", search: { id } });
    }
  }

  function toggleView(v: ViewMode) {
    setViewModeState(v);
    setViewMode(v);
  }

  const contratos = cards.filter((c) => c.tipo_card === "contrato");
  const lotes     = cards.filter((c) => c.tipo_card === "lote");

  // ─── Painel esquerdo — lista ──
  const ListaPanel = useCallback(() => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
        <span className="text-xs text-text-muted font-medium flex-1">
          {cards.length} card{cards.length !== 1 ? "s" : ""}
        </span>
        {/* Toggle view */}
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <button
            onClick={() => toggleView("lista")}
            className={`p-1 rounded transition-colors ${viewMode === "lista" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"}`}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toggleView("kanban")}
            className={`p-1 rounded transition-colors ${viewMode === "kanban" ? "bg-foreground text-background" : "text-text-muted hover:text-text-primary"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
        {isAdmin && (
          <Button size="sm" variant="default" asChild>
            <a href="/contratos/importar" className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Importar
            </a>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <FileText className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary mb-1">Nenhum contrato ainda</p>
          {isAdmin && (
            <p className="text-xs text-text-muted">Use "Importar" para adicionar o primeiro contrato.</p>
          )}
        </div>
      )}

      {!isLoading && viewMode === "lista" && cards.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Header — minmax(0,1fr) permite shrink; auto dimensiona ao badge mais largo */}
          <div className="sticky top-0 grid bg-accent-light px-4 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted z-10"
            style={{ gridTemplateColumns: "minmax(0,1fr) 48px auto" }}>
            <div>Contrato / Lote</div>
            <div>Amb.</div>
            <div>Etapa</div>
          </div>
          {cards.map((c) => {
            const isContr = c.tipo_card === "contrato";
            const id = isContr ? c.contrato_id : c.contrato_id;
            const isActive = selectedId === id;
            return (
              <button
                key={isContr ? c.contrato_id : c.lote_id}
                onClick={() => selectContrato(id)}
                className={`w-full text-left grid px-4 py-3 border-b border-border items-center transition-colors ${
                  isActive ? "bg-accent-light" : "bg-surface hover:bg-accent-light/60"
                }`}
                style={{ gridTemplateColumns: "minmax(0,1fr) 48px auto" }}
              >
                {/* Col 1: texto longo — overflow-hidden garante truncação */}
                <div className="min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="font-mono font-bold text-sm text-text-primary truncate">
                      {isContr ? c.contrato_numero : c.lote_numero}
                    </span>
                    {!isContr && c.tem_ressalva && <span className="text-[10px] text-[var(--color-warning)] flex-shrink-0">⚠</span>}
                  </div>
                  <div className="text-xs text-text-secondary truncate">{c.cliente_nome}</div>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {isContr && c.sub_estado && <SubEstadoBadge sub={c.sub_estado} />}
                    {isContr && c.tem_atraso && <AtrasoBadge />}
                  </div>
                </div>
                {/* Col 2: contagem — mono pequeno */}
                <div className="font-mono text-xs text-text-muted text-right pr-2">
                  {isContr && c.qtd_ambientes_sem_lote > 0 ? c.qtd_ambientes_sem_lote : isContr ? "—" : c.qtd_itens}
                </div>
                {/* Col 3: badge — flex-shrink-0 para não comprimir */}
                <div className="flex-shrink-0"><EtapaBadge etapa={c.etapa} /></div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && viewMode === "kanban" && cards.length > 0 && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-0 min-w-max">
            {KANBAN_COLUNAS.map((col) => {
              const colCards = cards.filter((c) => c.etapa === col.etapa);
              if (colCards.length === 0 && !["backlog", "aguardando_medicao"].includes(col.etapa)) return null;
              return (
                <div key={col.etapa} className="flex flex-col h-full border-r border-border last:border-r-0" style={{ width: 220 }}>
                  <div className="flex-shrink-0 px-3 py-2.5 border-b border-border bg-accent-light">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{col.label}</p>
                    <p className="text-xs text-text-secondary font-medium">{colCards.length}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {colCards.length === 0 && (
                      <div className="text-xs text-text-muted text-center py-6 px-2">
                        {col.etapa === "backlog" ? "Nenhum contrato no backlog." :
                         col.etapa === "aguardando_medicao" ? "Nenhum aguardando medição." : "Vazio"}
                      </div>
                    )}
                    {colCards.map((c) => {
                      const id = c.contrato_id;
                      const isActive = selectedId === id;
                      return c.tipo_card === "contrato" ? (
                        <KanbanContratoCard
                          key={c.contrato_id}
                          card={c}
                          isActive={isActive}
                          onClick={() => selectContrato(id)}
                        />
                      ) : (
                        <KanbanLoteCard
                          key={c.lote_id}
                          card={c}
                          isActive={isActive}
                          onClick={() => selectContrato(id)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ), [cards, isLoading, viewMode, selectedId, isAdmin]);

  return (
    <div className="h-[calc(100vh-4rem)]">
      {selectedId ? (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={35} minSize={25} maxSize={55}>
            <div className="h-full bg-background border-r border-border">
              <ListaPanel />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={65}>
            <div className="h-full bg-surface overflow-hidden">
              <ContratoPanel
                key={selectedId}
                contratoId={selectedId}
                onClose={() => navigate({ to: "/contratos", search: {} })}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="h-full bg-background">
          <ListaPanel />
        </div>
      )}
    </div>
  );
}
