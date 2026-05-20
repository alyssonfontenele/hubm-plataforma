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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ADMIN_ACTION_LABEL,
  logAdminAction,
  type AdminAction,
  type AdminLogRow,
} from "@/lib/admin-log";

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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setRescueOpen(true)}
            className="border-border"
          >
            <LifeBuoy className="w-4 h-4 mr-2" /> Resgatar usuário
          </Button>
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo usuário
          </Button>
        </div>
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
                      onEdit={() => setEditTarget(p)}
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

      <RescueUserModal
        open={rescueOpen}
        onOpenChange={setRescueOpen}
        companyId={companyId}
        onReactivated={() => {
          setRescueOpen(false);
          void load();
        }}
      />

      <EditUserModal
        profile={editTarget}
        sectors={sectors}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
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
  onEdit,
}: {
  profile: Profile;
  isSelf: boolean;
  onChanged: () => void | Promise<void>;
  onEdit: () => void;
}) {
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
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
    if (!profile.recovery_email) {
      toast.error("Este usuário não possui e-mail de recuperação cadastrado.");
      return;
    }
    const cpfDisplay = profile.cpf_hash ?? "—";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111111;">
        <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px;">Olá, ${profile.full_name}</h1>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Seu acesso ao HubM está disponível. Use as informações abaixo para entrar.
        </p>
        <div style="border: 1px solid #e5e5e5; padding: 16px; margin: 16px 0;">
          <p style="font-size: 13px; margin: 0 0 8px; color: #555555;">CPF de acesso</p>
          <p style="font-size: 16px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">${cpfDisplay}</p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Entre com seu CPF e a senha atual. Caso não lembre da senha, utilize a opção
          "Esqueci minha senha" na tela de login para redefini-la.
        </p>
        <p style="font-size: 12px; color: #888888; margin: 24px 0 0;">
          Este é um e-mail automático. Se você não solicitou este acesso, ignore esta mensagem.
        </p>
      </div>
    `;
    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        to: profile.recovery_email,
        subject: "Seu acesso ao HubM",
        html,
      },
    });
    if (error) {
      toast.error("Falha ao reenviar. Verifique se o e-mail de recuperação está correto.");
      return;
    }
    toast.success("E-mail de acesso reenviado com sucesso.");
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

      <AlertDialog open={deleteStep === 1} onOpenChange={(o) => !o && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Esta ação é irreversível e removerá o acesso de {profile.full_name} permanentemente.
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
              Digite <strong>EXCLUIR</strong> para confirmar a exclusão permanente de {profile.full_name}.
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
                  const { error: fnErr } = await supabase.functions.invoke(
                    "admin-delete-user",
                    { body: { user_id: profile.id } },
                  );
                  if (fnErr) throw fnErr;
                  const { error: profErr } = await supabase
                    .from("profiles")
                    .update({
                      full_name: "Usuário removido",
                      cpf_hash: null,
                      recovery_email: null,
                      cellphone: null,
                    })
                    .eq("id", profile.id);
                  if (profErr) throw profErr;
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
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    if (initialPassword && !isValidInitialPassword(initialPassword)) {
      setPasswordError(
        "A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula",
      );
      toast.error("Senha inicial inválida");
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
          initial_password: initialPassword || undefined,
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

// ---------- Rescue user modal ----------

function RescueUserModal({
  open,
  onOpenChange,
  companyId,
  onReactivated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  onReactivated: () => void;
}) {
  const [cpf, setCpf] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    if (!open) {
      setCpf("");
      setFound(null);
      setNotFound(false);
      setSearching(false);
      setReactivating(false);
    }
  }, [open]);

  const search = async () => {
    if (!isValidCpf(cpf)) {
      toast.error("CPF inválido");
      return;
    }
    setSearching(true);
    setNotFound(false);
    setFound(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .eq("cpf_hash", cpfToDigits(cpf))
        .not("deleted_at", "is", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setNotFound(true);
      } else {
        setFound(data as Profile);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar usuário.");
    } finally {
      setSearching(false);
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
      toast.success("Usuário reativado com sucesso. E-mail de acesso reenviado.");
      onReactivated();
    } catch (err) {
      toast.error(
        err instanceof Error ? `Falha: ${err.message}` : "Falha ao reativar usuário.",
      );
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
            Informe o CPF do usuário inativado para reativar o acesso.
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
                Nenhum usuário inativado encontrado com este CPF.
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

// ---------- Edit user modal ----------

function EditUserModal({
  profile,
  sectors,
  onOpenChange,
  onSaved,
}: {
  profile: Profile | null;
  sectors: Sector[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
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
      setPwError(
        "A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula",
      );
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        full_name: fullName.trim(),
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

      // Replace sector memberships
      await supabase.from("sector_members").delete().eq("profile_id", profile.id);
      if (assignments.length > 0) {
        await supabase.from("sector_members").insert(
          assignments.map((a) => ({
            profile_id: profile.id,
            sector_id: a.sector_id,
            role: a.role,
          })),
        );
      }

      if (newPassword && profile.auth_type === "cpf") {
        const { error: pwErr } = await supabase.functions.invoke(
          "admin-update-password",
          { body: { user_id: profile.id, new_password: newPassword } },
        );
        if (pwErr) throw pwErr;
      }

      toast.success("Dados do usuário atualizados com sucesso.");
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? `Falha: ${err.message}` : "Falha ao salvar.",
      );
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
            {cellphoneError && (
              <p className="mt-1 text-xs text-destructive">{cellphoneError}</p>
            )}
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
                  <div key={s.id} className="flex items-center justify-between gap-3">
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
                          setAssignments((prev) =>
                            prev.map((a) =>
                              a.sector_id === s.id ? { ...a, role: v as SectorRole } : a,
                            ),
                          )
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
                  Se preenchida, a senha será redefinida e o usuário precisará alterá-la no próximo acesso.
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
