import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DOMAINS = [
  { label: "Mowig",      url: "https://hubm.mowig.ind.br" },
  { label: "Moveria",    url: "https://moveria.app.br" },
  { label: "SuperAdmin", url: "https://admin.mowig.ind.br" },
];

type SecurityEvent = {
  id: string;
  event_type: string | null;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type DomainStatus = {
  url: string;
  ok: boolean | null; // null = checking
};

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse" />;
  return ok
    ? <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
    : <span className="inline-block w-3 h-3 rounded-full bg-red-500" />;
}

export function StatusDashboard() {
  const [statuses, setStatuses] = useState<DomainStatus[]>(
    DOMAINS.map(d => ({ url: d.url, ok: null }))
  );
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Probe each domain via fetch (no-cors, just check reachability)
  useEffect(() => {
    DOMAINS.forEach((domain, i) => {
      fetch(domain.url, { method: "HEAD", mode: "no-cors" })
        .then(() => {
          setStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, ok: true } : s));
        })
        .catch(() => {
          setStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, ok: false } : s));
        });
    });
  }, []);

  // Load recent security events from admin_logs
  useEffect(() => {
    supabase
      .from("admin_logs")
      .select("id, event_type, action, created_at, metadata")
      .not("event_type", "is", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setEvents((data ?? []) as SecurityEvent[]);
        setLoadingEvents(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Domain status cards */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Status dos domínios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOMAINS.map((domain, i) => (
            <div
              key={domain.url}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <StatusBadge ok={statuses[i].ok} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{domain.label}</p>
                <p className="text-xs text-text-muted truncate">{domain.url}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Verificação em tempo real via HEAD request. Para histórico de uptime, use{" "}
          <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="underline">
            UptimeRobot
          </a>.
        </p>
      </section>

      {/* Recent security events */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Últimos eventos de segurança</h2>
        {loadingEvents ? (
          <p className="text-sm text-text-muted">Carregando...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento registrado.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-accent-light text-text-secondary text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Evento</th>
                  <th className="px-3 py-2 text-left font-medium">Detalhes</th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map(ev => (
                  <tr key={ev.id} className="bg-surface hover:bg-accent-light/40 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 font-medium ${
                        ev.event_type === "lockout_triggered" ? "text-red-600" :
                        ev.event_type === "login_failure"     ? "text-amber-600" :
                        ev.event_type === "login_success"     ? "text-green-600" :
                        "text-text-primary"
                      }`}>
                        {ev.event_type ?? ev.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs font-mono">
                      {ev.metadata ? JSON.stringify(ev.metadata) : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
