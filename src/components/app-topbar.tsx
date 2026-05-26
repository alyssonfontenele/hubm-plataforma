import { useState, useEffect, useRef } from "react";
import { Search, LogOut, User as UserIcon } from "lucide-react";
import { useRouterState, useNavigate } from "@tanstack/react-router";

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
import { supabase } from "@/integrations/supabase/client";

type SearchResult = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  sector_id: string | null;
  sectors: { name: string; slug: string } | null;
};

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
  const navigate = useNavigate();
  const name = profile?.display_name ?? profile?.full_name ?? session?.user.email ?? "";
  const email = session?.user.email ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("resources")
        .select("id, name, description, type, sector_id, sectors(name, slug)")
        .ilike("name", `%${searchQuery}%`)
        .is("deleted_at", null)
        .limit(10);
      setSearchResults((data as SearchResult[] | null) ?? []);
      setSearchOpen(true);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleResultClick = (r: SearchResult) => {
    if (r.sectors?.slug) {
      void navigate({
        to: "/sectors/$slug",
        params: { slug: r.sectors.slug },
        search: { folder: undefined },
      });
    }
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center gap-3 px-3 md:px-4">
      <SidebarTrigger />

      <nav
        aria-label="Breadcrumb"
        className="hidden md:flex items-center gap-1 text-sm text-text-secondary"
      >
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted">/</span>}
            <span
              className={
                i === crumbs.length - 1 ? "text-text-primary font-medium capitalize" : "capitalize"
              }
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div ref={searchRef} className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
            placeholder="Buscar…"
            className="h-9 w-48 md:w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          {searchOpen && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              {searching ? (
                <p className="px-3 py-2 text-sm text-text-muted">Buscando…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-2 text-sm text-text-muted">Nenhum resultado encontrado.</p>
              ) : (
                <ul>
                  {searchResults.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleResultClick(r)}
                        className="w-full text-left px-3 py-2 hover:bg-background transition-colors flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{r.name}</p>
                          {r.sectors?.name && (
                            <p className="text-xs text-text-muted truncate">{r.sectors.name}</p>
                          )}
                        </div>
                        <span className="text-xs text-text-muted shrink-0 uppercase tracking-wider">
                          {r.type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                <AvatarFallback className="text-xs">{initialsOf(name, email)}</AvatarFallback>
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
