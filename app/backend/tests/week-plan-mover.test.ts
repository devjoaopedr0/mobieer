/**
 * Planejamento da semana: mover a tarefa para qualquer dia, sem cair em dia
 * inválido nem fora das datas da obra.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planDateProblem, planDateWarning, type PlanProject } from "../src/modules/production/week-plan.rules";

const HOJE = "2026-10-29"; // quinta
const obra = (p: Partial<PlanProject> = {}): PlanProject => ({ code: "364-1", status: "ACTIVE", startAt: new Date("2026-10-01T12:00:00Z"), dueAt: new Date("2026-11-20T12:00:00Z"), completedAt: null, createdAt: new Date("2026-09-15T12:00:00Z"), ...p });

test("qualquer semana serve, não só a que está aberta", () => {
  assert.equal(planDateProblem("2026-11-10", HOJE), null);
  assert.equal(planDateProblem("2026-10-05", HOJE), null); // semana passada também (registro do que foi feito)
  assert.equal(planDateProblem("2026-10-31", HOJE), null); // sábado
});

test("dia inválido: data que não existe, domingo e longe demais", () => {
  assert.equal(planDateProblem("2026-02-30", HOJE), "Data inválida");
  assert.equal(planDateProblem("29/10/2026", HOJE), "Data inválida");
  assert.match(planDateProblem("2026-11-01", HOJE)!, /segunda a sábado/);
  assert.match(planDateProblem("2028-01-04", HOJE)!, /um ano/);
  assert.match(planDateProblem("2025-10-01", HOJE)!, /um ano/);
});

test("fora da obra: antes do início, depois de concluída ou obra cancelada", () => {
  assert.match(planDateProblem("2026-09-30", HOJE, obra())!, /começa em 01\/10\/2026/);
  assert.equal(planDateProblem("2026-10-01", HOJE, obra()), null);
  // sem início marcado, vale a data em que a obra foi cadastrada
  assert.match(planDateProblem("2026-09-14", HOJE, obra({ startAt: null }))!, /começa em 15\/09\/2026/);
  assert.match(planDateProblem("2026-10-28", HOJE, obra({ completedAt: new Date("2026-10-27T15:00:00Z"), status: "COMPLETED" }))!, /concluída em 27\/10\/2026/);
  assert.match(planDateProblem("2026-10-30", HOJE, obra({ status: "CANCELLED" }))!, /cancelada/);
});

test("passar do prazo de entrega é aviso, não trava", () => {
  assert.equal(planDateProblem("2026-11-25", HOJE, obra()), null);
  assert.match(planDateWarning("2026-11-25", obra())!, /prazo de entrega da obra 364-1 \(20\/11\/2026\)/);
  assert.equal(planDateWarning("2026-11-20", obra()), null);
  assert.equal(planDateWarning("2026-11-25", obra({ dueAt: null })), null);
});
