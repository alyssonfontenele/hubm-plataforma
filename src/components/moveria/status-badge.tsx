import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EtapaKanban =
  | "backlog"
  | "aguardando_medicao"
  | "medido"
  | "apresentacao_tecnica"
  | "em_aprovacao"
  | "aprovado"
  | "pedidos_fornecedores"
  | "documentacao_tecnica_completa"
  | "cancelado"
  | "concluido";

export type Aptidao = "pendente" | "apto" | "apto_ressalva" | "inapto";

const ETAPA_CFG: Record<string, { label: string; cls: string }> = {
  backlog:                        { label: "Backlog",        cls: "bg-muted text-text-secondary border-border" },
  aguardando_medicao:             { label: "Aguard. med.",   cls: "bg-[var(--color-info-light)] text-[var(--color-info-text)] border-[var(--color-info)]" },
  medido:                         { label: "Medido",         cls: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]" },
  apresentacao_tecnica:           { label: "Apresentação",   cls: "bg-muted text-text-secondary border-border" },
  em_aprovacao:                   { label: "Em Aprovação",   cls: "bg-muted text-text-secondary border-border" },
  aprovado:                       { label: "Aprovado",       cls: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]" },
  pedidos_fornecedores:           { label: "Ped. Fornec.",   cls: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]" },
  documentacao_tecnica_completa:  { label: "Doc. Técnica",  cls: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]" },
  cancelado:                      { label: "Cancelado",      cls: "bg-[var(--color-danger-light)] text-[var(--color-danger-text)] border-[var(--color-danger)]" },
  concluido:                      { label: "Concluído",      cls: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]" },
};

const APT_CFG: Record<Aptidao, { label: string; dot: string; cls: string }> = {
  pendente:      { label: "Pendente",        dot: "bg-text-muted",                        cls: "bg-muted text-text-secondary border-border" },
  apto:          { label: "Apto",            dot: "bg-[var(--color-success)]",             cls: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]" },
  apto_ressalva: { label: "Apto c/ ressalva",dot: "bg-[var(--color-warning)]",            cls: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]" },
  inapto:        { label: "Inapto",          dot: "bg-[var(--color-danger)]",              cls: "bg-[var(--color-danger-light)] text-[var(--color-danger-text)] border-[var(--color-danger)]" },
};

export function EtapaBadge({ etapa, className }: { etapa: string; className?: string }) {
  const cfg = ETAPA_CFG[etapa] ?? { label: etapa, cls: "bg-muted text-text-secondary border-border" };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border",
      cfg.cls, className
    )}>
      {cfg.label}
    </span>
  );
}

export function AptidaoBadge({ aptidao, className }: { aptidao: Aptidao; className?: string }) {
  const cfg = APT_CFG[aptidao];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border",
      cfg.cls, className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function SubEstadoBadge({ sub }: { sub: "designado" | "em_rodadas" }) {
  return sub === "em_rodadas" ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border border-[var(--color-warning)]">
      em rodadas
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-info-light)] text-[var(--color-info-text)] border border-[var(--color-info)]">
      designado
    </span>
  );
}

export function AtrasoBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-danger-light)] text-[var(--color-danger-text)] border border-[var(--color-danger)]">
      ⚠ atrasado
    </span>
  );
}
