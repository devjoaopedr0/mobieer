/**
 * Requisição impressa no formato da planilha da loja ("REQUISICOES PEÇAS
 * ASSISTENCIA.xlsx"), sem fundo nem faixas escuras. Por padrão as linhas
 * acompanham os itens (mais uma em branco para completar à mão) e cabem
 * quantas requisições der na folha A4; dá para pedir duas ou três por folha,
 * com as 10 linhas da planilha.
 *
 * Peças:   CLIENTE / MONTADOR · DATA PEDIDO / DATA ENTREGA
 *          AMBIENTE | COR | QTD | DESCRIÇÃO | FITA | MOTIVO
 *          SOLICITADO POR · PRODUZIDO POR
 * Insumos: AMBIENTE | TIPO | QTD | DESCRIÇÃO | PENDENTE | MOTIVO
 *          SOLICITADO POR · ENTREGUE
 * Requisição com muitas linhas ocupa o espaço que precisar.
 */
import PDFDocument from "pdfkit";
import { BRAND } from "../../lib/brand-pdf";

type Item = {
  room?: string | null;
  /** tipo do insumo (categoria do produto) */
  kindLabel?: string | null;
  quantity: number;
  unit?: string;
  description: string;
  material: string | null;
  thickness: number | null;
  length: number | null;
  width: number | null;
  edgeFinish: string | null;
  note: string | null;
};

export type RequisitionPrint = {
  /** PECAS ou INSUMOS */
  kind?: string;
  number: string;
  /** quem pediu no sistema (SOLICITADO POR) */
  requester: string;
  /** montador / quem vai usar (campo "Montador" da tela) */
  fitter?: string | null;
  clientName: string | null;
  projectReference: string | null;
  priority: string;
  orderedAt: Date;
  neededAt: Date | null;
  cutter: string | null;
  note: string | null;
  items: Item[];
};

const UNIT: Record<string, string> = { UNIT: "un", BOX: "cx", PACKAGE: "pct", METER: "m", LITER: "L", KILO: "kg", ROLL: "rolo", PAIR: "par" };
const M = 28;
const TITLE_H = 16;
const BOX_H = 13;
const ROW_H = 14;
/** folha dividida em partes iguais: linhas da planilha, mesmo sem itens, para escrever à mão */
const SLOT_ROWS = 10;
/** folha corrida: o mínimo de linhas, e uma em branco depois dos itens */
const AUTO_MIN_ROWS = 3;
export type PerPage = 2 | 3 | "auto";
const rowsFor = (r: RequisitionPrint, perPage: PerPage) => (perPage === "auto" ? Math.max(r.items.length + 1, AUTO_MIN_ROWS) : Math.max(r.items.length, SLOT_ROWS));
const brDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");
const n = (v: number | null) => (v == null ? "" : String(Number(v)).replace(".", ","));

/** "PEÇA ACABAMENTO · 6 mm · 2119 × 181 mm" (a cor vai na coluna COR) */
export function pieceText(i: Item): string {
  const size = i.length != null && i.width != null ? `${n(i.length)} × ${n(i.width)} mm` : i.length != null ? `${n(i.length)} mm` : "";
  return [i.description, i.thickness != null ? `${n(i.thickness)} mm` : "", size].filter(Boolean).join(" · ");
}

/** Altura que a requisição ocupa (para saber se cabe na sua parte da folha). */
export function blockHeight(r: RequisitionPrint, perPage: PerPage = 3) {
  return TITLE_H + 2 * BOX_H + ROW_H + rowsFor(r, perPage) * ROW_H + BOX_H + (r.note ? BOX_H : 0) + 4;
}

