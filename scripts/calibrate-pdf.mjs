/**
 * calibrate-pdf.mjs — Extrai itens de texto com coordenadas dos 3 PDFs
 * de calibração do módulo Contratos Moveria.
 *
 * Uso: node scripts/calibrate-pdf.mjs
 *
 * Saída:
 *   - Por PDF: páginas relevantes com itens agrupados por linha (Y),
 *              busca por padrões-chave (numero, data, CANCELA, CPF/CNPJ, endereço)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

// pdfjs-dist v4+ usa import ESM
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(
  () => import("pdfjs-dist")
);
const { getDocument, GlobalWorkerOptions } = pdfjsLib.default ?? pdfjsLib;

// Node.js: apontar para o worker bundled para evitar fake-worker error
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const workerPath = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).href;
GlobalWorkerOptions.workerSrc = workerPath;

const PDFS = [
  { file: "contrato mandara.pdf",  label: "MANDARA (PJ, sem substituição, 36 itens, 10p)" },
  { file: "Contrato Cdv.pdf",      label: "CDV    (PJ, substitui 100000672-1, 39 itens, 11p)" },
  { file: "output.pdf",            label: "TICIANA (PF, substitui 100000671, 3 itens, 7p)" },
];

// ────────────────────────────────────────────────────────────────────────────
// Agrupa itens de texto por linha (Y próximo dentro de YGAP pontos)
// ────────────────────────────────────────────────────────────────────────────
const YGAP = 3; // pontos; itens no mesmo YGAP → mesma linha

function groupByLine(items) {
  const lines = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x); // PDF: y cresce para cima
  for (const item of sorted) {
    if (!item.str.trim()) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= YGAP) {
      last.push(item);
      last.sort((a, b) => a.x - b.x);
    } else {
      lines.push([item]);
    }
  }
  return lines;
}

// ────────────────────────────────────────────────────────────────────────────
// Extrai itens de uma página com x, y, width, str
// ────────────────────────────────────────────────────────────────────────────
async function extractPageItems(page) {
  const content = await page.getTextContent();
  return content.items
    .filter((i) => i.str)
    .map((i) => ({
      str:   i.str,
      x:     Math.round(i.transform[4] * 10) / 10,
      y:     Math.round(i.transform[5] * 10) / 10,
      w:     Math.round(i.width * 10) / 10,
      h:     Math.round(i.height * 10) / 10,
    }));
}

// ────────────────────────────────────────────────────────────────────────────
// Imprime uma linha de itens no formato [x=NNN "texto"] ...
// ────────────────────────────────────────────────────────────────────────────
function printLine(items) {
  return items.map((i) => `[x=${String(i.x).padStart(6)} "${i.str}"]`).join("  ");
}

// ────────────────────────────────────────────────────────────────────────────
// Busca padrões-chave em todas as linhas de um PDF
// ────────────────────────────────────────────────────────────────────────────
const RE_NUMERO   = /(\d{8,10})(?:-(\d{1,2}))?/;
const RE_DATA     = /(\d{2}\/\d{2}\/\d{4})/;
const RE_CANCELA  = /CANCELA\s+E\s+SUBSTITUI/i;
const RE_CPF      = /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2}/;
const RE_CNPJ     = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\.\s\/]?\d{4}[\-\.\s]?\d{2}/;
const RE_CEP      = /\d{5}-?\d{3}/;

function scanPatterns(allLines) {
  const hits = {
    numero:     [],
    data:       [],
    cancela:    [],
    cpf:        [],
    cnpj:       [],
    cep:        [],
    contrato_header: [],
    total:      [],
    responsavel:[],
  };

  for (const [pageIdx, lines] of allLines.entries()) {
    for (const line of lines) {
      const joined = line.map((i) => i.str).join(" ");
      const y0 = line[0]?.y;
      const xs = line.map((i) => i.x);

      if (/CONTRATO\s+N[ºo°]?/i.test(joined))   hits.contrato_header.push({ page: pageIdx+1, y: y0, line: joined, items: line });
      if (RE_CANCELA.test(joined))               hits.cancela.push({ page: pageIdx+1, y: y0, line: joined, items: line });
      if (/Total\s+do\s+pedido/i.test(joined))   hits.total.push({ page: pageIdx+1, y: y0, line: joined, items: line });
      if (/RESPONS[AÁ]VEL\s+PELA\s+VENDA/i.test(joined)) hits.responsavel.push({ page: pageIdx+1, y: y0, line: joined, items: line });

      const mNum  = joined.match(RE_NUMERO);
      if (mNum) hits.numero.push({ page: pageIdx+1, y: y0, match: mNum[0], line: joined });

      const mDt   = joined.match(RE_DATA);
      if (mDt) hits.data.push({ page: pageIdx+1, y: y0, match: mDt[0], line: joined });

      // CPF vs CNPJ por tamanho de dígitos
      const digits = joined.replace(/\D/g, "");
      if (digits.length === 11 && /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2}/.test(joined))
        hits.cpf.push({ page: pageIdx+1, y: y0, match: joined.match(RE_CPF)?.[0], line: joined });
      if (digits.length === 14 && /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}/.test(joined))
        hits.cnpj.push({ page: pageIdx+1, y: y0, match: joined.match(RE_CNPJ)?.[0], line: joined });

      if (RE_CEP.test(joined))
        hits.cep.push({ page: pageIdx+1, y: y0, match: joined.match(RE_CEP)?.[0], line: joined, items: line });
    }
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Para cada PDF, mostra páginas 1-2 (cabeçalho) + páginas com itens
// + análise de colunas nas linhas de item
// ────────────────────────────────────────────────────────────────────────────
async function calibrate(pdfPath, label) {
  console.log("\n" + "═".repeat(80));
  console.log(`PDF: ${label}`);
  console.log("═".repeat(80));

  const data = readFileSync(pdfPath);
  const doc  = await getDocument({ data: new Uint8Array(data) }).promise;
  const numPages = doc.numPages;
  console.log(`Páginas: ${numPages}`);

  const allLines = [];

  for (let p = 1; p <= numPages; p++) {
    const page  = await doc.getPage(p);
    const items = await extractPageItems(page);
    const lines = groupByLine(items);
    allLines.push(lines);

    // Mostra páginas 1 e 2 completas (cabeçalho, dados do cliente, campos-chave)
    if (p <= 2) {
      console.log(`\n─── PÁGINA ${p} ─────────────────────────────────────────────────────`);
      for (const line of lines) {
        const y = line[0]?.y ?? 0;
        console.log(`  y=${String(Math.round(y)).padStart(5)}  ${printLine(line)}`);
      }
    }
  }

  // Padrões-chave
  const hits = scanPatterns(allLines);

  console.log("\n─── PADRÕES-CHAVE ──────────────────────────────────────────────────────");

  console.log("\n[CABEÇALHO CONTRATO — NÚMERO]");
  for (const h of hits.contrato_header.slice(0,4))
    console.log(`  p${h.page} y=${h.y}  ${printLine(h.items)}`);

  console.log("\n[NÚMEROS EXTRAÍDOS (regex \\d{8,10})]");
  const uniqNums = [...new Map(hits.numero.map(h => [h.match, h])).values()].slice(0,8);
  for (const h of uniqNums)
    console.log(`  p${h.page} y=${h.y}  match="${h.match}"  linha="${h.line.slice(0,80)}"`);

  console.log("\n[DATAS]");
  for (const h of hits.data.slice(0,6))
    console.log(`  p${h.page} y=${h.y}  match="${h.match}"  linha="${h.line.slice(0,80)}"`);

  console.log("\n[CANCELA E SUBSTITUI]");
  if (hits.cancela.length === 0) console.log("  (não encontrado)");
  for (const h of hits.cancela)
    console.log(`  p${h.page} y=${h.y}  ${printLine(h.items)}`);

  console.log("\n[CPF]");
  if (hits.cpf.length === 0) console.log("  (não encontrado)");
  for (const h of hits.cpf.slice(0,4))
    console.log(`  p${h.page} y=${h.y}  match="${h.match}"  linha="${h.line.slice(0,80)}"`);

  console.log("\n[CNPJ]");
  if (hits.cnpj.length === 0) console.log("  (não encontrado)");
  for (const h of hits.cnpj.slice(0,4))
    console.log(`  p${h.page} y=${h.y}  match="${h.match}"  linha="${h.line.slice(0,80)}"`);

  console.log("\n[CEP / LINHA DE ENDEREÇO]");
  for (const h of hits.cep.slice(0,3))
    console.log(`  p${h.page} y=${h.y}  match="${h.match}"  ${printLine(h.items)}`);

  console.log("\n[TOTAL DO PEDIDO]");
  for (const h of hits.total)
    console.log(`  p${h.page} y=${h.y}  ${printLine(h.items)}`);

  console.log("\n[RESPONSÁVEL PELA VENDA]");
  for (const h of hits.responsavel)
    console.log(`  p${h.page} y=${h.y}  ${printLine(h.items)}`);

  // ── Análise de colunas: última página de itens (antes do Total)
  // Pega as linhas da última página que contém "DESCRIÇÃO" ou itens tipo "AA-"
  console.log("\n─── ANÁLISE DE COLUNAS (itens) ─────────────────────────────────────────");
  let itemPageLines = null;
  for (let p = numPages - 1; p >= 0; p--) {
    const lns = allLines[p];
    const joined = lns.map(l => l.map(i=>i.str).join(" ")).join(" ");
    if (/DESCRI[ÇC][ÃA]O|AMBIENTE|PRODUTO/i.test(joined)) {
      itemPageLines = lns;
      console.log(`  Usando página ${p+1} para análise de colunas.`);
      break;
    }
  }
  if (!itemPageLines) {
    itemPageLines = allLines[0];
    console.log("  Usando página 1 (fallback).");
  }

  // Mostra linhas do cabeçalho da tabela + primeiras linhas de item
  const headerIdx = itemPageLines.findIndex(l =>
    /DESCRI[ÇC][ÃA]O|AMBIENTE|QTD|VALOR/i.test(l.map(i=>i.str).join(" "))
  );
  if (headerIdx >= 0) {
    console.log("  CABEÇALHO DA TABELA:");
    console.log(`    y=${itemPageLines[headerIdx][0]?.y}  ${printLine(itemPageLines[headerIdx])}`);
    const sampleItems = itemPageLines.slice(headerIdx + 1, headerIdx + 8);
    console.log("  PRIMEIRAS LINHAS DE ITEM:");
    for (const l of sampleItems) {
      const joined = l.map(i=>i.str).join(" ");
      if (!joined.trim() || /total/i.test(joined)) break;
      console.log(`    y=${l[0]?.y}  ${printLine(l)}`);
    }
  } else {
    console.log("  Cabeçalho de tabela não encontrado na página selecionada.");
    // Mostra todas as linhas desta página para inspeção manual
    for (const l of itemPageLines.slice(0, 20)) {
      console.log(`    y=${l[0]?.y}  ${printLine(l)}`);
    }
  }

  return { hits, allLines };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
for (const { file, label } of PDFS) {
  const path = join(root, "pdfs-calibracao", file);
  await calibrate(path, label);
}

console.log("\n" + "═".repeat(80));
console.log("Calibração concluída.");
