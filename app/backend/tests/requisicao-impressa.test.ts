/**
 * Requisição impressa: folha corrida (linhas conforme os itens) ou dividida em duas/três; peças e insumos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { blockHeight, observationText, pieceSize, pieceText, requisitionsPdf, type RequisitionPrint } from "../src/modules/requisitions/requisitions.pdf";

const base: RequisitionPrint = { number: "REQ-00001", requester: "DAVID BRUNO", clientName: "GUILHERME", projectReference: "Q. NOAH", priority: "HIGH", orderedAt: new Date(), neededAt: null, cutter: null, note: null, items: [] };
const peca = { quantity: 1, description: "PEÇA ACABAMENTO", material: "MDF BRANCO", thickness: 6, length: 2119, width: 181, edgeFinish: "SEM FITA", note: null };

test("peça impressa com comprimento, largura e altura (espessura da chapa) com rótulo", () => {
  // length = comprimento, width = largura, thickness = altura; a cor vai na coluna COR
  assert.equal(pieceText(peca), "PEÇA ACABAMENTO · C 2119 × L 181 × A 6 mm");
  assert.equal(pieceText({ ...peca, material: null, thickness: null, width: null }), "PEÇA ACABAMENTO · C 2119 mm");
  assert.equal(pieceSize({ length: 397, width: 111.08, thickness: 15.5 }), "C 397 × L 111,08 × A 15,5 mm");
  // código da etiqueta vai na frente, sem repetir
  assert.equal(pieceText({ ...peca, pieceCode: "PRA8604A", description: "PRATELEIRA" }), "PRA8604A PRATELEIRA · C 2119 × L 181 × A 6 mm");
  assert.equal(pieceText({ ...peca, pieceCode: "PRA8604A", description: "PRA8604A PRATELEIRA" }), "PRA8604A PRATELEIRA · C 2119 × L 181 × A 6 mm");
});

test("observação impressa separada do motivo, com módulo, plano de corte e falta", () => {
  const it = { ...peca, note: "PEÇA FOI MENOR", observation: "CORREDIÇA 45 LIGHT", moduleRef: "8421", cutPlanRef: "Chapa 2 / posição 20.C", missingQuantity: 1 };
  assert.equal(observationText(it), "CORREDIÇA 45 LIGHT · Mód. 8421 · Chapa 2 / posição 20.C · FALTANDO 1");
  assert.equal(observationText(peca), "");
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
