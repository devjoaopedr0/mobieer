/**
 * Itens especiais (metalon, vidro, espelho, laca, iluminação): entram no preço
 * e no total do contrato, mas ficam fora da base da comissão — do consultor,
 * dos demais envolvidos e da reserva técnica do indicador.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRICING, commissionBaseOf, computeQuote, isSpecialItem, specialItemSuggestion, type QuoteInput } from "../src/modules/commercial/quote.rules";
import { participations, type Contract } from "../src/modules/commercial/commission-tiers.rules";

const SEM_REF = { ...DEFAULT_PRICING, defaultFreightPercent: 0, defaultTaxPercent: 0 };
const base = (items: QuoteInput["items"], extra: Partial<QuoteInput> = {}): QuoteInput => ({
  items,
  markup: 2,
  commissions: [
    { name: "Ana", role: "VENDEDOR", percent: 3 },
    { name: "Arq. Bia", role: "INDICADOR", referrerId: "r1", percent: 2 },
  ],
  payment: { method: "AVISTA" },
  ...extra,
});

test("sugestão pelo nome do ambiente, não pelo acabamento nem pela observação", () => {
  assert.equal(specialItemSuggestion({ room: "Metalon da varanda", description: "Móveis planejados" }), true);
  assert.equal(specialItemSuggestion({ room: "Vidros", description: "x" }), true);
  assert.equal(specialItemSuggestion({ room: "Espelho bisotê", description: "x" }), true);
  assert.equal(specialItemSuggestion({ room: "Iluminação", description: "x" }), true);
  assert.equal(specialItemSuggestion({ room: "Cozinha", description: "Portas de vidro reflecta" }), false);
  assert.equal(specialItemSuggestion({ room: null, description: "Painel em laca" }), true);
  // "vidraça"/"lacado" não são o item em si: só a palavra inteira conta
  assert.equal(specialItemSuggestion({ room: "Placa de vidraça", description: "" }), false);
});

test("a marca informada vale mais que a sugestão", () => {
  assert.equal(isSpecialItem({ room: "Metalon", special: false }), false);
  assert.equal(isSpecialItem({ room: "Cozinha", special: true }), true);
  assert.equal(isSpecialItem({ room: "Metalon" }), true);
});

test("item especial fica no total mas sai da base da comissão", () => {
  const c = computeQuote(base([
    { room: "Cozinha", description: "Móveis", unitCost: 6000 },
    { room: "Metalon", description: "Estrutura", unitCost: 2000 },
  ]), SEM_REF);
  const cozinha = c.items[0].total;
  const metalon = c.items[1].total;
  assert.equal(c.items[1].special, true);
  assert.equal(c.total, Math.round((cozinha + metalon) * 100) / 100);
  assert.equal(c.commissionBase, cozinha);
  assert.equal(c.specialTotal, metalon);
  const vendedor = c.commissions.find((x) => x.role === "VENDEDOR")!;
  const rt = c.commissions.find((x) => x.role === "INDICADOR")!;
  assert.equal(vendedor.amount, Math.round(cozinha * 3) / 100);
  assert.equal(rt.amount, Math.round(cozinha * 2) / 100);
});

test("sem item especial a base é o total (como antes)", () => {
  const c = computeQuote(base([{ room: "Cozinha", description: "Móveis", unitCost: 6000 }]), SEM_REF);
  assert.equal(c.commissionBase, c.total);
  assert.equal(c.specialTotal, 0);
  assert.equal(c.commissions[0].amount, Math.round(c.total * 3) / 100);
});

test("desconto se reparte na proporção entre comum e especial", () => {
  const items = [
    { room: "Cozinha", description: "Móveis", unitCost: 3000 },
    { room: "Vidros", description: "Box", unitCost: 1000 },
  ];
  const cheio = computeQuote(base(items), SEM_REF);
  const c = computeQuote(base(items, { discountPercent: 10 }), SEM_REF);
  assert.equal(c.total, Math.round(cheio.subtotal * 90) / 100);
  assert.equal(c.commissionBase, Math.round(c.total * 0.75 * 100) / 100);
});

test("tudo especial: ninguém recebe comissão", () => {
  const c = computeQuote(base([{ room: "Metalon", description: "x", unitCost: 1000, special: true }]), SEM_REF);
  assert.equal(c.commissionBase, 0);
  assert.equal(c.commissions.every((x) => x.amount === 0), true);
  assert.equal(c.commissionTotal, 0);
});

test("comissão menor melhora o resultado; o preço do cliente não muda", () => {
  const items = [
    { room: "Cozinha", description: "Móveis", unitCost: 6000 },
    { room: "Metalon", description: "x", unitCost: 2000 },
  ];
  const comum = computeQuote(base(items.map((i) => ({ ...i, special: false }))), SEM_REF);
  const esp = computeQuote(base(items), SEM_REF);
  assert.equal(esp.total, comum.total);
  assert.ok(esp.commissionTotal < comum.commissionTotal);
  assert.equal(Math.round((esp.result - comum.result) * 100), Math.round((comum.commissionTotal - esp.commissionTotal) * 100));
});

test("commissionBaseOf: limites", () => {
  assert.equal(commissionBaseOf(1000, 1000, 0), 1000);
  assert.equal(commissionBaseOf(900, 1000, 250), 675);
  assert.equal(commissionBaseOf(900, 1000, 1000), 0);
  assert.equal(commissionBaseOf(0, 0, 0), 0);
});

test("faixa do consultor usa a base da comissão; contrato antigo usa o total", () => {
  const line = { id: "l1", userId: "u1", referrerId: null, name: "Ana", role: "VENDEDOR", percent: 3 };
  const contracts: Contract[] = [
    { id: "q1", number: "ORC-1", total: 10000, commissionBase: 7500, sellerId: "u1", lines: [line] },
    { id: "q2", number: "ORC-2", total: 5000, sellerId: "u1", lines: [{ ...line, id: "l2" }] },
  ];
  const { items } = participations(contracts, "VENDEDOR");
  assert.deepEqual(items.map((i) => i.base), [7500, 5000]);
});
