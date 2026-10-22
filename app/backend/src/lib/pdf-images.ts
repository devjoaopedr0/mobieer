/**
 * Imagens de um PDF para a IA ler. Reserva: fotos de dentro de um PDF escaneado: cada página de um PDF escaneado é uma
 * imagem (a folha fotografada). Aqui tiramos a maior imagem de cada página para
 * a IA de imagem ler, sem renderizar o PDF (nada de canvas: roda na Vercel).
 *
 * - JPEG (DCTDecode, o caso de quase todo scanner e app de celular): os bytes
 *   do PDF já são o arquivo .jpg;
 * - Flate (pixels compactados) em RGB ou cinza, 8 bits: vira PNG.
 * Outros formatos (JBIG2, CCITT de scanner preto e branco) ficam de fora.
 */
import zlib from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFObject } from "pdf-lib";

export type PdfImage = { page: number; mime: "image/jpeg" | "image/png"; bytes: Buffer; width: number; height: number };

const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

function filters(dict: PDFDict): string[] {
  const f = dict.get(PDFName.of("Filter"));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : ""));
  return [];
}

// ---- PNG mínimo (zlib + CRC32) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG a partir das linhas já com o byte de filtro do PNG na frente de cada uma. */
export function pngFromRows(width: number, height: number, colors: 1 | 3, filteredRows: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = colors === 3 ? 2 : 0; // RGB ou cinza
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(filteredRows)), chunk("IEND", Buffer.alloc(0))]);
}

function flateToPng(stream: PDFRawStream, width: number, height: number): Buffer | null {
  const d = stream.dict;
  if (num(d.get(PDFName.of("BitsPerComponent"))) !== 8) return null;
  const cs = d.get(PDFName.of("ColorSpace"));
  const csName = cs instanceof PDFName ? cs.decodeText() : "";
  const colors = csName === "DeviceRGB" ? 3 : csName === "DeviceGray" ? 1 : 0;
  if (!colors) return null;
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.from(stream.contents));
  } catch {
    return null;
  }
  const rowLen = width * colors;
  const parms = d.get(PDFName.of("DecodeParms"));
  const predictor = parms instanceof PDFDict ? num(parms.get(PDFName.of("Predictor"))) ?? 1 : 1;
  // preditor PNG (10–15): as linhas já trazem o byte de filtro, igual ao PNG
  if (predictor >= 10) return raw.length >= (rowLen + 1) * height ? pngFromRows(width, height, colors, raw.subarray(0, (rowLen + 1) * height)) : null;
  if (predictor !== 1 || raw.length < rowLen * height) return null;
  const rows = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) raw.copy(rows, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  return pngFromRows(width, height, colors, rows);
}

function imagesIn(doc: PDFDocument, resources: PDFDict | undefined, depth = 0): PDFRawStream[] {
  if (!resources || depth > 2) return [];
  const xobjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return [];
  const out: PDFRawStream[] = [];
  for (const [, ref] of xobjects.entries()) {
    const obj = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.get(PDFName.of("Subtype"));
    if (subtype === PDFName.of("Image")) out.push(obj);
    // imagem dentro de um "formulário" (alguns apps de scanner fazem assim)
    else if (subtype === PDFName.of("Form")) out.push(...imagesIn(doc, obj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), depth + 1));
  }
  return out;
}

/** A maior imagem de cada página (até `maxPages`), pronta para a IA de imagem. */
export async function pdfPageImages(bytes: Buffer | Uint8Array, maxPages = 6): Promise<PdfImage[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out: PdfImage[] = [];
  doc.getPages().slice(0, maxPages).forEach((page, i) => {
    const imgs = imagesIn(doc, page.node.Resources())
      .map((s) => ({ s, w: num(s.dict.get(PDFName.of("Width"))) ?? 0, h: num(s.dict.get(PDFName.of("Height"))) ?? 0 }))
      .filter((x) => x.w >= 200 && x.h >= 200) // logos e ícones não interessam
      .sort((a, b) => b.w * b.h - a.w * a.h);
    for (const { s, w, h } of imgs) {
      const f = filters(s.dict);
      if (f.length === 1 && f[0] === "DCTDecode") {
        out.push({ page: i + 1, mime: "image/jpeg", bytes: Buffer.from(s.contents), width: w, height: h });
        break;
      }
      if (f.length === 1 && f[0] === "FlateDecode") {
        const png = flateToPng(s, w, h);
        if (png) {
          out.push({ page: i + 1, mime: "image/png", bytes: png, width: w, height: h });
          break;
        }
      }
    }
  });
  return out;
}

/**
 * Páginas do PDF como imagem para a IA ler: desenha a página inteira em JPG
 * (pdf-render, serve para qualquer PDF); se o conversor não carregar no
 * servidor, cai para a foto tirada de dentro do PDF (acima).
 */
export async function pdfImagesForAi(bytes: Buffer | Uint8Array, maxPages = 6): Promise<{ page: number; mime: "image/jpeg" | "image/png"; bytes: Buffer }[]> {
  try {
    // carregado só aqui: um problema no canvas não derruba as rotas que importam este arquivo
    const { pdfToJpgs } = await import("./pdf-render");
    const pages = await pdfToJpgs(bytes, { maxPages });
    if (pages.length) return pages;
  } catch {
    // segue para a reserva
  }
  return pdfPageImages(bytes, maxPages);
}
