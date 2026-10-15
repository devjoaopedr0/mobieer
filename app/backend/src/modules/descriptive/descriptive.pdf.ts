/**
 * PDF da descritiva, em páginas de apresentação (16:9) como o modelo da loja:
 * capa, moodboard de cada ambiente, imagens 3D com o texto dos móveis e a
 * página de processos.
 */
import PDFDocument from "pdfkit";
import { BRAND } from "../../lib/brand-pdf";
import { FINISH_KINDS, FINISH_KIND_LABEL, type DescriptiveData, type Finish } from "./descriptive.rules";

type Doc = InstanceType<typeof PDFDocument>;
const W = 960;
const H = 540;
const BG = "#DCDCDC";
const INK = "#3A3A3A";
const RED = "#E0261B";

export type DescriptiveImage = { renderId: string; data: Buffer };

/** Fundo cinza e o traço da marca no canto (as duas curvas laranja e o Ø). */
function page(doc: Doc, opts: { first?: boolean; corner?: boolean } = {}) {
  if (!opts.first) doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(BG);
  if (opts.corner !== false) {
    doc.save();
    doc.lineWidth(1.6).strokeColor(BRAND.orange);
    doc.moveTo(W - 150, H).bezierCurveTo(W - 120, H - 70, W - 60, H - 90, W, H - 170).stroke();
    doc.moveTo(W - 135, H).bezierCurveTo(W - 105, H - 60, W - 50, H - 75, W, H - 150).stroke();
    const cx = W - 60;
    const cy = H - 45;
    doc.lineWidth(4).circle(cx, cy, 22).stroke();
    doc.moveTo(cx - 20, cy + 26).lineTo(cx + 20, cy - 26).stroke();
    doc.restore();
  }
  doc.fillColor(INK);
}

/** MØBIEER com o Ø laranja e a frase da marca embaixo. */
function logo(doc: Doc, cx: number, y: number, size: number) {
  doc.font("Helvetica").fontSize(size);
  const parts: [string, string][] = [["M", INK], ["Ø", BRAND.orange], ["BIEER", INK]];
  const opt = { characterSpacing: size * 0.08, lineBreak: false } as const;
  const total = parts.reduce((s, [t]) => s + doc.widthOfString(t, opt), 0);
  let x = cx - total / 2;
  for (const [t, c] of parts) {
    doc.fillColor(c).text(t, x, y, opt);
    x += doc.widthOfString(t, opt);
  }
  doc.fontSize(size * 0.22);
  const tag = "PLANEJADOS   |   CASA COM A SUA CASA";
  const tw = doc.widthOfString(tag, { characterSpacing: 2 });
  doc.fillColor(INK).text(tag, cx - tw / 2, y + size * 1.05, { characterSpacing: 2, lineBreak: false });
}

function roomTitle(doc: Doc, room: string) {
  doc.font("Helvetica").fontSize(26).fillColor("#5A5A5A").text(`AMBIENTE: ${room.toUpperCase()}`, 22, H - 58, { lineBreak: false, width: W - 200 });
}

/** Quadradinho do acabamento: a cor, ou um neutro com traço quando não tem cor. */
function swatch(doc: Doc, f: Finish, x: number, y: number, s: number) {
  doc.save();
  doc.rect(x + 3, y + 3, s, s).fill("#BEBEBE");
  if (f.color) doc.rect(x, y, s, s).fill(f.color);
  else {
    doc.rect(x, y, s, s).fill("#EFEFEF");
    doc.lineWidth(0.8).strokeColor("#9A9A9A").moveTo(x + 8, y + s - 8).lineTo(x + s - 8, y + 8).stroke();
  }
  doc.lineWidth(1.2).strokeColor("#202020").rect(x, y, s, s).stroke();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text(f.name, x - 20, y - 26, { width: s + 40, align: "center", height: 24 });
}

function moodboard(doc: Doc, room: string, finishes: Finish[], note: string) {
  page(doc);
  if (note) doc.font("Helvetica").fontSize(10).fillColor(RED).text(note, W - 470, 12, { width: 450, align: "right" });
  doc.font("Helvetica").fontSize(34).fillColor("#5A5A5A").text("MOODBOARD", 0, 40, { width: W, align: "center" });
  const groups = FINISH_KINDS.map((k) => ({ k, list: finishes.filter((f) => f.kind === k) })).filter((g) => g.list.length);
  const colW = (W - 80) / Math.max(1, groups.length);
  groups.forEach((g, gi) => {
    const x0 = 40 + gi * colW;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(FINISH_KIND_LABEL[g.k].toUpperCase(), x0, 118, { width: colW, align: "center" });
    // cabe tudo entre o título e o nome do ambiente: menos espaço, quadrado menor
    const list = g.list.slice(0, 12);
    let s = 76;
    let perRow = Math.max(1, Math.floor((colW - 10) / (s + 34)));
    while (s > 34 && Math.ceil(list.length / perRow) * (s + 50) > H - 90 - 175) {
      s -= 6;
      perRow = Math.max(1, Math.floor((colW - 10) / (s + 34)));
    }
    list.forEach((f, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowW = Math.min(perRow, list.length - row * perRow) * (s + 34);
      const x = x0 + (colW - rowW) / 2 + col * (s + 34) + 17;
      const y = 175 + row * (s + 50);
      swatch(doc, f, x, y, s);
    });
  });
  if (!groups.length) doc.font("Helvetica").fontSize(12).fillColor("#6A6A6A").text("Acabamentos a definir.", 0, 240, { width: W, align: "center" });
  roomTitle(doc, room);
}