export function requisitionsPdf(reqs: RequisitionPrint[], perPage: PerPage = "auto"): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: "Requisições" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width - 2 * M;
  const bottom = doc.page.height - M;
  const part = perPage === "auto" ? bottom - M : (bottom - M) / perPage;
  /** espaço entre uma requisição e a próxima, com a linha de corte no meio */
  const GAP = 12;
  // larguras como na planilha
  const colsFor = (supply: boolean) => [
    { label: "AMBIENTE", w: 0.15 },
    { label: supply ? "TIPO" : "COR", w: 0.15 },
    { label: "QTD", w: 0.06 },
    { label: "DESCRIÇÃO", w: 0.36 },
    { label: supply ? "PENDENTE" : "FITA", w: 0.12 },
    { label: "MOTIVO", w: 0.16 },
  ];
  const stroke = () => doc.lineWidth(0.6).strokeColor(BRAND.ink);
  const text = (s: string, x: number, y: number, w: number, h: number, o: { bold?: boolean; size?: number; align?: "left" | "center" | "right" } = {}) =>
    doc
      .font(o.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(o.size ?? 7.5)
      .fillColor(BRAND.ink)
      .text(s, x + 3, y + (h - (o.size ?? 7.5)) / 2 + 0.5, { width: w - 6, height: h, ellipsis: true, lineBreak: false, align: o.align ?? "left" });
  /** caixa "RÓTULO: valor" */
  const field = (label: string, value: string, x: number, y: number, w: number) => {
    stroke().rect(x, y, w, BOX_H).stroke();
    const lw = doc.font("Helvetica-Bold").fontSize(7.5).widthOfString(`${label}: `);
    text(`${label}:`, x, y, lw + 6, BOX_H, { bold: true });
    text(value, x + lw, y, w - lw, BOX_H);
  };

  let top = M;
  let slot = 0; // próxima parte livre da folha (perPage = folha cheia)
  reqs.forEach((r, idx) => {
    const supply = r.kind === "INSUMOS";
    const cols = colsFor(supply);
    const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? M : acc[i - 1] + cols[i - 1].w * W], []);
    const fits = blockHeight(r, perPage) <= part - 6;
    if (idx > 0) {
      if (perPage === "auto") {
        // folha corrida: a próxima vem logo abaixo, se couber inteira
        if (top + GAP + blockHeight(r, perPage) <= bottom) {
          doc.moveTo(M, top + GAP / 2).lineTo(M + W, top + GAP / 2).dash(3, { space: 3 }).lineWidth(0.4).strokeColor(BRAND.muted).stroke().undash();
          top += GAP;
        } else {
          doc.addPage();
          top = M;
        }
      } else if (fits && slot < perPage) top = M + slot * part + 4;
      else {
        doc.addPage();
        top = M;
        slot = 0;
      }
    }
    let y = top;
    // título centralizado, número à direita
    stroke().rect(M, y, W, TITLE_H).stroke();
    text(supply ? "REQUISIÇÃO DE INSUMOS E FERRAGENS" : "REQUISIÇÃO DE PEÇAS", M, y, W, TITLE_H, { bold: true, size: 9, align: "center" });
    text(r.number + (r.priority === "URGENT" ? " · URGENTE" : r.priority === "HIGH" ? " · ALTA" : ""), M, y, W, TITLE_H, { size: 7, align: "right" });
    y += TITLE_H;
    const left = W * 0.6;
    field("CLIENTE", [r.clientName, r.projectReference].filter(Boolean).join(" — "), M, y, left);
    field("DATA PEDIDO", brDate(r.orderedAt), M + left, y, W - left);
    y += BOX_H;
    field("MONTADOR", r.fitter ?? "", M, y, left);
    field("DATA ENTREGA", brDate(r.neededAt), M + left, y, W - left);
    y += BOX_H;
    const head = (yy: number) => {
      stroke().rect(M, yy, W, ROW_H).stroke();
      cols.forEach((c, i) => {
        if (i) doc.moveTo(xs[i], yy).lineTo(xs[i], yy + ROW_H).stroke();
        text(c.label, xs[i], yy, c.w * W, ROW_H, { bold: true, size: 7, align: i === 0 ? "left" : "center" });
      });
      return yy + ROW_H;
    };
    y = head(y);
    const lines: (Item | null)[] = [...r.items];
    while (lines.length < rowsFor(r, perPage)) lines.push(null);
    for (const it of lines) {
      if (y + ROW_H > doc.page.height - M - BOX_H) {
        doc.addPage();
        y = head(M);
      }
      doc.lineWidth(0.4).strokeColor(BRAND.muted).rect(M, y, W, ROW_H).stroke();
      cols.forEach((_, i) => i && doc.moveTo(xs[i], y).lineTo(xs[i], y + ROW_H).stroke());
      if (it) {
        const desc = supply ? [it.description, it.unit && UNIT[it.unit] ? UNIT[it.unit] : ""].filter(Boolean).join(" · ") : pieceText(it);
        const cells = [it.room ?? "", supply ? it.kindLabel ?? "" : it.material ?? "", String(it.quantity), desc, supply ? "" : it.edgeFinish ?? "", it.note ?? ""];
        cells.forEach((c, i) => text(c, xs[i], y, cols[i].w * W, ROW_H, { size: i === 3 ? 7 : 7.5, bold: i === 2, align: i === 2 ? "center" : "left" }));
      }
      y += ROW_H;
    }
    if (r.note) {
      field("OBS", r.note, M, y, W);
      y += BOX_H;
    }
    field("SOLICITADO POR", r.requester, M, y, left);
    field(supply ? "ENTREGUE" : "PRODUZIDO POR", r.cutter ?? "", M + left, y, W - left);
    y += BOX_H + 4;
    if (perPage === "auto") {
      top = y;
      return;
    }
    const end = M + (slot + 1) * part;
    if (fits && y <= end) {
      // linha de corte entre uma requisição e a próxima
      if (slot + 1 < perPage) doc.moveTo(M, end).lineTo(M + W, end).dash(3, { space: 3 }).lineWidth(0.4).strokeColor(BRAND.muted).stroke().undash();
      slot += 1;
    } else slot = perPage;
  });
  if (!reqs.length) doc.font("Helvetica").fontSize(10).text("Nenhuma requisição para imprimir.");
  doc.end();
  return done;
}
