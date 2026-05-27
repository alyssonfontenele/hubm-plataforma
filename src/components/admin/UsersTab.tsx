import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock, Plus, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { supabase, type GlobalRole, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserList } from "@/components/admin/UserList";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserFormModal, EditUserModal } from "@/components/admin/UserFormModal";
import { adminProfilesQueryKey, useAdminUsers } from "@/hooks/useAdminUsers";
import { GLOBAL_ROLES, ROLE_LABEL, type Sector } from "@/components/admin/shared";
import { logAdminAction } from "@/lib/admin-log";

const INTERNAL_SECRET = import.meta.env.VITE_INTERNAL_SECRET;
const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

async function sendNotificationEmail(to: string | null, subject: string, html: string) {
  if (!to) return;
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ to: [to], subject, html }),
    });
  } catch {
    // silencia erro de email — não bloqueia o fluxo principal
  }
}

interface UsersTabProps {
  companyId: string;
  currentUserId: string | null;
}

type CargoRequest = {
  id: string;
  sector_id: string | null;
  cargo_id: string | null;
  status: string;
  cargos: { id: string; name: string } | null;
};

type PendingRow = {
  id: string;
  full_name: string;
  recovery_email: string | null;
  created_at: string;
  companies: { slug: string; name: string } | null;
  profile_sector_requests: CargoRequest[];
};

type CargoRow = {
  id: string;
  name: string;
  description: string | null;
};

const SLUG_TO_DOMAIN: Record<string, string> = {
  mowig: "mowig.com.br",
  hubmkt: "hubmkt.com.br",
  moveria: "moveria.com.br",
};

const ROLE_META: Record<GlobalRole, { label: string; tooltip: string }> = {
  admin:       { label: ROLE_LABEL.admin,       tooltip: "Acesso total: gerencia usuários, setores, configurações e conteúdo." },
  manager:     { label: ROLE_LABEL.manager,     tooltip: "Gerencia conteúdo e usuários do seu setor, sem acesso às configurações globais." },
  member:      { label: ROLE_LABEL.member,      tooltip: "Acesso padrão: visualiza e interage com os setores liberados." },
  viewer:      { label: ROLE_LABEL.viewer,      tooltip: "Somente leitura — não pode criar, editar ou excluir nada." },
  operational: { label: ROLE_LABEL.operational, tooltip: "Acesso restrito a recursos operacionais específicos do setor." },
};

