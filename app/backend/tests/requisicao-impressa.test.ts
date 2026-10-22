/**
 * Requisição impressa: três por folha, peças e insumos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { blockHeight, pieceText, requisitionsPdf, type RequisitionPrint } from "../src/modules/requisitions/requisitions.pdf";

const base: RequisitionPrint = { number: "REQ-00001", requester: "DAVID BRUNO", clientName: "GUILHERME", projectReference: "Q. NOAH", priority: "HIGH", orderedAt: new Date(), neededAt: null, cutter: null, note: null, items: [] };
const peca = { quantity: 1, description: "PEÇA ACABAMENTO", material: "MDF BRANCO", thickness: 6, length: 2119, width: 181, edgeFinish: "SEM FITA", note: null };

test("peça impressa com material, espessura e medidas", () => {
  assert.equal(pieceText(peca), "PEÇA ACABAMENTO · MDF BRANCO · 6 mm · 2119 × 181 mm");
  assert.equal(pieceText({ ...peca, material: null, thickness: null, width: null }), "PEÇA ACABAMENTO · 2119 mm");
});

test("requisição pequena cabe em um terço da folha; com muitas peças, não", () => {
  const third = (841.89 - 56) / 3;
  assert.ok(blockHeight({ ...base, items: [peca, peca] }) < third - 8);
  assert.ok(blockHeight({ ...base, items: Array(30).fill(peca) }) > third);
});

test("duas requisições pequenas saem na mesma folha; insumos têm título próprio", async () => {
  const pdf = await requisitionsPdf([
    { ...base, items: [peca] },
    { ...base, number: "REQ-00002", kind: "INSUMOS", items: [{ ...peca, description: "COLA PVA", unit: "LITER", material: null, thickness: null, length: null, width: null, edgeFinish: null }] },
  ]);
  const txt = pdf.toString("latin1");
  assert.equal((txt.match(/\/Type \/Page\b/g) ?? []).length, 1);
});

test("três requisições pequenas na mesma folha; a quarta vai para a próxima; duas por folha se pedir", async () => {
  const reqs = [1, 2, 3, 4].map((n) => ({ ...base, number: `REQ-0000${n}`, items: [peca, peca] }));
  const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.equal(pages(await requisitionsPdf(reqs)), 2);
  assert.equal(pages(await requisitionsPdf(reqs.slice(0, 3))), 1);
  assert.equal(pages(await requisitionsPdf(reqs.slice(0, 3), 2)), 2);
});
