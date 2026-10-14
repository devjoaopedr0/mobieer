/**
 * Ponto: resumo de horas da equipe no mês (quem deve, quem tem crédito, atrasos).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SCHEDULE, buildMirror, fortalezaToUtc, parseSchedule, summarizeTeamMonth } from "../src/modules/hr/timeclock.service";

const punch = (d: number, hh: number, mi: number) => ({ timestamp: fortalezaToUtc(2026, 10, d, hh, mi), kind: "IN" as const });
const sched = { start: "08:00", tolerance: 10 };

test("resumo do mês: só conta até hoje; dia que não chegou não é falta nem hora devida", () => {
  // 01/10/2026 é quinta. Trabalhou quinta (8h) e sexta (8h, chegando 08:40); segunda 05 faltou.
  const days = buildMirror([punch(1, 8, 0), punch(1, 12, 0), punch(1, 13, 0), punch(1, 17, 0), punch(2, 8, 40), punch(2, 12, 0), punch(2, 13, 0), punch(2, 17, 40)], "2026-10", 40).days;
  const r = summarizeTeamMonth(days, { to: "2026-10-05", schedule: sched });
  assert.equal(r.diasTrabalhados, 2);
  assert.equal(r.workedMinutes, 960);
  assert.equal(r.expectedMinutes, 3 * 480); // quinta, sexta e segunda
  assert.equal(r.balanceMinutes, -480);
  assert.equal(r.faltas, 1);
  assert.deepEqual([r.atrasos, r.atrasoMinutos], [1, 40]);
  // o mês inteiro, sem cortar em hoje, viraria um monte de faltas que ainda não aconteceram
  assert.ok(summarizeTeamMonth(days, { to: "2026-10-31", schedule: sched }).faltas > 15);
});

test("resumo do mês: antes da admissão não conta; dentro da tolerância não é atraso; batida ímpar é dia incompleto", () => {
  const days = buildMirror([punch(6, 8, 10), punch(6, 12, 0), punch(6, 13, 0), punch(6, 17, 0), punch(7, 8, 5), punch(7, 12, 0), punch(7, 13, 0)], "2026-10", 40).days;
  const r = summarizeTeamMonth(days, { from: "2026-10-06", to: "2026-10-07", schedule: sched });
  assert.equal(r.faltas, 0); // 01, 02 e 05 são antes da admissão
  assert.equal(r.atrasos, 0); // 08:10 e 08:05 estão dentro dos 10 minutos
  assert.equal(r.incompletos, 1);
  assert.equal(r.expectedMinutes, 2 * 480);
});

test("horário de entrada: valor guardado inválido volta para o padrão", () => {
  assert.deepEqual(parseSchedule(JSON.stringify({ start: "07:30", tolerance: 5 })), { start: "07:30", tolerance: 5 });
  assert.deepEqual(parseSchedule(JSON.stringify({ start: "25:00", tolerance: 999 })), DEFAULT_SCHEDULE);
  assert.deepEqual(parseSchedule(null), DEFAULT_SCHEDULE);
  assert.deepEqual(parseSchedule("{quebrado"), DEFAULT_SCHEDULE);
});
