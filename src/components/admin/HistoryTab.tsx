import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_ACTION_LABEL, type AdminLogRow } from "@/lib/admin-log";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HistoryTab({ companyId }: { companyId: string }) {
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: logRows } = await supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = (logRows as AdminLogRow[] | null) ?? [];
      const adminIds = Array.from(
        new Set(rows.map((r) => r.admin_id).filter((v): v is string => !!v)),
      );
      let names: Record<string, string> = {};
      if (adminIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", adminIds);
        names = Object.fromEntries(
          (profs ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "—"]),
        );
      }
      if (!cancelled) {
        setLogs(rows);
        setAdminNames(names);
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-text-primary">Histórico de ações</p>
        <p className="text-xs text-text-muted">
          Registro auditável das ações realizadas no painel administrativo.
        </p>
      </header>

      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-44">Data/hora</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Usuário afetado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  Nenhuma ação registrada até o momento.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-border">
                  <TableCell className="text-text-muted text-xs whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell className="text-text-primary">
                    {log.admin_id ? (adminNames[log.admin_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-border text-text-primary">
                      {ADMIN_ACTION_LABEL[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-primary">{log.target_name ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
