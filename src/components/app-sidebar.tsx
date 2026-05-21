import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
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
  return ICONS[name.toLowerCase()] ?? Folder;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { company, sectorMemberships, globalRole, profile, signOut } = useAuth();
  const isMobile = useIsMobile();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const UNGROUPED = "__ungrouped__";
  const groupedSectors = useMemo(() => {
    const map = new Map<string, typeof sectorMemberships>();
    for (const m of sectorMemberships) {
      const key = m.sector.group_name?.trim() || UNGROUPED;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    // ungrouped first, then groups alphabetically
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => {
      if (a === UNGROUPED) return -1;
      if (b === UNGROUPED) return 1;
      return a.localeCompare(b, "pt-BR");
    });
    return entries;
  }, [sectorMemberships]);


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-sm font-bold">
            H
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">HubM</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{company?.name ?? "—"}</p>
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
                    {!collapsed && <span>Home</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groupedSectors.map(([groupKey, members]) => {
          const isUngrouped = groupKey === UNGROUPED;
          const label = isUngrouped ? "Setores" : groupKey;
          const renderItems = () => (
            <SidebarMenu>
              {members.map((m) => {
                const Icon = resolveIcon(m.sector.icon);
                const path = `/sectors/${m.sector.slug}`;
                return (
                  <SidebarMenuItem key={m.sector_id}>
                    <SidebarMenuButton asChild isActive={isActive(path)}>
                      <Link
                        to="/sectors/$slug"
                        params={{ slug: m.sector.slug }}
                        className="flex items-center gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {!collapsed && <span>{m.sector.name}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          );

          if (isUngrouped || collapsed) {
            return (
              <SidebarGroup key={groupKey}>
                {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
                <SidebarGroupContent>{renderItems()}</SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <CollapsibleSectorGroup
              key={groupKey}
              label={label}
              hasActive={members.some((m) => isActive(`/sectors/${m.sector.slug}`))}
              defaultCollapsedOnMobile={isMobile}
            >
              {renderItems()}
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
  label,
  hasActive,
  defaultCollapsedOnMobile,
  children,
}: {
  label: string;
  hasActive: boolean;
  defaultCollapsedOnMobile: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(hasActive || !defaultCollapsedOnMobile);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
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
