/**
 * Ponto: marcação manual. A hora digitada na tela é a da loja (Fortaleza, UTC-3).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildMirror, fortalezaToUtc, parsePunchTime } from "../src/modules/hr/timeclock.service";

test("hora sem fuso (campo da tela) é a hora da loja, não UTC", () => {
  assert.equal(parsePunchTime("2026-10-13T17:00")?.toISOString(), "2026-10-13T20:00:00.000Z");
  assert.equal(parsePunchTime("2026-10-13 07:45:30")?.toISOString(), "2026-10-13T10:45:30.000Z");
});

test("hora com fuso explícito vale como veio", () => {
  assert.equal(parsePunchTime("2026-10-13T17:00:00.000Z")?.toISOString(), "2026-10-13T17:00:00.000Z");
  assert.equal(parsePunchTime("2026-10-13T17:00-03:00")?.toISOString(), "2026-10-13T20:00:00.000Z");
});

test("texto que não é data é recusado", () => {
  assert.equal(parsePunchTime("ontem de tarde"), null);
});

test("a saída que faltava, lançada à mão, completa o dia no espelho", () => {
  // 13/10/2026 (terça): entrou 08:00, saiu 12:00, voltou 13:00 e esqueceu de bater a saída
  const device = [fortalezaToUtc(2026, 10, 13, 8, 0), fortalezaToUtc(2026, 10, 13, 12, 0), fortalezaToUtc(2026, 10, 13, 13, 0)];
  const before = buildMirror(device.map((timestamp) => ({ timestamp, kind: "IN" as const })), "2026-10", 44).days.find((d) => d.date === "2026-10-13")!;
  assert.equal(before.status, "INCOMPLETO");
  assert.equal(before.workedMinutes, 240);
  const manual = parsePunchTime("2026-10-13T17:48")!;
  const after = buildMirror([...device, manual].map((timestamp) => ({ timestamp, kind: "IN" as const })), "2026-10", 44).days.find((d) => d.date === "2026-10-13")!;
  assert.equal(after.status, "OK");
  assert.equal(after.workedMinutes, 240 + 288);
  assert.deepEqual(after.punches.map((p) => p.time), ["08:00", "12:00", "13:00", "17:48"]);
});
