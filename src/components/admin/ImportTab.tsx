import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Download, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface ParsedRow {
  nome: string;
  cpf: string;
  email_recuperacao: string;
  celular: string;
  cargo_id: string;
}

type RowStatus = "idle" | "pending" | "success" | "duplicate" | "error";

interface RowResult {
  status: RowStatus;
  message?: string;
}

interface ImportTabProps {
  companyId: string;
}

const CSV_HEADERS = ["nome", "cpf", "email_recuperacao", "celular", "cargo_id"];

function downloadTemplate() {
  const example = ["João Silva", "123.456.789-09", "joao@empresa.com", "(11) 99999-9999", "<cargo_id>"];
  const content = [CSV_HEADERS.join(","), example.join(",")].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-importacao.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines
    .slice(1)
    .map((line) => {
      const [nome = "", cpf = "", email_recuperacao = "", celular = "", cargo_id = ""] =
        line.split(",").map((s) => s.trim());
      return { nome, cpf, email_recuperacao, celular, cargo_id };
    })
    .filter((r) => r.nome || r.cpf);
}

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === "pending")   return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
  if (status === "success")   return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === "duplicate") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  if (status === "error")     return <XCircle className="w-4 h-4 text-red-500" />;
  return <span className="w-4 h-4 inline-flex items-center justify-center text-text-muted text-xs">—</span>;
}

export function ImportTab({ companyId }: ImportTabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]       = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone]       = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error("Nenhuma linha válida encontrada no CSV.");
        return;
      }
      setRows(parsed);
      setResults(parsed.map(() => ({ status: "idle" })));
      setDone(false);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImport = async () => {
    if (rows.length === 0 || importing) return;
    setImporting(true);
    setDone(false);

    const next: RowResult[] = rows.map(() => ({ status: "idle" as RowStatus }));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      next[i] = { status: "pending" };
      setResults([...next]);

      try {
        const { data, error } = await supabase.functions.invoke("create-cpf-user", {
          body: {
            full_name:      row.nome,
            cpf:            row.cpf,
            recovery_email: row.email_recuperacao || null,
            cellphone:      row.celular || null,
            company_id:     companyId,
            global_role:    "member",
          },
        });

        if (error) {
          next[i] = { status: "error", message: error.message };
        } else if (data?.error === "already registered") {
          next[i] = { status: "duplicate" };
        } else if (data?.error) {
          next[i] = { status: "error", message: data.error };
        } else {
          next[i] = { status: "success" };
        }
      } catch (err) {
        next[i] = { status: "error", message: err instanceof Error ? err.message : "Erro desconhecido" };
      }

      setResults([...next]);
    }

    setImporting(false);
    setDone(true);
  };

  const created   = results.filter((r) => r.status === "success").length;
  const duplicate = results.filter((r) => r.status === "duplicate").length;
  const errors    = results.filter((r) => r.status === "error").length;

  const allDone = results.length > 0 && results.every((r) => r.status !== "idle" && r.status !== "pending");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Importar usuários via CSV</p>
        <p className="text-xs text-text-muted">Crie múltiplos usuários de uma vez a partir de um arquivo CSV.</p>
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          className="gap-2 border-border text-text-primary hover:bg-accent-light"
        >
          <Download className="w-4 h-4" />
          Baixar template CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="gap-2 border-border text-text-primary hover:bg-accent-light"
        >
          <Upload className="w-4 h-4" />
          Selecionar arquivo CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      </div>

      {/* Template hint */}
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs text-text-muted space-y-1">
        <p className="font-medium text-text-secondary">Formato esperado do CSV:</p>
        <code className="block font-mono">nome,cpf,email_recuperacao,celular,cargo_id</code>
        <p>O <strong>cargo_id</strong> deve ser o UUID do cargo cadastrado na aba Cargos.</p>
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">
              Preview — {rows.length} linha{rows.length !== 1 ? "s" : ""}
            </p>
            {!allDone && (
              <Button
                size="sm"
                onClick={() => void handleImport()}
                disabled={importing}
                className="gap-2 bg-text-primary text-background hover:bg-text-primary/90"
              >
                {importing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando…</>
                  : "Importar"}
              </Button>
            )}
          </div>

          <div className="rounded-md border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Nome</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">CPF</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">E-mail recuperação</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Celular</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Cargo ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-8">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const result = results[i];
                  const isErr = result?.status === "error";
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-0 ${
                        isErr ? "bg-red-500/5" : result?.status === "success" ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-text-muted text-xs">{i + 1}</td>
                      <td className="px-3 py-2 text-text-primary">{row.nome}</td>
                      <td className="px-3 py-2 text-text-primary font-mono text-xs">{row.cpf}</td>
                      <td className="px-3 py-2 text-text-secondary text-xs">{row.email_recuperacao || "—"}</td>
                      <td className="px-3 py-2 text-text-secondary text-xs">{row.celular || "—"}</td>
                      <td className="px-3 py-2 text-text-muted font-mono text-xs truncate max-w-[140px]">
                        {row.cargo_id || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={result?.status ?? "idle"} />
                          {isErr && result.message && (
                            <span className="text-xs text-red-500 truncate max-w-[120px]" title={result.message}>
                              {result.message}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {done && (
            <div className="flex flex-wrap gap-4 rounded-md border border-border bg-surface px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                <strong>{created}</strong> criado{created !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-yellow-600">
                <AlertTriangle className="w-4 h-4" />
                <strong>{duplicate}</strong> já existia{duplicate !== 1 ? "m" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-red-600">
                <XCircle className="w-4 h-4" />
                <strong>{errors}</strong> erro{errors !== 1 ? "s" : ""}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => { setRows([]); setResults([]); setDone(false); }}
                className="ml-auto border-border text-text-primary hover:bg-accent-light"
              >
                Nova importação
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
