import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, type Profile } from "@/integrations/supabase/client";
import {
  cpfToDigits,
  isValidCpf,
  maskCellphone,
  maskCpf,
} from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-log";
import { useRescueByCPF } from "@/hooks/useRescueByCPF";

interface RescueByCPFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string | null;
  onReactivated: () => void;
}

export function RescueByCPFDialog({
  open,
  onOpenChange,
  adminId,
  onReactivated,
}: RescueByCPFDialogProps) {
  const [cpf, setCpf] = useState("");
  const [found, setFound] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const { lookup, loading: searching } = useRescueByCPF();

  useEffect(() => {
    if (!open) {
      setCpf("");
      setFound(null);
      setNotFound(false);
      setReactivating(false);
    }
  }, [open]);

  const search = async () => {
    if (!isValidCpf(cpf)) {
      toast.error("CPF inválido");
      return;
    }
    setNotFound(false);
    setFound(null);
    try {
      const result = await lookup(cpfToDigits(cpf));
      if (result.status === "not_found" || result.status === "deleted") {
        setNotFound(true);
      } else {
        setFound(result.profile);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar usuário.");
    }
  };

  const reactivate = async () => {
    if (!found) return;
    setReactivating(true);
    try {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          active: true,
          deleted_at: null,
          must_change_password: true,
        })
        .eq("id", found.id);
      if (updErr) throw updErr;

      if (found.recovery_email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: found.recovery_email,
            subject: "Seu acesso ao HubM foi reativado",
            template: "user-reactivated",
            data: { full_name: found.full_name },
          },
        });
      }
      await logAdminAction({
        adminId,
        action: "reactivate_user",
        targetId: found.id,
        targetName: found.full_name,
        details: { via: "rescue", new_status: "active" },
      });
      toast.success("Usuário reativado com sucesso. E-mail de acesso reenviado.");
      onReactivated();
    } catch (err) {
      toast.error(err instanceof Error ? `Falha: ${err.message}` : "Falha ao reativar usuário.");
    } finally {
      setReactivating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Resgatar usuário</DialogTitle>
          <DialogDescription className="text-text-muted">
            Informe o CPF do usuário para reativar o acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="rescue_cpf">CPF</Label>
            <div className="flex gap-2">
              <Input
                id="rescue_cpf"
                value={cpf}
                onChange={(e) => {
                  setCpf(maskCpf(e.target.value));
                  setNotFound(false);
                  setFound(null);
                }}
                placeholder="000.000.000-00"
                maxLength={14}
                inputMode="numeric"
              />
              <Button
                onClick={() => void search()}
                disabled={searching}
                variant="outline"
                className="border-border"
              >
                {searching ? "Buscando…" : "Buscar"}
              </Button>
            </div>
            {notFound && (
              <p className="mt-2 text-xs text-text-muted">
                Nenhum usuário ativo encontrado com este CPF.
              </p>
            )}
            {found && found.active === false && (
              <p className="mt-2 text-xs text-text-muted">
                Usuário encontrado mas está suspenso. Deseja reativá-lo?
              </p>
            )}
          </div>

          {found && (
            <div className="border border-border rounded-md p-4 space-y-2 bg-background">
              <div>
                <p className="text-xs text-text-muted">Nome</p>
                <p className="text-sm text-text-primary">{found.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">E-mail de recuperação</p>
                <p className="text-sm text-text-primary">{found.recovery_email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Celular</p>
                <p className="text-sm text-text-primary">
                  {found.cellphone ? maskCellphone(found.cellphone) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Papel global</p>
                <p className="text-sm text-text-primary capitalize">{found.global_role}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {found && (
            <Button
              onClick={() => void reactivate()}
              disabled={reactivating}
              className="bg-text-primary text-background hover:bg-text-primary/90"
            >
              {reactivating ? "Reativando…" : "Reativar acesso"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
