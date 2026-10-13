/**
 * Planner pessoal: qual semana a tela está pedindo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { weekStart } from "../src/modules/workspace/workspace.routes";

const day = (d: Date) => d.toISOString().slice(0, 10);

test("planner: a semana começa na segunda-feira do dia pedido", () => {
  assert.equal(day(weekStart("2026-10-12")), "2026-10-12"); // segunda
  assert.equal(day(weekStart("2026-10-13")), "2026-10-12"); // terça
  assert.equal(day(weekStart("2026-10-17")), "2026-10-12"); // sábado
});

test("planner: domingo vem da tela antiga e quer a segunda seguinte, não a semana anterior", () => {
  // em 13/10 a tela antiga pedia "2026-10-11" e o servidor devolvia a semana de 05/10
  assert.equal(day(weekStart("2026-10-11")), "2026-10-12");
  assert.equal(day(weekStart("2026-12-27")), "2026-12-28");
});
