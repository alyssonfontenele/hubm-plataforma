import { Search, LogOut, User as UserIcon } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

function initialsOf(name: string | null | undefined, fallback: string) {
  const src = (name ?? fallback).trim();
  if (!src) return "?";
  const parts = src.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || src[0].toUpperCase();
}

function useCrumbs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return ["Home"];
  if (segs[0] === "app") return ["Home"];
  if (segs[0] === "sectors") return ["Setores", segs[1] ?? ""];
  if (segs[0] === "admin") return ["Administração"];
  return segs;
}

export function AppTopbar() {
  const { profile, session, signOut } = useAuth();
  const crumbs = useCrumbs();
  const name = profile?.display_name ?? profile?.full_name ?? session?.user.email ?? "";
  const email = session?.user.email ?? "";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center gap-3 px-3 md:px-4">
      <SidebarTrigger />

      <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 text-sm text-text-secondary">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted">/</span>}
            <span className={i === crumbs.length - 1 ? "text-text-primary font-medium capitalize" : "capitalize"}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="search"
            placeholder="Buscar…"
            className="h-9 w-48 md:w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-1 hover:bg-accent-light transition-colors"
              aria-label="Conta"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt={name} />
                <AvatarFallback className="text-xs">
                  {initialsOf(name, email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium truncate">{name || "—"}</span>
              <span className="text-xs text-text-muted truncate">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="h-4 w-4 mr-2" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
