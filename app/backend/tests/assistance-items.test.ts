/**
 * Itens da assistência: tudo na garantia por padrão; só o marcado é cobrado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chargePlan, isInternalKind, itemKindLabel, itemTotals, lineTotal } from "../src/modules/assistance/assistance-items.rules";

test("totais: garantia, cobrado e total", () => {
  const t = itemTotals([
    { quantity: 2, unitPrice: 45.5, charged: false }, // dobradiças na garantia
    { quantity: 1, unitPrice: 120, charged: true }, // corrediça nova, cobrada
    { quantity: 1.5, unitPrice: 80, charged: false }, // mão de obra na garantia
  ]);
  assert.deepEqual(t, { garantia: 211, cobrado: 120, total: 331 });
  assert.equal(lineTotal({ quantity: 3, unitPrice: 0.1 }), 0.3);
  assert.deepEqual(itemTotals([]), { garantia: 0, cobrado: 0, total: 0 });
});

test("cobrança: cria, atualiza, retira, e não mexe no que já foi recebido", () => {
  assert.deepEqual(chargePlan(120, null), { action: "CRIAR" });
  assert.deepEqual(chargePlan(150, { status: "PENDENTE", amount: 120 }), { action: "ATUALIZAR" });
  assert.deepEqual(chargePlan(0, { status: "PENDENTE", amount: 120 }), { action: "REMOVER" });
  assert.equal(chargePlan(0, null).action, "NADA");
  assert.match(chargePlan(0, null).motivo!, /garantia/);
  assert.match(chargePlan(200, { status: "PAGO", amount: 120 }).motivo!, /já foi recebida/);
});

test("registro interno: erro e retrabalho não vão para o cliente", () => {
  assert.equal(isInternalKind("RETRABALHO"), true);
  assert.equal(isInternalKind("ERRO_INTERNO"), true);
  assert.equal(isInternalKind("ASSISTENCIA"), false);
  assert.equal(isInternalKind(null), false);
  assert.equal(itemKindLabel("FERRAGEM"), "Ferragem / acessório");
  assert.equal(itemKindLabel("???"), "Outro");
});

test("ordem de serviço: sai um PDF, com itens ou sem, de cliente e de retrabalho", async () => {
  const { serviceOrderPdf } = await import("../src/modules/assistance/assistance-items.routes");
  const base = {
    number: "AST-00001", kind: "ASSISTENCIA", internal: false, createdAt: new Date("2026-10-14T12:00:00Z"), title: "Porta desalinhada", roomLabel: "Cozinha", problemType: "Dobradiça",
    scheduledAt: new Date("2026-10-16T13:00:00Z"), description: "A porta do aéreo não fecha.",
    client: { id: "c", name: "Neila Souza", phone: "85 99999-0000", document: null, street: "Rua A", addressNumber: "10", complement: null, district: "Aldeota", city: "Fortaleza", state: "CE", address: null, condominium: null },
    project: { id: "p", code: "PRJ-0001", name: "Closet" }, assignee: { name: "Guilherme" },
    items: [{ id: "1", ticketId: "t", kind: "FERRAGEM", description: "Dobradiça com amortecedor", quantity: 2 as never, unitPrice: 45.5 as never, charged: false, position: 0, createdAt: new Date() }],
  };
  for (const t of [base, { ...base, items: [] }, { ...base, kind: "RETRABALHO", internal: true }]) {
    const pdf = await serviceOrderPdf(t as never);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 2000);
  }
});
