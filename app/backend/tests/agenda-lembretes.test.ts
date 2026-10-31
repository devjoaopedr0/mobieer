/**
 * Lembrete da agenda: o texto do aviso no sino, no fuso de Fortaleza.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { reminderText } from "../src/modules/agenda/reminders.rules";

// 31/10 às 10h em Fortaleza = 13h UTC
const now = new Date("2026-10-31T13:00:00Z");

test("minutos antes, hoje, amanhã e outro dia", () => {
  assert.equal(reminderText(new Date("2026-10-31T13:30:00Z"), now, false), "Em 30 min (10:30)");
  assert.equal(reminderText(new Date("2026-10-31T18:00:00Z"), now, false), "Hoje às 15:00");
  assert.equal(reminderText(new Date("2026-11-01T12:00:00Z"), now, false), "Amanhã às 09:00");
  assert.equal(reminderText(new Date("2026-11-05T12:00:00Z"), now, false), "05/11 às 09:00");
});

test("na hora e dia inteiro", () => {
  assert.equal(reminderText(now, now, false), "Agora (10:00)");
  assert.equal(reminderText(new Date("2026-10-31T03:00:00Z"), now, true), "Hoje");
  assert.equal(reminderText(new Date("2026-11-03T03:00:00Z"), now, true), "Dia 03/11");
});
