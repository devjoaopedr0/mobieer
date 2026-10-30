/**
 * Requisição: separação por item, inclusive parcial.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { separationProblem } from "../src/modules/requisitions/requisitions.service";

test("separar parte do pedido vale; mais do que o pedido, não", () => {
  assert.equal(separationProblem(1, 3), null);
  assert.equal(separationProblem(3, 3), null);
  assert.equal(separationProblem(0, 3), null); // desfaz
  assert.match(separationProblem(4, 3)!, /mais do que o pedido \(3\)/);
  assert.match(separationProblem(-1, 3)!, /inválida/);
  assert.match(separationProblem(1.5, 3)!, /inválida/);
});
