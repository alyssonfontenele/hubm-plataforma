import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Plus, UserCog, LifeBuoy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  supabase,
  type GlobalRole,
  type SectorRole,
  type AuthType,
  type Profile,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import {
  cellphoneToDigits,
  cpfToDigits,
  isValidCellphone,
  isValidCpf,
  maskCellphone,
  maskCpf,
} from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — HubM" }] }),
  component: AdminPage,
});

interface Sector {
  id: string;
  name: string;
  slug: string;
}

interface SectorAssignment {
  sector_id: string;
  role: SectorRole;
}

const GLOBAL_ROLES: GlobalRole[] = ["admin", "manager", "member", "viewer", "operational"];
const SECTOR_ROLES: SectorRole[] = ["manager", "member", "viewer"];

function AdminPage() {
  const { globalRole, company, loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && globalRole !== "admin") {
      void navigate({ to: "/app" });
    }
  }, [loading, globalRole, navigate]);

  if (globalRole !== "admin" || !company) return null;
  return <UsersTab companyId={company.id} currentUserId={session?.user?.id ?? null} />;
}

// ---------- Friendly error mapper ----------

function friendlyCreateError(message: string): string {
  const raw = message?.trim() ?? "";
  const m = raw.toLowerCase();
  if (!raw) return "Erro ao criar usuário. Tente novamente.";
  if (m.includes("user inactive") || m.includes("usuário inativado") || m.includes("usuario inativado"))
    return "Este CPF pertence a um usuário inativado. Use a opção de resgate para reativá-lo.";
  if (m.includes("invalid cpf"))
    return "CPF inválido. Verifique os dígitos informados.";
  if (m.includes("not null violation") || m.includes("not-null"))
    return "Preencha todos os campos obrigatórios.";
  if (m.includes("foreign key"))
    return "Empresa não encontrada. Tente novamente.";
  if (
    (m.includes("already registered") || m.includes("duplicate")) &&
    (m.includes("hubm.internal") || m.includes("cpf"))
  )
    return "Este CPF já está cadastrado no sistema.";
  if (m.includes("duplicate") && m.includes("recovery_email"))
    return "Este e-mail de recuperação já está em uso por outro usuário.";
  if (m.includes("duplicate") && m.includes("cellphone"))
    return "Este celular já está cadastrado no sistema.";
  return `Erro ao criar usuário: ${raw}`;
}

function isValidInitialPassword(pw: string): boolean {
  return pw.length >= 8 && /\d/.test(pw) && /[A-Z]/.test(pw);
}

// ---------- Users tab ----------

