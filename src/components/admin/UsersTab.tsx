import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserList } from "@/components/admin/UserList";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserFormModal, EditUserModal } from "@/components/admin/UserFormModal";
import { adminProfilesQueryKey, useAdminUsers } from "@/hooks/useAdminUsers";
import type { Sector } from "@/components/admin/shared";

interface UsersTabProps {
  companyId: string;
  currentUserId: string | null;
}

export function UsersTab({ companyId, currentUserId }: UsersTabProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);

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

  const loading = loadingProfiles || loadingSectors;

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profilesQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["admin-sectors", companyId] }),
    ]);
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

      <div className="rounded-md border border-border bg-surface/50 p-3 text-xs text-text-muted">
        Usuários Google são adicionados automaticamente ao fazer login pela primeira vez com um
        domínio autorizado.
      </div>

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
    </div>
  );
}
