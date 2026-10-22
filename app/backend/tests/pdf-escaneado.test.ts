/**
 * PDF escaneado: a foto de cada página sai do PDF para a IA de imagem ler.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { pdfPageImages, pngFromRows } from "../src/lib/pdf-images";

/** PNG cinza w×h (degradê), para montar PDFs de teste sem arquivo. */
function grayPng(w: number, h: number) {
  const rows = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows[y * (w + 1) + 1 + x] = (x + y) % 256;
  return pngFromRows(w, h, 1, rows);
}

test("PNG gerado é válido (o pdf-lib consegue abrir)", async () => {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(grayPng(300, 250));
  assert.equal(img.width, 300);
  assert.equal(img.height, 250);
});

test("tira a foto de cada página; ignora logo pequeno; PDF digital sem foto não dá nada", async () => {
  const doc = await PDFDocument.create();
  const big = await doc.embedPng(grayPng(400, 500));
  const logo = await doc.embedPng(grayPng(60, 60));
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([595, 842]);
    p.drawImage(logo, { x: 10, y: 780, width: 50, height: 50 });
    p.drawImage(big, { x: 0, y: 0, width: 595, height: 760 });
  }
  const imgs = await pdfPageImages(await doc.save());
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs.map((i) => [i.page, i.mime, i.width, i.height]), [[1, "image/png", 400, 500], [2, "image/png", 400, 500]]);
  // a imagem tirada abre de novo como PNG
  const again = await (await PDFDocument.create()).embedPng(imgs[0].bytes);
  assert.equal(again.width, 400);

  const digital = await PDFDocument.create();
  digital.addPage().drawText("Fatura digital");
  assert.equal((await pdfPageImages(await digital.save())).length, 0);
});

test("PDF vira JPG página a página (qualquer PDF, até sem foto dentro)", async () => {
  const { pdfToJpgs } = await import("../src/lib/pdf-render");
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText("Fatura digital", { x: 50, y: 700, size: 24 });
  doc.addPage([842, 595]);
  const pages = await pdfToJpgs(await doc.save(), { maxSide: 1000 });
  assert.deepEqual(pages.map((p) => [p.page, p.mime, Math.max(p.width, p.height)]), [[1, "image/jpeg", 1000], [2, "image/jpeg", 1000]]);
  assert.equal(pages[0].bytes.subarray(0, 2).toString("hex"), "ffd8"); // cabeçalho de JPG
  assert.ok(pages[1].width > pages[1].height); // página deitada continua deitada
});
