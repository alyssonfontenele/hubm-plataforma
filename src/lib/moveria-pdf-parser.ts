/**
 * moveria-pdf-parser.ts
 *
 * Parser client-side para contratos PDF da Moveria.
 * Calibrado contra 3 PDFs reais (Mandara/PJ, CDV/PJ+substituição, Ticiana/PF+substituição).
 *
 * Coordenadas calibradas (pontos PDF, y=0 na base da página):
 *   Endereço — BAIRRO x≈30, CIDADE x≈204, UF x≈372, CEP x≈434
 *   Itens     — ITEM x<56, QTD x∈[55,80), DESC x∈[80,230), PRAZO x∈[465,510), VALOR x≥510
 *   Número    — linha isolada y≈723, abaixo de "CONTRATO N.o" (y≈741)
 *   Data      — x≥420 na linha de valores do vendedor (y≈684)
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ParsedItem {
  seq: number;
  qtd: number;
  codigo_ambiente: string;
  descricao: string;
  prazo: number | null;
  valor_unitario: number;
}

export interface ParsedContrato {
  numero_base: string;
  versao: number;
  data_contrato: string;         // ISO "YYYY-MM-DD"
  vendedor_nome: string;

  cliente_codigo: string;
  cliente_nome: string;
  documento_raw: string;         // CPF ou CNPJ como aparece no PDF
  tipo_doc: "CPF" | "CNPJ";

  end_atual_rua: string;
  end_atual_bairro: string;
  end_atual_cidade: string;
  end_atual_uf: string;
  end_atual_cep: string;

  telefone: string;
  email: string;

  end_entrega_rua: string;
  end_entrega_bairro: string;
  end_entrega_cidade: string;
  end_entrega_uf: string;
  end_entrega_cep: string;

  itens: ParsedItem[];
  valor_total_declarado: number;

  substitui_numero_raw: string | null;
  substitui_data_raw: string | null;
  substitui_numero_base: string | null;
  substitui_versao: number | null;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

type Row = TextItem[];

// ─── Constantes de coluna (calibradas) ───────────────────────────────────────

const COL_ITEM_MAX   = 56;
const COL_QTD_MAX    = 80;
const COL_DESC_MAX   = 230;
const COL_PRAZO_MIN  = 465;
const COL_PRAZO_MAX  = 510;
const COL_VALOR_MIN  = 510;

const COL_END_CIDADE = 150;  // x < 150 = BAIRRO, x >= 150 = CIDADE (dentro da linha de valores)
const COL_END_UF     = 350;  // x >= 350 = UF
const COL_END_CEP    = 420;  // x >= 420 = CEP

const COL_VENDOR_LOJA = 250;
const COL_DATE_MIN    = 420;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Agrupa TextItems em linhas pelo eixo Y (gap ≤ 3pt = mesma linha). */
function groupByLine(items: TextItem[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    if (!item.str.trim()) continue;
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= 3) {
      last.push(item);
      last.sort((a, b) => a.x - b.x);
    } else {
      rows.push([item]);
    }
  }
  return rows;
}

/** "800.000,00" → 800000 */
function parseBRL(s: string): number {
  return parseFloat(s.trim().replace(/\./g, "").replace(",", ".")) || 0;
}

