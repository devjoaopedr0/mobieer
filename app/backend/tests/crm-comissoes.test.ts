/**
 * CRM — Etapa 5: comissões por vendedor a partir das linhas do orçamento.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { commissionsBySeller, seesAllCommissions } from "../src/modules/commercial/commissions.rules";

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-10-31T23:59:59Z");

test("prevista = orçamentos em aberto; a receber = aceitos no período", () => {
  const rows = commissionsBySeller(
    [
      { userId: "ana", name: "Ana", amount: 500, quoteStatus: "SENT", approvedAt: null },
      { userId: "ana", name: "Ana", amount: 1200, quoteStatus: "APPROVED", approvedAt: new Date("2026-10-10T12:00:00Z") },
      // aceito fora do período: não entra
      { userId: "ana", name: "Ana", amount: 900, quoteStatus: "APPROVED", approvedAt: new Date("2026-09-10T12:00:00Z") },
      // rascunho não é venda em aberto
      { userId: "ana", name: "Ana", amount: 300, quoteStatus: "DRAFT", approvedAt: null },
      { userId: null, name: "Carlos ", amount: 200, quoteStatus: "NEGOTIATION", approvedAt: null },
      { userId: null, name: "carlos", amount: 100, quoteStatus: "VIEWED", approvedAt: null },
    ],
    from,
    to
  );
  assert.deepEqual(rows.map((r) => [r.name.trim(), r.prevista, r.aReceber, r.vendas]), [
    ["Ana", 500, 1200, 1],
    ["Carlos", 300, 0, 0],
  ]);
});

test("quem vê todas: financeiro ou gestão; o vendedor, só as dele", () => {
  assert.equal(seesAllCommissions(["finance.read"]), true);
  assert.equal(seesAllCommissions(["organization.manage"]), true);
  assert.equal(seesAllCommissions(["commercial.commissions.manage"]), true);
  assert.equal(seesAllCommissions(["commercial.read", "commercial.read.all", "production.steps"]), false);
});
