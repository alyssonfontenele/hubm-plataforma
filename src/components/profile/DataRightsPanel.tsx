import { useState } from "react";
import { toast } from "sonner";
import { Download, Edit2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/data-rights`;

async function callDataRights(action: string, extra?: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function DataRightsPanel() {
  const [exportLoading,  setExportLoading]  = useState(false);
  const [correctOpen,    setCorrectOpen]    = useState(false);
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [correctName,    setCorrectName]    = useState("");
  const [correctEmail,   setCorrectEmail]   = useState("");
  const [correctLoading, setCorrectLoading] = useState(false);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const data = await callDataRights("export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-hubm-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Seus dados foram exportados.");
    } catch {
      toast.error("Erro ao exportar dados. Tente novamente.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleCorrect = async () => {
    if (!correctName.trim() && !correctEmail.trim()) {
      toast.error("Informe ao menos um campo para corrigir.");
      return;
    }
    setCorrectLoading(true);
    try {
      await callDataRights("correct", {
        ...(correctName.trim()  && { name: correctName.trim() }),
        ...(correctEmail.trim() && { email: correctEmail.trim() }),
      });
      toast.success("Dados corrigidos com sucesso.");
      setCorrectOpen(false);
      setCorrectName("");
      setCorrectEmail("");
    } catch {
      toast.error("Erro ao corrigir dados. Tente novamente.");
    } finally {
      setCorrectLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await callDataRights("delete");
      toast.success("Seus dados foram anonimizados. Você será desconectado.");
      setTimeout(() => supabase.auth.signOut(), 2000);
    } catch {
      toast.error("Erro ao anonimizar dados. Tente novamente.");
    } finally {
      setDeleteLoading(false);
      setDeleteOpen(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Meus dados</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Exercite seus direitos como titular de dados conforme a LGPD.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Exportar */}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-text-secondary" />
            <p className="text-sm font-medium text-text-primary">Exportar meus dados</p>
          </div>
          <p className="text-xs text-text-muted">
            Baixe um arquivo JSON com todos os seus dados pessoais armazenados no sistema.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void handleExport()}
            disabled={exportLoading}
          >
            {exportLoading ? "Exportando…" : "Baixar meus dados"}
          </Button>
        </div>

        {/* Corrigir */}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-text-secondary" />
            <p className="text-sm font-medium text-text-primary">Corrigir meus dados</p>
          </div>
          <p className="text-xs text-text-muted">
            Solicite a correção de nome ou e-mail de recuperação.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setCorrectOpen(true)}
          >
            Solicitar correção
          </Button>
        </div>

        {/* Excluir */}
        <div className="rounded-lg border border-destructive/30 bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-destructive" />
            <p className="text-sm font-medium text-destructive">Solicitar exclusão</p>
          </div>
          <p className="text-xs text-text-muted">
            Seus dados serão anonimizados e o acesso revogado imediatamente.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => setDeleteOpen(true)}
          >
            Solicitar exclusão
          </Button>
        </div>
      </div>

      {/* Modal correção */}
      <AlertDialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Corrigir meus dados</AlertDialogTitle>
            <AlertDialogDescription>
              Preencha apenas os campos que deseja corrigir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Novo nome completo"
              value={correctName}
              onChange={e => setCorrectName(e.target.value)}
            />
            <Input
              placeholder="Novo e-mail de recuperação"
              type="email"
              value={correctEmail}
              onChange={e => setCorrectEmail(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={correctLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCorrect()} disabled={correctLoading}>
              {correctLoading ? "Salvando…" : "Confirmar correção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Confirmar exclusão de dados</AlertDialogTitle>
            <AlertDialogDescription>
              Seus dados pessoais serão anonimizados (nome, CPF, e-mail substituídos por valores genéricos) e seu acesso será revogado imediatamente. Esta ação não pode ser desfeita sem intervenção do administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteLoading ? "Processando…" : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
