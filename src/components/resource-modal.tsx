import { useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Link2,
  Presentation,
  Cog,
  File,
  Download,
  User,
  Folder,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeUrl, safeUrl } from "@/lib/safe-url";

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
}

interface Props {
  resource: ResourceModalData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function actionLabel(type: ResourceType, url: string | null) {
  if (!url) return "Sem link disponível";
  if (type === "pdf" || type === "file") return "Baixar arquivo";
  if (type === "link" || type === "system") return "Abrir link";
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
    return "Abrir no Drive";
  }
  return "Abrir recurso";
}

export function ResourceModal({ resource, open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const [addedByName, setAddedByName] = useState<string | null>(null);
  const loggedRef = useState<{ id: string | null }>({ id: null })[0];

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
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
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
          (data?.display_name as string | null) ??
            (data?.full_name as string | null) ??
            null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [resource?.created_by]);

  // Reset logged ref when modal closes
  useEffect(() => {
    if (!open) loggedRef.id = null;
  }, [open, loggedRef]);

  if (!resource) return null;

  const Icon = TYPE_ICON[resource.type] ?? File;
  const hasUrl = isSafeUrl(resource.url);
  const href = safeUrl(resource.url);
  const isDownload = resource.type === "pdf" || resource.type === "file";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-text-muted">
                {TYPE_LABEL[resource.type] ?? "Recurso"}
              </p>
              <DialogTitle className="text-text-primary text-lg leading-tight">
                {resource.name}
              </DialogTitle>
              {resource.description && (
                <DialogDescription className="text-text-muted mt-1">
                  {resource.description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

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

        <div className="pt-2">
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
        </div>
      </DialogContent>
    </Dialog>
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
