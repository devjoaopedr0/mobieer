/**
 * Contrato editável: o texto do modelo, já preenchido, vira um documento que a
 * pessoa corrige no editor (como num editor de texto) antes de gerar o PDF.
 *
 * Ida: `contractHtml` monta o HTML inicial — títulos, campos, listas e os
 * quadros do pedido e do pagamento como tabelas comuns, que dá para editar.
 * Volta: o navegador devolve o documento em blocos simples (`docBlocksSchema`)
 * e `contractDocPdf` desenha esses blocos no padrão visual da loja. O servidor
 * nunca lê HTML.
 */
import { z } from "zod";
import { BRAND, PAGE, brandDocument, brandSection, brandTitle, ensureSpace } from "../../lib/brand-pdf";
import { BLOCK, type ContractOrder } from "./contract-order";
import { contractLines } from "./contract.service";

/** Tamanho do título "Contrato Nº …": o mesmo do orçamento (o padrão, 23, saía grande demais). */
export const CONTRACT_TITLE_SIZE = 16;

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function table(head: string[], rows: string[][]) {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

const field = (label: string, value: string) => `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`;

function orderHtml(o: ContractOrder) {
  const parts = [table(["ITEM", "DESCRIÇÃO DO AMBIENTE / PRODUTO", "LINHA", "PRAZO FAB.", "VALOR (R$)"], o.items.map((it) => [it.code, it.room, it.line, it.deadline, brl(it.total)]))];
  if (o.discount > 0) parts.push(`<p style="text-align: right">Total dos ambientes: ${esc(brl(o.subtotal))}</p>`, `<p style="text-align: right">Desconto: - ${esc(brl(o.discount))}</p>`);
  parts.push(`<p style="text-align: right"><strong>VALOR TOTAL DO PEDIDO: ${esc(brl(o.total))}</strong></p>`, "<p><br></p>");
  parts.push(table(["ITEM", "CAIXARIA (CORPO)", "PORTA", "PUXADOR", "OBSERVAÇÃO"], o.items.map((it) => [it.code, it.corpo || "-", it.porta || "-", it.puxador || "-", it.obs || "-"])));
  return parts.join("");
}

function paymentHtml(o: ContractOrder) {
  const parts = [field("Condição Pagto", o.condition || "—"), field("Forma Pagto", o.method || "—")];
  if (o.installments.length) {
    parts.push(field("Parcelamento", `${o.installments.length} ${o.installments.length > 1 ? "pagamentos" : "pagamento"}`));
    parts.push(table(["PARCELA", "VALOR", "VENCIMENTO"], o.installments.map((p) => [p.label, brl(p.amount), brDate(p.due)])));
  }
  return parts.join("");
}

/** HTML inicial do editor, com a mesma leitura de linhas que o PDF usa. */
export function contractHtml(text: string, order: ContractOrder | null): string {
  const blocks: Record<string, string> = order ? { [BLOCK.pedido]: orderHtml(order), [BLOCK.pagamento]: paymentHtml(order) } : {};
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const l of contractLines(text, Object.keys(blocks))) {
    if (l.kind === "bullet") {
      list.push(`<li>${esc(l.text)}</li>`);
      continue;
    }
    flush();
    if (l.kind === "gap") out.push("<p><br></p>");
    else if (l.kind === "block") out.push(blocks[l.key]);
    else if (l.kind === "heading") out.push(`<h3>${esc(l.text)}</h3>`);
    else if (l.kind === "field") out.push(field(l.label, l.value));
    else if (l.kind === "lead") out.push(`<p style="text-align: justify"><strong>${esc(l.label)}:</strong> ${esc(l.text)}</p>`);
    else out.push(`<p style="text-align: justify">${esc(l.text)}</p>`);
  }
  flush();
  return out.join("");
}

// ---------------- Documento editado → PDF ----------------

const run = z.object({ text: z.string().max(20_000), b: z.boolean().optional(), i: z.boolean().optional(), u: z.boolean().optional() });
const align = z.enum(["left", "center", "right", "justify"]).optional();
export const docBlocksSchema = z
  .array(
    z.discriminatedUnion("t", [
      z.object({ t: z.literal("h"), runs: z.array(run).max(200), align }),
      z.object({ t: z.literal("p"), runs: z.array(run).max(500), align }),
      z.object({ t: z.literal("li"), ordered: z.boolean(), n: z.number().int().min(1).max(10_000), runs: z.array(run).max(500) }),
      z.object({ t: z.literal("table"), rows: z.array(z.array(z.string().max(2000)).max(12)).min(1).max(400) }),
    ])
  )
  .max(5000);
export type DocBlocks = z.infer<typeof docBlocksSchema>;
type Run = z.infer<typeof run>;

const fontOf = (r: Run) => (r.b && r.i ? "Helvetica-BoldOblique" : r.b ? "Helvetica-Bold" : r.i ? "Helvetica-Oblique" : "Helvetica");
const plain = (runs: Run[]) => runs.map((r) => r.text).join("");

type Doc = ReturnType<typeof brandDocument>["doc"];

