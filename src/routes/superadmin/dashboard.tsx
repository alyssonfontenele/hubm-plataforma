import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyFormModal } from "@/components/superadmin/CompanyFormModal";

export const Route = createFileRoute("/superadmin/dashboard")({
  ssr: false,
  component: SuperadminDashboard,
});

interface CompanyWithCount extends Company {
  user_count: number;
}

function SuperadminDashboard() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["superadmin-companies"],
    queryFn: async (): Promise<CompanyWithCount[]> => {
      const [{ data: cos, error: cosErr }, { data: counts, error: cntErr }] =
        await Promise.all([
          supabase
            .from("companies")
            .select(
              "id,slug,name,domain,logo_url,favicon_url,primary_color,email_sender,active",
            )
            .neq("slug", "system")
            .order("name", { ascending: true }),
          supabase
            .from("profiles")
            .select("company_id")
            .is("deleted_at", null),
        ]);
      if (cosErr) throw cosErr;
      if (cntErr) throw cntErr;
      const countMap = new Map<string, number>();
      for (const p of counts ?? []) {
        countMap.set(p.company_id, (countMap.get(p.company_id) ?? 0) + 1);
      }
      return (cos ?? []).map((c) => ({
        ...(c as Company),
        user_count: countMap.get(c.id) ?? 0,
      }));
    },
  });

  const toggleActive = async (company: Company) => {
    const { error } = await supabase
      .from("companies")
      .update({ active: !company.active })
      .eq("id", company.id);
    if (error) {
      toast.error("Erro ao alterar status: " + error.message);
      return;
    }
    toast.success(company.active ? "Empresa desativada." : "Empresa ativada.");
    await qc.invalidateQueries({ queryKey: ["superadmin-companies"] });
  };

  const openNew = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditTarget(company);
    setModalOpen(true);
  };

  const handleSaved = async () => {
    setModalOpen(false);
    await qc.invalidateQueries({ queryKey: ["superadmin-companies"] });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Empresas</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {companies?.length ?? "—"} empresa
            {companies?.length !== 1 ? "s" : ""} cadastrada
            {companies?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={openNew}
          className="bg-text-primary text-background hover:bg-text-primary/90"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nova empresa
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-surface animate-pulse border border-border"
            />
          ))}
        </div>
      ) : !companies?.length ? (
        <div className="border border-border rounded-lg bg-surface p-12 text-center">
          <Building2 className="h-8 w-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">Nenhuma empresa cadastrada.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent-light">
                <th className="text-left px-4 py-2.5 font-medium text-text-secondary">
                  Empresa
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-text-secondary hidden sm:table-cell">
                  Slug
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-text-secondary hidden md:table-cell">
                  Domínio
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-text-secondary">
                  Usuários
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-text-secondary">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-accent-light/40">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {company.logo_url ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={company.logo_url}
                          alt=""
                          className="h-5 w-auto object-contain"
                        />
                        <span>{company.name}</span>
                      </div>
                    ) : (
                      company.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary hidden sm:table-cell font-mono text-xs">
                    {company.slug}
                  </td>
                  <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                    {company.domain ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    {company.user_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge
                      variant="outline"
                      className={`cursor-pointer select-none ${
                        company.active
                          ? "border-green-500 text-green-600 hover:bg-green-50"
                          : "border-border text-text-muted hover:bg-accent-light"
                      }`}
                      onClick={() => void toggleActive(company)}
                    >
                      {company.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(company)}
                      className="h-7 px-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompanyFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editTarget={editTarget}
      />
    </div>
  );
}
