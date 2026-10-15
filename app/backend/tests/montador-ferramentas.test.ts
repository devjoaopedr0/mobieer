/**
 * Ferramentas do montador e documentos padrão.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CONDUCT_BODY, DEFAULT_TOOL_CATALOG, contractorValues, normalizeCatalog, termIsCurrent } from "../src/modules/contractors/contractor-tools.rules";
import { MERGE_FIELDS } from "../src/modules/templates/contract.service";
import { templateKeys } from "../src/utils/template";

test("catálogo: sem repetir, sem vazio; sem nada salvo usa a lista padrão", () => {
  assert.deepEqual(normalizeCatalog([" Trena ", "trena", "", 3, "Nível"]), ["Trena", "Nível"]);
  assert.deepEqual(normalizeCatalog(null), DEFAULT_TOOL_CATALOG);
});

test("termo vale só se foi assinado depois da última mudança", () => {
  const d = (s: string) => new Date(s);
  assert.equal(termIsCurrent([d("2026-10-01")], d("2026-10-02"), 1), true);
  assert.equal(termIsCurrent([d("2026-10-01"), d("2026-10-05")], d("2026-10-02"), 1), false);
  assert.equal(termIsCurrent([d("2026-10-01")], null, 1), false);
  assert.equal(termIsCurrent([], null, 0), true);
});

test("dados do montador para os modelos", () => {
  const v = contractorValues({ name: "João", document: null, phone: "85", address: "Rua Z", city: "Fortaleza", state: "CE", crewRole: "AJUDANTE", specialty: null, dailyRate: 0 });
  assert.equal(v["montador.funcao"], "Ajudante de montagem");
  assert.equal(v["montador.endereco"], "Rua Z — Fortaleza/CE");
  assert.equal(v["montador.diaria"], "");
});

test("código de conduta só usa campos conhecidos", () => {
  const known = new Set(MERGE_FIELDS.map((f) => f.key));
  assert.deepEqual(templateKeys(CONDUCT_BODY).filter((k) => !known.has(k)), []);
});
