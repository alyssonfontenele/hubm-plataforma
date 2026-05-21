import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as LucideIcons from "lucide-react";
import {
  FileText,
  FileSpreadsheet,
  Link2,
  Presentation,
  FolderOpen,
  File,
  Cog,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { ResourceModal, type ResourceModalData } from "@/components/resource-modal";
import { FoldersManager } from "@/components/sectors/folders-manager";

export const Route = createFileRoute("/_authenticated/sectors/$slug")({
  head: () => ({ meta: [{ title: "Setor — HubM" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    folder: typeof search.folder === "string" ? search.folder : undefined,
  }),
  component: SectorPage,
});

interface Folder {
  id: string;
  name: string;
  sector_id: string;
  parent_id: string | null;
  sort_order: number | null;
  is_page: boolean;
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

type LayoutKind = "grid" | "list" | "kanban" | "dashboard";

interface SectorRecord {
  id: string;
  name: string;
  icon: string | null;
  config: { layout?: LayoutKind } | null;
}

function SectorPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { sectorMemberships, globalRole, company } = useAuth();
  const membership = sectorMemberships.find((m) => m.sector.slug === slug);
  const isAdmin = globalRole === "admin";

  const [sectorRecord, setSectorRecord] = useState<SectorRecord | null>(null);
  const sectorId = sectorRecord?.id ?? membership?.sector.id;
  const sectorName = sectorRecord?.name ?? membership?.sector.name ?? slug;
  const sectorIcon = sectorRecord?.icon ?? membership?.sector.icon ?? null;
  const layout: LayoutKind = sectorRecord?.config?.layout ?? "grid";

  const [folders, setFolders] = useState<Folder[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const activeFolder: string | "all" = search.folder ?? "all";
  const setActiveFolder = (v: string | "all") => {
    void navigate({
      to: "/sectors/$slug",
      params: { slug },
      search: { folder: v === "all" ? undefined : v },
      replace: true,
    });
  };
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ResourceModalData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Resolve sector by slug (admin may not be a member).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("sectors")
        .select("id,name,icon,config")
        .eq("slug", slug)
        .eq("active", true)
        .is("deleted_at", null)
        .limit(1);
      if (company?.id) query = query.eq("company_id", company.id);
      const { data } = await query.maybeSingle();
      if (cancelled) return;
      setSectorRecord((data as SectorRecord | null) ?? null);
    })();
    return () => {
  cancelled = true;
};
}, [slug, company?.id]);


  useEffect(() => {
    if (!sectorId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [foldersRes, resourcesRes] = await Promise.all([
        supabase
          .from("folders")
          .select("id,name,sector_id,parent_id,sort_order,is_page")
          .eq("sector_id", sectorId)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
        supabase
          .from("resources")
          .select(
            "id,name,description,url,type,folder_id,thumbnail_url,sort_order,mime_type,created_by,created_at",
          )
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      setFolders(
        ((foldersRes.data as Folder[] | null) ?? []).map((f) => ({
          ...f,
          is_page: Boolean(f.is_page),
        })),
      );
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
  const childrenOfPage = useMemo(() => {
    const map = new Map<string, string[]>();
    folders.forEach((f) => {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f.id);
        map.set(f.parent_id, arr);
      }
    });
    return map;
  }, [folders]);
  const visibleResources = useMemo(() => {
    if (activeFolder === "all") return sectorResources;
    const activeRecord = folderMap.get(activeFolder);
    if (activeRecord?.is_page) {
      const childIds = new Set(childrenOfPage.get(activeFolder) ?? []);
      childIds.add(activeFolder);
      return sectorResources.filter(
        (r) => r.folder_id && childIds.has(r.folder_id),
      );
    }
    return sectorResources.filter((r) => r.folder_id === activeFolder);
  }, [sectorResources, activeFolder, folderMap, childrenOfPage]);
  const pillFolders = useMemo(
    () => folders.filter((f) => !f.parent_id),
    [folders],
  );

  const SectorIcon = useMemo(() => {
    if (!sectorIcon) return FolderOpen;
    const Cmp = (LucideIcons as unknown as Record<string, typeof FolderOpen>)[sectorIcon];
    return Cmp ?? FolderOpen;
  }, [sectorIcon]);

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
      folder_name: r.folder_id ? (folderMap.get(r.folder_id)?.name ?? null) : null,
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

      {pillFolders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FolderPill
            label="Todos"
            count={sectorResources.length}
            active={activeFolder === "all"}
            onClick={() => setActiveFolder("all")}
          />
          {pillFolders.map((f) => {
            const count = f.is_page
              ? sectorResources.filter((r) => {
                  if (!r.folder_id) return false;
                  const childIds = childrenOfPage.get(f.id) ?? [];
                  return r.folder_id === f.id || childIds.includes(r.folder_id);
                }).length
              : sectorResources.filter((r) => r.folder_id === f.id).length;
            return (
              <FolderPill
                key={f.id}
                label={`${f.is_page ? "📄 " : ""}${f.name}`}
                count={count}
                active={activeFolder === f.id}
                onClick={() => setActiveFolder(f.id)}
              />
            );
          })}
        </div>
      )}

      {sectorId && <FoldersManager sectorId={sectorId} canManage={isAdmin} />}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-lg border border-border bg-surface animate-pulse"
            />
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
      ) : layout === "list" ? (
        <ListLayout resources={visibleResources} onOpen={openResource} />
      ) : layout === "kanban" ? (
        <KanbanLayout
          resources={visibleResources}
          folders={folders}
          onOpen={openResource}
        />
      ) : layout === "dashboard" ? (
        <DashboardLayout resources={visibleResources} onOpen={openResource} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleResources.map((r) => (
            <ResourceCard key={r.id} resource={r} onClick={() => openResource(r)} />
          ))}
        </div>
      )}

      <ResourceModal resource={selected} open={modalOpen} onOpenChange={setModalOpen} />
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
      <span className={`ml-2 text-xs ${active ? "opacity-70" : "text-text-muted"}`}>{count}</span>
    </button>
  );
}

