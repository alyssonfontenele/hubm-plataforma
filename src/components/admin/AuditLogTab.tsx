import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AuditRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  event: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
};

const EVENT_OPTIONS = [
  { value: "all", label: "Todos os eventos" },
  { value: "resource_viewed",      label: "Visualização de documento" },
  { value: "role_changed",         label: "Alteração de cargo" },
  { value: "permission_changed",   label: "Alteração de permissão" },
  { value: "admin_accessed",       label: "Acesso ao painel admin" },
  { value: "profile_exported",     label: "Exportação de dados" },
  { value: "profile_anonymized",   label: "Anonimização de dados" },
];

const PAGE_SIZE = 25;

interface AuditLogTabProps {
  companyId: string;
}

export function AuditLogTab({ companyId }: AuditLogTabProps) {
  const [page, setPage]           = useState(0);
  const [eventFilter, setEvent]   = useState("all");
  const [actorFilter, setActor]   = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log", companyId, page, eventFilter, actorFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("id, created_at, actor_name, event, resource_type, resource_id, metadata, ip_address")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (eventFilter !== "all") q = q.eq("event", eventFilter);
      if (actorFilter.trim())   q = q.ilike("actor_name", `%${actorFilter.trim()}%`);
      if (dateFrom)             q = q.gte("created_at", dateFrom);
      if (dateTo)               q = q.lte("created_at", dateTo + "T23:59:59");

      const { data } = await q;
      return (data ?? []) as AuditRow[];
    },
  });

  const exportCsv = () => {
    const header = "Data,Usuário,Evento,Tipo de recurso,ID do recurso,IP,Metadata\n";
    const csvRows = rows.map(r =>
      [
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.actor_name ?? "",
        r.event,
        r.resource_type ?? "",
        r.resource_id ?? "",
        r.ip_address ?? "",
        JSON.stringify(r.metadata),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([header + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm font-medium text-text-primary">
          Trilha de auditoria — somente leitura
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={eventFilter} onValueChange={v => { setEvent(v); setPage(0); }}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filtrar por usuário"
          className="w-44"
          value={actorFilter}
          onChange={e => { setActor(e.target.value); setPage(0); }}
        />

        <Input
          type="date"
          className="w-36"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(0); }}
        />
        <Input
          type="date"
          className="w-36"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(0); }}
        />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <p className="text-sm text-text-muted">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhum registro encontrado.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-light text-text-secondary text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Usuário</th>
                <th className="px-3 py-2 text-left font-medium">Evento</th>
                <th className="px-3 py-2 text-left font-medium">Recurso</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={row.id} className="bg-surface hover:bg-accent-light/40 transition-colors">
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap text-xs">
                    {new Date(row.created_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-text-primary">{row.actor_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs bg-accent-light px-1.5 py-0.5 rounded">
                      {row.event}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-secondary text-xs">
                    {row.resource_type
                      ? `${row.resource_type}${row.resource_id ? ` · ${row.resource_id.slice(0, 8)}…` : ""}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-text-muted text-xs font-mono">
                    {row.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      <div className="flex items-center gap-3 justify-end text-sm">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
          Anterior
        </Button>
        <span className="text-text-muted">Página {page + 1}</span>
        <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
          Próxima
        </Button>
      </div>

      <p className="text-xs text-text-muted italic">
        Registros de auditoria são imutáveis — inserção apenas, sem edição ou exclusão.
      </p>
    </div>
  );
}
