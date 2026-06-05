import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
type Interessado = {
  id: string;
  contrato_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  papel: "arquiteto" | "proprietario" | "comprador";
  criado_em: string;
};

type ClienteDetalhe = {
  email: string | null;
  telefone: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
};

type ContratoEnderecos = {
  entrega_rua: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  entrega_cep: string | null;
  entrega_igual_atual: boolean | null;
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const PAPEL_LABEL: Record<string, string> = {
  arquiteto:    "Arquiteto",
  proprietario: "Proprietário",
  comprador:    "Comprador",
};

const DEFAULT_FORM = { nome: "", telefone: "", email: "", papel: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatEndereco(
  rua: string | null,
  bairro: string | null,
  cidade: string | null,
  uf: string | null,
  cep: string | null,
): string {
  const locParts = [cidade, uf].filter(Boolean).join("/");
  const parts = [rua, bairro, locParts, cep].filter(Boolean);
  return parts.join(", ") || "Não informado";
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-text-muted text-xs w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-text-secondary break-all">{value || "—"}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 mb-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── RepositorioTab ───────────────────────────────────────────────────────────
export function RepositorioTab({
  contratoId,
  clienteId,
  isVendedor,
}: {
  contratoId: string;
  clienteId: string | null;
  isVendedor: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<"new" | Interessado | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  // ── Dados do cliente ────────────────────────────────────────────────────────
  const { data: cliente, isLoading: loadingCliente } = useQuery<ClienteDetalhe | null>({
    queryKey: ["moveria_cliente_detalhe", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_clientes_v")
        .select(
          "email, telefone, endereco_rua, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep"
        )
        .eq("id", clienteId!)
        .maybeSingle();
      return (data as ClienteDetalhe | null) ?? null;
    },
  });

  // ── Endereços do contrato ───────────────────────────────────────────────────
  const { data: enderecos } = useQuery<ContratoEnderecos | null>({
    queryKey: ["moveria_contrato_enderecos", contratoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_contratos_v")
        .select(
          "entrega_rua, entrega_bairro, entrega_cidade, entrega_uf, entrega_cep, entrega_igual_atual"
        )
        .eq("id", contratoId)
        .maybeSingle();
      return (data as ContratoEnderecos | null) ?? null;
    },
  });

  // ── Interessados ────────────────────────────────────────────────────────────
  const { data: interessados = [], isLoading: loadingInt } = useQuery<Interessado[]>({
    queryKey: ["moveria_interessados", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_interessados")
        .select("id, contrato_id, nome, telefone, email, papel, criado_em")
        .eq("contrato_id", contratoId)
        .order("criado_em");
      if (error) {
        if (error.code === "42P01") return []; // migration ainda não aplicada
        throw error;
      }
      return (data ?? []) as Interessado[];
    },
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  function refetchInt() {
    qc.invalidateQueries({ queryKey: ["moveria_interessados", contratoId] });
  }

  const insertMut = useMutation({
    mutationFn: async (row: Omit<Interessado, "id" | "criado_em">) => {
      const { error } = await supabase.from("moveria_interessados").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interessado adicionado.");
      setEditing(null);
      setForm(DEFAULT_FORM);
      refetchInt();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao adicionar"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...row }: Partial<Omit<Interessado, "id" | "criado_em">> & { id: string }) => {
      const { error } = await supabase.from("moveria_interessados").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interessado atualizado.");
      setEditing(null);
      setForm(DEFAULT_FORM);
      refetchInt();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("moveria_interessados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Interessado removido."); refetchInt(); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  function openNew() {
    setForm(DEFAULT_FORM);
    setEditing("new");
  }

  function openEdit(i: Interessado) {
    setForm({
      nome:     i.nome,
      telefone: i.telefone ?? "",
      email:    i.email ?? "",
      papel:    i.papel,
    });
    setEditing(i);
  }

  function cancelForm() {
    setEditing(null);
    setForm(DEFAULT_FORM);
  }

  function submitForm() {
    if (!form.nome.trim() || !form.papel) {
      toast.error("Nome e papel são obrigatórios.");
      return;
    }
    const row = {
      contrato_id: contratoId,
      nome:        form.nome.trim(),
      telefone:    form.telefone.trim() || null,
      email:       form.email.trim() || null,
      papel:       form.papel as Interessado["papel"],
    };
    if (editing === "new") {
      insertMut.mutate(row);
    } else if (editing && typeof editing === "object") {
      updateMut.mutate({ id: (editing as Interessado).id, ...row });
    }
  }

  // ── Endereços (C3) ──────────────────────────────────────────────────────────
  const endCliente = formatEndereco(
    cliente?.endereco_rua ?? null,
    cliente?.endereco_bairro ?? null,
    cliente?.endereco_cidade ?? null,
    cliente?.endereco_uf ?? null,
    cliente?.endereco_cep ?? null,
  );
  const endEntrega = formatEndereco(
    enderecos?.entrega_rua ?? null,
    enderecos?.entrega_bairro ?? null,
    enderecos?.entrega_cidade ?? null,
    enderecos?.entrega_uf ?? null,
    enderecos?.entrega_cep ?? null,
  );

  const isSubmitting = insertMut.isPending || updateMut.isPending;
  const editingId = editing !== null && editing !== "new"
    ? (editing as Interessado).id
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Contatos ───────────────────────────────────────────────────────── */}
      <SectionCard title="Contatos do cliente">
        {loadingCliente ? (
          <LoaderCircle className="w-4 h-4 animate-spin text-text-muted" />
        ) : (
          <div className="flex flex-col gap-1.5">
            <InfoRow label="Telefone" value={cliente?.telefone ?? null} />
            <InfoRow label="E-mail"   value={cliente?.email ?? null} />
          </div>
        )}
      </SectionCard>

      {/* ── Endereços ──────────────────────────────────────────────────────── */}
      <SectionCard title="Endereços">
        {enderecos?.entrega_igual_atual ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-text-secondary">{endCliente}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              Entrega no mesmo endereço do cliente.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                Endereço do cliente
              </p>
              <p className="text-sm text-text-secondary">{endCliente}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                Endereço de entrega
              </p>
              <p className="text-sm text-text-secondary">{endEntrega}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Interessados ───────────────────────────────────────────────────── */}
      <SectionCard title="Interessados">
        {loadingInt ? (
          <LoaderCircle className="w-4 h-4 animate-spin text-text-muted" />
        ) : (
          <>
            {/* Lista */}
            {interessados.length === 0 && editing === null && (
              <p className="text-sm text-text-muted text-center py-3">
                Nenhum interessado cadastrado.
              </p>
            )}
            <div className="flex flex-col divide-y divide-border/50 mb-2">
              {interessados.map((i) => {
                const isEditingThis = editingId === i.id;
                if (isEditingThis) return null; // substituído pelo form abaixo
                return (
                  <div
                    key={i.id}
                    className="flex items-center gap-2 py-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-text-primary">{i.nome}</span>
                        <span className="text-[10px] font-semibold text-text-muted bg-accent-light border border-border rounded px-1.5 py-0.5">
                          {PAPEL_LABEL[i.papel] ?? i.papel}
                        </span>
                      </div>
                      {(i.telefone || i.email) && (
                        <div className="text-xs text-text-muted mt-0.5">
                          {[i.telefone, i.email].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {!isVendedor && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => openEdit(i)}
                          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-border transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Remover "${i.nome}"?`)) {
                              deleteMut.mutate(i.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                          className="p-1 rounded text-text-muted hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors disabled:opacity-40"
                          title="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Formulário (add ou edit) */}
            {!isVendedor && editing !== null && (
              <div className="rounded-lg border border-[var(--color-info)] bg-[var(--color-info-light)] p-3 mt-1 mb-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
                  {editing === "new" ? "Novo interessado" : "Editar interessado"}
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 flex-wrap">
                    {/* Nome */}
                    <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                      <Label className="text-xs">Nome *</Label>
                      <input
                        type="text"
                        value={form.nome}
                        onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                        placeholder="Nome completo"
                        className="h-8 text-sm border border-border rounded-md px-2 bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    {/* Papel */}
                    <div className="flex flex-col gap-1 w-40">
                      <Label className="text-xs">Papel *</Label>
                      <Select
                        value={form.papel}
                        onValueChange={(v) => setForm((f) => ({ ...f, papel: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="arquiteto">Arquiteto</SelectItem>
                          <SelectItem value="proprietario">Proprietário</SelectItem>
                          <SelectItem value="comprador">Comprador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Telefone */}
                    <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                      <Label className="text-xs">Telefone</Label>
                      <input
                        type="text"
                        value={form.telefone}
                        onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        className="h-8 text-sm border border-border rounded-md px-2 bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    {/* E-mail */}
                    <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                      <Label className="text-xs">E-mail</Label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="email@exemplo.com"
                        className="h-8 text-sm border border-border rounded-md px-2 bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelForm}
                      disabled={isSubmitting}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={submitForm}
                      disabled={isSubmitting || !form.nome.trim() || !form.papel}
                    >
                      {isSubmitting && (
                        <LoaderCircle className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      )}
                      {editing === "new" ? "Adicionar" : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Botão adicionar */}
            {!isVendedor && editing === null && (
              <Button
                size="sm"
                variant="outline"
                onClick={openNew}
                className="w-full mt-1"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Adicionar interessado
              </Button>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
