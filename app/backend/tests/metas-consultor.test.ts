/**
 * Metas: cada consultor define a própria; só a gestão define a da loja e a dos outros.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { goalOwner } from "../src/modules/commercial/goals.service";

const GESTAO = ["commercial.read", "commercial.goals.manage", "commercial.goals.self"];
const CONSULTOR = ["commercial.read", "commercial.goals.self"];

test("gestão: meta da loja e de qualquer consultor", () => {
  assert.equal(goalOwner(GESTAO, "g1", undefined), null);
  assert.equal(goalOwner(GESTAO, "g1", null), null);
  assert.equal(goalOwner(GESTAO, "g1", "c2"), "c2");
});

test("consultor: só a própria meta", () => {
  assert.equal(goalOwner(CONSULTOR, "c1", undefined), "c1");
  assert.equal(goalOwner(CONSULTOR, "c1", "c1"), "c1");
  assert.throws(() => goalOwner(CONSULTOR, "c1", "c2"), /meta de outro consultor/);
  assert.throws(() => goalOwner(CONSULTOR, "c1", null), /meta da loja/);
});

test("sem permissão de meta: nada", () => {
  assert.throws(() => goalOwner(["commercial.read"], "x", undefined), /não pode definir metas/);
});
