import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Database, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Map of known project refs per company slug (maintained in code, not DB)
const COMPANY_PROJECT_MAP: Record<string, string> = {
  mowig:   "xpoqiclaqkudznmshzal",
  moveria: "fzgasvcfxufhrbrdakow",
};

type Company = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

type CompanyStats = {
  companyId: string;
  lastAccess: string | null;
  activeUsers: number | null;
};

function useCompanyStats(companyId: string): CompanyStats {
  const { data } = useQuery({
    queryKey: ["isolation-stats", companyId],
    queryFn: async () => {
      // This query runs against hubm-core — admin_logs and profiles
      // are in company DBs and not accessible here directly.
      // Return placeholders; real stats would require per-company API calls.
      return { companyId, lastAccess: null, activeUsers: null };
    },
    staleTime: 60_000,
  });
  return data ?? { companyId, lastAccess: null, activeUsers: null };
}

function CompanyCard({ company, onDetails }: { company: Company; onDetails: () => void }) {
  const projectId = COMPANY_PROJECT_MAP[company.slug] ?? "—";
  const stats = useCompanyStats(company.id);

  return (
    <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text-primary">{company.name}</p>
          <p className="text-xs text-text-muted">@{company.slug}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          company.active
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-600"
        }`}>
          {company.active ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-text-secondary">
          <Users className="w-4 h-4 shrink-0" />
          <span>{stats.activeUsers !== null ? `${stats.activeUsers} usuários` : "—"}</span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <Database className="w-4 h-4 shrink-0" />
          <span className="font-mono text-xs truncate">{projectId}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Banco isolado
        </p>
        <Button variant="outline" size="sm" onClick={onDetails}>
          Ver detalhes
        </Button>
      </div>
    </div>
  );
}

function IsolationDetailModal({ company, open, onClose }: {
  company: Company;
  open: boolean;
  onClose: () => void;
}) {
  const projectId = COMPANY_PROJECT_MAP[company.slug] ?? "desconhecido";

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4" /> Isolamento — {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <Row label="Empresa" value={company.name} />
            <Row label="Slug" value={`@${company.slug}`} mono />
            <Row label="Company ID (hubm-core)" value={company.id} mono />
            <Row label="Supabase Project Ref" value={projectId} mono />
            <Row label="Status" value={company.active ? "Ativo" : "Inativo"} />
          </div>

          <div className="rounded-lg border border-border bg-accent-light/30 p-4 space-y-2 text-xs text-text-secondary">
            <p className="font-semibold text-text-primary text-sm">Garantias de isolamento</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Banco de dados Postgres exclusivo no Supabase (project ref acima)</li>
              <li>Nenhuma credencial compartilhada entre empresas</li>
              <li>RLS filtra todos os SELECTs por <code>company_id = auth_company_id()</code></li>
              <li>Edge Functions usam <code>INTERNAL_SECRET</code> único por projeto</li>
              <li>Teste automatizado: <code>supabase/functions/__tests__/isolation.test.ts</code></li>
            </ul>
          </div>

          <p className="text-xs text-text-muted">
            Ver <code>docs/architecture.md</code> para detalhes completos da arquitetura multi-tenant.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className={`text-text-primary text-right break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function IsolationDashboard() {
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["superadmin-companies-isolation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, slug, name, active")
        .order("name");
      return (data ?? []) as Company[];
    },
  });

  if (isLoading) return <p className="text-sm text-text-muted">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">
          Isolamento por empresa — {companies.length} banco{companies.length !== 1 ? "s" : ""} separado{companies.length !== 1 ? "s" : ""}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map(c => (
          <CompanyCard
            key={c.id}
            company={c}
            onDetails={() => setDetailCompany(c)}
          />
        ))}
      </div>

      {detailCompany && (
        <IsolationDetailModal
          company={detailCompany}
          open={!!detailCompany}
          onClose={() => setDetailCompany(null)}
        />
      )}
    </div>
  );
}