function RoleSelector({
  value,
  onChange,
}: {
  value: GlobalRole;
  onChange: (r: GlobalRole) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full h-10 flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <span>{ROLE_META[value].label}</span>
          <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-md py-1">
            {GLOBAL_ROLES.map((role) => {
              const { label, tooltip } = ROLE_META[role];
              return (
                <Tooltip key={role}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => { onChange(role); setOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent-light transition-colors ${value === role ? "font-medium text-text-primary" : "text-text-secondary"}`}
                    >
                      {value === role && <Check className="w-3.5 h-3.5 shrink-0" />}
                      <span className={value === role ? "" : "pl-[1.375rem]"}>{label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-56">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function UsersTab({ companyId, currentUserId }: UsersTabProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen]         = useState(false);
  const [editTarget, setEditTarget]       = useState<Profile | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingRow | null>(null);
  const [approveRole, setApproveRole]     = useState<GlobalRole>("member");
  const [approveCargoId, setApproveCargoId] = useState<string | null>(null);

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

  const { data: cargos = [] } = useQuery({
    queryKey: ["admin-cargos", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select("id,name,description")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CargoRow[];
    },
  });

  const profileIds = useMemo(() => profiles.map((p) => p.id), [profiles]);

  const { data: profileCargosRaw = [] } = useQuery({
    queryKey: ["admin-profile-cargos-map", companyId, profileIds] as const,
    queryFn: async () => {
      if (profileIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profile_cargos")
        .select("profile_id, cargos(name)")
        .in("profile_id", profileIds);
      if (error) throw error;
      return (data ?? []) as unknown as { profile_id: string; cargos: { name: string } | null }[];
    },
    enabled: profileIds.length > 0,
  });

  const cargosMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pc of profileCargosRaw) {
      if (pc.cargos?.name) map[pc.profile_id] = pc.cargos.name;
    }
    return map;
  }, [profileCargosRaw]);

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-pending-profiles", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id, full_name, recovery_email, created_at,
          companies(slug, name),
          profile_sector_requests(id, sector_id, cargo_id, status, cargos(id, name))
        `)
        .eq("company_id", companyId)
        .eq("active", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PendingRow[];
    },
  });

  const loading = loadingProfiles || loadingSectors;

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profilesQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["admin-sectors", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-pending-profiles", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-profile-cargos-map", companyId, profileIds] }),
    ]);
  };

  const handleOpenApprove = (req: PendingRow) => {
    setApproveTarget(req);
    setApproveRole("member");
    const firstCargo = req.profile_sector_requests.find((r) => r.cargo_id)?.cargo_id ?? null;
    setApproveCargoId(firstCargo);
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

    if (approveCargoId) {
      // Fetch sectors covered by this cargo
      const { data: cs } = await supabase
        .from("cargo_sectors")
        .select("sector_id")
        .eq("cargo_id", approveCargoId);
      const sectorIds = (cs ?? []).map((r) => r.sector_id as string);

      if (sectorIds.length > 0) {
        await supabase.from("sector_members").upsert(
          sectorIds.map((sid) => ({
            profile_id: approveTarget.id,
            sector_id: sid,
            role: "member" as const,
          })),
          { ignoreDuplicates: true }
        );
      }

      await supabase.from("profile_cargos").upsert(
        { profile_id: approveTarget.id, cargo_id: approveCargoId, sector_id: null },
        { onConflict: "profile_id" }
      );
    }

    for (const req of approveTarget.profile_sector_requests) {
      await supabase
        .from("profile_sector_requests")
        .update({ status: "approved" })
        .eq("id", req.id);
    }

    await logAdminAction({
      adminId: currentUserId,
      action: "approve_user",
      targetId: approveTarget.id,
      targetName: approveTarget.full_name,
      details: { cargo_id: approveCargoId, role: approveRole },
    });

    await sendNotificationEmail(
      approveTarget.recovery_email,
      "Seu acesso ao HubMowig foi aprovado",
      `<p>Olá, <strong>${approveTarget.full_name}</strong>!</p>
   <p>Seu acesso ao <strong>HubMowig</strong> foi aprovado. Você já pode fazer login em <a href="https://hubm.mowig.ind.br">hubm.mowig.ind.br</a>.</p>`
    );

    toast.success(`${approveTarget.full_name} aprovado.`);
    setApproveTarget(null);
    setApproveRole("member");
    setApproveCargoId(null);
    await reload();
  };

  const handleReject = async (id: string, name: string, email: string | null) => {
    await logAdminAction({
      adminId: currentUserId,
      action: "reject_user",
      targetId: id,
      targetName: name,
    });
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao rejeitar solicitação.");
      return;
    }
    await sendNotificationEmail(
      email,
      "Solicitação de acesso ao HubMowig",
      `<p>Olá, <strong>${name}</strong>.</p>
   <p>Infelizmente sua solicitação de acesso ao <strong>HubMowig</strong> não foi aprovada. Entre em contato com o administrador para mais informações.</p>`
    );
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
              const requestedCargo = req.profile_sector_requests.find((r) => r.cargos)?.cargos;
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
                        onClick={() => void handleReject(req.id, req.full_name, req.recovery_email)}
                        className="flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs text-text-primary hover:bg-accent-light"
                      >
                        <X className="w-3 h-3" /> Rejeitar
                      </button>
                    </div>
                  </div>
                  {requestedCargo && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-accent-light text-text-secondary border border-border">
                      {requestedCargo.name}
                    </span>
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
        cargosMap={cargosMap}
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
              <RoleSelector value={approveRole} onChange={setApproveRole} />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-text-secondary">Cargo</label>
              <select
                value={approveCargoId ?? ""}
                onChange={(e) => setApproveCargoId(e.target.value || null)}
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Sem cargo</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {approveCargoId && (
                <p className="text-xs text-text-muted">
                  Os setores do cargo serão atribuídos automaticamente.
                </p>
              )}
            </div>

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
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