function UsersTab({
  companyId,
  currentUserId,
}: {
  companyId: string;
  currentUserId: string | null;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [rescueOpen, setRescueOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true }),
      supabase
        .from("sectors")
        .select("id,name,slug")
        .eq("company_id", companyId)
        .order("name", { ascending: true }),
    ]);
    setProfiles((pRes.data as Profile[] | null) ?? []);
    setSectors((sRes.data as Sector[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Administração</p>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <UserCog className="w-6 h-6" /> Usuários
          </h1>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-text-primary text-background hover:bg-text-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo usuário
        </Button>
      </header>

      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Papel global</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted py-8">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((p) => (
                <TableRow key={p.id} className="border-border">
                  <TableCell>
                    <div className="font-medium text-text-primary">{p.full_name}</div>
                    {p.display_name && p.display_name !== p.full_name && (
                      <div className="text-xs text-text-muted">{p.display_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-border text-text-primary">
                      {p.auth_type === "google" ? "Google" : "CPF"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-primary capitalize">{p.global_role}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.active && !p.deleted_at
                          ? "border-border text-text-primary bg-background"
                          : "border-border text-text-muted bg-surface"
                      }`}
                    >
                      {p.deleted_at ? "Inativo" : p.active ? "Ativo" : "Suspenso"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <UserActionsMenu
                      profile={p}
                      isSelf={currentUserId === p.id}
                      onChanged={load}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sectors={sectors}
        companyId={companyId}
        onCreated={() => {
          setModalOpen(false);
          void load();
        }}
      />
    </div>
  );
}

// ---------- Actions menu ----------

type ConfirmDef = {
  title: string;
  description: string;
  actionLabel: string;
  run: () => Promise<void>;
};

function UserActionsMenu({
  profile,
  isSelf,
  onChanged,
}: {
  profile: Profile;
  isSelf: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [confirm, setConfirm] = useState<ConfirmDef | null>(null);

  const updateProfile = async (patch: Record<string, unknown>, successMsg: string) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
    if (error) {
      toast.error("Falha: " + error.message);
      return;
    }
    toast.success(successMsg);
    await onChanged();
  };

  const suspend = () =>
    setConfirm({
      title: "Suspender usuário",
      description: `Tem certeza que deseja suspender ${profile.full_name}? O acesso será bloqueado imediatamente.`,
      actionLabel: "Suspender",
      run: () => updateProfile({ active: false }, `${profile.full_name} suspenso.`),
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
        ),
    });

  const reactivate = () =>
    setConfirm({
      title: "Reativar usuário",
      description: `Deseja reativar o acesso de ${profile.full_name}?`,
      actionLabel: "Reativar",
      run: () =>
        updateProfile(
          { active: true, deleted_at: null },
          `${profile.full_name} reativado.`,
        ),
    });

  const forcePw = () =>
    setConfirm({
      title: "Forçar troca de senha",
      description: `${profile.full_name} será solicitado a redefinir a senha no próximo acesso.`,
      actionLabel: "Confirmar",
      run: () =>
        updateProfile(
          { must_change_password: true },
          "Troca de senha exigida no próximo acesso.",
        ),
    });

  const resendAccess = async () => {
    const { error } = await supabase.functions.invoke("create-cpf-user", {
      body: {
        resend: true,
        cpf: profile.cpf_hash,
        recovery_email: profile.recovery_email,
      },
    });
    if (error) {
      toast.error("Falha ao reenviar acesso. Verifique se o e-mail de recuperação está correto.");
      return;
    }
    toast.success(`E-mail de acesso reenviado para ${profile.recovery_email}.`);
  };

  const isInactive = !!profile.deleted_at;
  const canForcePw = profile.auth_type === "cpf" && !isInactive;
  const canResend =
    profile.auth_type === "cpf" && profile.must_change_password && !isInactive;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ações para ${profile.full_name}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
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
              <DropdownMenuItem onSelect={forcePw}>
                Forçar troca de senha
              </DropdownMenuItem>
            </>
          )}
          {canResend && (
            <DropdownMenuItem onSelect={() => void resendAccess()}>
              Reenviar acesso
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}

// ---------- Create user modal ----------

function UserFormModal({
  open,
  onOpenChange,
  sectors,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sectors: Sector[];
  companyId: string;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [authType, setAuthType] = useState<AuthType>("google");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [cellphone, setCellphone] = useState("");
  const [cellphoneError, setCellphoneError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [globalRole, setGlobalRole] = useState<GlobalRole>("member");
  const [assignments, setAssignments] = useState<SectorAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullName("");
      setAuthType("google");
      setEmail("");
      setCpf("");
      setCellphone("");
      setCellphoneError(null);
      setRecoveryEmail("");
      setGlobalRole("member");
      setAssignments([]);
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
    setAssignments((prev) =>
      prev.map((a) => (a.sector_id === sectorId ? { ...a, role } : a)),
    );
  };

  const assignmentsPayload = useMemo(
    () => assignments.map((a) => ({ sector_id: a.sector_id, role: a.role })),
    [assignments],
  );

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }

    if (authType === "google") {
      if (!email.trim()) {
        toast.error("Informe o e-mail do Google");
        return;
      }
      // Google flow keeps the previous direct insert behaviour.
      setSubmitting(true);
      try {
        const newId = crypto.randomUUID();
        const { error } = await supabase.from("profiles").insert({
          id: newId,
          company_id: companyId,
          full_name: fullName.trim(),
          display_name: fullName.trim().split(" ")[0],
          auth_type: "google",
          global_role: globalRole,
          active: true,
          must_change_password: false,
          recovery_email: email.trim().toLowerCase(),
        });
        if (error) throw error;
        if (assignmentsPayload.length > 0) {
          await supabase
            .from("sector_members")
            .insert(
              assignmentsPayload.map((a) => ({
                profile_id: newId,
                sector_id: a.sector_id,
                role: a.role,
              })),
            );
        }
        toast.success("Usuário criado com sucesso.");
        onCreated();
      } catch (err) {
        toast.error(
          friendlyCreateError(err instanceof Error ? err.message : ""),
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // CPF flow → Edge Function
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

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-cpf-user", {
        body: {
          full_name: fullName.trim(),
          cpf: cpfToDigits(cpf),
          recovery_email: recoveryEmail.trim().toLowerCase(),
          cellphone: cellphoneToDigits(cellphone),
          company_id: companyId,
          global_role: globalRole,
          sector_assignments: assignmentsPayload,
        },
      });
      if (error) {
        // supabase-js wraps function errors; inspect message + context
        const ctxMsg =
          (data as { error?: string } | null)?.error ??
          (error as { context?: { error?: string } }).context?.error ??
          error.message ??
          "";
        toast.error(friendlyCreateError(ctxMsg));
        return;
      }
      toast.success(
        `Usuário criado com sucesso. E-mail de acesso enviado para ${recoveryEmail.trim().toLowerCase()}.`,
      );
      onCreated();
    } catch (err) {
      toast.error(friendlyCreateError(err instanceof Error ? err.message : ""));
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

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-text-primary">
                Tipo de autenticação
              </p>
              <p className="text-xs text-text-muted">
                {authType === "google"
                  ? "Login via Google (@mowig.com.br)"
                  : "Login via CPF + senha interna"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={authType === "cpf" ? "text-text-primary" : "text-text-muted"}>
                CPF
              </span>
              <Switch
                checked={authType === "google"}
                onCheckedChange={(c) => setAuthType(c ? "google" : "cpf")}
              />
              <span className={authType === "google" ? "text-text-primary" : "text-text-muted"}>
                Google
              </span>
            </div>
          </div>

          {authType === "google" ? (
            <div>
              <Label htmlFor="email">E-mail Google</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="maria@mowig.com.br"
              />
            </div>
          ) : (
            <>
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
            </>
          )}

          <div>
            <Label>Papel global</Label>
            <Select value={globalRole} onValueChange={(v) => setGlobalRole(v as GlobalRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLOBAL_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Setores</Label>
            <div className="mt-2 space-y-2 border border-border rounded-md p-3">
              {sectors.length === 0 && (
                <p className="text-sm text-text-muted">Nenhum setor disponível.</p>
              )}
              {sectors.map((s) => {
                const assigned = assignments.find((a) => a.sector_id === s.id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <label className="flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={Boolean(assigned)}
                        onChange={() => toggleSector(s.id)}
                        className="accent-text-primary"
                      />
                      {s.name}
                    </label>
                    {assigned && (
                      <Select
                        value={assigned.role}
                        onValueChange={(v) =>
                          setAssignmentRole(s.id, v as SectorRole)
                        }
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTOR_ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
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
