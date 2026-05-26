import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { logAdminAction, type AdminAction } from "@/lib/admin-log";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";

type ConfirmDef = {
  title: string;
  description: string;
  actionLabel: string;
  run: () => Promise<void>;
};

interface UserActionsMenuProps {
  profile: Profile;
  isSelf: boolean;
  adminId: string | null;
  companyId: string;
  onChanged: () => void | Promise<void>;
  onEdit: () => void;
}

export function UserActionsMenu({
  profile,
  isSelf,
  adminId,
  companyId,
  onChanged,
  onEdit,
}: UserActionsMenuProps) {
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmDef | null>(null);
  const [simpleDeleteOpen, setSimpleDeleteOpen] = useState(false);

  const updateProfile = async (
    patch: Record<string, unknown>,
    successMsg: string,
    log?: { action: AdminAction; details?: Record<string, unknown> },
  ) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
    if (error) {
      toast.error("Falha: " + error.message);
      return;
    }
    if (log) {
      await logAdminAction({
        adminId,
        action: log.action,
        targetId: profile.id,
        targetName: profile.full_name,
        details: log.details,
      });
    }
    toast.success(successMsg);
    await onChanged();
  };

  const suspend = () =>
    setConfirm({
      title: "Suspender usuário",
      description: `Tem certeza que deseja suspender ${profile.full_name}? O acesso será bloqueado imediatamente.`,
      actionLabel: "Suspender",
      run: () =>
        updateProfile({ active: false }, `${profile.full_name} suspenso.`, {
          action: "suspend_user",
          details: { previous_status: "active", new_status: "suspended" },
        }),
    });

  const inactivate = () =>
    setConfirm({
      title: "Inativar usuário",
      description: `Esta ação desativará permanentemente ${profile.full_name}. Os dados serão preservados mas o acesso será removido.`,
      actionLabel: "Inativar",
      run: () =>
        updateProfile(
          { active: false, deleted_at: new Date().toISOString() },
          `${profile.full_name} inativado.`,
          {
            action: "inactivate_user",
            details: { previous_status: profile.active ? "active" : "suspended" },
          },
        ),
    });

  const reactivate = () =>
    setConfirm({
      title: "Reativar usuário",
      description: `Deseja reativar o acesso de ${profile.full_name}?`,
      actionLabel: "Reativar",
      run: () =>
        updateProfile({ active: true, deleted_at: null }, `${profile.full_name} reativado.`, {
          action: "reactivate_user",
          details: { new_status: "active" },
        }),
    });

  const forcePw = () =>
    setConfirm({
      title: "Forçar troca de senha",
      description: `${profile.full_name} será solicitado a redefinir a senha no próximo acesso.`,
      actionLabel: "Confirmar",
      run: () =>
        updateProfile({ must_change_password: true }, "Troca de senha exigida no próximo acesso.", {
          action: "force_password_reset",
        }),
    });

  const resendAccess = async () => {
    const { data, error } = await supabase.functions.invoke("resend-access", {
      body: { profile_id: profile.id },
    });
    const errCode =
      (data as { error?: string } | null)?.error ??
      (error as { context?: { error?: string } } | null)?.context?.error;
    if (error || errCode) {
      if (errCode === "no_recovery_email") {
        toast.error("Este usuário não possui e-mail de recuperação cadastrado.");
      } else {
        toast.error("Falha ao reenviar acesso. Tente novamente.");
      }
      return;
    }
    await logAdminAction({
      adminId,
      action: "resend_access",
      targetId: profile.id,
      targetName: profile.full_name,
      details: { recovery_email: profile.recovery_email },
    });
    toast.success("E-mail de acesso reenviado com sucesso.");
  };

  const isInactive = !!profile.deleted_at;
  const canForcePw = profile.auth_type === "cpf" && !isInactive;
  const canResend = profile.auth_type === "cpf" && profile.must_change_password && !isInactive;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações para ${profile.full_name}`}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isInactive && profile.active && (
            <DropdownMenuItem disabled={isSelf} onSelect={suspend}>
              Suspender
            </DropdownMenuItem>
          )}
          {!isInactive && (
            <DropdownMenuItem disabled={isSelf} onSelect={inactivate}>
              Inativar
            </DropdownMenuItem>
          )}
          {(!profile.active || isInactive) && (
            <DropdownMenuItem onSelect={reactivate}>Reativar</DropdownMenuItem>
          )}
          {canForcePw && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={forcePw}>Forçar troca de senha</DropdownMenuItem>
            </>
          )}
          {canResend && (
            <DropdownMenuItem onSelect={() => void resendAccess()}>
              Reenviar acesso
            </DropdownMenuItem>
          )}
          {isInactive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSelf}
                onSelect={() => {
                  setDeleteConfirmText("");
                  setDeleteStep(1);
                }}
                className="text-destructive focus:text-destructive"
              >
                Excluir definitivamente
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            onSelect={() => setSimpleDeleteOpen(true)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteUserDialog
        open={simpleDeleteOpen}
        onOpenChange={setSimpleDeleteOpen}
        profile={profile}
        companyId={companyId}
        adminId={adminId}
        onDeleted={onChanged}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                if (c) await c.run();
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteStep === 1} onOpenChange={(o) => !o && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Esta ação é irreversível e removerá o acesso de {profile.full_name}{" "}
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setDeleteStep(2);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteStep === 2} onOpenChange={(o) => !o && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação final</AlertDialogTitle>
            <AlertDialogDescription>
              Digite <strong>EXCLUIR</strong> para confirmar a exclusão permanente de{" "}
              {profile.full_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="EXCLUIR"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== "EXCLUIR" || deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (deleteConfirmText !== "EXCLUIR") return;
                setDeleting(true);
                try {
                  const { error: fnErr } = await supabase.functions.invoke("delete-user", {
                    body: { user_id: profile.id },
                  });
                  if (fnErr) throw fnErr;
                  await logAdminAction({
                    adminId,
                    action: "delete_user",
                    targetId: profile.id,
                    targetName: profile.full_name,
                    details: { auth_type: profile.auth_type },
                  });
                  toast.success("Usuário excluído permanentemente.");
                  setDeleteStep(0);
                  await onChanged();
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? `Falha ao excluir: ${err.message}`
                      : "Falha ao excluir usuário.",
                  );
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Excluindo…" : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