function ResourceCard({ resource, onClick }: { resource: Resource; onClick: () => void }) {
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
        <h3 className="text-sm font-semibold text-text-primary line-clamp-2">{resource.name}</h3>
        {resource.description && (
          <p className="text-xs text-text-muted line-clamp-2">{resource.description}</p>
        )}
      </div>
    </button>
  );
}

function ListLayout({
  resources,
  onOpen,
}: {
  resources: Resource[];
  onOpen: (r: Resource) => void;
}) {
  return (
    <ul className="border border-border rounded-lg bg-surface divide-y divide-border">
      {resources.map((r) => {
        const Icon = TYPE_ICON[r.type] ?? File;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{r.name}</p>
                {r.description && (
                  <p className="text-xs text-text-muted truncate">{r.description}</p>
                )}
              </div>
              <span className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {TYPE_LABEL[r.type] ?? "Recurso"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function KanbanLayout({
  resources,
  folders,
  onOpen,
}: {
  resources: Resource[];
  folders: Folder[];
  onOpen: (r: Resource) => void;
}) {
  const columns = useMemo(() => {
    const map = new Map<string, { name: string; items: Resource[] }>();
    folders.forEach((f) => map.set(f.id, { name: f.name, items: [] }));
    const orphans: Resource[] = [];
    resources.forEach((r) => {
      const col = r.folder_id ? map.get(r.folder_id) : null;
      if (col) col.items.push(r);
      else orphans.push(r);
    });
    const cols = Array.from(map.entries())
      .filter(([, v]) => v.items.length > 0)
      .map(([id, v]) => ({ id, name: v.name, items: v.items }));
    if (orphans.length > 0) {
      cols.push({ id: "__orphans__", name: "Sem pasta", items: orphans });
    }
    return cols;
  }, [resources, folders]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div
          key={col.id}
          className="w-72 shrink-0 rounded-lg border border-border bg-surface p-3"
        >
          <header className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {col.name}
            </h3>
            <span className="text-xs text-text-muted">{col.items.length}</span>
          </header>
          <div className="space-y-2">
            {col.items.map((r) => {
              const Icon = TYPE_ICON[r.type] ?? File;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpen(r)}
                  className="w-full text-left rounded-md border border-border bg-background p-3 hover:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-text-primary shrink-0" />
                    <p className="text-sm font-medium text-text-primary truncate">
                      {r.name}
                    </p>
                  </div>
                  {r.description && (
                    <p className="mt-1 text-xs text-text-muted line-clamp-2">
                      {r.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardLayout({
  resources,
  onOpen,
}: {
  resources: Resource[];
  onOpen: (r: Resource) => void;
}) {
  const counts = useMemo(() => {
    const acc: Partial<Record<ResourceType, number>> = {};
    resources.forEach((r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
    });
    return acc;
  }, [resources]);
  const types = Object.keys(counts) as ResourceType[];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">Total</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{resources.length}</p>
        </div>
        {types.map((t) => {
          const Icon = TYPE_ICON[t] ?? File;
          return (
            <div key={t} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Icon className="w-4 h-4" />
                <p className="text-xs uppercase tracking-wider">{TYPE_LABEL[t]}</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-text-primary">{counts[t]}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {resources.map((r) => (
          <ResourceCard key={r.id} resource={r} onClick={() => onOpen(r)} />
        ))}
      </div>
    </div>
  );
}
