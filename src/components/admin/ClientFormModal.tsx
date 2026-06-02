import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cpfToDigits,
  isValidCpf,
  maskCpf,
} from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-log";
import { sanitize } from "@/lib/sanitize";
import { isValidInitialPassword } from "@/components/admin/shared";

// ─── Create Client Modal ──────────────────────────────────────────────────────

interface CreateClientModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  adminId: string | null;
  onCreated: () => void;
}

export function CreateClientModal({
  open,
  onOpenChange,
  companyId,
  adminId,
  onCreated,
}: CreateClientModalProps) {
  const [identifierMode, setIdentifierMode] = useState<"cpf" | "email">("cpf");
  const [fullName, setFullName]           = useState("");
  const [cpf, setCpf]                     = useState("");
  const [email, setEmail]                 = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);

  useEffect(() => {
    if (!open) {
      setIdentifierMode("cpf");
      setFullName("");
      setCpf("");
      setEmail("");
      setRecoveryEmail("");
      setInitialPassword("");
      setShowPassword(false);
      setPasswordError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }

    if (identifierMode === "cpf") {
      if (!isValidCpf(cpf)) {
        toast.error("CPF inválido");
        return;
      }
      if (!recoveryEmail.trim()) {
        toast.error("Informe um e-mail de recuperação");
        return;
      }
    } else {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        toast.error("E-mail inválido");
        return;
      }
    }

    if (initialPassword && !isValidInitialPassword(initialPassword)) {
      setPasswordError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
      toast.error("Senha inicial inválida");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        full_name:        sanitize(fullName.trim()),
        company_id:       companyId,
        initial_password: initialPassword || undefined,
      };
      if (identifierMode === "cpf") {
        body.cpf            = cpfToDigits(cpf);
        body.recovery_email = recoveryEmail.trim().toLowerCase();
      } else {
        body.email = email.trim().toLowerCase();
      }

      const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
        "create-client-user",
        { body },
      );

      if (invokeErr) {
        try {
          const errBody = await (invokeErr as { context?: { json?: () => Promise<Record<string, unknown>> } }).context?.json?.();
          if (errBody?.error) { toast.error(String(errBody.error)); return; }
        } catch { /* ignore */ }
        toast.error("Erro ao criar cliente. Verifique os dados e tente novamente.");
        return;
      }

      const createdId = (invokeData?.user_id as string | undefined) ?? companyId;
      await logAdminAction({
        adminId,
        action: "create_client",
        targetId: createdId,
        targetName: fullName.trim(),
        details: {
          auth_type:  identifierMode,
          company_id: companyId,
        },
      });

      toast.success(
        identifierMode === "cpf"
          ? `Cliente criado. Acesso enviado para ${recoveryEmail.trim().toLowerCase()}.`
          : `Cliente criado. Acesso enviado para ${email.trim().toLowerCase()}.`,
      );
      onCreated();
    } catch {
      toast.error("Erro ao criar cliente. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Novo cliente</DialogTitle>
          <DialogDescription className="text-text-muted">
            Cadastre um cliente. Clientes não têm acesso a setores internos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="client_name">Nome completo</Label>
            <Input
              id="client_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              placeholder="Ex: João Silva"
            />
          </div>

          {/* Seletor de modo: CPF ou E-mail */}
          <div>
            <Label>Modo de identificação</Label>
            <div className="flex gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setIdentifierMode("cpf")}
                className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${
                  identifierMode === "cpf"
                    ? "border-text-primary bg-text-primary text-background"
                    : "border-border bg-surface text-text-secondary hover:bg-accent-light"
                }`}
              >
                CPF
              </button>
              <button
                type="button"
                onClick={() => setIdentifierMode("email")}
                className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${
                  identifierMode === "email"
                    ? "border-text-primary bg-text-primary text-background"
                    : "border-border bg-surface text-text-secondary hover:bg-accent-light"
                }`}
              >
                E-mail
              </button>
            </div>
          </div>

          {identifierMode === "cpf" ? (
            <>
              <div>
                <Label htmlFor="client_cpf">CPF</Label>
                <Input
                  id="client_cpf"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label htmlFor="client_recovery">E-mail de recuperação</Label>
                <Input
                  id="client_recovery"
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  maxLength={255}
                  placeholder="cliente@exemplo.com"
                />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="client_email">E-mail</Label>
              <Input
                id="client_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="cliente@exemplo.com"
              />
            </div>
          )}

          <div>
            <Label htmlFor="client_initial_password">Senha inicial</Label>
            <div className="relative">
              <Input
                id="client_initial_password"
                type={showPassword ? "text" : "password"}
                value={initialPassword}
                onChange={(e) => {
                  setInitialPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                onBlur={() => {
                  if (initialPassword && !isValidInitialPassword(initialPassword)) {
                    setPasswordError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
                  }
                }}
                placeholder="Mínimo 8 caracteres"
                maxLength={72}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordError ? (
              <p className="mt-1 text-xs text-destructive">{passwordError}</p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Se não preenchida, uma senha temporária será gerada automaticamente
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {submitting ? "Salvando…" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Client Modal ────────────────────────────────────────────────────────

interface EditClientModalProps {
  profile: Profile | null;
  adminId: string | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export function EditClientModal({
  profile,
  adminId,
  onOpenChange,
  onSaved,
}: EditClientModalProps) {
  const [fullName, setFullName]         = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newPassword, setNewPassword]   = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [pwError, setPwError]           = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setRecoveryEmail(profile.recovery_email ?? "");
      setNewPassword("");
      setShowPw(false);
      setPwError(null);
    }
  }, [profile]);

  if (!profile) return null;

  const save = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }
    if (newPassword && !isValidInitialPassword(newPassword)) {
      setPwError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
      return;
    }

    setSaving(true);
    try {
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name:      sanitize(fullName.trim()),
          recovery_email: recoveryEmail.trim().toLowerCase() || null,
        })
        .eq("id", profile.id);
      if (profErr) throw profErr;

      if (newPassword && profile.auth_type === "cpf") {
        const { error: pwErr } = await supabase.functions.invoke("admin-update-password", {
          body: { user_id: profile.id, new_password: newPassword },
        });
        if (pwErr) throw pwErr;
      }

      await logAdminAction({
        adminId,
        action: "edit_client",
        targetId: profile.id,
        targetName: fullName.trim(),
        details: { name_changed: profile.full_name !== fullName.trim() },
      });

      toast.success("Dados do cliente atualizados.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? `Falha: ${err.message}` : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Editar cliente</DialogTitle>
          <DialogDescription className="text-text-muted">
            Atualize as informações do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="ec_name">Nome completo</Label>
            <Input
              id="ec_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
            />
          </div>

          {profile.auth_type === "cpf" && (
            <div>
              <Label htmlFor="ec_rec">E-mail de recuperação</Label>
              <Input
                id="ec_rec"
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                maxLength={255}
              />
            </div>
          )}

          {profile.auth_type === "cpf" && (
            <div>
              <Label htmlFor="ec_pw">Nova senha inicial</Label>
              <div className="relative">
                <Input
                  id="ec_pw"
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (pwError) setPwError(null);
                  }}
                  onBlur={() => {
                    if (newPassword && !isValidInitialPassword(newPassword)) {
                      setPwError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
                    }
                  }}
                  placeholder="Deixe em branco para manter"
                  maxLength={72}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwError && <p className="mt-1 text-xs text-destructive">{pwError}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
