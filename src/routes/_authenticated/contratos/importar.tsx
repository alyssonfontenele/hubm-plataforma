import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  parseMoveriaContratoPDF,
  validarCPF,
  validarCNPJ,
  mascaraCPF,
  sha256hex,
  type ParsedContrato,
  type ParsedItem,
} from "@/lib/moveria-pdf-parser";

export const Route = createFileRoute("/_authenticated/contratos/importar")({
  ssr: false,
  component: ImportarContratoPage,
});

// ─── Tipos de formulário ──────────────────────────────────────────────────────

interface FormContrato extends ParsedContrato {
  vendedor_id: string;
  justificativa: string;
}

type Step = "idle" | "parsing" | "review" | "saving" | "done";

// ─── Componente principal ─────────────────────────────────────────────────────

function ImportarContratoPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const fileRef     = useRef<HTMLInputElement>(null);

  const [step, setStep]     = useState<Step>("idle");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [form, setForm]     = useState<FormContrato | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupeError, setDupeError]   = useState<string | null>(null);
  const [bloqueioCorte, setBloqueioCorte] = useState(false);
  const [avisoPre, setAvisoPre]     = useState<string | null>(null);

  // ── Vendedores disponíveis ─────────────────────────────────────────────────
  const { data: vendedores = [] } = useQuery({
    queryKey: ["moveria-vendedores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("moveria_membros")
        .select("id, papel, profile:profiles(full_name)")
        .eq("ativo", true)
        .in("papel", ["vendedor", "admin_moveria"]);
      return (data ?? []).map((m: any) => ({
        id: m.id as string,
        nome: (m.profile?.full_name ?? "") as string,
      }));
    },
  });

  // ── Data de corte da empresa ───────────────────────────────────────────────
  const { data: dataCorteStr } = useQuery({
    queryKey: ["moveria-data-corte"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_features")
        .select("config")
        .eq("feature_slug", "moveria-contratos")
        .maybeSingle();
      return (data?.config as any)?.data_corte as string | undefined;
    },
  });

  // ── Parse do PDF ───────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfFile(file);
    setStep("parsing");
    setErrors({});
    setDupeError(null);
    setAvisoPre(null);
    setBloqueioCorte(false);

    try {
      const parsed = await parseMoveriaContratoPDF(file);
      if (!parsed.numero_base) throw new Error("Número do contrato não encontrado.");
      if (parsed.itens.length === 0) throw new Error("Nenhum item encontrado.");

      // Pré-seleção de vendedor por nome (hint, não obrigatório)
      const hint = vendedores.find(v =>
        v.nome.toLowerCase().includes(parsed.vendedor_nome.toLowerCase().slice(0, 6))
      );

      setForm({ ...parsed, vendedor_id: hint?.id ?? "", justificativa: "" });

      // Verifica duplicata de número
      await checkDuplicate(parsed.numero_base, parsed.versao);

      // Verifica regra de substituição + data de corte
      if (parsed.substitui_numero_raw) {
        checkSubstituicao(parsed);
      }

      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar PDF.");
      setStep("idle");
    }
  }

  async function checkDuplicate(numero_base: string, versao: number) {
    const { data } = await supabase
      .from("moveria_contratos")
      .select("id")
      .eq("numero_base", numero_base)
      .eq("versao", versao)
      .maybeSingle();
    if (data) {
      setDupeError(
        `Contrato ${numero_base}${versao > 1 ? `-${versao}` : ""} já existe no banco.`
      );
    }
  }

  function checkSubstituicao(parsed: ParsedContrato) {
    if (!dataCorteStr || !parsed.substitui_data_raw) return;

    // Data de referência = MAX(data_contrato_novo, data_do_substituto)
    const dNovo  = new Date(parsed.data_contrato).getTime();
    const dVelho = new Date(
      parsed.substitui_data_raw.split("/").reverse().join("-")
    ).getTime();
    const dRef  = Math.max(dNovo, dVelho);
    const dCorte = new Date(dataCorteStr).getTime();

    const sub = `${parsed.substitui_numero_raw} DE ${parsed.substitui_data_raw}`;
    if (dRef < dCorte) {
      setAvisoPre(
        `Este contrato substitui ${sub}, anterior à data de corte (${dataCorteStr}). A importação será registrada com aviso.`
      );
    } else {
      setBloqueioCorte(true);
      setAvisoPre(
        `Este contrato substitui ${sub}. A data de referência está dentro do período de corte. Justificativa obrigatória para prosseguir.`
      );
    }
  }

  // ── Validação do formulário ────────────────────────────────────────────────
  function validate(): Record<string, string> {
    if (!form) return {};
    const errs: Record<string, string> = {};

    if (!form.vendedor_id)
      errs.vendedor_id = "Consultor Comercial obrigatório.";

    const digits = form.documento_raw.replace(/\D/g, "");
    if (form.tipo_doc === "CPF" && !validarCPF(form.documento_raw))
      errs.documento_raw = "CPF inválido.";
    if (form.tipo_doc === "CNPJ" && !validarCNPJ(form.documento_raw))
      errs.documento_raw = "CNPJ inválido.";

    if (!form.numero_base)
      errs.numero_base = "Número do contrato obrigatório.";
    if (!form.data_contrato)
      errs.data_contrato = "Data do contrato obrigatória.";
    if (form.itens.length === 0)
      errs.itens = "Pelo menos 1 item obrigatório.";
    if (form.itens.some(i => i.valor_unitario <= 0))
      errs.itens_valor = "Todos os itens precisam de valor > 0.";
    if (bloqueioCorte && !form.justificativa.trim())
      errs.justificativa = "Justificativa obrigatória para substituição dentro do corte.";

    return errs;
  }

  // ── Salvar contrato ────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!form || !pdfFile || !profile) return;

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (dupeError) { toast.error(dupeError); return; }

    setStep("saving");

    try {
      const digits = form.documento_raw.replace(/\D/g, "");

      // ── 1. Hash do documento ──────────────────────────────────────────────
      const docHash = await sha256hex(digits);

      // ── 2. Busca cliente existente por hash ───────────────────────────────
      const hashCol = form.tipo_doc === "CPF" ? "cpf_hash" : "cnpj_hash";
      const { data: existingCliente } = await supabase
        .from("moveria_clientes")
        .select("id")
        .eq(hashCol, docHash)
        .maybeSingle();

      let clienteId: string;

      if (existingCliente) {
        clienteId = existingCliente.id;
        // Atualiza campos que podem ter mudado
        await supabase.from("moveria_clientes").update({
          nome_completo:   form.cliente_nome,
          telefone:        form.telefone || null,
          email:           form.email || null,
          endereco:        form.end_atual_rua,
          endereco_rua:    form.end_atual_rua,
          endereco_bairro: form.end_atual_bairro,
          endereco_cidade: form.end_atual_cidade,
          endereco_uf:     form.end_atual_uf,
          endereco_cep:    form.end_atual_cep,
        }).eq("id", clienteId);
      } else {
        // ── 3. Cria novo cliente ────────────────────────────────────────────
        const clientePayload: Record<string, unknown> = {
          nome_completo:   form.cliente_nome,
          telefone:        form.telefone || null,
          email:           form.email || null,
          endereco:        form.end_atual_rua,
          endereco_rua:    form.end_atual_rua,
          endereco_bairro: form.end_atual_bairro,
          endereco_cidade: form.end_atual_cidade,
          endereco_uf:     form.end_atual_uf,
          endereco_cep:    form.end_atual_cep,
        };
        if (form.tipo_doc === "CPF") {
          clientePayload.cpf_hash     = docHash;
          clientePayload.cpf_mascarado = mascaraCPF(form.documento_raw);
        } else {
          clientePayload.cnpj_hash = docHash;
        }
        const { data: novoCliente, error: ceErr } = await supabase
          .from("moveria_clientes")
          .insert(clientePayload)
          .select("id")
          .single();
        if (ceErr) throw ceErr;
        clienteId = novoCliente.id;
      }

      // ── 4. Busca contrato substituído (se houver) ──────────────────────────
      let substituiContratoId: string | null = null;
      if (form.substitui_numero_base) {
        const { data: subRow } = await supabase
          .from("moveria_contratos")
          .select("id")
          .eq("numero_base", form.substitui_numero_base)
          .eq("versao", form.substitui_versao ?? 1)
          .maybeSingle();
        substituiContratoId = subRow?.id ?? null;
      }

      // ── 5. Cria contrato ──────────────────────────────────────────────────
      const storagePrefix = `${form.numero_base}/`;
      const entregaIgual  =
        form.end_entrega_bairro === form.end_atual_bairro &&
        form.end_entrega_cep    === form.end_atual_cep;

      const { data: contrato, error: ctErr } = await supabase
        .from("moveria_contratos")
        .insert({
          numero:                `${form.numero_base}${form.versao > 1 ? `-${form.versao}` : ""}`,
          numero_base:           form.numero_base,
          versao:                form.versao,
          cliente_id:            clienteId,
          vendedor_id:           form.vendedor_id,
          data_contrato:         form.data_contrato || null,
          valor_total_declarado: form.valor_total_declarado || null,
          substitui_contrato_id: substituiContratoId,
          storage_prefix:        storagePrefix,
          entrega_rua:           form.end_entrega_rua || null,
          entrega_bairro:        form.end_entrega_bairro || null,
          entrega_cidade:        form.end_entrega_cidade || null,
          entrega_uf:            form.end_entrega_uf || null,
          entrega_cep:           form.end_entrega_cep || null,
          entrega_igual_atual:   entregaIgual,
        })
        .select("id")
        .single();
      if (ctErr) throw ctErr;

      // ── 6. Cria itens ─────────────────────────────────────────────────────
      const itensPayload = form.itens.map((item, idx) => ({
        contrato_id:               contrato.id,
        codigo:                    item.codigo_ambiente,
        descricao:                 item.descricao,
        ambiente:                  item.codigo_ambiente,
        quantidade:                Math.max(1, Math.round(item.qtd)),
        valor_unitario:            item.valor_unitario,
        prazo_producao_dias_uteis: item.prazo ?? null,
        ordem:                     idx + 1,
      }));
      const { error: itErr } = await supabase
        .from("moveria_itens_contrato")
        .insert(itensPayload);
      if (itErr) throw itErr;

      // ── 7. Upload do PDF ──────────────────────────────────────────────────
      const storagePath = `${form.numero_base}/${crypto.randomUUID()}-proposta.pdf`;
      const { error: upErr } = await supabase.storage
        .from("moveria-docs")
        .upload(storagePath, pdfFile, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      // ── 8. Registra documento ─────────────────────────────────────────────
      await supabase.from("moveria_documentos").insert({
        contrato_id:   contrato.id,
        tipo:          "proposta_pdf",
        storage_path:  storagePath,
        nome_arquivo:  pdfFile.name,
        mime_type:     "application/pdf",
        tamanho_bytes: pdfFile.size,
        enviado_por:   profile.id,
      });

      // ── 9. Marca contrato substituído + evento de substituição ────────────
      if (substituiContratoId) {
        await supabase
          .from("moveria_contratos")
          .update({ status: "substituido" as any })
          .eq("id", substituiContratoId);

        await supabase.from("moveria_eventos").insert({
          tipo:        "status_contrato_alterado",
          contrato_id: substituiContratoId,
          autor_id:    profile.id,
          payload: {
            de:              "em_andamento",
            para:            "substituido",
            substituto_id:   contrato.id,
            substituto_num:  `${form.numero_base}${form.versao > 1 ? `-${form.versao}` : ""}`,
            numero_antigo:   form.substitui_numero_raw,
            justificativa:   form.justificativa.trim() || null,
            admin_override:  bloqueioCorte,
          },
        });
      }

      // ── 10. Evento de importação ──────────────────────────────────────────
      await supabase.from("moveria_eventos").insert({
        tipo:        "documento_importado",
        contrato_id: contrato.id,
        autor_id:    profile.id,
        payload: {
          storage_path:   storagePath,
          nome_arquivo:   pdfFile.name,
          qtd_itens:      form.itens.length,
          substitui:      form.substitui_numero_raw ?? null,
        },
      });

      setStep("done");
      toast.success("Contrato importado com sucesso.");

      setTimeout(() => void navigate({ to: "/contratos/backlog" }), 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar.";
      toast.error(msg);
      setStep("review");
    }
  }

  // ─── Atualiza campo de item ───────────────────────────────────────────────
  function updateItem(idx: number, patch: Partial<ParsedItem>) {
    setForm(f => {
      if (!f) return f;
      const itens = [...f.itens];
      itens[idx] = { ...itens[idx], ...patch };
      return { ...f, itens };
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-text-primary">
        <CheckCircle className="w-10 h-10 text-success" />
        <p className="text-lg font-semibold">Contrato importado.</p>
        <p className="text-sm text-text-muted">Redirecionando para o backlog…</p>
      </div>
    );
  }

  if (step === "idle" || step === "parsing") {
    return (
      <div className="space-y-6 max-w-lg mx-auto py-8">
        <header>
          <p className="text-xs uppercase tracking-wider text-text-muted">Contratos</p>
          <h2 className="text-xl font-bold text-text-primary">Importar contrato via PDF</h2>
        </header>

        <div
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-border bg-surface hover:bg-accent-light transition-colors p-10 flex flex-col items-center gap-3 text-text-muted"
        >
          {step === "parsing"
            ? <Loader2 className="w-8 h-8 animate-spin" />
            : <Upload className="w-8 h-8" />}
          <p className="text-sm font-medium text-text-primary">
            {step === "parsing" ? "Processando PDF…" : "Clique para selecionar o PDF"}
          </p>
          <p className="text-xs">Contratos Moveria (B2C)</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => void handleFile(e)}
          disabled={step === "parsing"}
        />
      </div>
    );
  }

  if (!form) return null;

  const totalCalculado = form.itens.reduce((s, i) => s + i.valor_unitario * i.qtd, 0);
  const canConfirm = !dupeError && !(bloqueioCorte && !form.justificativa.trim());

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Contratos</p>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Revisar importação — {form.numero_base}{form.versao > 1 ? `-${form.versao}` : ""}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => setStep("idle")}>
          Cancelar
        </Button>
      </header>

      {/* ── Banners ── */}
      {dupeError && (
        <div className="rounded-md border border-danger bg-danger-light px-4 py-3 text-sm text-danger-text flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{dupeError} Corrija o número ou cancele.</span>
        </div>
      )}
      {avisoPre && !bloqueioCorte && (
        <div className="rounded-md border border-warning bg-warning-light px-4 py-3 text-sm text-warning-text flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{avisoPre}</span>
        </div>
      )}
      {avisoPre && bloqueioCorte && (
        <div className="rounded-md border border-danger bg-danger-light px-4 py-3 text-sm text-danger-text flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{avisoPre}</span>
          </div>
          <label className="block">
            <span className="text-xs font-medium">Justificativa obrigatória</span>
            <textarea
              rows={3}
              value={form.justificativa}
              onChange={e => setForm(f => f ? { ...f, justificativa: e.target.value } : f)}
              className="mt-1 w-full rounded-md border border-danger bg-background text-text-primary text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-danger"
              placeholder="Descreva o motivo desta substituição dentro do período de corte…"
            />
            {errors.justificativa && (
              <p className="text-xs text-danger mt-1">{errors.justificativa}</p>
            )}
          </label>
        </div>
      )}

      {/* ── Seção: Contrato ── */}
      <Section title="Contrato">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Número" error={errors.numero_base}>
            <input className={input()} value={form.numero_base} onChange={e => setForm(f => f ? { ...f, numero_base: e.target.value } : f)} />
          </Field>
          <Field label="Versão">
            <input type="number" min={1} className={input()} value={form.versao} onChange={e => setForm(f => f ? { ...f, versao: parseInt(e.target.value) || 1 } : f)} />
          </Field>
          <Field label="Data do contrato" error={errors.data_contrato}>
            <input type="date" className={input()} value={form.data_contrato} onChange={e => setForm(f => f ? { ...f, data_contrato: e.target.value } : f)} />
          </Field>
          <Field label="Consultor Comercial (RESPONSÁVEL PELA VENDA)" error={errors.vendedor_id}>
            <div className="text-xs text-text-muted mb-1">Extraído do PDF: <em>{form.vendedor_nome || "—"}</em></div>
            <select
              className={input()}
              value={form.vendedor_id}
              onChange={e => setForm(f => f ? { ...f, vendedor_id: e.target.value } : f)}
            >
              <option value="">— selecione —</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.substitui_numero_raw && (
          <p className="mt-2 text-xs text-text-muted">
            Substitui: <strong>{form.substitui_numero_raw}</strong> de {form.substitui_data_raw}
          </p>
        )}
      </Section>

      {/* ── Seção: Cliente ── */}
      <Section title="Cliente">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome completo">
            <input className={input()} value={form.cliente_nome} onChange={e => setForm(f => f ? { ...f, cliente_nome: e.target.value } : f)} />
          </Field>
          <Field label={`${form.tipo_doc} (extraído: ${form.tipo_doc})`} error={errors.documento_raw}>
            <input className={input()} value={form.documento_raw} onChange={e => setForm(f => f ? { ...f, documento_raw: e.target.value } : f)} />
          </Field>
          <Field label="Telefone">
            <input className={input()} value={form.telefone} onChange={e => setForm(f => f ? { ...f, telefone: e.target.value } : f)} />
          </Field>
          <Field label="E-mail">
            <input className={input()} value={form.email} onChange={e => setForm(f => f ? { ...f, email: e.target.value } : f)} />
          </Field>
        </div>
        <p className="text-xs font-medium text-text-muted mt-4 mb-2">Endereço atual</p>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Rua / logradouro">
            <input className={input()} value={form.end_atual_rua} onChange={e => setForm(f => f ? { ...f, end_atual_rua: e.target.value } : f)} />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Bairro">
              <input className={input()} value={form.end_atual_bairro} onChange={e => setForm(f => f ? { ...f, end_atual_bairro: e.target.value } : f)} />
            </Field>
            <Field label="Cidade">
              <input className={input()} value={form.end_atual_cidade} onChange={e => setForm(f => f ? { ...f, end_atual_cidade: e.target.value } : f)} />
            </Field>
            <Field label="UF">
              <input maxLength={2} className={input()} value={form.end_atual_uf} onChange={e => setForm(f => f ? { ...f, end_atual_uf: e.target.value.toUpperCase() } : f)} />
            </Field>
            <Field label="CEP">
              <input className={input()} value={form.end_atual_cep} onChange={e => setForm(f => f ? { ...f, end_atual_cep: e.target.value } : f)} />
            </Field>
          </div>
        </div>
        <p className="text-xs font-medium text-text-muted mt-4 mb-2">Endereço de entrega</p>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Rua / logradouro">
            <input className={input()} value={form.end_entrega_rua} onChange={e => setForm(f => f ? { ...f, end_entrega_rua: e.target.value } : f)} />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Bairro">
              <input className={input()} value={form.end_entrega_bairro} onChange={e => setForm(f => f ? { ...f, end_entrega_bairro: e.target.value } : f)} />
            </Field>
            <Field label="Cidade">
              <input className={input()} value={form.end_entrega_cidade} onChange={e => setForm(f => f ? { ...f, end_entrega_cidade: e.target.value } : f)} />
            </Field>
            <Field label="UF">
              <input maxLength={2} className={input()} value={form.end_entrega_uf} onChange={e => setForm(f => f ? { ...f, end_entrega_uf: e.target.value.toUpperCase() } : f)} />
            </Field>
            <Field label="CEP">
              <input className={input()} value={form.end_entrega_cep} onChange={e => setForm(f => f ? { ...f, end_entrega_cep: e.target.value } : f)} />
            </Field>
          </div>
        </div>
      </Section>

      {/* ── Seção: Itens ── */}
      <Section title={`Itens (${form.itens.length})`} error={errors.itens || errors.itens_valor}>
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-2 py-2 text-left text-text-muted w-8">#</th>
                <th className="px-2 py-2 text-left text-text-muted w-12">Cód.</th>
                <th className="px-2 py-2 text-left text-text-muted">Descrição</th>
                <th className="px-2 py-2 text-left text-text-muted w-10">Qtd</th>
                <th className="px-2 py-2 text-right text-text-muted w-28">Valor unit.</th>
                <th className="px-2 py-2 text-right text-text-muted w-20">Prazo (du)</th>
              </tr>
            </thead>
            <tbody>
              {form.itens.map((item, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 text-text-muted">{item.seq}</td>
                  <td className="px-2 py-1.5 font-mono text-text-muted">
                    <input
                      className="w-10 bg-transparent border-b border-border focus:outline-none text-text-primary"
                      value={item.codigo_ambiente}
                      onChange={e => updateItem(idx, { codigo_ambiente: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="w-full bg-transparent border-b border-border focus:outline-none text-text-primary"
                      value={item.descricao}
                      onChange={e => updateItem(idx, { descricao: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center text-text-primary">{item.qtd}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`w-28 text-right bg-transparent border-b border-border focus:outline-none ${item.valor_unitario <= 0 ? "text-danger" : "text-text-primary"}`}
                      value={item.valor_unitario}
                      onChange={e => updateItem(idx, { valor_unitario: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      className="w-16 text-right bg-transparent border-b border-border focus:outline-none text-text-primary"
                      value={item.prazo ?? ""}
                      onChange={e => updateItem(idx, { prazo: parseInt(e.target.value) || null })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col items-end gap-1 text-sm">
          <span className="text-text-muted">
            Total calculado:{" "}
            <strong className="text-text-primary font-mono">
              R$ {totalCalculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </strong>
          </span>
          {form.valor_total_declarado > 0 && (
            <span className={`text-xs ${Math.abs(totalCalculado - form.valor_total_declarado) > 0.01 ? "text-warning-text" : "text-text-muted"}`}>
              Total declarado no PDF:{" "}
              R$ {form.valor_total_declarado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              {Math.abs(totalCalculado - form.valor_total_declarado) > 0.01 && " ⚠ divergência"}
            </span>
          )}
        </div>
      </Section>

      {/* ── Botão de confirmação ── */}
      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => setStep("idle")}>Cancelar</Button>
        <Button
          onClick={() => void handleConfirm()}
          disabled={!canConfirm || step === "saving"}
          className="bg-text-primary text-background hover:bg-text-primary/90 disabled:opacity-50"
        >
          {step === "saving"
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando…</>
            : "✓ Confirmar importação"}
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Section({
  title, children, error,
}: { title: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {error && <p className="text-xs text-danger">{error}</p>}
      {children}
    </div>
  );
}

function Field({
  label, children, error,
}: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function input() {
  return "w-full h-9 px-3 rounded-md border border-border bg-background text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-text-primary";
}
