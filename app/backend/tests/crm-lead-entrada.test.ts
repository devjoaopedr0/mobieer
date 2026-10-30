/**
 * CRM — Etapa 1: o lead entra como lead (sem oportunidade), perdido exige
 * motivo, e a origem segue a lista fixa (texto antigo fora dela fica como veio).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { leadStatusProblem, normalizeOrigin, ORIGINS } from "../src/modules/commercial/crm.rules";

test("cadastro: entra como novo, contatado ou qualificado; convertido não", () => {
  for (const s of ["NEW", "CONTACTED", "QUALIFIED", undefined]) assert.equal(leadStatusProblem(s, null, null), null);
  assert.match(leadStatusProblem("CONVERTED", null, null)!, /entra como lead/);
});

test("perdido exige o motivo, no cadastro e na mudança", () => {
  assert.match(leadStatusProblem("LOST", null, null)!, /motivo da perda/);
  assert.match(leadStatusProblem("LOST", undefined, "CONTACTED")!, /motivo da perda/);
  assert.equal(leadStatusProblem("LOST", "PRECO", "CONTACTED"), null);
  // já estava perdido: mexer em outro campo não pede o motivo de novo
  assert.equal(leadStatusProblem("LOST", null, "LOST"), null);
});

test("convertido só pela conversão", () => {
  assert.match(leadStatusProblem("CONVERTED", null, "QUALIFIED")!, /Use Converter/);
  assert.equal(leadStatusProblem("CONVERTED", null, "CONVERTED"), null);
});

test("origem: lista fixa única; texto fora dela não vira item", () => {
  assert.deepEqual([...ORIGINS], ["INSTAGRAM", "INDICACAO", "GOOGLE", "SITE", "ARQUITETO", "PARCEIROS", "OUTRO"]);
  assert.equal(normalizeOrigin("Insta"), "INSTAGRAM");
  assert.equal(normalizeOrigin("Indicação da Maria"), "INDICACAO");
  assert.equal(normalizeOrigin("feira de móveis"), null);
});
