/**
 * Vista frontal cotada, desenhada a partir das medidas (tech-drawing.rules), no
 * modelo "PROJETO TÉCNICO SUÍTE MASTER" da loja:
 *  - a vista fechada (como o móvel é visto, com as portas) com a chamada e as cotas;
 *  - quando há algo atrás de portas, a vista interna (aberta) ao lado, como na "VISTA C";
 *  - as imagens 3D ao lado da vista ("VISTA A") ou numa folha própria ("PERSPECTIVA B").
 * Sai sem carimbo: a pasta técnica encaixa cada página na prancha e põe o carimbo,
 * o título e a escala. A 2ª página, quando existe, é a perspectiva.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { SHELF_LIKE, hasInside, imagesOnOwnSheet, layoutDrawing, mm, wrapWords, type DrawingLayout, type DrawingSpec, type LaidColumn } from "./tech-drawing.rules";

export type BoardImage = { bytes: Buffer; mime: string };
/** imagens 3D (render) do móvel fechado e aberto */
export type BoardImages = { closed?: BoardImage | null; open?: BoardImage | null };

const PW = 802;
const PH = 453;
const INK = rgb(0.15, 0.15, 0.15);
const DIM = rgb(0.35, 0.35, 0.35);
const RED = rgb(0.85, 0.1, 0.25);
const BODY = rgb(0.8, 0.8, 0.8);
const BAND = rgb(0.7, 0.7, 0.7);
const DOOR = rgb(0.38, 0.38, 0.39);
const EMPTY = rgb(0.93, 0.93, 0.93);
const EDGE = rgb(0.4, 0.4, 0.4);

