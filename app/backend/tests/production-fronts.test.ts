/**
 * Frentes de produção em paralelo à marcenaria.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FRONT_CODES, frontDates, frontDaysLate, frontLabel, frontsPending } from "../src/modules/production/fronts.rules";

test("frentes: as três além da marcenaria, com rótulo", () => {
  assert.deepEqual(FRONT_CODES, ["METALON", "PECAS_ESPECIAIS", "PORTAS_VIDRO"]);
  assert.equal(frontLabel("PORTAS_VIDRO"), "Portas de vidro");
  assert.equal(frontLabel("MARCENARIA"), "Marcenaria");
  assert.equal(frontLabel("NOVA"), "NOVA");
});

test("frentes: as datas acompanham a situação", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const antes = new Date("2026-10-10T12:00:00Z");
  assert.deepEqual(frontDates({ status: "PENDING", startedAt: null, completedAt: null }, "IN_PROGRESS", now), { startedAt: now, completedAt: null });
  // concluir sem ter iniciado marca as duas; o início já registrado é mantido
  assert.deepEqual(frontDates({ status: "PENDING", startedAt: null, completedAt: null }, "DONE", now), { startedAt: now, completedAt: now });
  assert.deepEqual(frontDates({ status: "IN_PROGRESS", startedAt: antes, completedAt: null }, "DONE", now), { startedAt: antes, completedAt: now });
  // salvar de novo como concluída não muda a data de conclusão
  assert.deepEqual(frontDates({ status: "DONE", startedAt: antes, completedAt: antes }, "DONE", now), { startedAt: antes, completedAt: antes });
  // voltar para pendente limpa; reabrir tira a conclusão
  assert.deepEqual(frontDates({ status: "DONE", startedAt: antes, completedAt: antes }, "PENDING", now), { startedAt: null, completedAt: null });
  assert.deepEqual(frontDates({ status: "DONE", startedAt: antes, completedAt: antes }, "IN_PROGRESS", now), { startedAt: antes, completedAt: null });
});

test("frentes: atraso e o que ainda falta no pedido", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assert.equal(frontDaysLate(new Date("2026-10-10T12:00:00Z"), "IN_PROGRESS", now), 3);
  assert.equal(frontDaysLate(new Date("2026-10-10T12:00:00Z"), "DONE", now), 0);
  assert.equal(frontDaysLate(new Date("2026-10-20T12:00:00Z"), "PENDING", now), 0);
  assert.equal(frontDaysLate(null, "PENDING", now), 0);
  assert.deepEqual(frontsPending([{ front: "METALON", status: "DONE" }, { front: "PORTAS_VIDRO", status: "IN_PROGRESS" }]), ["Portas de vidro"]);
});
