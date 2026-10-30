/**
 * CRM — Etapa 6: meta adaptativa só com histórico, a conta e o ajuste da equipe.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveProposal, explainProposal, historyMonths, shiftMonth, type MonthStat } from "../src/modules/commercial/adaptive-goal.rules";

const m = (month: string, leads: number, won: number, wonValue: number): MonthStat => ({ month, leads, won, wonValue });

test("meses: conta para trás e atravessa o ano", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", -12), "2025-10");
});

test("sem 3 meses com venda fechada e lead registrado, a meta segue manual", () => {
  const stats = [m("2026-08", 10, 2, 40000), m("2026-09", 8, 0, 0), m("2026-07", 0, 1, 20000)];
  assert.equal(historyMonths(stats, "2026-10"), 1);
  const p = adaptiveProposal(stats, "2026-10");
  assert.equal(p.active, false);
  assert.match(p.active ? "" : p.reason, /segue manual/);
});

test("proposta: leads esperados × conversão × ticket (sem sazonalidade nem ajuste)", () => {
  const stats = [m("2026-07", 10, 2, 40000), m("2026-08", 10, 2, 40000), m("2026-09", 10, 2, 40000)];
  const p = adaptiveProposal(stats, "2026-10");
  assert.equal(p.active, true);
  if (!p.active) return;
  // 10 leads/mês × (6 ÷ 30) × 20.000 = 40.000
  assert.equal(p.basis.leadsExpected, 10);
  assert.equal(p.basis.conversionPercent, 20);
  assert.equal(p.basis.ticket, 20000);
  assert.equal(p.basis.seasonality, 1);
  assert.equal(p.amount, 40000);
  assert.match(explainProposal(p), /10 leads esperados .* 20% de conversão .* ticket médio de R\$\s20\.000 = R\$\s40\.000/);
});

test("sazonalidade do mesmo mês no ano passado, limitada a 1,3", () => {
  const stats = [m("2025-10", 10, 5, 400000), ...["2026-07", "2026-08", "2026-09"].map((x) => m(x, 10, 2, 40000))];
  const p = adaptiveProposal(stats, "2026-10");
  assert.equal(p.active && p.basis.seasonality, 1.3);
});

test("o ajuste da equipe nas últimas propostas entra na próxima", () => {
  const stats = ["2026-07", "2026-08", "2026-09"].map((x) => m(x, 10, 2, 40000));
  const p = adaptiveProposal(stats, "2026-10", [
    { month: "2026-09", proposed: 40000, final: 44000 },
    { month: "2026-08", proposed: 40000, final: 44000 },
    // pendente/recusada não conta
    { month: "2026-07", proposed: 40000, final: null },
  ]);
  assert.equal(p.active && p.basis.adjustment, 1.1);
  assert.equal(p.active && p.amount, 44000);
});