/** Texto com negrito/itálico/sublinhado: um trecho por vez, emendados. */
function drawRuns(doc: Doc, runs: Run[], x: number, width: number, opts: { align?: "left" | "center" | "right" | "justify"; size?: number; color?: string }) {
  const parts = runs.filter((r) => r.text.length);
  parts.forEach((r, k) => {
    doc.font(fontOf(r)).fontSize(opts.size ?? 10).fillColor(opts.color ?? BRAND.ink);
    const o = { width, align: opts.align ?? "left", lineGap: 2.5, underline: !!r.u, continued: k < parts.length - 1 };
    if (k === 0) doc.text(r.text, x, doc.y, o);
    else doc.text(r.text, o);
  });
  doc.x = PAGE.left;
}

const looksNumeric = (s: string) => /^\s*-?\s*(R\$\s*)?-?[\d.]+(,\d+)?\s*%?\s*$/.test(s);

/** Tabela no padrão da marca: primeira linha é o cabeçalho; a linha cresce com o texto. */
function drawTable(doc: Doc, rows: string[][]) {
  const L = PAGE.left;
  const W = doc.page.width - PAGE.left - PAGE.right;
  const cols = Math.max(...rows.map((r) => r.length));
  const cell = (r: string[], i: number) => (r[i] ?? "").replace(/\s+/g, " ").trim();
  // largura de cada coluna pelo tamanho do texto, sem coluna espremida
  const weight = Array.from({ length: cols }, (_, i) => Math.min(40, Math.max(6, ...rows.map((r) => cell(r, i).length))));
  const sum = weight.reduce((s, w) => s + w, 0);
  const ws = weight.map((w) => (w / sum) * W);
  const xs = ws.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? L : acc[i - 1] + ws[i - 1]], []);
  const body = rows.slice(1);
  const right = Array.from({ length: cols }, (_, i) => body.length > 0 && body.every((r) => !cell(r, i) || cell(r, i) === "-" || looksNumeric(cell(r, i))));
  const rowH = (r: string[], bold: boolean, size: number) =>
    Math.max(16, ...ws.map((w, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).heightOfString(cell(r, i) || " ", { width: w - 12 }) + 8));
  const drawRow = (r: string[], head: boolean) => {
    const size = head ? 7.5 : 8.5;
    const h = rowH(r, head, size);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (!head) drawRow(rows[0], true);
    }
    const y = doc.y;
    if (head) doc.rect(L, y, W, h).fill(BRAND.head);
    ws.forEach((w, i) => {
      doc.font(head ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(BRAND.ink).text(cell(r, i), xs[i] + 6, y + 4.5, { width: w - 12, align: right[i] ? "right" : "left" });
    });
    if (!head) doc.moveTo(L, y + h).lineTo(L + W, y + h).strokeColor(BRAND.line).lineWidth(0.5).stroke();
    doc.y = y + h;
  };
  ensureSpace(doc, 40);
  doc.y += 2;
  drawRow(rows[0], true);
  for (const r of body) drawRow(r, false);
  doc.x = L;
  doc.y += 6;
}

/** PDF do contrato editado, com o mesmo cabeçalho, rodapé e estilo do contrato automático. */
export function contractDocPdf(opts: { title: string; subtitle?: string; blocks: DocBlocks; footer?: string; contacts?: string[] }): Promise<Buffer> {
  const { doc, done, width } = brandDocument({ contacts: opts.contacts });
  // "Contrato Nº 377" no mesmo tamanho do título do orçamento
  brandTitle(doc, opts.title, opts.subtitle, { size: CONTRACT_TITLE_SIZE });

  for (const b of opts.blocks) {
    if (b.t === "table") {
      if (b.rows.some((r) => r.some((c) => c.trim()))) drawTable(doc, b.rows);
      continue;
    }
    if (!plain(b.runs).trim()) {
      doc.moveDown(0.35);
      continue;
    }
    if (b.t === "h") {
      // título não fica sozinho no pé da página
      ensureSpace(doc, 80);
      doc.moveDown(0.3);
      if (!b.align || b.align === "left" || b.align === "justify") brandSection(doc, plain(b.runs));
      else {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.orange).text(plain(b.runs).toUpperCase(), PAGE.left, doc.y, { width, align: b.align, characterSpacing: 0.8 });
        doc.fillColor(BRAND.ink);
        doc.moveDown(0.35);
      }
    } else if (b.t === "li") {
      const y = doc.y;
      const mark = b.ordered ? `${b.n}.` : "•";
      doc.font("Helvetica").fontSize(10).fillColor(b.ordered ? BRAND.ink : BRAND.orange).text(mark, PAGE.left + 2, y, { lineBreak: false });
      doc.y = y;
      drawRuns(doc, b.runs, PAGE.left + 16, width - 16, {});
    } else {
      drawRuns(doc, b.runs, PAGE.left, width, { align: b.align });
    }
  }

  if (opts.footer) {
    // a nota final cabe no espaço até o rodapé: não abre uma página só para ela
    const limit = doc.page.height - 62;
    const h = doc.font("Helvetica").fontSize(7.5).heightOfString(opts.footer, { width, align: "center" });
    if (doc.y + 10 + h > limit) doc.addPage();
    else doc.y += 10;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 60;
    doc.fillColor(BRAND.muted).text(opts.footer, PAGE.left, doc.y, { width, align: "center" });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/** Campos que ficaram para preencher no documento editado ("____"). */
export const docHasBlanks = (blocks: DocBlocks) =>
  blocks.some((b) => (b.t === "table" ? b.rows.some((r) => r.some((c) => c.includes("____"))) : plain(b.runs).includes("____")));
