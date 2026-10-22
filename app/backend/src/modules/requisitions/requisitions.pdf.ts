/**
 * Requisição de peças impressa, como a planilha da loja: duas por folha A4
 * (meia folha cada) para economizar papel. Sem fundo nem faixas escuras.
 * Requisição com muitas peças ocupa a folha inteira e continua na seguinte.
 */
import PDFDocument from "pdfkit";
import { BRAND } from "../../lib/brand-pdf";

export type RequisitionPrint = {
  /** PECAS ou INSUMOS */
  kind?: string;
  number: string;
  requester: string;
  clientName: string | null;
  projectReference: string | null;
  priority: string;
  orderedAt: Date;
  neededAt: Date | null;
  cutter: string | null;
  note: string | null;
  items: { quantity: number; unit?: string; description: string; material: string | null; thickness: number | null; length: number | null; width: number | null; edgeFinish: string | null; note: string | null }[];
};

const PRIORITY: Record<string, string> = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };
const UNIT: Record<string, string> = { UNIT: "un", BOX: "cx", PACKAGE: "pct", METER: "m", LITER: "L", KILO: "kg", ROLL: "rolo", PAIR: "par" };
const M = 28;
const HEAD_H = 18;
const ROW_H = 16;
const brDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "____/____/______");
const n = (v: number | null) => (v == null ? "" : String(Number(v)).replace(".", ","));

/** "MDF BRANCO · 6 mm · 2119 × 181 mm" */
export function pieceText(i: RequisitionPrint["items"][number]): string {
  const size = i.length != null && i.width != null ? `${n(i.length)} × ${n(i.width)} mm` : i.length != null ? `${n(i.length)} mm` : "";
  return [i.description, i.material, i.thickness != null ? `${n(i.thickness)} mm` : "", size].filter(Boolean).join(" · ");
}

/** Altura que a requisição ocupa (para saber se cabe em meia folha). */
export function blockHeight(r: RequisitionPrint) {
  return 66 + HEAD_H + Math.max(r.items.length, 3) * ROW_H + (r.note ? 26 : 0) + 30;
}

