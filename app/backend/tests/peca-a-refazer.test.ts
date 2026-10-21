/**
 * Peça a refazer: título da tarefa no planejamento, quem refaz e resumo dos motivos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { reasonLabel, reasonsSummary, reworkPerson, reworkTaskTitle } from "../src/modules/production/production-rework.rules";

test("tarefa do planejamento diz qual peça e o motivo", () => {
  assert.equal(reworkTaskTitle(" porta do armário ", "CORTE"), "REFAZER: porta do armário (erro de corte)");
  assert.equal(reasonLabel("XYZ"), "XYZ");
});

test("sem nome vai para a EQUIPE; com nome, em maiúsculas como no planejamento", () => {
  assert.equal(reworkPerson(null), "EQUIPE");
  assert.equal(reworkPerson("  "), "EQUIPE");
  assert.equal(reworkPerson("Sergio"), "SERGIO");
});

test("motivos mais comuns primeiro", () => {
  assert.deepEqual(reasonsSummary([{ reason: "MEDIDA" }, { reason: "CORTE" }, { reason: "MEDIDA" }]).map((r) => [r.code, r.count]), [["MEDIDA", 2], ["CORTE", 1]]);
});
