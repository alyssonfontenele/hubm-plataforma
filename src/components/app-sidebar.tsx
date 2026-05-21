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

  const sectorIds = useMemo(
    () => sectorMemberships.map((m) => m.sector.id).sort(),
    [sectorMemberships],
  );

  // Fetch sectors with sort_order to respect admin-configured ordering.
  const { data: sectorsData } = useQuery({
    queryKey: ["sidebar-sectors", sectorIds.join(",")],
    enabled: sectorIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<SidebarSector[]> => {
      if (sectorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("sectors")
        .select("id,name,slug,icon,group_name,sort_order")
        .in("id", sectorIds)
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as SidebarSector[] | null) ?? [];
    },
  });

  const sectors = useMemo<SidebarSector[]>(() => {
    if (sectorsData && sectorsData.length > 0) return sectorsData;
    // Fallback to membership data (unsorted) while query loads.
    return sectorMemberships.map((m) => ({
      id: m.sector.id,
      name: m.sector.name,
      slug: m.sector.slug,
      icon: m.sector.icon,
      group_name: m.sector.group_name,
      sort_order: null,
    }));
  }, [sectorsData, sectorMemberships]);

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
                HubM
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {company?.name ?? "—"}
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

        {globalRole === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <Link to="/admin" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Admin</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
  sort_order: number | null;
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
        .select("id,name,sort_order")
        .eq("sector_id", sector.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as FolderRow[] | null) ?? [];
    },
  });

  return (
    <>
      <SidebarMenuItem>
        <div className="flex items-center gap-1">
          <SidebarMenuButton asChild isActive={active} className="flex-1">
            <Link
              to="/sectors/$slug"
              params={{ slug: sector.slug }}
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
          ) : folders.length === 0 ? (
            <p className="text-xs text-sidebar-foreground/50 px-2 py-1">
              Sem pastas
            </p>
          ) : (
            folders.map((f) => {
              const folderActive =
                pathname === path &&
                typeof window !== "undefined" &&
                new URLSearchParams(window.location.search).get("folder") ===
                  f.id;
              return (
                <Link
                  key={f.id}
                  to="/sectors/$slug"
                  params={{ slug: sector.slug }}
                  search={{ folder: f.id }}
                  className={`block truncate text-xs px-2 py-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                    folderActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80"
                  }`}
                >
                  {f.name}
                </Link>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
