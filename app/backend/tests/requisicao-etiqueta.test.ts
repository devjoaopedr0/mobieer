/**
 * Requisição de peça: leitura da etiqueta (sugestão), tipos de item, falta e recebimento.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cutPlanText, isEmptySuggestion, parseLabelDimensions, parseLabelReading, parseMm } from "../src/modules/requisitions/requisitions.label";
import { createRequisitionSchema, itemMissingSchema, requisitionItemSchema, SUPPLY_TYPE_LABEL, SUPPLY_TYPES } from "../src/modules/requisitions/requisitions.schema";
import { assertItemFollowUp, assertNoMissing, isItemDone, ITEM_TRANSITIONS, readyForInspection } from "../src/modules/requisitions/requisitions.service";

test("dimensões da etiqueta: largura x comprimento x altura (espessura)", () => {
  assert.deepEqual(parseLabelDimensions("111,08 x 397 x 15,5"), { width: 111.08, length: 397, thickness: 15.5 });
  assert.deepEqual(parseLabelDimensions("600 × 2.119,5 × 18 mm"), { width: 600, length: 2119.5, thickness: 18 });
  assert.deepEqual(parseLabelDimensions("397"), { width: null, length: null, thickness: null });
  assert.equal(parseMm("15,5mm"), 15.5);
  assert.equal(parseMm("abc"), null);
});

test("leitura da etiqueta vira sugestão com o mapa etiqueta -> campo", () => {
  const ia = `Aqui está: {"cliente":"MARIA SOUZA","projeto":"COZINHA","peca_codigo":"PRA8604A","peca_nome":"PRATELEIRA",
    "dimensoes":"111,08 x 397 x 15,5","material":"Branco 15mm","fita":"Fitar 1: 1-Branco","codigo_item":"PRA8604A",
    "modulo":"8421","chapa":"Chapa 2","posicao":"20.C"}`;
  assert.deepEqual(parseLabelReading(ia), {
    clientName: "MARIA SOUZA",
    room: "COZINHA",
    description: "PRATELEIRA",
    pieceCode: "PRA8604A",
    width: 111.08,
    length: 397,
    thickness: 15.5,
    material: "Branco 15mm",
    edgeFinish: "Fitar 1: 1-Branco",
    moduleRef: "8421",
    cutPlanRef: "Chapa 2 / posição 20.C",
  });
});

test("leitura sem nada aproveitável não vira sugestão", () => {
  assert.ok(isEmptySuggestion(parseLabelReading("não consegui ler")));
  assert.ok(isEmptySuggestion(parseLabelReading('{"cliente":null,"projeto":"null"}')));
  assert.equal(cutPlanText(null, "20.C"), "posição 20.C");
  assert.equal(cutPlanText("Chapa 2", null), "Chapa 2");
});

test("tipos de item: os novos entram e os antigos continuam", () => {
  for (const t of ["INSUMO", "FERRAGEM", "OUTRO", "FERRAMENTA", "PERFIL", "PUXADOR", "ACESSORIOS"]) assert.ok((SUPPLY_TYPES as readonly string[]).includes(t));
  assert.equal(SUPPLY_TYPE_LABEL.ACESSORIOS, "Acessórios");
  assert.equal(requisitionItemSchema.parse({ description: "PUXADOR CAVA", quantity: 2, supplyType: "PUXADOR" }).supplyType, "PUXADOR");
});

test("observação separada do motivo e descrição maior", () => {
  const longa = "CORREDIÇA 45 LIGHT ".repeat(20).trim();
  const item = requisitionItemSchema.parse({ description: longa, quantity: 1, note: "faltou", observation: "FLANGE PRAT = flange para prateleira", pieceCode: "PRA8604A", moduleRef: "8421", cutPlanRef: "Chapa 2 / posição 20.C" });
  assert.equal(item.note, "faltou");
  assert.equal(item.observation, "FLANGE PRAT = flange para prateleira");
  assert.ok(item.description.length > 200);
  // obra: projeto cadastrado é opcional; o texto livre continua
  const req = createRequisitionSchema.parse({ clientName: "MARIA", projectReference: "Q. NOAH", items: [{ description: "LATERAL", quantity: 1 }] });
  assert.equal(req.projectId, undefined);
});

test("faltando: entra pelo registro de falta e sai quando a peça chega", () => {
  assert.equal(itemMissingSchema.safeParse({ missingQuantity: 0 }).success, false);
  assert.ok(ITEM_TRANSITIONS.MISSING.includes("CUT"));
  // nenhum andamento comum leva a faltando
  for (const s of ["PENDING", "CUTTING", "CUT", "INSPECTED"] as const) assert.ok(!ITEM_TRANSITIONS[s].includes("MISSING"));
  assert.equal(isItemDone("MISSING"), false);
  assert.equal(isItemDone("CUT"), true);
  // mover de ambiente, falta e recebimento: depois do rascunho e antes de cancelar
  assert.throws(() => assertItemFollowUp("DRAFT"));
  assert.throws(() => assertItemFollowUp("CANCELLED"));
  assert.doesNotThrow(() => assertItemFollowUp("IN_CUTTING"));
  assert.doesNotThrow(() => assertItemFollowUp("COMPLETED"));
});

test("peça faltando não segura a conferência das outras, só a conclusão", () => {
  const it = (status: "PENDING" | "CUT" | "INSPECTED" | "MISSING" | "CANCELLED", description = "PEÇA") => ({ status, description });
  // as outras cortadas, uma faltando: pode ir para a conferência
  assert.equal(readyForInspection([it("CUT"), it("MISSING"), it("INSPECTED")]), true);
  assert.equal(readyForInspection([it("CUT"), it("PENDING")]), false);
  // concluir trava enquanto houver falta
  assert.throws(() => assertNoMissing([it("CUT"), it("MISSING", "LATERAL")]), /LATERAL/);
  // recebida (volta a cortada) ou cancelada: libera
  assert.doesNotThrow(() => assertNoMissing([it("CUT"), it("CANCELLED")]));
  assert.deepEqual(ITEM_TRANSITIONS.CANCELLED, []);
});
