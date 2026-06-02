/**
 * check-parse.mjs — valida extração dos campos após correção dos 3 bugs.
 * Roda em Node.js (não no browser), usando a mesma lógica do parser.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, "..");

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { getDocument, GlobalWorkerOptions } = pdfjsLib.default ?? pdfjsLib;
import { createRequire } from "module";
GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).href;

const YGAP = 3;
function groupByLine(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    if (!item.str.trim()) continue;
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= YGAP) {
      last.push(item); last.sort((a, b) => a.x - b.x);
    } else { rows.push([item]); }
  }
  return rows;
}
function rowText(r) { return r.map(i => i.str).join(" ").trim(); }
function colStr(row, pred) { return row.find(i => pred(i.x))?.str.trim() ?? ""; }
function rowBelow(rows, labelY) {
  return rows.find(r => r[0].y < labelY - 3 && r[0].y > labelY - 30);
}

const PDFS = [
  "contrato mandara.pdf",
  "Contrato Cdv.pdf",
  "output.pdf",
];

for (const file of PDFS) {
  const path = join(root, "pdfs-calibracao", file);
  const data = readFileSync(path);
  const doc  = await getDocument({ data: new Uint8Array(data) }).promise;

  const page  = await doc.getPage(1);
  const cont  = await page.getTextContent();
  const items = cont.items
    .filter(i => i.str)
    .map(i => ({ str: i.str, x: Math.round(i.transform[4]*10)/10, y: Math.round(i.transform[5]*10)/10 }));
  const page1 = groupByLine(items);

  // Bug 1: nome do cliente (sem "Normal")
  const clienteLabelY = page1.find(r => {
    const t = rowText(r);
    return t.trim() === "CLIENTE" || t.startsWith("CLIENTE ");
  })?.[0].y ?? 0;
  const clienteRow  = rowBelow(page1, clienteLabelY);
  const clienteText = (clienteRow ?? []).filter(i => i.x < 400).map(i => i.str).join(" ").trim();
  const clienteMatch = clienteText.match(/^(\d+)\s*-\s*(.+)$/);
  const cliente_nome = clienteMatch?.[2].trim() ?? clienteText;

  // Bug 2: telefone + email
  const telLabelY = page1.find(r => {
    const t = rowText(r);
    return t.includes("TELEFONE") && t.includes("PROFISSÃO");
  })?.[0].y ?? 0;
  const telRow   = rowBelow(page1, telLabelY);
  const telefone = colStr(telRow ?? [], x => x < 150);
  const email    = colStr(telRow ?? [], x => x >= 350);

  // Bug 3: endereço (dois rowBelow para pular a linha de labels)
  const endAtualLabelY = page1.find(r => rowText(r).includes("ENDEREÇO ATUAL"))?.[0].y ?? 0;
  const endAtualRuaRow  = rowBelow(page1, endAtualLabelY);
  const endAtualRuaY    = endAtualRuaRow?.[0].y ?? 0;
  const endAtualLabsRow = rowBelow(page1, endAtualRuaY);
  const endAtualLabsY   = endAtualLabsRow?.[0].y ?? 0;
  const endAtualValRow  = rowBelow(page1, endAtualLabsY);
  const bairro = colStr(endAtualValRow ?? [], x => x < 150);
  const cidade = colStr(endAtualValRow ?? [], x => x >= 150 && x < 350);
  const uf     = colStr(endAtualValRow ?? [], x => x >= 350 && x < 420);
  const cep    = colStr(endAtualValRow ?? [], x => x >= 420);

  console.log(`\n── ${file} ──`);
  console.log(`  cliente_nome : "${cliente_nome}"`);
  console.log(`  telefone     : "${telefone}"`);
  console.log(`  email        : "${email}"`);
  console.log(`  bairro       : "${bairro}"`);
  console.log(`  cidade       : "${cidade}"`);
  console.log(`  uf           : "${uf}"`);
  console.log(`  cep          : "${cep}"`);
}
