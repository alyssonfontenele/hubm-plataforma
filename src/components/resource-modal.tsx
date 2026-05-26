import { useEffect, useState } from "react";
import {
  BarChart2,
  BookOpen,
  Calendar,
  ChevronDown,
  Code2,
  Cog,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Globe,
  Image as ImageIcon,
  Link2,
  Pencil,
  Presentation,
  Table2,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { supabase, type ResourceType, type SectorRole } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeUrl, safeUrl } from "@/lib/safe-url";
import { logAdminAction } from "@/lib/admin-log";
import { toast } from "sonner";

export interface ResourceModalData {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ResourceType;
  folder_id: string | null;
  mime_type?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  folder_name?: string | null;
  sector_name?: string | null;
  sector_id?: string | null;
  icon?: string | null;
}

interface Props {
  resource: ResourceModalData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
  sectorRole?: SectorRole | null;
  onDeleted?: (id: string) => void;
  onUpdated?: (updated: ResourceModalData) => void;
}

type PermRow = {
  id: string;
  profile_id: string;
  permission: string;
  profiles: { full_name: string | null; display_name: string | null } | null;
};

type UserOption = {
  id: string;
  full_name: string | null;
  display_name: string | null;
};

const PERM_LABEL: Record<string, string> = { none: "Nenhum", view: "Ver", edit: "Editar" };
const PERM_VALUES = ["none", "view", "edit"] as const;

const TYPE_ICON = {
  link: Link2,
  spreadsheet: FileSpreadsheet,
  document: FileText,
  pdf: FileText,
  slides: Presentation,
  system: Cog,
  file: File,
} as const;

const TYPE_LABEL = {
  link: "Link",
  spreadsheet: "Planilha",
  document: "Documento",
  pdf: "PDF",
  slides: "Apresentação",
  system: "Sistema",
  file: "Arquivo",
} as const;

const ICON_OPTIONS: { name: string; Icon: typeof FileText }[] = [
  { name: "FileText",  Icon: FileText  },
  { name: "Link2",     Icon: Link2     },
  { name: "Table2",    Icon: Table2    },
  { name: "Film",      Icon: Film      },
  { name: "Image",     Icon: ImageIcon },
  { name: "Folder",    Icon: Folder    },
  { name: "BookOpen",  Icon: BookOpen  },
  { name: "BarChart2", Icon: BarChart2 },
  { name: "Globe",     Icon: Globe     },
  { name: "Code2",     Icon: Code2     },
];

function actionLabel(type: ResourceType, url: string | null) {
  if (!url) return "Sem link disponível";
  if (type === "pdf" || type === "file") return "Baixar arquivo";
  if (type === "link" || type === "system") return "Abrir link";
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
    return "Abrir no Drive";
  }
  return "Abrir recurso";
}

