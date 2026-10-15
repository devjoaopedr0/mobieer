/**
 * Aba "Comissões e dívidas": a quem pagar, agrupamento com atraso e parcelas da dívida.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { commissionPayee, creditorOf, groupOpen, planDebt } from "../src/modules/finance/open-balances.rules";

test("nome de quem recebe a comissão sai da descrição gerada no aceite", () => {
  assert.equal(commissionPayee("Orçamento ORC-00001 — comissão Ana Paula (5%) — 1/3"), "Ana Paula");
  assert.equal(commissionPayee("Orçamento ORC-00002 v2 — reserva técnica Arq. Bruno (10%)"), "Arq. Bruno");
  assert.equal(commissionPayee("lançado à mão", "Indicador X"), "Indicador X");
  assert.equal(commissionPayee(null), "Sem nome");
  // lançada à mão na aba
  assert.equal(commissionPayee("Cliente João — comissão Carla — parcela 1/2"), "Carla");
  assert.equal(commissionPayee("Cliente João — comissão Carla"), "Carla");
});

test("credor é o começo da descrição", () => {
  assert.equal(creditorOf("Banco do Nordeste — empréstimo de capital de giro — parcela 2/12"), "Banco do Nordeste");
  assert.equal(creditorOf(""), "Sem credor");
});

test("agrupa saldos: atraso primeiro, pago em parte conta só o que falta", () => {
  const rows = [
    { id: "1", amount: 100, paidAmount: 0, dueDay: "2026-10-01", who: "Ana" },
    { id: "2", amount: 300, paidAmount: 100, dueDay: "2026-11-01", who: "Ana" },
    { id: "3", amount: 500, paidAmount: 0, dueDay: "2026-12-01", who: "Bia" },
    { id: "4", amount: 50, paidAmount: 50, dueDay: "2026-09-01", who: "Bia" },
  ];
  const g = groupOpen(rows, (r) => r.who, "2026-10-14");
  assert.deepEqual(g.map((x) => [x.key, x.open, x.overdue, x.count, x.nextDue]), [
    ["Ana", 300, 100, 2, "2026-11-01"],
    ["Bia", 500, 0, 1, "2026-12-01"],
  ]);
  assert.equal(g[0].items[0].late, true);
});

test("dívida parcelada: soma fecha e uma parcela por mês", () => {
  const p = planDebt(1000, 3, "2026-10-31");
  assert.equal(Math.round(p.reduce((s, x) => s + x.amount, 0) * 100), 100000);
  assert.deepEqual(p.map((x) => x.number), [1, 2, 3]);
  assert.equal(p[0].dueDay, "2026-10-31");
  assert.equal(p.length, 3);
  assert.ok(p[1].dueDay.startsWith("2026-11"));
});
