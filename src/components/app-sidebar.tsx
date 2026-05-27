import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Shield,
  LogOut,
  Folder,
  Megaphone,
  Briefcase,
  Users,
  Calculator,
  FileText,
  Settings,
  Database,
  BarChart3,
  Wallet,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  megaphone: Megaphone,
  briefcase: Briefcase,
  users: Users,
  calculator: Calculator,
  document: FileText,
  "file-text": FileText,
  settings: Settings,
  database: Database,
  chart: BarChart3,
  "bar-chart": BarChart3,
  wallet: Wallet,
};

function resolveIcon(name: string | null): LucideIcon {
  if (!name) return Folder;
  const lower = name.toLowerCase();
  if (ICONS[lower]) return ICONS[lower];
  return Folder;
}

interface SidebarSector {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  group_name: string | null;
  sort_order: number | null;
}

const UNGROUPED = "__ungrouped__";

function usePersistentBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return raw === "1";
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { company, sectorMemberships, globalRole, profile, signOut } = useAuth();
  const isMobile = useIsMobile();

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  const isAdmin = globalRole === "admin";
  const companyId = company?.id;

  const sectorIds = useMemo(
    () => sectorMemberships.map((m) => m.sector.id).sort(),
    [sectorMemberships],
  );

  // Admins see ALL active sectors of the company.
  // Non-admins see only sectors they are members of.
  const { data: sectorsData } = useQuery({
    queryKey: isAdmin
      ? ["sidebar-sectors", "admin", companyId ?? ""]
      : ["sidebar-sectors", "member", sectorIds.join(",")],
    enabled: isAdmin ? !!companyId : sectorIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<SidebarSector[]> => {
      let query = supabase
        .from("sectors")
        .select("id,name,slug,icon,group_name,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (isAdmin && companyId) {
        query = query.eq("company_id", companyId);
      } else {
        if (sectorIds.length === 0) return [];
        query = query.in("id", sectorIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as SidebarSector[] | null) ?? [];
    },
  });

  const sectors = useMemo<SidebarSector[]>(() => {
    if (sectorsData && sectorsData.length > 0) return sectorsData;
    if (isAdmin) return [];
    return sectorMemberships.map((m) => ({
      id: m.sector.id,
      name: m.sector.name,
      slug: m.sector.slug,
      icon: m.sector.icon,
      group_name: m.sector.group_name,
      sort_order: null,
    }));
  }, [sectorsData, sectorMemberships, isAdmin]);

  const groupedSectors = useMemo(() => {
    const map = new Map<string, SidebarSector[]>();
    for (const s of sectors) {
      const key = s.group_name?.trim() || UNGROUPED;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    // Ungrouped ("Geral") first, then groups alphabetically.
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => {
      if (a === UNGROUPED) return -1;
      if (b === UNGROUPED) return 1;
      return a.localeCompare(b, "pt-BR");
    });
    return entries;
  }, [sectors]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-sm font-bold">
            H
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                {company?.name ?? "HubM"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/app"}>
                  <Link to="/app" className="flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {!collapsed && <span>Início</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groupedSectors.map(([groupKey, members]) => {
          const isUngrouped = groupKey === UNGROUPED;
          const label = isUngrouped ? "Geral" : groupKey;
          const hasActive = members.some((s) =>
            isActive(`/sectors/${s.slug}`),
          );
          return (
            <CollapsibleSectorGroup
              key={groupKey}
              groupKey={groupKey}
              label={label}
              collapsedSidebar={collapsed}
              hasActive={hasActive}
              defaultCollapsed={isMobile}
            >
              <SidebarMenu>
                {members.map((s) => (
                  <SectorItem
                    key={s.id}
                    sector={s}
                    collapsed={collapsed}
                    isActive={isActive}
                    pathname={pathname}
                    defaultSubmenuCollapsed
                  />
                ))}
              </SidebarMenu>
            </CollapsibleSectorGroup>
          );
        })}

        {(globalRole === "admin" || globalRole === "superadmin") && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {globalRole === "admin" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin")}>
                      <Link to="/admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {!collapsed && <span>Admin</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {globalRole === "superadmin" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/superadmin/dashboard")}
                    >
                      <Link
                        to="/superadmin/dashboard"
                        className="flex items-center gap-2"
                      >
                        <Database className="h-4 w-4" />
                        {!collapsed && <span>Painel Sistema</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => void signOut()}
              tooltip="Sair"
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && (
                <span className="truncate">
                  Sair
                  {profile?.display_name ? ` · ${profile.display_name}` : ""}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function CollapsibleSectorGroup({
  groupKey,
  label,
  collapsedSidebar,
  hasActive,
  defaultCollapsed,
  children,
}: {
  groupKey: string;
  label: string;
  collapsedSidebar: boolean;
  hasActive: boolean;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `hubm.sidebar.group.${groupKey}`;
  const [open, setOpen] = usePersistentBool(storageKey, !defaultCollapsed);

  // Force-open if a sector inside is currently active.
  const effectiveOpen = hasActive ? true : open;

  if (collapsedSidebar) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>{children}</SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Collapsible open={effectiveOpen} onOpenChange={setOpen}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                effectiveOpen ? "" : "-rotate-90"
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

interface FolderRow {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number | null;
  parent_id: string | null;
  is_page: boolean;
}

function SectorItem({
  sector,
  collapsed,
  isActive,
  pathname,
  defaultSubmenuCollapsed,
}: {
  sector: SidebarSector;
  collapsed: boolean;
  isActive: (path: string) => boolean;
  pathname: string;
  defaultSubmenuCollapsed: boolean;
}) {
  const Icon = resolveIcon(sector.icon);
  const path = `/sectors/${sector.slug}`;
  const active = isActive(path);
  const storageKey = `hubm.sidebar.sector.${sector.id}`;
  const [open, setOpen] = usePersistentBool(
    storageKey,
    !defaultSubmenuCollapsed,
  );

  const { data: folders } = useQuery({
    queryKey: ["sidebar-folders", sector.id],
    enabled: open && !collapsed,
    staleTime: 60_000,
    queryFn: async (): Promise<FolderRow[]> => {
      const { data, error } = await supabase
        .from("folders")
        .select("id,name,icon,sort_order,parent_id,is_page")
        .eq("sector_id", sector.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as FolderRow[] | null) ?? []).map((f) => ({
        ...f,
        is_page: Boolean(f.is_page),
      }));
    },
  });

  const tree = useMemo(() => {
    const all = folders ?? [];
    const childrenOf = (pid: string) => all.filter((f) => f.parent_id === pid);
    return all
      .filter((f) => !f.parent_id)
      .map((f) => ({
        folder: f,
        children: f.is_page ? childrenOf(f.id) : [],
      }));
  }, [folders]);

  const activeFolderId =
    typeof window !== "undefined" && pathname === path
      ? new URLSearchParams(window.location.search).get("folder")
      : null;

  return (
    <>
      <SidebarMenuItem>
        <div className="flex items-center gap-1">
          <SidebarMenuButton asChild isActive={active} className="flex-1">
            <Link
              to="/sectors/$slug"
              params={{ slug: sector.slug }}
              search={{ folder: undefined }}
              className="flex items-center gap-2"
            >
              {sector.icon && sector.icon.length <= 4 ? (
                <span className="text-base leading-none w-4 text-center" aria-hidden>
                  {sector.icon}
                </span>
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {!collapsed && <span className="truncate">{sector.name}</span>}
            </Link>
          </SidebarMenuButton>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Recolher subpastas" : "Expandir subpastas"}
              aria-expanded={open}
              className="p-1 rounded text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  open ? "rotate-90" : ""
                }`}
              />
            </button>
          )}
        </div>
      </SidebarMenuItem>

      {!collapsed && open && (
        <div className="ml-6 mt-0.5 mb-1 border-l border-sidebar-border pl-2 space-y-0.5">
          {folders === undefined ? (
            <p className="text-xs text-sidebar-foreground/50 px-2 py-1">
              Carregando…
            </p>
          ) : tree.length === 0 ? (
            <p className="text-xs text-sidebar-foreground/50 px-2 py-1">
              Sem pastas
            </p>
          ) : (
            tree.map(({ folder, children }) =>
              folder.is_page ? (
                <PageEntry
                  key={folder.id}
                  page={folder}
                  pageChildren={children}
                  sectorSlug={sector.slug}
                  sectorPath={path}
                  activeFolderId={activeFolderId}
                  pathname={pathname}
                />
              ) : (
                <FolderLink
                  key={folder.id}
                  folder={folder}
                  sectorSlug={sector.slug}
                  sectorPath={path}
                  activeFolderId={activeFolderId}
                  pathname={pathname}
                />
              ),
            )
          )}
        </div>
      )}
    </>
  );
}

function FolderLink({
  folder,
  sectorSlug,
  sectorPath,
  activeFolderId,
  pathname,
}: {
  folder: FolderRow;
  sectorSlug: string;
  sectorPath: string;
  activeFolderId: string | null;
  pathname: string;
}) {
  const active = pathname === sectorPath && activeFolderId === folder.id;
  return (
    <Link
      to="/sectors/$slug"
      params={{ slug: sectorSlug }}
      search={{ folder: folder.id }}
      className={`flex items-center gap-1.5 truncate text-xs px-2 py-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80"
      }`}
    >
      {folder.icon && (
        <span className="text-sm leading-none" aria-hidden>
          {folder.icon}
        </span>
      )}
      <span className="truncate">{folder.name}</span>
    </Link>
  );
}

function PageEntry({
  page,
  pageChildren,
  sectorSlug,
  sectorPath,
  activeFolderId,
  pathname,
}: {
  page: FolderRow;
  pageChildren: FolderRow[];
  sectorSlug: string;
  sectorPath: string;
  activeFolderId: string | null;
  pathname: string;
}) {
  const storageKey = `hubm.sidebar.page.${page.id}`;
  const hasActiveChild =
    activeFolderId === page.id ||
    pageChildren.some((c) => c.id === activeFolderId);
  const [open, setOpen] = usePersistentBool(storageKey, true);
  const effectiveOpen = hasActiveChild ? true : open;
  const pageActive = pathname === sectorPath && activeFolderId === page.id;

  return (
    <div>
      <div className="flex items-center gap-1">
        <Link
          to="/sectors/$slug"
          params={{ slug: sectorSlug }}
          search={{ folder: page.id }}
          className={`flex-1 flex items-center gap-1.5 truncate text-xs px-2 py-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            pageActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 font-medium"
          }`}
        >
          <span className="text-sm leading-none" aria-hidden>
            {page.icon || "📄"}
          </span>
          <span className="truncate">{page.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={effectiveOpen ? "Recolher página" : "Expandir página"}
          aria-expanded={effectiveOpen}
          className="p-0.5 rounded text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${
              effectiveOpen ? "rotate-90" : ""
            }`}
          />
        </button>
      </div>
      {effectiveOpen && pageChildren.length > 0 && (
        <div className="ml-3 mt-0.5 mb-1 border-l border-sidebar-border pl-2 space-y-0.5">
          {pageChildren.map((c) => (
            <FolderLink
              key={c.id}
              folder={c}
              sectorSlug={sectorSlug}
              sectorPath={sectorPath}
              activeFolderId={activeFolderId}
              pathname={pathname}
            />
          ))}
        </div>
      )}
    </div>
  );
}

