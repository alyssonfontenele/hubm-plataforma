import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Calendar as CalendarIcon, Plus, ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { signInWithGoogle } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}

const CAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatTime(iso: string | undefined) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatHeader() {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function isToday(iso: string | undefined) {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

export function CalendarCard() {
  const { providerToken } = useAuth();
  const [events, setEvents] = useState<GCalEvent[] | null>(null);
  const [error, setError] = useState<"missing" | "expired" | null>(null);
  const [open, setOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!providerToken) {
      setError("missing");
      setEvents([]);
      return;
    }
    setError(null);
    const params = new URLSearchParams({
      timeMin: startOfToday().toISOString(),
      timeMax: endOfTomorrow().toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });
    try {
      const res = await fetch(`${CAL_API}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError("expired");
        setEvents([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items?: GCalEvent[] };
      setEvents(json.items ?? []);
    } catch {
      setError("expired");
      setEvents([]);
    }
  }, [providerToken]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const handleReconnect = async () => {
    try {
      await signInWithGoogle(`${window.location.origin}/app`);
    } catch {
      /* noop */
    }
  };

  return (
    <section className="border border-border rounded-lg bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-text-secondary" />
          <h2 className="text-sm font-medium text-text-primary capitalize">
            {formatHeader()}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!providerToken}
            className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-surface hover:bg-accent-light text-text-primary disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo evento
          </button>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-surface hover:bg-accent-light text-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir Google Agenda
          </a>
        </div>
      </div>

      <div className="p-4">
        {error ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="text-sm text-text-secondary">
              Reconecte sua conta Google para ver a agenda.
            </p>
            <button
              type="button"
              onClick={handleReconnect}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md border border-border bg-surface hover:bg-accent-light text-text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconectar Google
            </button>
          </div>
        ) : events === null ? (
          <p className="text-sm text-text-muted py-4">Carregando…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-text-muted py-4">Nenhum evento agendado</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => {
              const startIso = ev.start?.dateTime ?? ev.start?.date;
              const todayBadge = isToday(startIso);
              return (
                <li
                  key={ev.id}
                  className="flex items-start gap-3 pl-3 py-2"
                  style={{ borderLeft: "3px solid #111111" }}
                >
                  <span className="text-xs font-mono text-text-secondary tabular-nums shrink-0 w-12 mt-0.5">
                    {ev.start?.dateTime ? formatTime(ev.start.dateTime) : "—"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {ev.summary ?? "(sem título)"}
                    </p>
                    {!todayBadge && startIso && (
                      <p className="text-xs text-text-muted">
                        {new Date(startIso).toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NewEventDialog
        open={open}
        onOpenChange={setOpen}
        providerToken={providerToken}
        onCreated={() => {
          setOpen(false);
          void fetchEvents();
        }}
      />
    </section>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  providerToken,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerToken: string | null;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(today);
      setStartTime("09:00");
      setEndTime("10:00");
      setErr(null);
    }
  }, [open, today]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!providerToken) {
      setErr("Token do Google ausente.");
      return;
    }
    if (!title.trim()) {
      setErr("Informe um título.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const body = {
        summary: title.trim(),
        start: { dateTime: `${date}T${startTime}:00`, timeZone: tz },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: tz },
      };
      const res = await fetch(CAL_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao criar evento.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Título
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Data
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Início
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Fim
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 px-3 text-sm rounded-md border border-border bg-surface hover:bg-accent-light text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-3 text-sm rounded-md bg-accent text-surface hover:bg-accent/90 disabled:opacity-60"
            >
              {submitting ? "Criando…" : "Criar evento"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
