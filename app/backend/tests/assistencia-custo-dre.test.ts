/**
 * Assistências no financeiro e na DRE: o custo (garantia, cobrados e retrabalho)
 * é despesa; o que é cobrado do cliente é receita. O que saiu do almoxarifado já
 * virou despesa na compra e não é lançado de novo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { assistanceCost, assistancesSummary, costPlan } from "../src/modules/assistance/assistance-items.rules";
import { buildDre, classifyDreLine } from "../src/modules/finance/dre.service";

const ITENS = [
  { quantity: 2, unitPrice: 50, charged: false, productId: null }, // garantia, comprado na hora: 100
  { quantity: 1, unitPrice: 80, charged: true, productId: null }, // cobrado: 80
  { quantity: 3, unitPrice: 10, charged: false, productId: "p1" }, // do almoxarifado: 30
];

test("custo: todos os itens, sem lançar de novo o que veio do estoque", () => {
  assert.deepEqual(assistanceCost(ITENS), { total: 210, doEstoque: 30, aLancar: 180 });
  assert.deepEqual(assistanceCost([]), { total: 0, doEstoque: 0, aLancar: 0 });
});

test("lançar o custo: criar, atualizar, retirar e travar o que já foi pago com outro valor", () => {
  assert.equal(costPlan(180, null).action, "CRIAR");
  assert.equal(costPlan(200, { status: "PENDENTE", amount: 180 }).action, "ATUALIZAR");
  assert.equal(costPlan(180, { status: "PAGO", amount: 180 }).action, "ATUALIZAR"); // mesmo valor: só data/forma
  assert.match(costPlan(200, { status: "PAGO", amount: 180 }).motivo!, /já foi pago/);
  assert.equal(costPlan(0, { status: "PENDENTE", amount: 180 }).action, "REMOVER");
  assert.match(costPlan(0, null).motivo!, /Nenhum custo/);
});

test("resumo do período: garantia, cobrado, retrabalho e o que falta lançar", () => {
  const s = assistancesSummary(
    [
      { internal: false, items: ITENS },
      { internal: true, items: [{ quantity: 1, unitPrice: 60, charged: false, productId: null }] },
    ],
    [
      { type: "DESPESA", amount: 180 },
      { type: "RECEITA", amount: 80 },
    ]
  );
  assert.equal(s.atendimentos, 2);
  assert.equal(s.garantia, 130);
  assert.equal(s.cobrado, 80);
  assert.equal(s.retrabalho, 60);
  assert.equal(s.custo, 270);
  assert.equal(s.doEstoque, 30);
  assert.equal(s.custoFaltando, 60); // o retrabalho ainda não foi lançado
  assert.equal(s.receitaFaltando, 0);
  assert.equal(s.resultado, -190);
});

test("DRE: custo de assistência é despesa com vendas; a cobrança é receita bruta", () => {
  assert.equal(classifyDreLine("DESPESA", "Custo de assistência técnica"), "DESPESA_VENDAS");
  assert.equal(classifyDreLine("DESPESA", "Retrabalho"), "DESPESA_VENDAS");
  assert.equal(classifyDreLine("RECEITA", "Assistência técnica"), "RECEITA_BRUTA");
  const dre = buildDre(
    [
      { type: "RECEITA", category: "Assistência técnica", amount: 80, status: "PAGO" },
      { type: "DESPESA", category: "Custo de assistência técnica", amount: 180, status: "PAGO" },
    ],
    {}
  );
  assert.equal(dre.buckets.RECEITA_BRUTA, 80);
  assert.equal(dre.buckets.DESPESA_VENDAS, 180);
  assert.equal(dre.lines.find((l) => l.key === "LUCRO_LIQUIDO")!.value, -100);
});
