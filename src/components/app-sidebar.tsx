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

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

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

        {sectorMemberships.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Setores</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sectorMemberships.map((m) => {
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
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
