/**
 * PDF → JPG: desenha cada página como imagem (igual ao que aparece na tela),
 * para a IA de imagem ler PDF escaneado de qualquer tipo, até de scanner preto
 * e branco (JBIG2/CCITT). pdf.js 3 (versão que o Node carrega com require) +
 * @napi-rs/canvas (binário pronto, não precisa de nada instalado no servidor).
 */
import fs from "node:fs";
import path from "node:path";
import { DOMMatrix, ImageData, Path2D, createCanvas, type Canvas } from "@napi-rs/canvas";

// o pdf.js desenha com as peças do navegador; no Node elas vêm do canvas
const g = globalThis as Record<string, unknown>;
g.DOMMatrix ??= DOMMatrix;
g.Path2D ??= Path2D;
g.ImageData ??= ImageData;

// pdf.js no Node roda o "worker" no mesmo processo; carregar aqui deixa o
// arquivo do worker no pacote da Vercel e evita ele procurar sozinho
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= require("pdfjs-dist/legacy/build/pdf.worker.js");

/** Fontes padrão (Helvetica, Times…) para PDF que não as embute: assets/pdf-fonts, copiadas do pdf.js. */
function standardFonts(): string | undefined {
  const dir = [path.join(process.cwd(), "assets", "pdf-fonts"), path.join(__dirname, "..", "..", "assets", "pdf-fonts"), path.join(__dirname, "..", "..", "..", "assets", "pdf-fonts")].find((d) => fs.existsSync(path.join(d, "LiberationSans-Regular.ttf")));
  return dir ? dir + path.sep : undefined;
}

export type RenderedPage = { page: number; mime: "image/jpeg"; bytes: Buffer; width: number; height: number };

type Pair = { canvas: Canvas; context: ReturnType<Canvas["getContext"]> };
const canvasFactory = {
  create: (w: number, h: number): Pair => {
    const canvas = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    return { canvas, context: canvas.getContext("2d") };
  },
  reset: (pair: Pair, w: number, h: number) => {
    pair.canvas.width = Math.max(1, Math.ceil(w));
    pair.canvas.height = Math.max(1, Math.ceil(h));
  },
  destroy: (pair: Pair) => {
    pair.canvas.width = 0;
    pair.canvas.height = 0;
  },
};

/**
 * Páginas do PDF em JPG. O lado maior fica com até `maxSide` px: legível para
 * a IA sem passar do tamanho que os provedores aceitam.
 */
export async function pdfToJpgs(bytes: Buffer | Uint8Array, opts: { maxPages?: number; maxSide?: number; quality?: number } = {}): Promise<RenderedPage[]> {
  const maxPages = opts.maxPages ?? 6;
  const maxSide = opts.maxSide ?? 1800;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: standardFonts(), disableFontFace: true, isEvalSupported: false, verbosity: Number(process.env.PDFJS_VERBOSITY ?? 0), canvasFactory }).promise;
  const out: RenderedPage[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);
      // fundo branco: o JPG não tem transparência e o texto sumiria no preto
      const ctx = context as unknown as { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void };
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvasFactory }).promise;
      out.push({ page: n, mime: "image/jpeg", bytes: await canvas.encode("jpeg", opts.quality ?? 82), width: canvas.width, height: canvas.height });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
