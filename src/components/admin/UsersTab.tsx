import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Plus, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { supabase, type GlobalRole, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserList } from "@/components/admin/UserList";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserFormModal, EditUserModal } from "@/components/admin/UserFormModal";
import { adminProfilesQueryKey, useAdminUsers } from "@/hooks/useAdminUsers";
import { GLOBAL_ROLES, type Sector } from "@/components/admin/shared";

interface UsersTabProps {
  companyId: string;
  currentUserId: string | null;
}

type SectorRequest = {
  id: string;
  sector_id: string;
  status: string;
  sectors: { id: string; name: string } | null;
};

type PendingRow = {
  id: string;
  full_name: string;
  recovery_email: string | null;
  created_at: string;
  companies: { slug: string; name: string } | null;
  profile_sector_requests: SectorRequest[];
};

const SLUG_TO_DOMAIN: Record<string, string> = {
  mowig: "mowig.com.br",
  hubmkt: "hubmkt.com.br",
  moveria: "moveria.com.br",
};

export function UsersTab({ companyId, currentUserId }: UsersTabProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingRow | null>(null);
  const [approveRole, setApproveRole] = useState<GlobalRole>("member");
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<string>>(new Set());

  const profilesQueryKey = adminProfilesQueryKey(companyId);

  const { data: profiles = [], isLoading: loadingProfiles } = useAdminUsers(companyId);

  const { data: sectors = [], isLoading: loadingSectors } = useQuery({
    queryKey: ["admin-sectors", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("id,name,slug")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as Sector[] | null) ?? [];
    },
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-pending-profiles", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id, full_name, recovery_email, created_at,
          companies(slug, name),
          profile_sector_requests(id, sector_id, status, sectors(id, name))
        `)
        .eq("company_id", companyId)
        .eq("active", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },
  });

  const loading = loadingProfiles || loadingSectors;

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profilesQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["admin-sectors", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-pending-profiles", companyId] }),
    ]);
  };

  const handleOpenApprove = (req: PendingRow) => {
    setApproveTarget(req);
    setApproveRole("member");
    setSelectedSectorIds(new Set(req.profile_sector_requests.map((r) => r.sector_id)));
  };

  const toggleSector = (sectorId: string) => {
    setSelectedSectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) next.delete(sectorId);
      else next.add(sectorId);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!approveTarget) return;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ active: true, global_role: approveRole })
      .eq("id", approveTarget.id);
    if (profileError) {
      toast.error("Erro ao aprovar usuário.");
      return;
    }

    if (selectedSectorIds.size > 0) {
      await supabase.from("sector_members").upsert(
        Array.from(selectedSectorIds).map((sid) => ({
          profile_id: approveTarget.id,
          sector_id: sid,
          role: "member" as const,
        })),
        { ignoreDuplicates: true }
      );
    }

    for (const req of approveTarget.profile_sector_requests) {
      const status = selectedSectorIds.has(req.sector_id) ? "approved" : "rejected";
      await supabase.from("profile_sector_requests").update({ status }).eq("id", req.id);
    }

    toast.success(
      `${approveTarget.full_name} aprovado com acesso a ${selectedSectorIds.size} setor(es).`
    );
    setApproveTarget(null);
    setApproveRole("member");
    setSelectedSectorIds(new Set());
    await reload();
  };

  const handleReject = async (id: string, name: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao rejeitar solicitação.");
      return;
    }
    toast.success(`Solicitação de ${name} rejeitada.`);
    await queryClient.invalidateQueries({ queryKey: ["admin-pending-profiles", companyId] });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-primary flex items-center gap-2">
            <UserCog className="w-4 h-4" /> Usuários da empresa
          </p>
          <p className="text-xs text-text-muted">Gerencie os acessos da sua organização.</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-text-primary text-background hover:bg-text-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo usuário
        </Button>
      </header>

      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <p className="text-sm font-medium text-text-primary">Solicitações Pendentes</p>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {pending.length}
            </span>
          </div>
          <div className="space-y-2">
            {pending.map((req) => {
              const slug = req.companies?.slug ?? "";
              const domain = SLUG_TO_DOMAIN[slug] ?? req.companies?.name ?? slug;
              const date = new Date(req.created_at).toLocaleDateString("pt-BR");
              const displayEmail = req.recovery_email ?? req.full_name;
              return (
                <div
                  key={req.id}
                  className="rounded-md border border-border bg-surface/50 px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {req.full_name}
                      </p>
                      <p className="text-xs text-text-muted truncate">{displayEmail}</p>
                      <p className="text-xs text-text-muted">{domain} · {date}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenApprove(req)}
                        className="flex items-center gap-1 h-8 px-3 rounded-md bg-text-primary text-background text-xs font-medium hover:bg-text-primary/90"
                      >
                        <Check className="w-3 h-3" /> Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReject(req.id, req.full_name)}
                        className="flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs text-text-primary hover:bg-accent-light"
                      >
                        <X className="w-3 h-3" /> Rejeitar
                      </button>
                    </div>
                  </div>
                  {req.profile_sector_requests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {req.profile_sector_requests.map((sr) => (
                        <span
                          key={sr.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-accent-light text-text-secondary border border-border"
                        >
                          {sr.sectors?.name ?? sr.sector_id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <UserList
        profiles={profiles}
        loading={loading}
        renderActions={(p) => (
          <UserActionsMenu
            profile={p}
            isSelf={currentUserId === p.id}
            adminId={currentUserId}
            companyId={companyId}
            onChanged={reload}
            onEdit={() => setEditTarget(p)}
          />
        )}
      />

      <UserFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sectors={sectors}
        companyId={companyId}
        adminId={currentUserId}
        onCreated={() => {
          setModalOpen(false);
          void reload();
        }}
      />

      <EditUserModal
        profile={editTarget}
        sectors={sectors}
        adminId={currentUserId}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          void reload();
        }}
      />

      {approveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 backdrop-blur-sm px-4"
          onClick={() => setApproveTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3 className="text-base font-semibold text-text-primary">Aprovar acesso</h3>
              <p className="text-xs text-text-muted mt-1">
                {approveTarget.recovery_email ?? approveTarget.full_name}
              </p>
            </header>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-text-secondary">Função</label>
              <select
                value={approveRole}
                onChange={(e) => setApproveRole(e.target.value as GlobalRole)}
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                {GLOBAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {approveTarget.profile_sector_requests.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-secondary">Setores solicitados</p>
                <div className="space-y-1.5">
                  {approveTarget.profile_sector_requests.map((sr) => (
                    <label
                      key={sr.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent-light"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSectorIds.has(sr.sector_id)}
                        onChange={() => toggleSector(sr.sector_id)}
                        className="h-4 w-4 rounded border-border accent-text-primary shrink-0"
                      />
                      <span className="text-sm text-text-primary">
                        {sr.sectors?.name ?? sr.sector_id}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="flex-1 h-10 rounded-md border border-border text-sm text-text-primary hover:bg-accent-light"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleApprove()}
                className="flex-1 h-10 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90"
              >
                Confirmar ({selectedSectorIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
