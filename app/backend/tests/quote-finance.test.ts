/**
 * Orçamento aceito → contas a receber e a pagar no financeiro.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FinanceAdjustError, addDaysDay, addMonthsDay, applyAdjustments, planFinance, splitAmount, type QuoteForFinance } from "../src/modules/commercial/quote.finance";

const q = (payment: Partial<QuoteForFinance["payment"]>, over: Partial<QuoteForFinance> = {}): QuoteForFinance => ({
  number: "ORC-00007",
  version: 1,
  total: 1000,
  payment: { method: "AVISTA", planName: null, installments: 1, downPayment: 0, feePercent: 0, ...payment },
  commissions: [],
  ...over,
});
const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

test("datas de calendário: fim de mês e virada de ano", () => {
  assert.equal(addMonthsDay("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsDay("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsDay("2026-11-15", 2), "2027-01-15");
  assert.equal(addDaysDay("2026-12-15", 30), "2027-01-14");
});

test("parcelas em centavos inteiros; o arredondamento cai na última", () => {
  assert.deepEqual(splitAmount(100, 3), [33.33, 33.33, 33.34]);
  assert.equal(sum(splitAmount(1052.63, 19).map((amount) => ({ amount }))), 1052.63);
});

test("PIX: um recebível no dia do aceite", () => {
  const p = planFinance(q({ method: "PIX" }), "2026-09-26");
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].type, p[0].amount, p[0].dueDay, p[0].method], ["RECEITA", 1000, "2026-09-26", "PIX"]);
});

test("boleto: entrada hoje e 10 parcelas mensais a partir do mês seguinte", () => {
  const p = planFinance(q({ method: "BOLETO", installments: 10, downPayment: 200 }), "2026-09-26");
  assert.equal(p.length, 11);
  assert.equal(p[0].description, "Orçamento ORC-00007 — entrada");
  assert.equal(p[0].dueDay, "2026-09-26");
  assert.equal(p[1].dueDay, "2026-10-26");
  assert.equal(p[10].dueDay, "2027-07-26");
  assert.equal(p[10].installmentNumber, 10);
  assert.equal(p[10].installmentTotal, 10);
  assert.equal(sum(p), 1000);
});

test("financeira: repasse único em 30 dias e a taxa como despesa no mesmo dia", () => {
  const p = planFinance(q({ method: "FINANCEIRA", planName: "Santander 19x sem entrada", installments: 19, feePercent: 10 }), "2026-09-26");
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].type, p[0].amount, p[0].dueDay], ["RECEITA", 1000, "2026-10-26"]);
  assert.match(p[0].description, /repasse Santander 19x/);
  assert.deepEqual([p[1].type, p[1].category, p[1].amount, p[1].dueDay], ["DESPESA", "Taxa de financiamento", 100, "2026-10-26"]);
});

test("cartão: um repasse e uma taxa por parcela, somando o total", () => {
  const p = planFinance(q({ method: "CARTAO", installments: 3, feePercent: 4 }), "2026-09-26");
  const rec = p.filter((x) => x.type === "RECEITA");
  const fee = p.filter((x) => x.type === "DESPESA");
  assert.equal(rec.length, 3);
  assert.equal(fee.length, 3);
  assert.equal(sum(rec), 1000);
  assert.equal(sum(fee), 40);
  assert.equal(fee[0].category, "Taxa de cartão");
});

test("comissão é paga conforme recebe: uma fatia por parcela, no mesmo vencimento; sem taxa não há despesa de taxa", () => {
  const p = planFinance(
    q({ method: "BOLETO", installments: 2 }, { commissions: [{ name: "Ana", percent: 3, amount: 31.58 }, { name: "Rui", percent: 0, amount: 0 }] }),
    "2026-09-26"
  );
  const com = p.filter((x) => x.category === "Comissão de venda");
  assert.deepEqual(com.map((c) => [c.amount, c.dueDay]), [[15.79, "2026-10-26"], [15.79, "2026-11-26"]]);
  assert.equal(com[0].description, "Orçamento ORC-00007 — comissão Ana (3%) — 1/2");
  assert.deepEqual(com.map((c) => p[c.follows!].description), ["Orçamento ORC-00007 — parcela 1/2", "Orçamento ORC-00007 — parcela 2/2"]);
  assert.equal(p.filter((x) => x.category.startsWith("Taxa")).length, 0);
});

// o caso da cliente: R$ 7.000, entrada de 4.500 e o restante depois; 3% + 2%
const caso = () =>
  planFinance(
    q({ method: "AVISTA", downPayment: 4500 }, { number: "ORC-00001", total: 7000, commissions: [{ name: "Jéssica", percent: 3, amount: 210 }, { name: "Projetista", percent: 2, amount: 140 }] }),
    "2026-10-13"
  );

test("entrada + restante: a comissão acompanha cada recebimento na proporção", () => {
  const p = caso();
  assert.deepEqual(p.map((e) => e.amount), [4500, 2500, 135, 75, 90, 50]);
  assert.equal(sum(p.filter((e) => e.description.includes("Jéssica"))), 210);
  assert.deepEqual(p.slice(2).map((e) => e.follows), [0, 1, 0, 1]);
  // centavos que não dividem: a soma continua fechando no valor da comissão
  const torto = planFinance(q({ method: "BOLETO", installments: 3 }, { commissions: [{ name: "Ana", percent: 1, amount: 10 }] }), "2026-10-13").filter((e) => e.category === "Comissão de venda");
  assert.deepEqual(torto.map((e) => e.amount), [3.33, 3.33, 3.34]);
});

test("ajustes do aceite: data do restante, valor e data da comissão", () => {
  const p = caso();
  const out = applyAdjustments(p, [{ index: 1, dueDay: "2026-11-20" }, { index: 3, dueDay: "2026-11-20", amount: 60 }, { index: 5, amount: 0 }], "2026-10-13", 6);
  assert.equal(out.length, 5); // comissão zerada sai da lista
  assert.equal(out[1].dueDay, "2026-11-20");
  assert.deepEqual([out[3].amount, out[3].dueDay], [60, "2026-11-20"]);
  assert.equal(p[1].dueDay, "2026-10-13"); // o plano original não é alterado
});

test("ajustes do aceite: o que não pode", () => {
  const p = caso();
  const bad = (a: Parameters<typeof applyAdjustments>[1], expected?: number) => assert.throws(() => applyAdjustments(p, a, "2026-10-13", expected), FinanceAdjustError);
  bad([{ index: 0, amount: 100 }]); // valor do recebível vem do contrato
  bad([{ index: 1, dueDay: "2026-10-01" }]); // antes de hoje
  bad([{ index: 1, dueDay: "20/11/2026" }]);
  bad([{ index: 2, amount: 7000.01 }]); // comissão maior que a venda
  bad([{ index: 9, dueDay: "2026-11-20" }]);
  bad([], 5); // o plano mudou desde que a janela abriu
  assert.equal(applyAdjustments(p, [{ index: 0, amount: 4500, dueDay: "2026-10-13" }], "2026-10-13").length, 6); // igual ao que já era: nada a recusar
});

test("entrada cobrindo o total: só a entrada; versão aparece na descrição", () => {
  const p = planFinance(q({ method: "BOLETO", installments: 5, downPayment: 5000 }, { version: 2 }), "2026-09-26");
  assert.equal(p.length, 1);
  assert.equal(p[0].amount, 1000);
  assert.equal(p[0].description, "Orçamento ORC-00007 v2 — entrada");
});

test("reserva técnica do indicador vira conta a pagar própria, ligada ao indicador", () => {
  const p = planFinance(
    q({ method: "PIX" }, { commissions: [{ name: "Ana", percent: 3, amount: 30 }, { name: "Arq. Paula", percent: 10, amount: 100, role: "INDICADOR", referrerId: "ref1" }] }),
    "2026-09-26"
  );
  const rt = p.find((x) => x.category === "Reserva técnica");
  assert.ok(rt);
  assert.equal(rt!.amount, 100);
  assert.equal(rt!.referrerId, "ref1");
  assert.equal(rt!.description, "Orçamento ORC-00007 — reserva técnica Arq. Paula (10%)");
  assert.equal(p.find((x) => x.category === "Comissão de venda")!.referrerId, null);
});

test("DRE classifica a reserva técnica como despesa de vendas", async () => {
  const { classifyDreLine } = await import("../src/modules/finance/dre.service");
  assert.equal(classifyDreLine("DESPESA", "Reserva técnica"), "DESPESA_VENDAS");
});
