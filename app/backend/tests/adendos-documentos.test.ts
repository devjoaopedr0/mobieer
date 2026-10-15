/**
 * Adendos nos documentos do projeto: de cada adendo, só a versão aceita mais nova, na ordem A1, A2…
 */
import assert from "node:assert/strict";
import test from "node:test";
import { latestAddenda } from "../src/modules/commercial/addenda";

test("adendos: versão mais nova de cada um, em ordem numérica", () => {
  const rows = [
    { id: "a", number: "ORC-00012-A2", version: 1 },
    { id: "b", number: "ORC-00012-A1", version: 1 },
    { id: "c", number: "ORC-00012-A1", version: 3 },
    { id: "d", number: "ORC-00012-A10", version: 1 },
  ];
  assert.deepEqual(latestAddenda(rows).map((r) => r.id), ["c", "a", "d"]);
  assert.deepEqual(latestAddenda([]), []);
});
