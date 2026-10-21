/**
 * Planner do financeiro: linha escrita como a loja escreve, semana e pendências por pessoa.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { byPerson, dayTotals, guessCategory, mondayOf, parseMoney, parseQuickPayable } from "../src/modules/finance/finance-planner.rules";

test("valor: com ponto de milhar, vírgula, R$ e sem centavos", () => {
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("R$ 854,00"), 854);
  assert.equal(parseMoney("138,4"), 138.4);
  assert.equal(parseMoney("720"), 720);
  assert.equal(parseMoney("abc"), null);
});

test("linha do planner: NOME: descrição valor, com soma e sem nome", () => {
  assert.deepEqual(parseQuickPayable("KELSON: 1ª quinzena outubro 854,00"), { payee: "KELSON", description: "1ª quinzena outubro", amount: 854, category: "Folha de pagamento" });
  assert.deepEqual(parseQuickPayable("David Bruno: diárias - 720,00 + 40,00"), { payee: "David Bruno", description: "diárias", amount: 760, category: "Folha de pagamento" });
  assert.deepEqual(parseQuickPayable("ajuda de custo Alefe - 138,40"), { payee: null, description: "ajuda de custo Alefe", amount: 138.4, category: "Folha de pagamento" });
  assert.deepEqual(parseQuickPayable("Douglas: acordo 800"), { payee: "Douglas", description: "acordo", amount: 800, category: "Acordos" });
  assert.ok("error" in parseQuickPayable("KELSON: quinzena"));
});

test("categoria pelo texto", () => {
  assert.equal(guessCategory("aluguel do galpão"), "Aluguel");
  assert.equal(guessCategory("conta da Enel"), "Contas de consumo");
  assert.equal(guessCategory("cadeira"), "Outros");
});

test("semana começa na segunda; domingo é da semana que termina nele", () => {
  assert.equal(mondayOf("2026-10-21"), "2026-10-19");
  assert.equal(mondayOf("2026-10-25"), "2026-10-19");
  assert.equal(mondayOf("2026-10-19"), "2026-10-19");
});

test("totais do dia e pendências por pessoa (a pagar menos o que a pessoa deve)", () => {
  const rows = [
    { id: "1", type: "DESPESA" as const, payee: "Joana", amount: 1000, paidAmount: 0, dueDay: "2026-10-21" },
    { id: "2", type: "DESPESA" as const, payee: "joana", amount: 500, paidAmount: 500, dueDay: "2026-10-21" },
    { id: "3", type: "RECEITA" as const, payee: "Joana", amount: 300, paidAmount: 0, dueDay: "2026-10-30" },
    { id: "4", type: "DESPESA" as const, payee: "Kelson", amount: 854, paidAmount: 200, dueDay: "2026-10-21" },
    { id: "5", type: "DESPESA" as const, payee: null, amount: 50, paidAmount: 0, dueDay: "2026-10-21" },
  ];
  assert.deepEqual(dayTotals(rows), { toPay: 1704, toReceive: 300, paid: 700 });
  assert.deepEqual(byPerson(rows).map((g) => [g.person, g.toPay, g.toDiscount, g.balance, g.count]), [
    ["Joana", 1000, 300, 700, 2],
    ["Kelson", 654, 0, 654, 1],
  ]);
});
