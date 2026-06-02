import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserX, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateClientModal, EditClientModal } from "@/components/admin/ClientFormModal";
import { logAdminAction } from "@/lib/admin-log";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";

const clientsQueryKey = (companyId: string) => ["admin-clients", companyId] as const;

interface ClientsTabProps {
  companyId: string;
  currentUserId: string | null;
}

export function ClientsTab({ companyId, currentUserId }: ClientsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: clientsQueryKey(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .eq("global_role", "cliente")
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data as Profile[] | null) ?? [];
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: clientsQueryKey(companyId) });

  const handleSuspend = async (profile: Profile) => {
    try {
      const newActive = !profile.active;
      const { error } = await supabase
        .from("profiles")
        .update({ active: newActive })
        .eq("id", profile.id);
      if (error) throw error;
      await logAdminAction({
        adminId:    currentUserId,
        action:     newActive ? "reactivate_client" : "suspend_client",
        targetId:   profile.id,
        targetName: profile.full_name,
        targetType: "client",
        details:    { active: newActive },
      });
      toast.success(newActive ? "Cliente reativado." : "Cliente suspenso.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar cliente.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Clientes</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Clientes têm acesso apenas ao portal do cliente — sem visibilidade de setores ou dados internos.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="bg-text-primary text-background hover:bg-text-primary/90 gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </div>

      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>E-mail de recuperação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted py-8">
                  Nenhum cliente cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id} className="border-border">
                  <TableCell className="font-medium text-text-primary">{c.full_name}</TableCell>
                  <TableCell className="text-text-secondary text-sm">
                    {c.auth_type === "cpf" ? "CPF" : "E-mail"}
                  </TableCell>
                  <TableCell className="text-text-secondary text-sm">
                    {c.recovery_email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.active ? (
                      <Badge variant="outline" className="text-xs border-success/30 bg-success-light text-success-text">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-800">
                        Suspenso
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Editar"
                        onClick={() => setEditTarget(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={c.active ? "Suspender" : "Reativar"}
                        onClick={() => void handleSuspend(c)}
                      >
                        {c.active
                          ? <UserX className="h-4 w-4 text-amber-600" />
                          : <RotateCcw className="h-4 w-4 text-green-600" />
                        }
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Excluir"
                        onClick={() => setDeleteTarget(c)}
                        disabled={c.id === currentUserId}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateClientModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        adminId={currentUserId}
        onCreated={() => { setCreateOpen(false); refresh(); }}
      />

      <EditClientModal
        profile={editTarget}
        adminId={currentUserId}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        onSaved={() => { setEditTarget(null); refresh(); }}
      />

      {deleteTarget && (
        <DeleteUserDialog
          open={!!deleteTarget}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          profile={deleteTarget}
          companyId={companyId}
          adminId={currentUserId}
          onDeleted={() => { setDeleteTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}
