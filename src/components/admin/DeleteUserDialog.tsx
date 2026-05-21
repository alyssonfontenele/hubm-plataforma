import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile } from "@/integrations/supabase/client";
import { useDeleteUser } from "@/hooks/useDeleteUser";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  companyId: string;
  adminId: string | null;
  onDeleted?: () => void | Promise<void>;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  profile,
  companyId,
  adminId,
  onDeleted,
}: DeleteUserDialogProps) {
  const deleteUser = useDeleteUser(companyId);
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
          <AlertDialogDescription>
            {profile.full_name} será removido da plataforma. Os registros de auditoria serão
            preservados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await deleteUser.mutateAsync({
                  userId: profile.id,
                  fullName: profile.full_name,
                  authType: profile.auth_type,
                  adminId,
                });
                toast.success("Usuário excluído.");
                onOpenChange(false);
                await onDeleted?.();
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? `Falha ao excluir: ${err.message}`
                    : "Falha ao excluir usuário.",
                );
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
