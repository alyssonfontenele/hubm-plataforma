import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, UserCog } from "lucide-react";
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
import { cpfToDigits, cpfToEmail, isValidCpf, maskCpf } from "@/lib/auth";

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
  const { globalRole, company, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && globalRole !== "admin") {
      void navigate({ to: "/app" });
    }
  }, [loading, globalRole, navigate]);

  if (globalRole !== "admin" || !company) return null;
  return <UsersTab companyId={company.id} />;
}

function UsersTab({ companyId }: { companyId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
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

  const toggleActive = async (p: Profile) => {
    const next = !p.active;
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: next } : x)));
    const { error } = await supabase
      .from("profiles")
      .update({ active: next })
      .eq("id", p.id);
    if (error) {
      toast.error("Falha ao atualizar status: " + error.message);
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !next } : x)));
    } else {
      toast.success(next ? "Usuário ativado" : "Usuário desativado");
    }
  };

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
                    <Badge
                      variant="outline"
                      className="border-border text-text-primary"
                    >
                      {p.auth_type === "google" ? "Google" : "CPF"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-primary capitalize">
                    {p.global_role}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.active
                          ? "border-border text-text-primary bg-background"
                          : "border-border text-text-muted bg-surface"
                      }`}
                    >
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={p.active}
                      onCheckedChange={() => toggleActive(p)}
                      aria-label="Alternar ativo"
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
      setRecoveryEmail("");
      setGlobalRole("member");
      setAssignments([]);
    }
  }, [open]);

  const sectorById = useMemo(() => {
    const m = new Map<string, Sector>();
    sectors.forEach((s) => m.set(s.id, s));
    return m;
  }, [sectors]);

  const toggleSector = (sectorId: string) => {
    setAssignments((prev) => {
      if (prev.some((a) => a.sector_id === sectorId)) {
        return prev.filter((a) => a.sector_id !== sectorId);
      }
      return [...prev, { sector_id: sectorId, role: "member" }];
    });
  };

  const setAssignmentRole = (sectorId: string, role: SectorRole) => {
    setAssignments((prev) =>
      prev.map((a) => (a.sector_id === sectorId ? { ...a, role } : a)),
    );
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Informe o nome completo");
      return;
    }
    if (authType === "google" && !email.trim()) {
      toast.error("Informe o e-mail do Google");
      return;
    }
    if (authType === "cpf") {
      if (!isValidCpf(cpf)) {
        toast.error("CPF inválido");
        return;
      }
      if (!recoveryEmail.trim()) {
        toast.error("Informe um e-mail de recuperação");
        return;
      }
    }

    setSubmitting(true);
    try {
      const newId = crypto.randomUUID();
      const profilePayload: Record<string, unknown> = {
        id: newId,
        company_id: companyId,
        full_name: fullName.trim(),
        display_name: fullName.trim().split(" ")[0],
        auth_type: authType,
        global_role: globalRole,
        active: true,
      };
      if (authType === "google") {
        profilePayload.recovery_email = email.trim().toLowerCase();
      } else {
        profilePayload.cpf_hash = cpfToDigits(cpf);
        profilePayload.recovery_email = recoveryEmail.trim().toLowerCase();
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .insert(profilePayload);
      if (profileError) throw profileError;

      if (assignments.length > 0) {
        const { error: membersError } = await supabase
          .from("sector_members")
          .insert(
            assignments.map((a) => ({
              profile_id: newId,
              sector_id: a.sector_id,
              role: a.role,
            })),
          );
        if (membersError) throw membersError;
      }

      const note =
        authType === "cpf"
          ? `Login interno: ${cpfToEmail(cpf)} (definir senha pelo fluxo de recuperação)`
          : "Acesso será ativado no primeiro login Google";
      toast.success("Usuário criado", { description: note });
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Falha ao criar usuário: " + msg);
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
            <Select
              value={globalRole}
              onValueChange={(v) => setGlobalRole(v as GlobalRole)}
            >
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
                <p className="text-sm text-text-muted">
                  Nenhum setor disponível.
                </p>
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
