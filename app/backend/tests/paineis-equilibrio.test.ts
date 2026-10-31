/**
 * Painéis no formato da loja: ponto de equilíbrio pelos contratos, fluxo de 7 dias e vencimentos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { breakEven, cashflowAhead, contractTotals, dailyAccumulated, dueSummary, type SignedContract } from "../src/modules/overview/overview.rules";

const c = (o: Partial<SignedContract>): SignedContract => ({ id: "x", number: "ORC-1", client: "C", day: "2026-08-05", total: 0, financingFee: 0, netRevenue: 0, cost: 0, commissions: 0, freight: 0, otherCosts: 0, ...o });

test("composição da margem: líquido menos compra, comissões, frete e impostos", () => {
  const t = contractTotals([c({ total: 110000, financingFee: 10000, netRevenue: 100000, cost: 40000, commissions: 5000, freight: 1000, otherCosts: 1000 })], 10);
  assert.equal(t.net, 100000);
  assert.equal(t.taxes, 10000);
  assert.equal(t.margin, 43000);
  assert.equal(t.marginPct, 43);
  assert.equal(t.score, 2.33);
});

test("ponto de equilíbrio e meta: venda necessária = custos ÷ margem; resultado = margem − fixos", () => {
  const t = contractTotals([c({ netRevenue: 100000, total: 100000, cost: 60000 })], 0); // margem 40%
  const b = breakEven(t, { fixedCost: 30000, profitGoal: 10000, taxPct: 0 });
  assert.equal(b.breakEvenSales, 75000);
  assert.equal(b.breakEvenProgress, 133.33);
  assert.equal(b.breakEvenMissing, 0);
  assert.equal(b.goalSales, 100000);
  assert.equal(b.goalProgress, 100);
  assert.equal(b.result, 10000);
  assert.equal(b.coveragePct, 133.33);
  // mês sem contrato: usa a margem de referência
  const vazio = contractTotals([], 0);
  assert.equal(breakEven(vazio, { fixedCost: 30000, profitGoal: 0, taxPct: 0 }).breakEvenSales, null);
  assert.equal(breakEven(vazio, { fixedCost: 30000, profitGoal: 0, taxPct: 0 }, 40).breakEvenMissing, 75000);
});

test("ponto de equilíbrio em quantidade de contratos: venda necessária ÷ ticket médio", () => {
  // preço 200, custo 120, imposto 5% = 10 → margem 70 por venda (35%); fixos 20 mil
  const t = contractTotals([c({ netRevenue: 200, total: 200, cost: 120 })], 5);
  assert.equal(t.avgTicket, 200);
  assert.equal(t.avgMargin, 70);
  assert.equal(t.marginPct, 35);
  const b = breakEven(t, { fixedCost: 20000, profitGoal: 0, taxPct: 5 });
  assert.equal(b.breakEvenSales, 57142.86);
  assert.equal(b.marginPerContract, 70);
  assert.equal(b.breakEvenContracts, 286); // 285,7 → arredonda para cima
  assert.equal(b.breakEvenContractsMissing, 285); // já fechou 1
  // conta exata não sobe um contrato a mais: 30 mil ÷ 40% = 75 mil ÷ 25 mil = 3
  const exato = contractTotals([c({ netRevenue: 25000, total: 25000, cost: 15000 })], 0);
  assert.equal(breakEven(exato, { fixedCost: 30000, profitGoal: 0, taxPct: 0 }).breakEvenContracts, 3);
  // mês sem contrato: margem e ticket de referência
  const vazio = contractTotals([], 0);
  assert.equal(breakEven(vazio, { fixedCost: 30000, profitGoal: 10000, taxPct: 0 }).breakEvenContracts, null);
  const ref = breakEven(vazio, { fixedCost: 30000, profitGoal: 10000, taxPct: 0 }, 40, 25000);
  assert.equal(ref.breakEvenContracts, 3);
  assert.equal(ref.goalContracts, 4);
  assert.equal(ref.goalContractsMissing, 4);
});

test("evolução do mês: acumulado dia a dia", () => {
  const d = dailyAccumulated([c({ day: "2026-02-03", netRevenue: 100 }), c({ day: "2026-02-03", netRevenue: 50 }), c({ day: "2026-02-10", netRevenue: 25 })], 2026, 2);
  assert.equal(d.length, 28);
  assert.equal(d[2].accumulated, 150);
  assert.equal(d[27].accumulated, 175);
});

test("fluxo de 7 dias e vencimentos: só o que falta pagar, vencidos dos últimos 30 dias", () => {
  const rows = [
    { type: "RECEITA" as const, amount: 1000, paid: 400, dueDay: "2026-10-15" },
    { type: "DESPESA" as const, amount: 300, paid: 0, dueDay: "2026-10-15" },
    { type: "DESPESA" as const, amount: 200, paid: 0, dueDay: "2026-10-20" },
    { type: "DESPESA" as const, amount: 999, paid: 0, dueDay: "2026-08-01" },
    { type: "DESPESA" as const, amount: 50, paid: 0, dueDay: "2026-10-01" },
  ];
  const f = cashflowAhead(rows, "2026-10-15", 7);
  assert.deepEqual(f.days[0], { day: "2026-10-15", in: 600, out: 300, balance: 300 });
  assert.equal(f.days[5].out, 200);
  assert.deepEqual(f.total, { in: 600, out: 500, balance: 100 });
  const p = dueSummary(rows, "DESPESA", "2026-10-15");
  assert.deepEqual(p, { today: { amount: 300, count: 1 }, overdue: { amount: 50, count: 1 } });
});