export function requisitionsPdf(reqs: RequisitionPrint[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: "Requisições de peças" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width - 2 * M;
  const half = (doc.page.height - 2 * M) / 2;
  const pieceCols = [
    { label: "QTD", w: 0.07 },
    { label: "DESCRIÇÃO", w: 0.5 },
    { label: "FITA", w: 0.14 },
    { label: "MOTIVO / OBS.", w: 0.19 },
    { label: "PRODUZIDO", w: 0.1 },
  ];
  const supplyCols = [
    { label: "QTD", w: 0.07 },
    { label: "INSUMO", w: 0.5 },
    { label: "UN.", w: 0.1 },
    { label: "OBS.", w: 0.23 },
    { label: "ENTREGUE", w: 0.1 },
  ];
  let cols = pieceCols;
  let xs: number[] = [];
  const layout = (supply: boolean) => {
    cols = supply ? supplyCols : pieceCols;
    xs = cols.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? M : acc[i - 1] + cols[i - 1].w * W], []);
  };
  const cell = (text: string, i: number, y: number, bold = false, size = 8) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(BRAND.ink).text(text, xs[i] + 4, y + (ROW_H - size) / 2 - 0.5, { width: cols[i].w * W - 8, height: ROW_H - 2, ellipsis: true, lineBreak: false });
  const tableHead = (y: number) => {
    doc.rect(M, y, W, HEAD_H).lineWidth(0.6).strokeColor(BRAND.ink).stroke();
    cols.forEach((c, i) => {
      if (i) doc.moveTo(xs[i], y).lineTo(xs[i], y + HEAD_H).stroke();
      doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.ink).text(c.label, xs[i] + 4, y + 6, { width: c.w * W - 8, lineBreak: false });
    });
    return y + HEAD_H;
  };
  const row = (y: number, it: RequisitionPrint["items"][number] | null) => {
    doc.rect(M, y, W, ROW_H).lineWidth(0.4).strokeColor(BRAND.muted).stroke();
    cols.forEach((_, i) => i && doc.moveTo(xs[i], y).lineTo(xs[i], y + ROW_H).stroke());
    if (it) {
      cell(String(it.quantity), 0, y, true);
      const supply = cols === supplyCols;
      cell(supply ? it.description : pieceText(it), 1, y);
      cell(supply ? UNIT[it.unit ?? ""] ?? it.unit ?? "" : it.edgeFinish ?? "", 2, y);
      cell(it.note ?? "", 3, y, false, 7);
    }
    // quadradinho para marcar à mão
    doc.rect(xs[4] + (cols[4].w * W) / 2 - 4, y + ROW_H / 2 - 4, 8, 8).lineWidth(0.6).strokeColor(BRAND.ink).stroke();
    return y + ROW_H;
  };

  let top = M;
  let slot = 0; // 0 = metade de cima livre, 1 = metade de baixo livre
  reqs.forEach((r, idx) => {
    const fitsHalf = blockHeight(r) <= half - 8;
    if (idx > 0) {
      if (fitsHalf && slot === 1) top = M + half + 8;
      else {
        doc.addPage();
        top = M;
        slot = 0;
      }
    }
    let y = top;
    const supply = r.kind === "INSUMOS";
    layout(supply);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND.ink).text(supply ? "REQUISIÇÃO DE INSUMOS — ALMOXARIFADO" : "REQUISIÇÃO DE PEÇAS", M, y, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).text(r.number, M, y, { width: W, align: "right", lineBreak: false });
    y += 18;
    const info = (label: string, value: string, x: number, w: number) => {
      doc.font("Helvetica").fontSize(6.5).fillColor(BRAND.muted).text(label, x, y, { width: w, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.ink).text(value || "—", x, y + 8, { width: w - 6, height: 11, ellipsis: true, lineBreak: false });
    };
    const q = W / 4;
    info("SOLICITANTE", r.requester, M, q);
    info("CLIENTE / PROJETO", [r.clientName, r.projectReference].filter(Boolean).join(" — "), M + q, q * 2);
    info("PRIORIDADE", PRIORITY[r.priority] ?? r.priority, M + 3 * q, q);
    y += 22;
    info("DATA DO PEDIDO", brDate(r.orderedAt), M, q);
    info("DATA DE ENTREGA", brDate(r.neededAt), M + q, q);
    info(supply ? "ENTREGUE POR" : "RESPONSÁVEL PELO CORTE", r.cutter ?? "", M + 2 * q, q * 2);
    y += 26;
    y = tableHead(y);
    const lines: (RequisitionPrint["items"][number] | null)[] = [...r.items];
    while (lines.length < 3) lines.push(null); // linhas em branco para completar à mão
    for (const it of lines) {
      if (y + ROW_H > doc.page.height - M - 20) {
        doc.addPage();
        y = tableHead(M);
      }
      y = row(y, it);
    }
    if (r.note) {
      doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.ink).text(`Observações: ${r.note}`, M, y + 5, { width: W, height: 20, ellipsis: true });
      y += 26;
    }
    doc.font("Helvetica").fontSize(7).fillColor(BRAND.muted).text("Conferido por: ______________________________     Data: ____/____/______", M, y + 8, { width: W, lineBreak: false });
    y += 22;
    if (fitsHalf && slot === 0 && y <= M + half) {
      // linha de corte entre as duas metades
      doc.moveTo(M, M + half + 4).lineTo(M + W, M + half + 4).dash(3, { space: 3 }).lineWidth(0.4).strokeColor(BRAND.muted).stroke().undash();
      slot = 1;
    } else slot = 2;
  });
  if (!reqs.length) doc.font("Helvetica").fontSize(10).text("Nenhuma requisição para imprimir.");
  doc.end();
  return done;
}
