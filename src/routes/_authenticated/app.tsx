import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Pin, Megaphone, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Home — HubM" }] }),
  component: HomePage,
});

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  sector_id: string | null;
  created_at: string;
  expires_at: string | null;
}

function resolveIcon(name: string | null | undefined) {
  if (!name) return Icons.Folder;
  const key = name
    .split(/[-_\s]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Comp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[key];
  return Comp ?? Icons.Folder;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function HomePage() {
  const { profile, company, sectorMemberships } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  const sectorMap = useMemo(() => {
    const m = new Map<string, string>();
    sectorMemberships.forEach((s) => m.set(s.sector.id, s.sector.name));
    return m;
  }, [sectorMemberships]);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    const sectorIds = sectorMemberships.map((s) => s.sector.id);
    const nowIso = new Date().toISOString();

    const sectorFilter =
      sectorIds.length > 0
        ? `sector_id.is.null,sector_id.in.(${sectorIds.join(",")})`
        : `sector_id.is.null`;

    void supabase
      .from("announcements")
      .select("id, title, body, pinned, sector_id, created_at, expires_at")
      .eq("company_id", company.id)
      .eq("active", true)
      .or(sectorFilter)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled) setAnnouncements((data as Announcement[] | null) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [company?.id, sectorMemberships]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          Olá, {profile?.display_name ?? profile?.full_name}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {company?.name} · {sectorMemberships.length} setor(es) disponível(is)
        </p>
      </header>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="h-4 w-4 text-text-secondary" />
          <h2 className="text-sm font-medium text-text-primary">Avisos</h2>
        </div>

        {announcements === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="border border-border rounded-lg bg-surface p-6 text-sm text-text-muted">
            Nenhum aviso no momento.
          </div>
        ) : (
          <ul className="space-y-2">
            {announcements.map((a) => (
              <li
                key={a.id}
                className="border border-border rounded-lg bg-surface p-4 hover:border-text-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.pinned && (
                      <Pin className="h-3.5 w-3.5 text-text-primary shrink-0" />
                    )}
                    <h3 className="text-sm font-medium text-text-primary truncate">
                      {a.title}
                    </h3>
                  </div>
                  <span className="text-xs text-text-muted shrink-0">
                    {formatDate(a.created_at)}
                  </span>
                </div>
                {a.body && (
                  <p className="text-sm text-text-secondary mt-1.5 line-clamp-2">
                    {a.body}
                  </p>
                )}
                {a.sector_id && (
                  <p className="text-xs text-text-muted mt-2">
                    {sectorMap.get(a.sector_id) ?? "Setor"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-text-primary mb-3">Seus setores</h2>
        {sectorMemberships.length === 0 ? (
          <p className="text-sm text-text-muted">
            Você ainda não foi adicionado a nenhum setor.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sectorMemberships.map((m) => {
              const Icon = resolveIcon(m.sector.icon);
              return (
                <li key={m.sector_id}>
                  <Link
                    to="/sectors/$slug"
                    params={{ slug: m.sector.slug }}
                    className="group flex items-center gap-3 border border-border rounded-lg bg-surface p-4 hover:border-text-muted/40 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-md bg-surface-elevated border border-border flex items-center justify-center">
                      <Icon className="h-4 w-4 text-text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {m.sector.name}
                      </p>
                      <p className="text-xs text-text-muted capitalize">{m.role}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