export function ResourceModal({ resource, open, onOpenChange, canManage, onDeleted, onUpdated }: Props) {
  const { profile } = useAuth();
  const [addedByName, setAddedByName] = useState<string | null>(null);
  const loggedRef = useState<{ id: string | null }>({ id: null })[0];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editSectorId, setEditSectorId] = useState<string | null>(null);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [foldersForSector, setFoldersForSector] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Individual permissions panel
  const [permOpen, setPermOpen] = useState(false);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newPermission, setNewPermission] = useState<"view" | "edit" | "none">("view");
  const [savingPerm, setSavingPerm] = useState(false);

  // Log a view when the modal opens for a given resource
  useEffect(() => {
    if (!open || !resource || !profile) return;
    if (loggedRef.id === resource.id) return;
    loggedRef.id = resource.id;
    supabase
      .from("access_logs")
      .insert({
        profile_id: profile.id,
        resource_id: resource.id,
        action: "view",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        metadata: { source: "resource_modal" },
      })
      .then(({ error }) => {
        if (error) console.warn("access_logs insert failed:", error.message);
      });
  }, [open, resource, profile, loggedRef]);

  // Resolve "added by" display name
  useEffect(() => {
    setAddedByName(null);
    if (!resource?.created_by) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name,full_name")
      .eq("id", resource.created_by)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAddedByName(
          (data?.display_name as string | null) ?? (data?.full_name as string | null) ?? null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [resource?.created_by]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      loggedRef.id = null;
      setIsEditing(false);
      setPermOpen(false);
      setPerms([]);
      setAddingUser(false);
      setUserSearch("");
      setSelectedUserId(null);
      setNewPermission("view");
    }
  }, [open, loggedRef]);

  // Init edit fields when resource changes
  useEffect(() => {
    if (resource) {
      setEditName(resource.name);
      setEditDescription(resource.description ?? "");
      setEditUrl(resource.url ?? "");
      setEditIcon(resource.icon ?? null);
      setEditFolderId(resource.folder_id ?? null);
      setEditSectorId(resource.sector_id ?? null);
    }
  }, [resource?.id]);

  // Fetch sectors when edit mode opens (managers/admins only)
  useEffect(() => {
    if (!isEditing || !canManage) return;
    supabase
      .from("sectors")
      .select("id,name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setSectors(data ?? []));
  }, [isEditing, canManage]);

  // Fetch folders for the selected sector
  useEffect(() => {
    if (!isEditing || !editSectorId) {
      setFoldersForSector([]);
      return;
    }
    supabase
      .from("folders")
      .select("id,name")
      .eq("sector_id", editSectorId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => setFoldersForSector(data ?? []));
  }, [isEditing, editSectorId]);

  // Fetch individual permission overrides when panel opens
  useEffect(() => {
    if (!permOpen || !resource || !canManage) return;
    let cancelled = false;
    setLoadingPerms(true);
    supabase
      .from("resource_permissions")
      .select("id, profile_id, permission, profiles!resource_permissions_profile_id_fkey(full_name, display_name)")
      .eq("resource_id", resource.id)
      .not("profile_id", "is", null)
      .then(({ data }) => {
        if (cancelled) return;
        setPerms((data ?? []) as unknown as PermRow[]);
        setLoadingPerms(false);
      });
    return () => { cancelled = true; };
  }, [permOpen, resource?.id, canManage]);

  // Fetch active users when adding an exception
  useEffect(() => {
    if (!addingUser || !canManage) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, full_name, display_name")
      .eq("active", true)
      .then(({ data }) => {
        if (cancelled) return;
        setAllUsers((data ?? []) as UserOption[]);
      });
    return () => { cancelled = true; };
  }, [addingUser, canManage]);

  const handleSave = async () => {
    if (!resource) return;
    setSaving(true);
    const { error } = await supabase
      .from("resources")
      .update({
        name: editName,
        description: editDescription || null,
        url: editUrl || null,
        icon: editIcon,
        folder_id: editFolderId || null,
        sector_id: editSectorId || null,
      })
      .eq("id", resource.id);
    setSaving(false);
    if (error) {
      toast.error("Falha ao atualizar recurso: " + error.message);
      return;
    }
    toast.success("Recurso atualizado.");
    setIsEditing(false);
    onUpdated?.({ ...resource, name: editName, description: editDescription || null, url: editUrl || null, icon: editIcon, folder_id: editFolderId, sector_id: editSectorId });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(resource?.name ?? "");
    setEditDescription(resource?.description ?? "");
    setEditUrl(resource?.url ?? "");
    setEditIcon(resource?.icon ?? null);
    setEditFolderId(resource?.folder_id ?? null);
    setEditSectorId(resource?.sector_id ?? null);
  };

  const handleDelete = async () => {
    if (!resource) return;
    setDeleting(true);
    await logAdminAction({
      adminId: profile?.id,
      action: "delete_resource",
      targetId: resource.id,
      targetName: resource.name,
      targetType: "resource",
    });
    const { error } = await supabase.from("resources").delete().eq("id", resource.id);
    setDeleting(false);
    if (error) {
      toast.error("Falha ao excluir recurso: " + error.message);
      return;
    }
    toast.success("Recurso excluído.");
    setConfirmDelete(false);
    onOpenChange(false);
    onDeleted?.(resource.id);
  };

  const handlePermToggle = async (permId: string, newPerm: string) => {
    const { error } = await supabase
      .from("resource_permissions")
      .update({ permission: newPerm })
      .eq("id", permId);
    if (error) { toast.error("Erro ao atualizar permissão: " + error.message); return; }
    setPerms((prev) => prev.map((p) => p.id === permId ? { ...p, permission: newPerm } : p));
  };

  const handlePermRemove = async (permId: string) => {
    const { error } = await supabase
      .from("resource_permissions")
      .delete()
      .eq("id", permId);
    if (error) { toast.error("Erro ao remover permissão: " + error.message); return; }
    setPerms((prev) => prev.filter((p) => p.id !== permId));
  };

  const handleAddPerm = async () => {
    if (!selectedUserId || !resource) return;
    setSavingPerm(true);
    const { data, error } = await supabase
      .from("resource_permissions")
      .insert({
        resource_id: resource.id,
        profile_id: selectedUserId,
        permission: newPermission,
        created_by: profile?.id ?? null,
      })
      .select("id, profile_id, permission, profiles!resource_permissions_profile_id_fkey(full_name, display_name)")
      .single();
    setSavingPerm(false);
    if (error) { toast.error("Erro ao adicionar exceção: " + error.message); return; }
    setPerms((prev) => [...prev, data as unknown as PermRow]);
    setSelectedUserId(null);
    setUserSearch("");
    setNewPermission("view");
    setAddingUser(false);
  };

  if (!resource) return null;

  const Icon = TYPE_ICON[resource.type] ?? File;
  const hasUrl = isSafeUrl(resource.url);
  const href = safeUrl(resource.url);
  const isDownload = resource.type === "pdf" || resource.type === "file";
  const ActiveIcon = (isEditing ? ICON_OPTIONS.find((o) => o.name === editIcon)?.Icon : null) ?? Icon;

  const filteredUsers = allUsers.filter(
    (u) =>
      !perms.some((p) => p.profile_id === u.id) &&
      ((u.full_name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.display_name ?? "").toLowerCase().includes(userSearch.toLowerCase())),
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
              <ActiveIcon className="w-5 h-5 text-text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-text-muted">
                {TYPE_LABEL[resource.type] ?? "Recurso"}
              </p>
              {isEditing ? (
                <>
                  <DialogTitle className="sr-only">{resource.name}</DialogTitle>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-base font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    placeholder="Descrição (opcional)"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
                  />
                </>
              ) : (
                <>
                  <DialogTitle className="text-text-primary text-lg leading-tight">
                    {resource.name}
                  </DialogTitle>
                  {resource.description && (
                    <DialogDescription className="text-text-muted mt-1">
                      {resource.description}
                    </DialogDescription>
                  )}
                </>
              )}
            </div>
            {canManage && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-accent-light transition-colors"
                aria-label="Editar recurso"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        {isEditing && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-secondary">URL</label>
              <input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            {canManage && (
              <>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-text-secondary">Setor</label>
                  <select
                    value={editSectorId ?? ""}
                    onChange={(e) => {
                      setEditSectorId(e.target.value || null);
                      setEditFolderId(null);
                    }}
                    className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="">Sem setor</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-text-secondary">Pasta</label>
                  <select
                    value={editFolderId ?? ""}
                    onChange={(e) => setEditFolderId(e.target.value || null)}
                    className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="">Nenhuma (raiz do setor)</option>
                    {foldersForSector.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary">Ícone</label>
              <div className="grid grid-cols-5 gap-2">
                {ICON_OPTIONS.map(({ name, Icon: Ic }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setEditIcon(editIcon === name ? null : name)}
                    className={`flex items-center justify-center h-9 rounded-md border transition-colors ${
                      editIcon === name
                        ? "border-text-primary bg-text-primary/10 text-text-primary"
                        : "border-border bg-background text-text-muted hover:bg-accent-light"
                    }`}
                    aria-label={name}
                  >
                    <Ic className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <MetaRow icon={Folder} label="Setor">
            {resource.sector_name ?? "—"}
            {resource.folder_name && (
              <span className="text-text-muted"> · {resource.folder_name}</span>
            )}
          </MetaRow>
          <MetaRow icon={User} label="Adicionado por">
            {addedByName ?? (resource.created_by ? "Carregando…" : "—")}
          </MetaRow>
          {resource.created_at && (
            <MetaRow icon={Calendar} label="Em">
              {new Date(resource.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </MetaRow>
          )}
        </div>

        <div className="pt-2 space-y-2">
          {isEditing ? (
            <>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || !editName.trim()}
                className="w-full bg-text-primary text-background hover:bg-text-primary/90"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
              <Button
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={saving}
                className="w-full"
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild={hasUrl}
                disabled={!hasUrl}
                className="w-full bg-text-primary text-background hover:bg-text-primary/90"
              >
                {hasUrl ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...(isDownload ? { download: "" } : {})}
                  >
                    {isDownload ? (
                      <Download className="w-4 h-4 mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    {actionLabel(resource.type, resource.url)}
                  </a>
                ) : (
                  <span>Sem link disponível</span>
                )}
              </Button>
              {canManage && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir recurso
                </Button>
              )}
            </>
          )}
        </div>

        {canManage && !isEditing && (
          <div className="border-t border-border pt-3 mt-1">
            <button
              type="button"
              onClick={() => setPermOpen((o) => !o)}
              className="flex items-center justify-between w-full text-sm font-medium text-text-primary"
            >
              <span>Acesso individual</span>
              <ChevronDown
                className={`w-4 h-4 text-text-muted transition-transform ${permOpen ? "rotate-180" : ""}`}
              />
            </button>

            {permOpen && (
              <div className="mt-3 space-y-3">
                {loadingPerms ? (
                  <p className="text-xs text-text-muted">Carregando…</p>
                ) : (
                  <>
                    {perms.length === 0 && !addingUser && (
                      <p className="text-xs text-text-muted">Nenhuma exceção individual configurada.</p>
                    )}

                    {perms.length > 0 && (
                      <div className="space-y-2">
                        {perms.map((p) => {
                          const name = p.profiles?.display_name ?? p.profiles?.full_name ?? "—";
                          return (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="flex-1 text-sm text-text-primary truncate">{name}</span>
                              <div className="flex rounded-md border border-border overflow-hidden text-xs shrink-0">
                                {PERM_VALUES.map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => void handlePermToggle(p.id, val)}
                                    className={`px-2 py-1 transition-colors ${
                                      p.permission === val
                                        ? "bg-text-primary text-background"
                                        : "bg-surface text-text-muted hover:bg-accent-light"
                                    }`}
                                  >
                                    {PERM_LABEL[val]}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handlePermRemove(p.id)}
                                className="p-1 text-text-muted hover:text-destructive transition-colors shrink-0"
                                aria-label="Remover exceção"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {addingUser ? (
                      <div className="space-y-2 rounded-md border border-border bg-background p-3">
                        <input
                          value={userSearch}
                          onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(null); }}
                          placeholder="Buscar usuário…"
                          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                          autoFocus
                        />
                        {userSearch.length > 0 && filteredUsers.length > 0 && (
                          <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-surface divide-y divide-border">
                            {filteredUsers.slice(0, 8).map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setSelectedUserId(u.id);
                                  setUserSearch(u.display_name ?? u.full_name ?? "");
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent-light transition-colors ${
                                  selectedUserId === u.id
                                    ? "font-medium text-text-primary bg-accent-light"
                                    : "text-text-secondary"
                                }`}
                              >
                                {u.display_name ?? u.full_name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex rounded-md border border-border overflow-hidden text-xs">
                            {PERM_VALUES.map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setNewPermission(val)}
                                className={`px-2 py-1.5 transition-colors ${
                                  newPermission === val
                                    ? "bg-text-primary text-background"
                                    : "bg-surface text-text-muted hover:bg-accent-light"
                                }`}
                              >
                                {PERM_LABEL[val]}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAddPerm()}
                            disabled={!selectedUserId || savingPerm}
                            className="h-8 px-3 rounded-md bg-text-primary text-background text-xs font-medium hover:bg-text-primary/90 disabled:opacity-60"
                          >
                            {savingPerm ? "…" : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingUser(false);
                              setSelectedUserId(null);
                              setUserSearch("");
                              setNewPermission("view");
                            }}
                            className="h-8 px-3 rounded-md border border-border text-xs text-text-secondary hover:bg-accent-light"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingUser(true)}
                        className="text-xs text-text-muted hover:text-text-primary transition-colors"
                      >
                        + Adicionar exceção
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
      <AlertDialogContent className="bg-surface border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir recurso?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir{" "}
            <strong className="text-text-primary">{resource.name}</strong>? Esta ação é permanente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Excluindo…" : "Excluir permanentemente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Folder;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-text-primary">
      <Icon className="w-4 h-4 text-text-muted shrink-0" />
      <span className="text-text-muted w-32 shrink-0">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