function safe(font: PDFFont, text: string) {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

type ViewOptions = {
  /** faixa horizontal da folha onde a vista cabe */
  x: number;
  w: number;
  /** FECHADA: com as portas; ABERTA: sem elas, mostrando o interior */
  mode: "FECHADA" | "ABERTA";
  /** chamada principal (descrição + L x A x P) em cima */
  callout: boolean;
  /** altura total à esquerda da cadeia de cotas */
  total: boolean;
  /** chamadas próprias das colunas, à direita */
  notes: { col: LaidColumn; lines: string[] }[];
  /** legenda pequena embaixo ("VISTA INTERNA") */
  caption?: string;
  /** escala imposta (pt por mm): as duas vistas da mesma folha saem do mesmo tamanho */
  k?: number;
};

const viewBox = (L: DrawingLayout, o: ViewOptions) => ({ l: o.total ? 96 : 62, r: o.notes.length ? Math.min(150, o.w * 0.3) : 26, t: 22 + (o.callout ? L.callout.length * 10 + 16 : 6), b: 44 });
/** A maior escala em que a vista cabe na faixa dela. */
function fitScale(L: DrawingLayout, o: ViewOptions) {
  const box = viewBox(L, o);
  return Math.min((o.w - box.l - box.r) / L.width, (PH - box.t - box.b) / L.height);
}

/** Cadeia de cotas verticais de uma coluna: vãos e a espessura das chapas entre eles. */
function chainOf(L: DrawingLayout, col: LaidColumn | undefined) {
  const inside: { y0: number; y1: number; value: number }[] = [];
  col?.bands.forEach((b, j) => {
    if (j > 0 && b.y0 - col.bands[j - 1].y1 > 0.01) inside.push({ y0: col.bands[j - 1].y1, y1: b.y0, value: L.thickness });
    inside.push({ y0: b.y0, y1: b.y1, value: b.value });
  });
  const inner = L.height - L.top - L.base;
  return [
    ...(L.base > 0 ? [{ y0: 0, y1: L.base, value: L.base }] : []),
    ...(inside.length ? inside : [{ y0: L.base, y1: L.base + inner, value: inner }]),
    ...(L.top > 0 ? [{ y0: L.height - L.top, y1: L.height, value: L.top }] : []),
  ];
}

function drawView(p: PDFPage, font: PDFFont, L: DrawingLayout, o: ViewOptions) {
  const open = o.mode === "ABERTA";
  const box = viewBox(L, o);
  const k = o.k ?? fitScale(L, o);
  const x0 = o.x + box.l + (o.w - box.l - box.r - L.width * k) / 2;
  // sobrando altura, o desenho fica no meio da folha
  const y0 = box.b + Math.max(0, (PH - box.t - box.b - L.height * k) / 2);
  const X = (v: number) => x0 + v * k;
  const Y = (v: number) => y0 + v * k;
  const line = (xa: number, ya: number, xb: number, yb: number, thickness = 0.5, color = INK) => p.drawLine({ start: { x: xa, y: ya }, end: { x: xb, y: yb }, thickness, color });
  const text = (s: string, x: number, y: number, size: number, color = INK) => p.drawText(safe(font, s), { x, y, size, font, color });
  const center = (s: string, cx: number, y: number, size: number, color = INK) => text(s, cx - font.widthOfTextAtSize(safe(font, s), size) / 2, y, size, color);
  /** texto em pé (lido de baixo para cima), centrado em cy */
  const upright = (s: string, x: number, cy: number, size: number, color = DIM) =>
    p.drawText(safe(font, s), { x, y: cy - font.widthOfTextAtSize(safe(font, s), size) / 2, size, font, color, rotate: degrees(90) });

  // corpo, topo e rodapé
  p.drawRectangle({ x: X(0), y: Y(0), width: L.width * k, height: L.height * k, color: BODY });
  if (L.top > 0) p.drawRectangle({ x: X(0), y: Y(L.height - L.top), width: L.width * k, height: L.top * k, color: BAND });
  if (L.base > 0) p.drawRectangle({ x: X(0), y: Y(0), width: L.width * k, height: L.base * k, color: BAND });

  // fechamentos (vistas) laterais: a tira de acabamento de cada lado, na altura toda
  for (const [x, w] of [[0, L.sideLeft], [L.width - L.sideRight, L.sideRight]] as const) {
    if (w > 0) p.drawRectangle({ x: X(x), y: Y(0), width: w * k, height: L.height * k, color: BAND, borderColor: EDGE, borderWidth: 0.4 });
  }

  const innerH = L.height - L.top - L.base;
  // espessura da chapa: prateleiras e laterais saem com as duas linhas, como no Promob
  const t = L.thickness;
  const doors = (cx: number, cw: number, ya: number, yb: number, n: number) => {
    p.drawRectangle({ x: cx, y: Y(ya), width: cw, height: (yb - ya) * k, color: DOOR });
    for (let d = 1; d < n; d++) line(cx + (cw * d) / n, Y(ya), cx + (cw * d) / n, Y(yb), 0.6, rgb(0.75, 0.75, 0.75));
    // puxador: um traço curto junto ao encontro das portas (ou na borda, com uma porta só)
    const hx = n > 1 ? cx + cw / n - 3 : cx + cw - 6;
    line(hx, Y((ya + yb) / 2) - 5, hx, Y((ya + yb) / 2) + 5, 1.4, rgb(0.85, 0.85, 0.85));
  };
  for (const c of L.columns) {
    const cx = X(c.x);
    const cw = c.width * k;
    const shelf = (y: number) => p.drawRectangle({ x: cx + t * k, y: Y(y) - (t * k) / 2, width: cw - 2 * t * k, height: Math.max(t * k, 1.4), color: rgb(0.9, 0.9, 0.9), borderColor: EDGE, borderWidth: 0.4 });
    if (c.cover > 0 && !open) {
      // portas na frente da coluna inteira: o interior só aparece na vista aberta
      doors(cx, cw, L.base, L.height - L.top, c.cover);
    } else {
      for (const part of c.parts) {
        const ph = part.y1 - part.y0;
        const isDoor = part.kind === "PORTAS";
        if (isDoor && !open) doors(cx, cw, part.y0, part.y1, part.doors);
        else if (part.kind === "VAO" || isDoor) p.drawRectangle({ x: cx, y: Y(part.y0), width: cw, height: ph * k, color: EMPTY });
        const openPart = SHELF_LIKE.includes(part.kind) || part.kind === "VAO" || (isDoor && open);
        // laterais, teto e base da caixaria com a espessura da chapa (na coluna de um trecho só)
        if (openPart && c.parts.length === 1 && c.width > 4 * t && ph > 4 * t) p.drawRectangle({ x: cx + t * k, y: Y(part.y0 + t), width: cw - 2 * t * k, height: (ph - 2 * t) * k, borderColor: EDGE, borderWidth: 0.4 });
        // o que fica atrás de porta só aparece na vista aberta
        const visible = !part.hidden || open;
        for (const y of visible ? part.lines : []) {
          if (part.kind === "GAVETAS") line(cx, Y(y), cx + cw, Y(y), 0.6, rgb(0.45, 0.45, 0.45));
          // a chapa da prateleira: duas linhas, afastadas pela espessura
          else shelf(y);
        }
        for (const b of visible ? part.bands : []) {
          const h = (b.y1 - b.y0) * k;
          if (b.label && h >= 10 && cw >= 40) center(b.label, cx + cw / 2, part.kind !== "GAVETAS" && part.bands.length > 1 ? Y(b.y1) - 9 : Y((b.y0 + b.y1) / 2) - 2.5, 6, RED);
        }
      }
      // a chapa que separa um trecho do outro
      for (const y of c.separators) shelf(y);
    }
    if (c.x > L.sideLeft) line(cx, Y(L.base), cx, Y(L.height - L.top), 0.7, EDGE);
  }
  p.drawRectangle({ x: X(0), y: Y(0), width: L.width * k, height: L.height * k, borderColor: INK, borderWidth: 0.8 });

  // cotas verticais: cadeia (rodapé, vãos, topo) e, mais afastada, a altura total.
  // Na vista aberta a cadeia é a do interior — a primeira coluna que estava atrás de portas.
  const chain = open ? chainOf(L, L.columns.find((c) => c.bands.length && (c.cover > 0 || c.hidden)) ?? L.columns.find((c) => c.bands.length)) : L.chain;
  const chainX = X(0) - 20;
  line(chainX, Y(0), chainX, Y(L.height), 0.4, DIM);
  for (const s of chain) {
    for (const y of [s.y0, s.y1]) {
      line(chainX - 3, Y(y), chainX + 3, Y(y), 0.4, DIM);
      line(chainX + 3, Y(y), X(0) - 2, Y(y), 0.2, rgb(0.7, 0.7, 0.7));
    }
    const h = (s.y1 - s.y0) * k;
    const label = mm(s.value);
    // faixa baixa demais para o número em pé: escreve deitado, à esquerda da linha
    if (h >= font.widthOfTextAtSize(label, 6.5) + 2) upright(label, chainX - 3, Y((s.y0 + s.y1) / 2), 6.5);
    else text(label, chainX - 5 - font.widthOfTextAtSize(label, 6), Y((s.y0 + s.y1) / 2) - 2, 6, DIM);
  }
  if (o.total) {
    const totalX = chainX - 30;
    line(totalX, Y(0), totalX, Y(L.height), 0.4, DIM);
    for (const y of [0, L.height]) line(totalX - 3, Y(y), totalX + 3, Y(y), 0.4, DIM);
    upright(mm(L.height), totalX - 3, Y(L.height / 2), 7);
  }

  // cotas horizontais: fechamento esquerdo, colunas, fechamento direito e a largura total
  const wy = Y(0) - 14;
  const parts = [...(L.sideLeft > 0 ? [{ x: 0, width: L.sideLeft }] : []), ...L.columns, ...(L.sideRight > 0 ? [{ x: L.width - L.sideRight, width: L.sideRight }] : [])];
  if (parts.length > 1) {
    line(X(0), wy, X(L.width), wy, 0.4, DIM);
    for (const c of parts) {
      for (const v of [c.x, c.x + c.width]) line(X(v), wy - 3, X(v), wy + 3, 0.4, DIM);
      if (c.width * k >= font.widthOfTextAtSize(mm(c.width), 6.5) + 2) center(mm(c.width), X(c.x + c.width / 2), wy + 3, 6.5, DIM);
    }
  }
  const ty = parts.length > 1 ? wy - 16 : wy;
  line(X(0), ty, X(L.width), ty, 0.4, DIM);
  for (const v of [0, L.width]) line(X(v), ty - 3, X(v), ty + 3, 0.4, DIM);
  center(mm(L.width), X(L.width / 2), ty + 3, 7, DIM);
  if (o.caption) center(o.caption, X(L.width / 2), ty - 12, 6.5, DIM);

  // chamada: texto em cima, com a linha até um ponto dentro do móvel
  if (o.callout) {
    const first = L.columns[0];
    const px = X(first.x + first.width * 0.4);
    const py = Y(L.height - L.top) - Math.min(18, innerH * k * 0.2);
    const cy = Y(L.height) + 14;
    const tx = Math.max(o.x + 6, px - 34);
    L.callout.forEach((l, i) => text(l, tx, cy + (L.callout.length - 1 - i) * 10 + 3, 7.5));
    const under = Math.max(...L.callout.map((l) => font.widthOfTextAtSize(safe(font, l), 7.5)));
    line(tx - 2, cy, tx + under + 2, cy, 0.4);
    line(px, cy, px, py, 0.4);
    p.drawCircle({ x: px, y: py, size: 1.8, color: INK });
  }

  // chamadas das colunas: ponto dentro da coluna, linha até o texto à direita
  let ny = Y(L.height - L.top) - 30;
  for (const n of o.notes) {
    const px2 = X(n.col.x + n.col.width * 0.6);
    const tx = X(L.width) + 22;
    n.lines.forEach((l, i) => text(l, tx, ny - i * 9, 6.5));
    const bottom = ny - (n.lines.length - 1) * 9 - 3;
    const w = Math.max(...n.lines.map((l) => font.widthOfTextAtSize(safe(font, l), 6.5)));
    line(tx - 2, bottom, tx + w + 2, bottom, 0.4);
    line(px2, bottom, tx - 2, bottom, 0.4);
    p.drawCircle({ x: px2, y: bottom, size: 1.8, color: INK });
    ny = bottom - 26;
  }
}

export async function drawingPdf(spec: DrawingSpec, images: BoardImages = {}): Promise<{ pdf: Buffer; warnings: string[]; pages: number }> {
  const L = layoutDrawing(spec);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([PW, PH]);

  const side = [images.closed, images.open].filter((i): i is BoardImage => Boolean(i));
  // com vista interna, ou a pedido, as imagens 3D vão para a folha de perspectiva
  const inside = hasInside(L);
  const ownSheet = side.length > 0 && imagesOnOwnSheet(spec, L);
  const beside = side.length > 0 && !ownSheet;
  const embed = async (img: BoardImage) => {
    try {
      return /png/i.test(img.mime) ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    } catch {
      // imagem que o PDF não consegue ler fica de fora; a vista sai
      return null;
    }
  };
  const noteLines = (max: number) => spec.columns.map((c, i) => ({ col: L.columns[i], lines: wrapWords((c.note ?? "").trim().toUpperCase(), max) })).filter((n) => n.lines.length);

  if (inside) {
    // fechada à esquerda, aberta à direita (como a "VISTA C" do modelo)
    const closed: ViewOptions = { x: 0, w: PW * 0.48, mode: "FECHADA", callout: true, total: true, notes: [] };
    const opened: ViewOptions = { x: PW * 0.48, w: PW * 0.52, mode: "ABERTA", callout: false, total: false, notes: noteLines(20), caption: "VISTA INTERNA" };
    const k = Math.min(fitScale(L, closed), fitScale(L, opened));
    drawView(p, font, L, { ...closed, k });
    drawView(p, font, L, { ...opened, k });
  } else {
    // com imagem 3D ao lado, a vista fica na metade esquerda (como a "VISTA A" do modelo)
    drawView(p, font, L, { x: 0, w: beside ? PW * 0.56 : PW, mode: "FECHADA", callout: true, total: true, notes: noteLines(beside ? 22 : 30) });
  }

  if (beside) {
    const RW = PW * 0.56;
    const slotH = (PH - 16) / side.length;
    for (const [i, img] of side.entries()) {
      const emb = await embed(img);
      if (!emb) continue;
      const area = { x: RW + 8, y: PH - 8 - (i + 1) * slotH + 4, w: PW - RW - 16, h: slotH - 8 };
      const s = Math.min(area.w / emb.width, area.h / emb.height);
      p.drawImage(emb, { x: area.x + (area.w - emb.width * s) / 2, y: area.y + (area.h - emb.height * s) / 2, width: emb.width * s, height: emb.height * s });
    }
  } else if (ownSheet) {
    // folha de perspectiva: a imagem ocupa a folha (duas imagens, lado a lado)
    const persp = doc.addPage([PW, PH]);
    const slotW = (PW - 16) / side.length;
    let drawn = 0;
    for (const [i, img] of side.entries()) {
      const emb = await embed(img);
      if (!emb) continue;
      const area = { x: 8 + i * slotW + 4, y: 8, w: slotW - 8, h: PH - 16 };
      const s = Math.min(area.w / emb.width, area.h / emb.height);
      persp.drawImage(emb, { x: area.x + (area.w - emb.width * s) / 2, y: area.y + (area.h - emb.height * s) / 2, width: emb.width * s, height: emb.height * s });
      drawn++;
    }
    if (!drawn) doc.removePage(1);
  }

  return { pdf: Buffer.from(await doc.save()), warnings: L.warnings, pages: doc.getPageCount() };
}
