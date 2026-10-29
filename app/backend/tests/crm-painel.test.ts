/**
 * CRM — Etapa 3: definição única de fechado, taxa de conversão do período e a
 * quebra por origem (com o grupo "Sem origem na lista").
 */
import assert from "node:assert/strict";
import test from "node:test";
import { closeRate, closedWhere, defaultMonth, lostWhere } from "../src/modules/commercial/closed.rules";
import { channelPanel } from "../src/modules/commercial/crm.rules";

test("fechado = WON com wonAt no período; perdido = LOST no período", () => {
  const r = { gte: new Date("2026-10-01"), lte: new Date("2026-10-31") };
  assert.deepEqual(closedWhere(r), { status: "WON", wonAt: r });
  assert.deepEqual(lostWhere(r), { status: "LOST", updatedAt: r });
});

test("taxa de conversão: fechados ÷ (fechados + perdidos)", () => {
  assert.equal(closeRate(3, 1), 75);
  assert.equal(closeRate(1, 2), 33.3);
  assert.equal(closeRate(0, 0), 0);
});

test("período padrão: o mês atual", () => {
  const now = new Date(2026, 9, 29, 15);
  const d = defaultMonth(now);
  assert.equal(d.from.getDate(), 1);
  assert.equal(d.from.getMonth(), 9);
  assert.equal(d.to, now);
});

test("por origem: entrou, qualificou, converteu, perdeu e vendido; sem origem é grupo próprio", () => {
  const rows = channelPanel(
    [
      { origin: "INSTAGRAM", status: "CONVERTED" },
      { origin: "INSTAGRAM", status: "LOST" },
      { origin: null, status: "NEW" },
    ],
    [{ origin: "INSTAGRAM", createdInPeriod: false, wonInPeriod: true, estimatedValue: 30000 }]
  );
  const insta = rows.find((r) => r.origin === "INSTAGRAM")!;
  assert.deepEqual([insta.entrou, insta.qualificou, insta.converteu, insta.perdeu, insta.taxaConversao, insta.valorVendido], [2, 1, 1, 1, 50, 30000]);
  const sem = rows.find((r) => r.origin === "SEM_ORIGEM")!;
  assert.equal(sem.label, "Sem origem na lista");
  assert.equal(sem.entrou, 1);
});
