import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as LucideIcons from "lucide-react";
import { FileText, FileSpreadsheet, Link2, Presentation, FolderOpen, File, Cog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { ResourceModal, type ResourceModalData } from "@/components/resource-modal";

export const Route = createFileRoute("/_authenticated/sectors/$slug")({
  head: () => ({ meta: [{ title: "Setor — HubM" }] }),
  component: SectorPage,
});

interface Folder {
  id: string;
  name: string;
  sector_id: string;
  parent_id: string | null;
  sort_order: number | null;
}

interface Resource {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ResourceType;
  folder_id: string | null;
  thumbnail_url: string | null;
  sort_order: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string | null;
}

const TYPE_ICON: Record<ResourceType, typeof FileText> = {
  link: Link2,
  spreadsheet: FileSpreadsheet,
  document: FileText,
  pdf: FileText,
  slides: Presentation,
  system: Cog,
  file: File,
};

const TYPE_LABEL: Record<ResourceType, string> = {
  link: "Link",
  spreadsheet: "Planilha",
  document: "Documento",
  pdf: "PDF",
  slides: "Apresentação",
  system: "Sistema",
  file: "Arquivo",
};

function SectorPage() {
  const { slug } = Route.useParams();
  const { sectorMemberships } = useAuth();
  const membership = sectorMemberships.find((m) => m.sector.slug === slug);
  const sectorId = membership?.sector.id;
  const sectorName = membership?.sector.name ?? slug;

  const [folders, setFolders] = useState<Folder[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ResourceModalData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!sectorId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [foldersRes, resourcesRes] = await Promise.all([
        supabase
          .from("folders")
          .select("id,name,sector_id,parent_id,sort_order")
          .eq("sector_id", sectorId)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
        supabase
          .from("resources")
          .select("id,name,description,url,type,folder_id,thumbnail_url,sort_order,mime_type,created_by,created_at")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      setFolders((foldersRes.data as Folder[] | null) ?? []);
      setResources((resourcesRes.data as Resource[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sectorId]);

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);
  const sectorResources = useMemo(
    () => resources.filter((r) => r.folder_id && folderMap.has(r.folder_id)),
    [resources, folderMap],
  );
  const visibleResources = useMemo(
    () =>
      activeFolder === "all"
        ? sectorResources
        : sectorResources.filter((r) => r.folder_id === activeFolder),
    [sectorResources, activeFolder],
  );

  const SectorIcon = useMemo(() => {
    const name = membership?.sector.icon;
    if (!name) return FolderOpen;
    const Cmp = (LucideIcons as unknown as Record<string, typeof FolderOpen>)[name];
    return Cmp ?? FolderOpen;
  }, [membership?.sector.icon]);

  const openResource = (r: Resource) => {
    setSelected({
      id: r.id,
      name: r.name,
      description: r.description,
      url: r.url,
      type: r.type,
      folder_id: r.folder_id,
      mime_type: r.mime_type,
      created_by: r.created_by,
      created_at: r.created_at,
      folder_name: r.folder_id ? folderMap.get(r.folder_id)?.name ?? null : null,
      sector_name: sectorName,
    });
    setModalOpen(true);
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center">
          <SectorIcon className="w-5 h-5 text-text-primary" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Setor</p>
          <h1 className="text-2xl font-bold text-text-primary">{sectorName}</h1>
        </div>
      </header>

      {folders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FolderPill
            label="Todos"
            count={sectorResources.length}
            active={activeFolder === "all"}
            onClick={() => setActiveFolder("all")}
          />
          {folders.map((f) => {
            const count = sectorResources.filter((r) => r.folder_id === f.id).length;
            return (
              <FolderPill
                key={f.id}
                label={f.name}
                count={count}
                active={activeFolder === f.id}
                onClick={() => setActiveFolder(f.id)}
              />
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border border-border bg-surface animate-pulse" />
          ))}
        </div>
      ) : visibleResources.length === 0 ? (
        <div className="border border-border rounded-lg bg-surface p-10 text-center">
          <FolderOpen className="w-8 h-8 mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-muted">
            {folders.length === 0
              ? "Nenhuma pasta cadastrada neste setor ainda."
              : "Nenhum recurso nesta pasta."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleResources.map((r) => (
            <ResourceCard key={r.id} resource={r} onClick={() => openResource(r)} />
          ))}
        </div>
      )}

      <ResourceModal
        resource={selected}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}

function FolderPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active
          ? "bg-text-primary text-background border-text-primary"
          : "bg-surface text-text-primary border-border hover:bg-background"
      }`}
    >
      {label}
      <span className={`ml-2 text-xs ${active ? "opacity-70" : "text-text-muted"}`}>
        {count}
      </span>
    </button>
  );
}

function ResourceCard({
  resource,
  onClick,
}: {
  resource: Resource;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[resource.type] ?? File;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left block rounded-lg border border-border bg-surface p-4 hover:bg-background transition-colors"
    >
      <div className="w-9 h-9 rounded-md bg-background border border-border flex items-center justify-center">
        <Icon className="w-4 h-4 text-text-primary" />
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {TYPE_LABEL[resource.type] ?? "Recurso"}
        </p>
        <h3 className="text-sm font-semibold text-text-primary line-clamp-2">
          {resource.name}
        </h3>
        {resource.description && (
          <p className="text-xs text-text-muted line-clamp-2">{resource.description}</p>
        )}
      </div>
    </button>
  );
}
