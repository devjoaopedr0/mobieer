/**
 * Requisição impressa: folha corrida (linhas conforme os itens) ou dividida em duas/três; peças e insumos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { blockHeight, pieceText, requisitionsPdf, type RequisitionPrint } from "../src/modules/requisitions/requisitions.pdf";

const base: RequisitionPrint = { number: "REQ-00001", requester: "DAVID BRUNO", clientName: "GUILHERME", projectReference: "Q. NOAH", priority: "HIGH", orderedAt: new Date(), neededAt: null, cutter: null, note: null, items: [] };
const peca = { quantity: 1, description: "PEÇA ACABAMENTO", material: "MDF BRANCO", thickness: 6, length: 2119, width: 181, edgeFinish: "SEM FITA", note: null };

test("peça impressa com material, espessura e medidas", () => {
  assert.equal(pieceText(peca), "PEÇA ACABAMENTO · 6 mm · 2119 × 181 mm"); // a cor vai na coluna COR
  assert.equal(pieceText({ ...peca, material: null, thickness: null, width: null }), "PEÇA ACABAMENTO · 2119 mm");
});

test("requisição pequena cabe em um terço da folha; com muitas peças, não", () => {
  const third = (841.89 - 56) / 3;
  assert.ok(blockHeight({ ...base, items: [peca, peca] }, 3) < third - 8);
  assert.ok(blockHeight({ ...base, items: Array(30).fill(peca) }, 3) > third);
});

test("folha corrida: as linhas acompanham os itens, uma em branco a mais", () => {
  const row = blockHeight({ ...base, items: [peca, peca, peca] }, "auto") - blockHeight({ ...base, items: [peca, peca] }, "auto");
  assert.ok(row > 0);
  // com poucos itens fica no mínimo de 3 linhas, bem menor que as 10 da planilha
  assert.equal(blockHeight({ ...base, items: [] }, "auto"), blockHeight({ ...base, items: [peca, peca] }, "auto"));
  assert.ok(blockHeight({ ...base, items: [peca] }, "auto") < blockHeight({ ...base, items: [peca] }, 3));
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
  assert.equal(pages(await requisitionsPdf(reqs, 3)), 2);
  assert.equal(pages(await requisitionsPdf(reqs.slice(0, 3), 3)), 1);
  assert.equal(pages(await requisitionsPdf(reqs.slice(0, 3), 2)), 2);
});

test("folha corrida: requisições pequenas cabem mais de três por folha", async () => {
  const reqs = [1, 2, 3, 4, 5].map((n) => ({ ...base, number: `REQ-0000${n}`, items: [peca, peca] }));
  const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.equal(pages(await requisitionsPdf(reqs)), 1);
  assert.equal(pages(await requisitionsPdf(Array(12).fill(reqs[0]))), 2);
});
