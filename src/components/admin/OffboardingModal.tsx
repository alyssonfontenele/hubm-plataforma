import { useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logAdminAction } from "@/lib/admin-log";
import { logSecurityEvent } from "@/lib/security-log";
import { classifyError } from "@/lib/errors";
import { handleError } from "@/lib/error-handler";

interface OffboardingModalProps {
  profile: Profile;
  adminId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void | Promise<void>;
}

export function OffboardingModal({
  profile,
  adminId,
  open,
  onOpenChange,
  onDone,
}: OffboardingModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // 1. Setar deactivated_at e active = false no perfil
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          deactivated_at: new Date().toISOString(),
          active: false,
        })
        .eq("id", profile.id);

      if (profileErr) throw profileErr;

      // 2. Revogar sessões ativas via Edge Function delete-user
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: profile.id }),
      });

      // 3. Registrar no audit log
      await logAdminAction({
        adminId,
        action: "delete_user",
        targetId: profile.id,
        targetName: profile.full_name,
        details: { reason: "offboarding", deactivated_at: new Date().toISOString() },
      });

      void logSecurityEvent("user_deleted", {
        reason: "offboarding",
        target_id: profile.id,
        target_name: profile.full_name,
      });

      toast.success(`Acesso de ${profile.full_name} revogado com sucesso.`);
      onOpenChange(false);
      await onDone();
    } catch (e) {
      handleError(classifyError(e), {
        onUnauthorized: () => onOpenChange(false),
      });
    } finally {
      setLoading(false);
    }
  };

  const lastLogin = profile.last_login_at
    ? new Date(profile.last_login_at).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "Nunca acessou";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <LogOut className="w-4 h-4" />
            Confirmar desligamento
          </DialogTitle>
          <DialogDescription>
            Esta ação revoga o acesso imediatamente e não pode ser desfeita sem intervenção manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Nome</span>
              <span className="font-medium text-text-primary">{profile.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Função</span>
              <span className="text-text-secondary">{profile.global_role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Último acesso</span>
              <span className="text-text-secondary">{lastLogin}</span>
            </div>
            {profile.recovery_email && (
              <div className="flex justify-between">
                <span className="text-text-muted">E-mail de recuperação</span>
                <span className="text-text-secondary truncate max-w-[180px]">{profile.recovery_email}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-destructive/30 bg-red-50 p-3 text-xs text-red-700 space-y-1">
            <p className="font-semibold">O que será feito automaticamente:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Conta marcada como inativa (<code>deactivated_at = now()</code>)</li>
              <li>Todas as sessões ativas revogadas</li>
              <li>Evento registrado no log de auditoria</li>
            </ul>
            <p className="font-semibold mt-2">O que precisa ser feito manualmente:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Remoção de acessos externos (Google Drive, Slack, etc.)</li>
              <li>Transferência de responsabilidades e arquivos</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {loading ? "Processando…" : "Confirmar desligamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
