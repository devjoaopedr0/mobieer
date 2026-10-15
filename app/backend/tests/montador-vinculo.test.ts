/**
 * Vínculo do montador: contratos de autônomo e contratado, e horas faltantes da diária.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CONTRACT_AUTONOMO_BODY, CONTRACT_CONTRATADO_BODY, imageConsentText } from "../src/modules/contractors/contractor-contracts";
import { contractorValues } from "../src/modules/contractors/contractor-tools.rules";
import { summarizeShifts } from "../src/modules/contractors/contractors.service";
import { MERGE_FIELDS } from "../src/modules/templates/contract.service";
import { templateKeys } from "../src/utils/template";

test("os dois contratos só usam campos que o sistema preenche", () => {
  const known = new Set(MERGE_FIELDS.map((f) => f.key));
  for (const body of [CONTRACT_AUTONOMO_BODY, CONTRACT_CONTRATADO_BODY]) assert.deepEqual(templateKeys(body).filter((k) => !known.has(k)), []);
});

test("uso de imagem: marcado só quando escolhido", () => {
  assert.match(imageConsentText("SIM"), /\[ X \] AUTORIZO/);
  assert.match(imageConsentText("NAO"), /\[ X \] NÃO AUTORIZO/);
  assert.match(imageConsentText(null), /não há autorização/);
});

test("salário e vínculo do contratado", () => {
  const v = contractorValues({ name: "A", document: null, phone: null, address: null, city: null, state: null, crewRole: "MONTADOR", specialty: null, dailyRate: 0, engagement: "CONTRATADO", monthlySalary: 2500, expectedDailyMinutes: 480 });
  assert.match(v["montador.salario"], /R\$\s2\.500,00/);
  assert.match(v["montador.vinculo"], /^Contratado/);
  assert.equal(v["montador.horasDiaria"], "8");
});

test("diária do autônomo: horas faltantes viram abatimento sugerido, fora do total", () => {
  const at = (h: number) => new Date(`2026-10-14T${String(h).padStart(2, "0")}:00:00-03:00`);
  const r = summarizeShifts([
    // 6 de 8 horas: faltam 2h de uma diária de 240 → 60
    { contractorId: "a", contractorName: "A", checkInAt: at(9), checkOutAt: at(15), minutes: 360, dailyRate: 240, expectedMinutes: 480 },
    // contratado: sem diária e sem cálculo de horas
    { contractorId: "b", contractorName: "B", checkInAt: at(8), checkOutAt: at(12), minutes: 240, dailyRate: 0, expectedMinutes: null },
  ]);
  const a = r.items.find((i) => i.contractorId === "a")!;
  assert.equal(a.total, 240);
  assert.equal(a.missingMinutes, 120);
  assert.equal(a.suggestedDeduction, 60);
  const b = r.items.find((i) => i.contractorId === "b")!;
  assert.equal(b.total, 0);
  assert.equal(b.suggestedDeduction, 0);
});
