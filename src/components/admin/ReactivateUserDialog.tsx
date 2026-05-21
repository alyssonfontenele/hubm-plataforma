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
import { useReactivateUser } from "@/hooks/useReactivateUser";

interface ReactivateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  fullName: string;
  globalRole: string;
  /** Called after a successful reactivation (success: true). */
  onReactivated?: () => void;
}

/**
 * Self-contained reactivation dialog.
 *
 * Shown when `create-cpf-user` returns
 * "A user with this email address has already been registered".
 * On confirm, calls `admin-reactivate-user` with `{ full_name, global_role }`
 * via {@link useReactivateUser}, which always invalidates the admin profiles
 * query (success or error).
 */
export function ReactivateUserDialog({
  open,
  onOpenChange,
  companyId,
  fullName,
  globalRole,
  onReactivated,
}: ReactivateUserDialogProps) {
  const { mutate, isPending } = useReactivateUser(companyId);

  const handleConfirm = () => {
    mutate(
      { full_name: fullName, global_role: globalRole },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success("Usuário reativado com sucesso.");
            onOpenChange(false);
            onReactivated?.();
          } else {
            toast.error("Falha ao reativar usuário.");
          }
        },
        onError: () => {
          toast.error("Falha ao reativar usuário.");
        },
      },
    );
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isPending) return;
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usuário já cadastrado</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja reativar o acesso?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {isPending ? "Reativando…" : "Reativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
