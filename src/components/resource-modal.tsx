import { useEffect, useState } from "react";
import {
  BarChart2,
  BookOpen,
  Calendar,
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
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeUrl, safeUrl } from "@/lib/safe-url";
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
  canDelete?: boolean;
  onDeleted?: (id: string) => void;
  onUpdated?: (updated: ResourceModalData) => void;
}

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

export function ResourceModal({ resource, open, onOpenChange, canDelete, onDeleted, onUpdated }: Props) {
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

  // Reset logged ref and edit state when modal closes
  useEffect(() => {
    if (!open) {
      loggedRef.id = null;
      setIsEditing(false);
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

  // Fetch sectors when edit mode opens (admin only)
  useEffect(() => {
    if (!isEditing || !canDelete) return;
    supabase
      .from("sectors")
      .select("id,name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setSectors(data ?? []));
  }, [isEditing, canDelete]);

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

  const handleSave = async () => {
    if (!resource) return;
    setSaving(true);
    const { error } = await supabase
      .from("resources")
      .update({ name: editName, description: editDescription || null, url: editUrl || null, icon: editIcon, folder_id: editFolderId || null })
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

  if (!resource) return null;

  const Icon = TYPE_ICON[resource.type] ?? File;
  const hasUrl = isSafeUrl(resource.url);
  const href = safeUrl(resource.url);
  const isDownload = resource.type === "pdf" || resource.type === "file";
  const ActiveIcon = (isEditing ? ICON_OPTIONS.find((o) => o.name === editIcon)?.Icon : null) ?? Icon;

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
            {canDelete && !isEditing && (
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
            {canDelete && (
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
              {canDelete && (
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
