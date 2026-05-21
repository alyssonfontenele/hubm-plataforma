import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { cpfToDigits, isValidCpf, maskCpf } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-log";
import { useRescueByCPF } from "@/hooks/useRescueByCPF";
import { adminProfilesQueryKey } from "@/hooks/useAdminUsers";

interface RescueByCPFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string | null;
  companyId: string;
  onReactivated: () => void;
}

export function RescueByCPFDialog({
  open,
  onOpenChange,
  adminId,
  companyId,
  onReactivated,
}: RescueByCPFDialogProps) {
  const queryClient = useQueryClient();
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
      if (result.status === "deleted" && result.profile) {
        setFound(result.profile);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar usuário.");
    }
  };

  const reactivate = async () => {
    if (!found) return;
    setReactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-reactivate-user",
        {
          body: {
            full_name: found.full_name,
            global_role: found.global_role,
          },
        },
      );

      await queryClient.invalidateQueries({
        queryKey: adminProfilesQueryKey(companyId),
      });

      const body = (data ?? null) as { success?: boolean } | null;
      if (error || body?.success !== true) {
        toast.error("Falha ao reativar usuário.");
        return;
      }

      await logAdminAction({
        adminId,
        action: "reactivate_user",
        targetId: found.id,
        targetName: found.full_name,
        details: { via: "rescue_by_cpf" },
      });
      toast.success("Usuário reativado com sucesso.");
      onReactivated();
    } catch {
      toast.error("Falha ao reativar usuário.");
    } finally {
      setReactivating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">
            Resgatar usuário excluído
          </DialogTitle>
          <DialogDescription className="text-text-muted">
            Informe o CPF do usuário removido para reativar o acesso.
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
                Nenhum cadastro removido encontrado com este CPF.
              </p>
            )}
          </div>

          {found && (
            <div className="border border-border rounded-md p-4 space-y-2 bg-background">
              <p className="text-sm text-text-primary">
                Reativar acesso de <strong>{found.full_name}</strong>?
              </p>
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
