/**
 * Roteiro de produção por peça: etapas base, ajuste por tipo de peça, sequência,
 * foto exigida e a ligação com a etapa do pedido.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BASE_ROUTE, canMarkDone, canUndo, currentPieceStep, DEFAULT_PIECE_TYPES, initialStatus, orderStepComplete, resolveStep, suggestPieceType, type ProgressDef, type StepDef } from "../src/modules/production/piece-route.rules";

const step = (position: number, o: Partial<StepDef> = {}): StepDef => ({ id: `s${position}`, position, name: `Etapa ${position}`, instruction: "Atenção, cuidado", requirePhoto: false, active: true, ...o });

test("roteiro base: 9 etapas em sequência, sem Separação e Limpeza; foto da Etiqueta ligada", () => {
  assert.equal(BASE_ROUTE.length, 9);
  assert.deepEqual(BASE_ROUTE.map((s) => s.position), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(BASE_ROUTE.map((s) => s.name), ["Corte", "Etiqueta", "Fitamento", "Refilamento", "Rasgos", "Furos", "Pré-montagem", "Embalar", "Coleta"]);
  assert.ok(BASE_ROUTE.every((s) => s.instruction)); // toda etapa tem instrução
  assert.deepEqual(BASE_ROUTE.filter((s) => s.requirePhoto).map((s) => s.name), ["Etiqueta"]);
  assert.equal(BASE_ROUTE[7].instruction, "Sarrafo não embala todo, só as pontas");
  assert.deepEqual(DEFAULT_PIECE_TYPES, ["Lateral", "Divisória", "Base", "Prateleira", "Porta", "Caixaria"]);
});

test("ajuste por tipo de peça: pular, acrescentar ou trocar a instrução", () => {
  const s = step(6, { instruction: "Lateral, divisória, base" });
  assert.deepEqual(resolveStep(s, null), { applies: true, instruction: "Lateral, divisória, base" });
  assert.equal(resolveStep(s, { routeStepId: s.id, action: "SKIP", instruction: null }).applies, false);
  assert.equal(resolveStep(s, { routeStepId: s.id, action: "APPEND", instruction: "rasgo do fundo" }).instruction, "Lateral, divisória, base. rasgo do fundo");
  assert.equal(resolveStep(s, { routeStepId: s.id, action: "REPLACE", instruction: "Rasgo de 6 mm" }).instruction, "Rasgo de 6 mm");
  assert.equal(initialStatus(s, { routeStepId: s.id, action: "SKIP", instruction: null }), "NOT_APPLICABLE");
  // etapa desativada pelo administrador não se aplica
  assert.equal(initialStatus(step(5, { active: false }), null), "NOT_APPLICABLE");
});

test("peça anda em sequência; etapa que pede foto só fecha com foto", () => {
  const prog: ProgressDef[] = [
    { routeStepId: "s1", position: 1, status: "DONE" },
    { routeStepId: "s2", position: 2, status: "PENDING" },
    { routeStepId: "s3", position: 3, status: "NOT_APPLICABLE" },
    { routeStepId: "s4", position: 4, status: "PENDING" },
  ];
  assert.deepEqual(canMarkDone(prog, "s4", { requirePhoto: false, hasPhoto: false }), { ok: false, motivo: "Faça antes a etapa 02" });
  assert.deepEqual(canMarkDone(prog, "s2", { requirePhoto: true, hasPhoto: false }), { ok: false, motivo: "Esta etapa pede foto" });
  assert.deepEqual(canMarkDone(prog, "s2", { requirePhoto: true, hasPhoto: true }), { ok: true });
  assert.equal(canMarkDone(prog, "s3", { requirePhoto: false, hasPhoto: false }).ok, false);
  assert.equal(currentPieceStep(prog)?.routeStepId, "s2");
  // desfazer só a última feita
  const feitas: ProgressDef[] = [{ routeStepId: "s1", position: 1, status: "DONE" }, { routeStepId: "s2", position: 2, status: "DONE" }];
  assert.equal(canUndo(feitas, "s1").ok, false);
  assert.equal(canUndo(feitas, "s2").ok, true);
});

test("tipo sugerido pela descrição da etiqueta só quando um tipo bate", () => {
  const types = DEFAULT_PIECE_TYPES.map((name, i) => ({ id: `t${i}`, name }));
  assert.equal(suggestPieceType("PRATELEIRA MÓVEL 15MM", types)?.name, "Prateleira");
  assert.equal(suggestPieceType("Divisoria interna", types)?.name, "Divisória");
  assert.equal(suggestPieceType("PORTAS DE CORRER", types)?.name, "Porta");
  assert.equal(suggestPieceType("LATERAL DA BASE", types), null); // dois tipos: quem decide é a pessoa
  assert.equal(suggestPieceType("TAMPO", types), null);
});

test("etapa do pedido fecha quando todas as peças passaram pelas etapas ligadas a ela", () => {
  const items = ["p1", "p2"];
  const rows = [
    { itemId: "p1", routeStepId: "s1", status: "DONE" as const },
    { itemId: "p2", routeStepId: "s1", status: "PENDING" as const },
  ];
  assert.equal(orderStepComplete(items, ["s1"], rows), false);
  rows[1].status = "DONE" as never;
  assert.equal(orderStepComplete(items, ["s1"], rows), true);
  // peça para a qual a etapa não se aplica não segura o pedido
  assert.equal(orderStepComplete(items, ["s1"], [rows[0], { itemId: "p2", routeStepId: "s1", status: "NOT_APPLICABLE" }]), true);
  // ninguém passou pela etapa: não conclui sozinho
  assert.equal(orderStepComplete(items, ["s1"], items.map((itemId) => ({ itemId, routeStepId: "s1", status: "NOT_APPLICABLE" as const }))), false);
  // peça sem roteiro ainda segura
  assert.equal(orderStepComplete([...items, "p3"], ["s1"], rows), false);
  assert.equal(orderStepComplete([], ["s1"], []), false);
});
