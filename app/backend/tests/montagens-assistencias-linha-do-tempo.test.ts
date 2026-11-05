/**
 * Linha do tempo da operação: duração do agendamento de montagem (opções e
 * "Outro"), situação, conflitos e indicadores; situação das assistências.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DurationError,
  assemblyKpis,
  assemblyState,
  customDurationMinutes,
  daysToMinutes,
  durationLabel,
  durationMinutes,
  scheduleConflicts,
} from "../src/modules/agenda/assembly-board.rules";
import { assistanceLate, assistanceStage } from "../src/modules/assistance/assistance.rules";

const at = (s: string) => new Date(s);
const H = 60;

test("N dias de montagem: dias corridos + um expediente", () => {
  assert.equal(daysToMinutes(1), 8 * H);
  assert.equal(daysToMinutes(2), 24 * H + 8 * H);
  // segunda 8h + 2 dias termina terça 16h
  const start = at("2026-11-09T08:00:00-03:00");
  assert.equal(new Date(start.getTime() + daysToMinutes(2) * 60000).toISOString(), at("2026-11-10T16:00:00-03:00").toISOString());
});

test("Outro: horas e dias validados", () => {
  assert.equal(customDurationMinutes(1.5, "HORAS"), 90);
  assert.equal(customDurationMinutes(3, "DIAS"), daysToMinutes(3));
  assert.equal(customDurationMinutes(0.5, "DIAS"), 4 * H);
  assert.throws(() => customDurationMinutes(0, "HORAS"), DurationError);
  assert.throws(() => customDurationMinutes(-2, "DIAS"), DurationError);
  assert.throws(() => customDurationMinutes(0.1, "HORAS"), DurationError);
  assert.throws(() => customDurationMinutes(61, "DIAS"), DurationError);
  assert.throws(() => customDurationMinutes(Number.NaN, "HORAS"), DurationError);
});

test("rótulo da duração, inclusive de agendamento antigo", () => {
  assert.equal(durationLabel(45), "45 min");
  assert.equal(durationLabel(150), "2h30");
  assert.equal(durationLabel(4 * H), "4h");
  assert.equal(durationLabel(8 * H), "1 dia (8h)");
  assert.equal(durationLabel(daysToMinutes(3)), "3 dias");
  assert.equal(durationLabel(48 * H), "2 dias corridos");
  assert.equal(durationLabel(30 * H), "1d 6h");
  assert.equal(durationLabel(0), "—");
  assert.equal(durationMinutes(at("2026-11-04T08:00:00Z"), at("2026-11-04T10:30:00Z")), 150);
});

const now = at("2026-11-04T12:00:00Z");
const ev = (id: string, startAt: string, endAt: string, status = "SCHEDULED", responsibleId = "u1", participantIds: string[] = [], completedAt: Date | null = null) => ({
  id, status, startAt: at(startAt), endAt: at(endAt), responsibleId, participantIds, completedAt,
});

test("situação: andamento pelo horário, atrasada quando passa do fim sem concluir", () => {
  assert.equal(assemblyState(ev("a", "2026-11-04T08:00:00Z", "2026-11-04T16:00:00Z"), now), "IN_PROGRESS");
  assert.equal(assemblyState(ev("a", "2026-11-05T08:00:00Z", "2026-11-05T16:00:00Z", "IN_PROGRESS"), now), "IN_PROGRESS");
  assert.equal(assemblyState(ev("a", "2026-11-05T08:00:00Z", "2026-11-05T16:00:00Z"), now), "SCHEDULED");
  assert.equal(assemblyState(ev("a", "2026-11-03T08:00:00Z", "2026-11-03T16:00:00Z", "IN_PROGRESS"), now), "LATE");
  assert.equal(assemblyState(ev("a", "2026-11-03T08:00:00Z", "2026-11-03T16:00:00Z", "COMPLETED"), now), "COMPLETED");
  assert.equal(assemblyState(ev("a", "2026-11-03T08:00:00Z", "2026-11-03T16:00:00Z", "CANCELLED"), now), "CANCELLED");
});

test("conflito: mesmo horário e alguém em comum; concluída/cancelada não conta", () => {
  const list = [
    ev("a", "2026-11-05T08:00:00Z", "2026-11-05T16:00:00Z", "SCHEDULED", "u1"),
    ev("b", "2026-11-05T14:00:00Z", "2026-11-05T18:00:00Z", "SCHEDULED", "u2", ["u1"]),
    ev("c", "2026-11-05T09:00:00Z", "2026-11-05T12:00:00Z", "SCHEDULED", "u3"),
    ev("d", "2026-11-05T09:00:00Z", "2026-11-05T12:00:00Z", "CANCELLED", "u1"),
    ev("e", "2026-11-05T16:00:00Z", "2026-11-05T17:00:00Z", "SCHEDULED", "u1"),
  ];
  const c = scheduleConflicts(list);
  assert.deepEqual(c.get("a"), ["b"]);
  assert.deepEqual(c.get("b")?.sort(), ["a", "e"]);
  assert.equal(c.has("c"), false);
  assert.equal(c.has("d"), false);
});

test("indicadores do período", () => {
  const from = at("2026-11-01T00:00:00Z");
  const to = at("2026-12-01T00:00:00Z");
  const list = [
    ev("andando", "2026-11-04T08:00:00Z", "2026-11-04T16:00:00Z"),
    ev("atrasada", "2026-10-30T08:00:00Z", "2026-10-30T16:00:00Z"),
    ev("futura", "2026-11-10T08:00:00Z", "2026-11-10T16:00:00Z"),
    ev("fora", "2026-12-10T08:00:00Z", "2026-12-10T16:00:00Z"),
    ev("feita", "2026-11-02T08:00:00Z", "2026-11-02T16:00:00Z", "COMPLETED", "u9", [], at("2026-11-02T15:00:00Z")),
    ev("feita-antes", "2026-10-02T08:00:00Z", "2026-10-02T16:00:00Z", "COMPLETED", "u9", [], at("2026-10-02T15:00:00Z")),
  ];
  assert.deepEqual(assemblyKpis(list, now, from, to, new Map()), { inProgress: 1, scheduled: 1, completedInPeriod: 1, late: 1, conflicts: 0 });
});

const t = (o: Partial<Parameters<typeof assistanceStage>[0]> = {}) => ({ status: "OPEN", scheduledAt: null, ...o });

test("assistência: situação pela agenda e pela confirmação do cliente", () => {
  assert.equal(assistanceStage(t()), "PENDENTE");
  assert.equal(assistanceStage(t({ status: "TRIAGE" })), "PENDENTE");
  assert.equal(assistanceStage(t({ optionsSentAt: now })), "AGUARDANDO_CONFIRMACAO");
  assert.equal(assistanceStage(t({ status: "WAITING_CLIENT" })), "AGUARDANDO_CONFIRMACAO");
  assert.equal(assistanceStage(t({ status: "SCHEDULED", scheduledAt: now })), "AGUARDANDO_CONFIRMACAO");
  assert.equal(assistanceStage(t({ status: "SCHEDULED", scheduledAt: now, clientConfirmedAt: now })), "AGENDADA");
  assert.equal(assistanceStage(t({ status: "SCHEDULED", scheduledAt: now, clientConfirmedAt: at("2026-11-01T00:00:00Z"), rescheduleRequestedAt: at("2026-11-02T00:00:00Z") })), "PENDENTE");
  assert.equal(assistanceStage(t({ status: "IN_PROGRESS", scheduledAt: now })), "EM_ANDAMENTO");
  assert.equal(assistanceStage(t({ status: "RESOLVED" })), "CONCLUIDA");
  assert.equal(assistanceStage(t({ status: "CANCELLED" })), "CANCELADA");
});

test("assistência atrasada: visita em dia passado ou prazo vencido, sem atendimento", () => {
  assert.equal(assistanceLate(t({ status: "SCHEDULED", scheduledAt: at("2026-11-03T13:00:00Z") }), now), true);
  // hoje mais cedo ainda não é atraso (o dia da visita é hoje)
  assert.equal(assistanceLate(t({ status: "SCHEDULED", scheduledAt: at("2026-11-04T11:00:00Z") }), now), false);
  assert.equal(assistanceLate(t({ dueAt: at("2026-11-04T10:00:00Z") }), now), true);
  assert.equal(assistanceLate(t({ status: "IN_PROGRESS", scheduledAt: at("2026-11-01T13:00:00Z") }), now), false);
  assert.equal(assistanceLate(t({ status: "RESOLVED", scheduledAt: at("2026-11-01T13:00:00Z") }), now), false);
});
