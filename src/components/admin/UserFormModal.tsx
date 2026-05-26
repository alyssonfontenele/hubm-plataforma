import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase, type GlobalRole, type SectorRole, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cellphoneToDigits,
  cpfToDigits,
  isValidCellphone,
  isValidCpf,
  maskCellphone,
  maskCpf,
} from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-log";
import { sanitize } from "@/lib/sanitize";
import {
  type Sector,
  type SectorAssignment,
  GLOBAL_ROLES,
  ROLE_LABEL,
  SECTOR_ROLES,
  SECTOR_ROLE_LABEL,
  isValidInitialPassword,
} from "@/components/admin/shared";

// ---------- Sector assignment picker (shared by both modals) ----------

function SectorAssignmentList({
  sectors,
  assignments,
  onToggle,
  onRoleChange,
}: {
  sectors: Sector[];
  assignments: SectorAssignment[];
  onToggle: (sectorId: string) => void;
  onRoleChange: (sectorId: string, role: SectorRole) => void;
}) {
  return (
    <div className="mt-2 space-y-2 border border-border rounded-md p-3">
      {sectors.length === 0 && (
        <p className="text-sm text-text-muted">Nenhum setor disponível.</p>
      )}
      {sectors.map((s) => {
        const assigned = assignments.find((a) => a.sector_id === s.id);
        return (
          <div key={s.id} className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={Boolean(assigned)}
                onChange={() => onToggle(s.id)}
                className="accent-text-primary"
              />
              {s.name}
            </label>
            {assigned && (
              <Select
                value={assigned.role}
                onValueChange={(v) => onRoleChange(s.id, v as SectorRole)}
              >
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTOR_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {SECTOR_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Create user modal ----------

interface UserFormModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sectors: Sector[];
  companyId: string;
  adminId: string | null;
  onCreated: () => void;
}

export function UserFormModal({
  open,
  onOpenChange,
  sectors,
  companyId,
  adminId,
  onCreated,
}: UserFormModalProps) {
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cellphone, setCellphone] = useState("");
  const [cellphoneError, setCellphoneError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [globalRole, setGlobalRole] = useState<GlobalRole>("member");
  const [assignments, setAssignments] = useState<SectorAssignment[]>([]);
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setFullName("");
      setCpf("");
      setCellphone("");
      setCellphoneError(null);
      setRecoveryEmail("");
      setGlobalRole("member");
      setAssignments([]);
      setInitialPassword("");
      setShowPassword(false);
      setPasswordError(null);
    }
  }, [open]);

  const toggleSector = (sectorId: string) => {
    setAssignments((prev) =>
      prev.some((a) => a.sector_id === sectorId)
        ? prev.filter((a) => a.sector_id !== sectorId)
        : [...prev, { sector_id: sectorId, role: "member" }],
    );
  };

  const setAssignmentRole = (sectorId: string, role: SectorRole) => {
    setAssignments((prev) => prev.map((a) => (a.sector_id === sectorId ? { ...a, role } : a)));
  };

  const assignmentsPayload = useMemo(
    () => assignments.map((a) => ({ sector_id: a.sector_id, role: a.role })),
    [assignments],
  );

  const GENERIC_CREATE_ERROR = "Erro ao criar usuário. Verifique os dados e tente novamente.";

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }
    if (!isValidCpf(cpf)) {
      toast.error("CPF inválido");
      return;
    }
    if (!isValidCellphone(cellphone)) {
      setCellphoneError("Celular inválido");
      toast.error("Celular inválido");
      return;
    }
    if (!recoveryEmail.trim()) {
      toast.error("Informe um e-mail de recuperação");
      return;
    }
    if (initialPassword && !isValidInitialPassword(initialPassword)) {
      setPasswordError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
      toast.error("Senha inicial inválida");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-cpf-user", {
        body: {
          full_name: sanitize(fullName.trim()),
          cpf: cpfToDigits(cpf),
          recovery_email: recoveryEmail.trim().toLowerCase(),
          cellphone: cellphoneToDigits(cellphone),
          company_id: companyId,
          global_role: globalRole,
          sector_assignments: assignmentsPayload,
          initial_password: initialPassword || undefined,
        },
      });
      console.log("[CreateUser] invoke result:", JSON.stringify(data), JSON.stringify(error));
      if (error) {
        const msg = typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : null;
        toast.error(msg || GENERIC_CREATE_ERROR);
        return;
      }

      const createdId =
        (data as { user_id?: string; id?: string } | null)?.user_id ??
        (data as { user_id?: string; id?: string } | null)?.id ??
        cpfToDigits(cpf);
      await logAdminAction({
        adminId,
        action: "create_user",
        targetId: createdId,
        targetName: fullName.trim(),
        details: {
          auth_type: "cpf",
          global_role: globalRole,
          recovery_email: recoveryEmail.trim().toLowerCase(),
        },
      });
      toast.success(
        `Usuário criado com sucesso. E-mail de acesso enviado para ${recoveryEmail.trim().toLowerCase()}.`,
      );
      onCreated();
    } catch {
      toast.error(GENERIC_CREATE_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Novo usuário</DialogTitle>
          <DialogDescription className="text-text-muted">
            Cadastre um usuário e atribua os setores que ele poderá acessar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              placeholder="Ex: Maria Silva"
            />
          </div>

          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>

          <div>
            <Label htmlFor="cellphone">Celular</Label>
            <Input
              id="cellphone"
              value={cellphone}
              onChange={(e) => {
                setCellphone(maskCellphone(e.target.value));
                if (cellphoneError) setCellphoneError(null);
              }}
              onBlur={() => {
                if (cellphone && !isValidCellphone(cellphone)) {
                  setCellphoneError("Celular inválido");
                }
              }}
              placeholder="(00) 00000-0000"
              maxLength={16}
              inputMode="numeric"
            />
            {cellphoneError && (
              <p className="mt-1 text-xs text-destructive">{cellphoneError}</p>
            )}
          </div>

          <div>
            <Label htmlFor="recovery">E-mail de recuperação</Label>
            <Input
              id="recovery"
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              maxLength={255}
              placeholder="maria@exemplo.com"
            />
          </div>

          <div>
            <Label htmlFor="initial_password">Senha inicial</Label>
            <div className="relative">
              <Input
                id="initial_password"
                type={showPassword ? "text" : "password"}
                value={initialPassword}
                onChange={(e) => {
                  setInitialPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                onBlur={() => {
                  if (initialPassword && !isValidInitialPassword(initialPassword)) {
                    setPasswordError(
                      "A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula",
                    );
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
                Se não preenchida, uma senha será gerada automaticamente
              </p>
            )}
          </div>

          <div>
            <Label>Papel global</Label>
            <Select value={globalRole} onValueChange={(v) => setGlobalRole(v as GlobalRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLOBAL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Setores</Label>
            <SectorAssignmentList
              sectors={sectors}
              assignments={assignments}
              onToggle={toggleSector}
              onRoleChange={setAssignmentRole}
            />
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
            {submitting ? "Salvando…" : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit user modal ----------

interface EditUserModalProps {
  profile: Profile | null;
  sectors: Sector[];
  adminId: string | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export function EditUserModal({
  profile,
  sectors,
  adminId,
  onOpenChange,
  onSaved,
}: EditUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [cellphone, setCellphone] = useState("");
  const [cellphoneError, setCellphoneError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [globalRole, setGlobalRole] = useState<GlobalRole>("member");
  const [assignments, setAssignments] = useState<SectorAssignment[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCellphone(profile.cellphone ? maskCellphone(profile.cellphone) : "");
      setRecoveryEmail(profile.recovery_email ?? "");
      setGlobalRole(profile.global_role);
      setNewPassword("");
      setShowPw(false);
      setPwError(null);
      setCellphoneError(null);
      void (async () => {
        const { data } = await supabase
          .from("sector_members")
          .select("sector_id, role")
          .eq("profile_id", profile.id);
        setAssignments((data as SectorAssignment[] | null) ?? []);
      })();
    }
  }, [profile]);

  if (!profile) return null;

  const toggleSector = (id: string) => {
    setAssignments((prev) =>
      prev.some((a) => a.sector_id === id)
        ? prev.filter((a) => a.sector_id !== id)
        : [...prev, { sector_id: id, role: "member" }],
    );
  };

  const setAssignmentRole = (sectorId: string, role: SectorRole) => {
    setAssignments((prev) =>
      prev.map((a) => (a.sector_id === sectorId ? { ...a, role } : a)),
    );
  };

  const save = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }
    if (cellphone && !isValidCellphone(cellphone)) {
      setCellphoneError("Celular inválido");
      return;
    }
    if (newPassword && !isValidInitialPassword(newPassword)) {
      setPwError("A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula");
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        full_name: sanitize(fullName.trim()),
        cellphone: cellphone ? cellphoneToDigits(cellphone) : null,
        recovery_email: recoveryEmail.trim().toLowerCase() || null,
        global_role: globalRole,
      };
      if (newPassword) {
        patch.must_change_password = true;
      }
      const { error: profErr } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", profile.id);
      if (profErr) throw profErr;

      const { error: deleteError } = await supabase
        .from("sector_members")
        .delete()
        .eq("profile_id", profile.id);
      if (deleteError) {
        toast.error("Erro ao atualizar setores: " + deleteError.message);
        return;
      }

      if (assignments.length > 0) {
        const { error: insertError } = await supabase
          .from("sector_members")
          .insert(
            assignments.map((a) => ({
              profile_id: profile.id,
              sector_id: a.sector_id,
              role: a.role,
            })),
          );
        if (insertError) {
          toast.error("Erro ao atualizar setores: " + insertError.message);
          return;
        }
      }

      if (newPassword && profile.auth_type === "cpf") {
        const { error: pwErr } = await supabase.functions.invoke("admin-update-password", {
          body: { user_id: profile.id, new_password: newPassword },
        });
        if (pwErr) throw pwErr;
      }

      await logAdminAction({
        adminId,
        action: "edit_user",
        targetId: profile.id,
        targetName: fullName.trim(),
        details: {
          global_role: globalRole,
          sectors_count: assignments.length,
          name_changed: profile.full_name !== fullName.trim(),
        },
      });
      if (newPassword && profile.auth_type === "cpf") {
        await logAdminAction({
          adminId,
          action: "reset_password",
          targetId: profile.id,
          targetName: fullName.trim(),
          details: { must_change_password: true },
        });
      }
      toast.success("Dados do usuário atualizados com sucesso.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? `Falha: ${err.message}` : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Editar usuário</DialogTitle>
          <DialogDescription className="text-text-muted">
            Atualize as informações do usuário.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="e_name">Nome completo</Label>
            <Input
              id="e_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <Label htmlFor="e_cell">Celular</Label>
            <Input
              id="e_cell"
              value={cellphone}
              onChange={(e) => {
                setCellphone(maskCellphone(e.target.value));
                if (cellphoneError) setCellphoneError(null);
              }}
              onBlur={() => {
                if (cellphone && !isValidCellphone(cellphone)) {
                  setCellphoneError("Celular inválido");
                }
              }}
              placeholder="(00) 00000-0000"
              maxLength={16}
              inputMode="numeric"
            />
            {cellphoneError && <p className="mt-1 text-xs text-destructive">{cellphoneError}</p>}
          </div>

          <div>
            <Label htmlFor="e_rec">E-mail de recuperação</Label>
            <Input
              id="e_rec"
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              maxLength={255}
            />
          </div>

          <div>
            <Label>Papel global</Label>
            <Select value={globalRole} onValueChange={(v) => setGlobalRole(v as GlobalRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLOBAL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Setores</Label>
            <SectorAssignmentList
              sectors={sectors}
              assignments={assignments}
              onToggle={toggleSector}
              onRoleChange={setAssignmentRole}
            />
          </div>

          {profile.auth_type === "cpf" && (
            <div>
              <Label htmlFor="e_pw">Nova senha inicial</Label>
              <div className="relative">
                <Input
                  id="e_pw"
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (pwError) setPwError(null);
                  }}
                  onBlur={() => {
                    if (newPassword && !isValidInitialPassword(newPassword)) {
                      setPwError(
                        "A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula",
                      );
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
              {pwError ? (
                <p className="mt-1 text-xs text-destructive">{pwError}</p>
              ) : (
                <p className="mt-1 text-xs text-text-muted">
                  Se preenchida, a senha será redefinida e o usuário precisará alterá-la no próximo
                  acesso.
                </p>
              )}
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
