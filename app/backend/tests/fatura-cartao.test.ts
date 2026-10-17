/**
 * Leitura da fatura do cartão: categoria pela loja, linhas do PDF e resposta da IA.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { categorize, expenseKey, parseAiItems, parseInvoiceText, resolveDate } from "../src/modules/finance/card-invoice.rules";

test("categoria pela loja: Uber/99, comida, posto, software; o resto é Outros", () => {
  assert.equal(categorize("UBER *TRIP HELP.UBER.COM"), "Transporte (Uber/99)");
  assert.equal(categorize("99APP *99 RIDE"), "Transporte (Uber/99)");
  assert.equal(categorize("IFOOD *RESTAURANTE"), "Alimentação");
  assert.equal(categorize("PADARIA PAO DOURADO"), "Alimentação");
  assert.equal(categorize("AUTO POSTO SHELL"), "Combustível");
  assert.equal(categorize("GOOGLE *WORKSPACE"), "Software / assinaturas");
  assert.equal(categorize("LOJA QUALQUER LTDA"), "Outros");
});

test("data da fatura: compra de mês depois do mês da fatura é do ano anterior", () => {
  assert.equal(resolveDate(12, 9, "2026-10"), "2026-09-12");
  assert.equal(resolveDate(28, 12, "2027-01"), "2026-12-28");
  assert.equal(resolveDate(32, 1, "2026-01"), null);
});

test("leitura simples: data, descrição, parcela e valor; pagamento e estorno ficam de fora", () => {
  const text = [
    "12/09 UBER *TRIP 25,90",
    "13 SET IFOOD *BURGER KING 48,50",
    "14/09 LOJA DE MOVEIS 02/10 1.234,56",
    "15/09 PAGAMENTO RECEBIDO 3.000,00",
    "16/09 ESTORNO COMPRA 10,00",
    "linha qualquer sem valor",
  ].join("\n");
  const items = parseInvoiceText(text, "2026-10");
  assert.deepEqual(items.map((i) => [i.date, i.description, i.amount, i.installment, i.category]), [
    ["2026-09-12", "UBER *TRIP", 25.9, null, "Transporte (Uber/99)"],
    ["2026-09-13", "IFOOD *BURGER KING", 48.5, null, "Alimentação"],
    ["2026-09-14", "LOJA DE MOVEIS", 1234.56, "02/10", "Outros"],
  ]);
});

test("resposta da IA: valida data e valor, tira pagamento e mantém a regra de Uber", () => {
  const raw = 'ok {"items":[{"date":"2026-09-12","description":"UBER *TRIP","amount":25.9,"category":"Outros"},{"date":"2026-09-15","description":"PAGAMENTO EFETUADO","amount":100},{"date":"1999-01-01","description":"X","amount":5},{"date":"2026-09-20","description":"LOJA","amount":"1.500,00","installment":"01/03","category":"Ferramentas"}]}';
  const items = parseAiItems(raw, "2026-10");
  assert.deepEqual(items.map((i) => [i.description, i.amount, i.category, i.installment]), [
    ["UBER *TRIP", 25.9, "Transporte (Uber/99)", null],
    ["LOJA", 1500, "Ferramentas", "01/03"],
  ]);
  assert.deepEqual(parseAiItems("não é json", "2026-10"), []);
});

test("compra repetida é reconhecida pela data, valor e descrição", () => {
  assert.equal(expenseKey({ date: "2026-09-12", amount: 25.9, description: " Uber *Trip " }), expenseKey({ date: "2026-09-12", amount: 25.9, description: "uber *trip" }));
});