/** Caixa branca com borda escura e o texto dos móveis, como as legendas do modelo. */
function textBox(doc: Doc, text: string, x: number, y: number, w: number, maxH: number) {
  doc.font("Helvetica").fontSize(10);
  const h = Math.min(maxH, doc.heightOfString(text, { width: w - 20, lineGap: 2 }) + 20);
  doc.rect(x, y, w, h).fillAndStroke("#FFFFFF", "#202020");
  doc.fillColor("#111111").text(text, x + 10, y + 10, { width: w - 20, height: h - 16, lineGap: 2, ellipsis: true });
  return h;
}

function framedImage(doc: Doc, data: Buffer, x: number, y: number, w: number, h: number): boolean {
  try {
    doc.rect(x - 3, y - 3, w + 6, h + 6).fill("#111111");
    doc.image(data, x, y, { fit: [w, h], align: "center", valign: "center" });
    return true;
  } catch {
    doc.rect(x, y, w, h).fill("#EFEFEF");
    doc.font("Helvetica").fontSize(10).fillColor("#777777").text("imagem indisponível", x, y + h / 2 - 6, { width: w, align: "center" });
    return false;
  }
}

/** Páginas das imagens: texto à esquerda e a imagem grande; com duas, as duas lado a lado. */
function imagePages(doc: Doc, room: string, text: string, images: Buffer[]) {
  const lines = text.trim();
  if (!images.length) {
    if (!lines) return;
    page(doc);
    textBox(doc, lines, 120, 70, W - 240, H - 170);
    roomTitle(doc, room);
    return;
  }
  for (let i = 0; i < images.length; i += 2) {
    page(doc);
    const pair = images.slice(i, i + 2);
    if (i === 0 && lines) {
      textBox(doc, lines, 24, 30, 300, H - 110);
      if (pair.length === 1) framedImage(doc, pair[0], 350, 30, W - 380, H - 110);
      else {
        framedImage(doc, pair[0], 350, 30, W - 380, (H - 130) / 2);
        framedImage(doc, pair[1], 350, 30 + (H - 130) / 2 + 20, W - 380, (H - 130) / 2);
      }
    } else if (pair.length === 1) framedImage(doc, pair[0], 60, 30, W - 120, H - 110);
    else {
      framedImage(doc, pair[0], 30, 60, (W - 90) / 2, H - 170);
      framedImage(doc, pair[1], 60 + (W - 90) / 2, 60, (W - 90) / 2, H - 170);
    }
    roomTitle(doc, room);
  }
}

/** Página de processos: os passos numerados em zigue-zague, com o prazo de cada um. */
function processesPage(doc: Doc, steps: { title: string; detail: string }[]) {
  page(doc, { corner: false });
  doc.font("Helvetica").fontSize(32).fillColor("#4A4A4A").text("PROCESSOS", 0, 34, { width: W, align: "center" });
  const n = steps.length;
  const left = 90;
  const step = (W - 2 * left) / Math.max(1, n - 1);
  steps.forEach((s, i) => {
    const cx = left + i * step;
    const up = i % 2 === 0;
    const cy = up ? 250 : 320;
    if (i < n - 1) {
      doc.save().lineWidth(1.5).dash(3, { space: 4 }).strokeColor("#555555");
      const nx = left + (i + 1) * step;
      const ny = up ? 320 : 250;
      doc.moveTo(cx + 34, cy).bezierCurveTo(cx + step / 2, up ? cy - 60 : cy + 60, nx - step / 2, up ? ny + 60 : ny - 60, nx - 34, ny).stroke();
      doc.undash().restore();
    }
    doc.circle(cx, cy, 34).fill("#A9A9A9");
    doc.font("Helvetica-Bold").fontSize(26).fillColor("#E8E8E8").text(String(i + 1), cx - 34, cy - 13, { width: 68, align: "center" });
    const tw = Math.min(150, step + 30);
    const ty = up ? 105 : 375;
    // o texto não passa da borda da página
    const tx = Math.min(Math.max(cx - tw / 2, 12), W - 12 - tw);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(s.title.toUpperCase(), tx, ty, { width: tw, align: "center" });
    if (s.detail) doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text(s.detail.toUpperCase(), tx, doc.y + 6, { width: tw, align: "center" });
  });
}

export function descriptivePdf(d: DescriptiveData, ctx: { client: string; imagesFor: (renderId: string) => Buffer | undefined }): Promise<Buffer> {
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true, info: { Title: `Descritiva — ${ctx.client}` } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // capa
  page(doc, { first: true });
  logo(doc, W / 2, 120, 92);
  doc.font("Helvetica").fontSize(40).fillColor("#111111").text("DESCRITIVA", 0, 300, { width: W, align: "center" });
  doc.font("Helvetica").fontSize(20).fillColor("#111111").text(`CLIENTE: ${ctx.client.toUpperCase()}`, 22, H - 92, { lineBreak: false });
  if (d.designer.trim()) doc.font("Helvetica").fontSize(16).fillColor("#5A5A5A").text(`PROJETISTA: ${d.designer.trim().toUpperCase()}`, 22, H - 56, { lineBreak: false });

  for (const r of d.rooms.filter((x) => x.include)) {
    moodboard(doc, r.room, r.finishes, d.note.trim());
    const images = r.renderIds.map((id) => ctx.imagesFor(id)).filter((b): b is Buffer => Boolean(b));
    imagePages(doc, r.room, r.text, images);
  }

  if (d.processes.length) processesPage(doc, d.processes);
  doc.end();
  return done;
}