/** "31/05/2025" → "2025-05-31" */
function parseDateBR(s: string): string {
  const [d, m, y] = s.trim().split("/");
  return `${y}-${m?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
}

/** Detecta CPF (11 dígitos) ou CNPJ (14 dígitos) pelo número de dígitos. */
function detectTipoDoc(raw: string): "CPF" | "CNPJ" {
  return raw.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ";
}

/** Extrai numero_base e versao de uma string como "100000672-2" ou "100000538". */
function parseNumeroContrato(s: string): { numero_base: string; versao: number } {
  const m = s.trim().match(/^(.+)-(\d{1,2})$/);
  return m ? { numero_base: m[1], versao: parseInt(m[2], 10) }
           : { numero_base: s.trim(), versao: 1 };
}

/** Retorna o str de um item da linha cujo x satisfaz o predicate, ou "". */
function colStr(row: Row, pred: (x: number) => boolean): string {
  return row.find(i => pred(i.x))?.str.trim() ?? "";
}

/** Texto completo de uma linha (todos os strs concatenados). */
function rowText(row: Row): string {
  return row.map(i => i.str).join(" ").trim();
}

/** Encontra a linha mais próxima abaixo de um labelY (dentro de 30pt). */
function rowBelow(rows: Row[], labelY: number): Row | undefined {
  return rows.find(r => r[0].y < labelY - 3 && r[0].y > labelY - 30);
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export async function parseMoveriaContratoPDF(file: File): Promise<ParsedContrato> {
  // Import dinâmico — evita execução server-side e inicializa o worker uma vez.
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).href;
  }

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  // ── Coleta todas as linhas de todas as páginas ────────────────────────────
  const allPageRows: Row[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page    = await doc.getPage(p);
    const content = await page.getTextContent();
    const items   = content.items
      .filter((i): i is { str: string; transform: number[]; width: number } =>
        "str" in i && typeof i.str === "string")
      .map(i => ({
        str: i.str,
        x: Math.round(i.transform[4] * 10) / 10,
        y: Math.round(i.transform[5] * 10) / 10,
        w: Math.round((i.width ?? 0) * 10) / 10,
      }));
    allPageRows.push(groupByLine(items));
  }

  // ── Extrai campos do cabeçalho da página 1 ────────────────────────────────
  const page1 = allPageRows[0] ?? [];

  // Número do contrato: linha com string única que bate /^\d{6,10}(-\d{1,2})?$/
  const numeroRaw = page1
    .find(r => r.length === 1 && /^\d{6,10}(-\d{1,2})?$/.test(r[0].str.trim()))
    ?.[0].str.trim() ?? "";
  const { numero_base, versao } = parseNumeroContrato(numeroRaw);

  // RESPONSÁVEL PELA VENDA label → linha abaixo tem vendedor, loja, data
  const vendorLabelY = page1.find(r =>
    rowText(r).includes("RESPONSÁVEL PELA VENDA")
  )?.[0].y ?? 0;
  const vendorRow = rowBelow(page1, vendorLabelY);
  const vendedor_nome = colStr(vendorRow ?? [], x => x < COL_VENDOR_LOJA);
  const dataStr       = colStr(vendorRow ?? [], x => x >= COL_DATE_MIN);
  const data_contrato = dataStr.match(/\d{2}\/\d{2}\/\d{4}/)
    ? parseDateBR(dataStr.match(/\d{2}\/\d{2}\/\d{4}/)![0])
    : "";

  // CLIENTE label → linha abaixo tem "CODE - NOME"
  const clienteLabelY = page1.find(r =>
    rowText(r).trim() === "CLIENTE" || rowText(r).startsWith("CLIENTE ")
  )?.[0].y ?? 0;
  const clienteRow  = rowBelow(page1, clienteLabelY);
  const clienteText = rowText(clienteRow ?? []);
  const clienteMatch = clienteText.match(/^(\d+)\s*-\s*(.+)$/);
  const cliente_codigo = clienteMatch?.[1].trim() ?? "";
  const cliente_nome   = clienteMatch?.[2].trim() ?? clienteText;

  // CPF/CNPJ label → linha abaixo
  const docLabelY = page1.find(r =>
    rowText(r).includes("CPF/CNPJ")
  )?.[0].y ?? 0;
  const docRow      = rowBelow(page1, docLabelY);
  const documento_raw = colStr(docRow ?? [], x => x < COL_END_CIDADE);
  const tipo_doc      = detectTipoDoc(documento_raw);

  // ENDEREÇO ATUAL label → rua 1 linha abaixo, bairro/cidade/uf/cep 2-3 linhas abaixo
  const endAtualLabelY = page1.find(r =>
    rowText(r).includes("ENDEREÇO ATUAL")
  )?.[0].y ?? 0;
  const endAtualRuaRow = rowBelow(page1, endAtualLabelY);
  const endAtualRuaY   = endAtualRuaRow?.[0].y ?? 0;
  const endAtualValRow = rowBelow(page1, endAtualRuaY);
  const end_atual_rua    = rowText(endAtualRuaRow ?? []);
  const end_atual_bairro = colStr(endAtualValRow ?? [], x => x < COL_END_CIDADE);
  const end_atual_cidade = colStr(endAtualValRow ?? [], x => x >= COL_END_CIDADE && x < COL_END_UF);
  const end_atual_uf     = colStr(endAtualValRow ?? [], x => x >= COL_END_UF && x < COL_END_CEP);
  const end_atual_cep    = colStr(endAtualValRow ?? [], x => x >= COL_END_CEP);

  // TELEFONE label → valores na linha abaixo
  const telLabelY = page1.find(r => rowText(r).includes("TELEFONE"))?.[0].y ?? 0;
  const telRow    = rowBelow(page1, telLabelY);
  const telefone  = colStr(telRow ?? [], x => x < COL_END_CIDADE);
  const email     = colStr(telRow ?? [], x => x >= COL_END_UF);

  // ENDEREÇO DE ENTREGA label → mesma estrutura que ATUAL
  const endEntLabelY = page1.find(r =>
    rowText(r).includes("ENDEREÇO DE ENTREGA")
  )?.[0].y ?? 0;
  const endEntRuaRow = rowBelow(page1, endEntLabelY);
  const endEntRuaY   = endEntRuaRow?.[0].y ?? 0;
  const endEntValRow = rowBelow(page1, endEntRuaY);
  const end_entrega_rua    = colStr(endEntRuaRow ?? [], x => x < COL_END_CEP);
  const end_entrega_bairro = colStr(endEntValRow ?? [], x => x < COL_END_CIDADE);
  const end_entrega_cidade = colStr(endEntValRow ?? [], x => x >= COL_END_CIDADE && x < COL_END_UF);
  const end_entrega_uf     = colStr(endEntValRow ?? [], x => x >= COL_END_UF && x < COL_END_CEP);
  const end_entrega_cep    = colStr(endEntValRow ?? [], x => x >= COL_END_CEP);

  // ── Extrai itens (multi-página) ───────────────────────────────────────────
  const itens: ParsedItem[] = [];
  let itemStarted   = false;
  let itemHeaderPg  = -1;
  let itemHeaderY   = 0;
  let currentRaw: null | {
    seq: number; qtd: number; desc_raw: string;
    prazo: number | null; valor_unitario: number;
  } = null;
  let totalDeclarado = 0;

  outer: for (let pgIdx = 0; pgIdx < allPageRows.length; pgIdx++) {
    const rows = allPageRows[pgIdx];
    for (const row of rows) {
      const txt = rowText(row);

      // Ignora números de página (y < 45) e cabeçalho repetido em páginas 2+ (y > 705)
      if (row[0].y < 45) continue;
      if (pgIdx > 0 && row[0].y > 705) continue;

      // Stop: Total do pedido
      if (/Total\s+do\s+pedido/i.test(txt)) {
        const valorStr = row.find(i => i.x >= COL_VALOR_MIN)?.str ?? "";
        totalDeclarado = parseBRL(valorStr);
        if (currentRaw) {
          itens.push(finalizeItem(currentRaw));
          currentRaw = null;
        }
        break outer;
      }

      // Detecta início da tabela de itens
      if (!itemStarted) {
        if (/DESCRIÇÃO\s+AMBIENTE/i.test(txt)) {
          itemStarted  = true;
          itemHeaderPg = pgIdx;
          itemHeaderY  = row[0].y;
        }
        continue;
      }

      // No mesmo página do header: apenas linhas ABAIXO do header
      if (pgIdx === itemHeaderPg && row[0].y >= itemHeaderY) continue;

      const firstX   = row[0].x;
      const firstStr = row[0].str.trim();

      if (firstX < COL_ITEM_MAX && /^\d+$/.test(firstStr)) {
        // ── Nova linha de item
        if (currentRaw) itens.push(finalizeItem(currentRaw));

        const desc_raw  = colStr(row, x => x >= COL_QTD_MAX && x < COL_DESC_MAX);
        const prazoStr  = colStr(row, x => x >= COL_PRAZO_MIN && x < COL_PRAZO_MAX);
        const valorStr  = colStr(row, x => x >= COL_VALOR_MIN);
        const qtdStr    = colStr(row, x => x >= COL_ITEM_MAX && x < COL_QTD_MAX);

        currentRaw = {
          seq:   parseInt(firstStr, 10),
          qtd:   parseBRL(qtdStr) || 1,
          desc_raw,
          prazo: prazoStr ? parseInt(prazoStr, 10) : null,
          valor_unitario: parseBRL(valorStr),
        };

      } else if (currentRaw && firstX >= COL_QTD_MAX && firstX < COL_DESC_MAX) {
        // ── Continuação de descrição (ex: "FITNESS" em nova linha)
        currentRaw.desc_raw += " " + firstStr;
      }
      // Continuações de FORNECEDOR/LINHA (x ≥ COL_DESC_MAX): ignoradas
    }
  }
  if (currentRaw) itens.push(finalizeItem(currentRaw));

  // ── Detecta CANCELA E SUBSTITUI em todas as páginas ──────────────────────
  const RE_CANCELA = /CANCELA\s+E\s+SUBSTITUI\s+O\s+DE\s+NÚMERO[:\s]+([^\s]+)\s+DE\s+(\d{2}\/\d{2}\/\d{4})/i;
  let substitui_numero_raw: string | null = null;
  let substitui_data_raw:   string | null = null;
  let substitui_numero_base: string | null = null;
  let substitui_versao:      number | null = null;

  for (const rows of allPageRows) {
    for (const row of rows) {
      const txt = rowText(row);
      const m   = txt.match(RE_CANCELA);
      if (m) {
        substitui_numero_raw = m[1];
        substitui_data_raw   = m[2];
        const parsed          = parseNumeroContrato(m[1]);
        substitui_numero_base = parsed.numero_base;
        substitui_versao      = parsed.versao;
        break;
      }
    }
    if (substitui_numero_raw) break;
  }

  return {
    numero_base,
    versao,
    data_contrato,
    vendedor_nome,
    cliente_codigo,
    cliente_nome,
    documento_raw,
    tipo_doc,
    end_atual_rua,
    end_atual_bairro,
    end_atual_cidade,
    end_atual_uf,
    end_atual_cep,
    telefone,
    email,
    end_entrega_rua,
    end_entrega_bairro,
    end_entrega_cidade,
    end_entrega_uf,
    end_entrega_cep,
    itens,
    valor_total_declarado: totalDeclarado,
    substitui_numero_raw,
    substitui_data_raw,
    substitui_numero_base,
    substitui_versao,
  };
}

// ─── Finalize item: split "AA-COWORKING OPÇÃO 01" em codigo+descricao ────────

function finalizeItem(raw: {
  seq: number; qtd: number; desc_raw: string;
  prazo: number | null; valor_unitario: number;
}): ParsedItem {
  const desc  = raw.desc_raw.trim();
  const dash  = desc.indexOf("-");
  const codigo_ambiente = dash > 0 ? desc.slice(0, dash).trim() : "";
  const descricao       = dash > 0 ? desc.slice(dash + 1).trim() : desc;
  return {
    seq: raw.seq,
    qtd: raw.qtd,
    codigo_ambiente,
    descricao,
    prazo: raw.prazo,
    valor_unitario: raw.valor_unitario,
  };
}

// ─── Validações ───────────────────────────────────────────────────────────────

export function validarCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    const sum = [...d.slice(0, len)].reduce(
      (acc, c, i) => acc + parseInt(c) * (len + 1 - i), 0
    );
    const r = (sum * 10) % 11;
    return r === 10 || r === 11 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

export function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
}

export function mascaraCPF(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11).padEnd(11, "0");
  return `${d.slice(0,3)}.${d.slice(3,6)}.XXX-XX`;
}

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
