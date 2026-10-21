/**
 * Entrada de nota fiscal, recibo e cupom: leitura da resposta da IA e o resumo "o que compramos".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseReceipt, purchaseCategory, purchaseSummary } from "../src/modules/finance/purchase-receipt.rules";

test("categoria da compra: MDF, ferragem, cola; o resto pela regra das lojas", () => {
  assert.equal(purchaseCategory("Chapa MDF branco TX 15mm"), "Matéria-prima");
  assert.equal(purchaseCategory("Dobradiça 35mm com amortecedor"), "Ferragens");
  assert.equal(purchaseCategory("Cola de contato 2,8kg"), "Acabamento");
  assert.equal(purchaseCategory("Posto Shell"), "Combustível");
});

test("resposta da IA: total, itens, pago e categoria", () => {
  const r = parseReceipt('ok {"kind":"CUPOM","supplier":"Casa das Ferragens","total":"1.234,50","paid":true,"method":"PIX","category":"Ferragens","items":[{"description":"Dobradiça","quantity":10,"amount":89.9},{"description":"","amount":5},{"description":"Corrediça","amount":"1.144,60"}],"date":"2026-10-20"}');
  assert.ok(r);
  assert.equal(r!.total, 1234.5);
  assert.deepEqual(r!.items.map((i) => [i.description, i.amount]), [["Dobradiça", 89.9], ["Corrediça", 1144.6]]);
  assert.equal(r!.paid, true);
  assert.equal(r!.category, "Ferragens");
  assert.equal(r!.date, "2026-10-20");
});

test("sem total, soma os itens; nota sem dizer se pagou fica a pagar; categoria inválida vem da regra", () => {
  const r = parseReceipt('{"kind":"NOTA_FISCAL","supplier":"Madeireira Norte","category":"Inventada","items":[{"description":"Chapa MDF 18mm","amount":300},{"description":"Fita de borda","amount":50}]}');
  assert.equal(r!.total, 350);
  assert.equal(r!.paid, false);
  assert.equal(r!.category, "Matéria-prima");
  assert.equal(parseReceipt('{"supplier":"","total":10}'), null);
  assert.equal(parseReceipt("não é json"), null);
});

test("o que compramos: por categoria, fornecedor e item, somando e contando", () => {
  const s = purchaseSummary([
    { category: "Ferragens", store: "Casa A", description: "Dobradiça", amount: 100 },
    { category: "Ferragens", store: "casa a", description: "dobradiça", amount: 50 },
    { category: "Transporte (Uber/99)", store: "UBER", description: "UBER", amount: 25 },
  ]);
  assert.equal(s.total, 175);
  assert.deepEqual(s.byCategory.map((g) => [g.key, g.total, g.count]), [["Ferragens", 150, 2], ["Transporte (Uber/99)", 25, 1]]);
  assert.deepEqual(s.bySupplier[0], { key: "Casa A", total: 150, count: 2 });
  assert.deepEqual(s.topItems[0], { key: "Dobradiça", total: 150, count: 2 });
});
