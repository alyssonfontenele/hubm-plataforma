import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function SecuritySection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error) {
      const verified = data?.totp?.find((f) => f.status === "verified");
      setFactorId(verified?.id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRemove = async () => {
    if (!factorId) return;
    setRemoving(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setRemoving(false);
    setConfirmOpen(false);
    if (error) {
      toast.error("Falha ao remover MFA: " + error.message);
      return;
    }
    toast.success("Autenticação em duas etapas removida.");
    setFactorId(null);
  };

  const enrolled = !!factorId;

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm font-medium text-text-primary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Segurança
        </p>
        <p className="text-xs text-text-muted">
          Proteja sua conta com camadas extras de autenticação.
        </p>
      </header>

      <div className="border border-border rounded-lg bg-surface p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">
              Autenticação em duas etapas (MFA)
            </p>
            {enrolled && (
              <Badge variant="outline" className="border-border text-text-primary">
                Ativo
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            {enrolled
              ? "Sua conta exige um código TOTP a cada novo acesso."
              : "Adicione um aplicativo autenticador para reforçar a segurança da sua conta."}
          </p>
        </div>
        <div className="shrink-0">
          {loading ? (
            <span className="text-xs text-text-muted">Carregando…</span>
          ) : enrolled ? (
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setConfirmOpen(true)}
            >
              Remover
            </Button>
          ) : (
            <Button
              onClick={() => void navigate({ to: "/setup-mfa" })}
              className="bg-text-primary text-background hover:bg-text-primary/90"
            >
              Ativar
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover autenticação em duas etapas</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover a autenticação em duas etapas? Sua conta ficará menos protegida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void handleRemove();
              }}
            >
              {removing ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function SettingsTab() {
  return (
    <div className="space-y-6">
      <SecuritySection />
    </div>
  );
}
