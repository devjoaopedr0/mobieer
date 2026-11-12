/**
 * Pedidos da loja (nov/2026): escolher os ambientes que saem no orçamento sem
 * apagar, e o contrato refeito sair como 377-1 com o aviso de substituição.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRICING, QuoteRuleError, computeQuote, type QuoteInput } from "../src/modules/commercial/quote.rules";
import { DEFAULT_REPLACEMENT_NOTICE, docStartsWith, normalizeNotice, replacementNotice, revisionNumber } from "../src/modules/templates/contract-revision.rules";

const SEM_REF = { ...DEFAULT_PRICING, defaultFreightPercent: 0, defaultTaxPercent: 0 };
const quote = (items: QuoteInput["items"]): QuoteInput => ({
  items,
  markup: 2,
  commissions: [{ name: "Ana", role: "VENDEDOR", percent: 3 }],
  payment: { method: "AVISTA" },
});

test("ambiente desmarcado fica guardado com o preço, mas fora do total, do custo e da comissão", () => {
  const todos = computeQuote(quote([{ room: "Cozinha", description: "x", unitCost: 6000 }, { room: "Varanda", description: "x", unitCost: 2000 }]), SEM_REF);
  const sem = computeQuote(quote([{ room: "Cozinha", description: "x", unitCost: 6000 }, { room: "Varanda", description: "x", unitCost: 2000, included: false }]), SEM_REF);
  assert.equal(sem.items.length, 2);
  assert.equal(sem.items[1].included, false);
  assert.equal(sem.items[1].total, todos.items[1].total);
  assert.equal(sem.subtotal, todos.items[0].total);
  assert.equal(sem.total, todos.items[0].total);
  assert.equal(sem.costTotal, 6000);
  assert.equal(sem.commissions[0].amount, Math.round(todos.items[0].total * 3) / 100);
});

test("sem a marca, o ambiente sai no orçamento (como antes)", () => {
  const c = computeQuote(quote([{ room: "Cozinha", description: "x", unitCost: 1000 }]), SEM_REF);
  assert.equal(c.items[0].included, true);
});

test("pelo menos um ambiente precisa sair no orçamento", () => {
  assert.throws(() => computeQuote(quote([{ room: "Cozinha", description: "x", unitCost: 1000, included: false }]), SEM_REF), QuoteRuleError);
});

test("ambiente especial desmarcado não entra na base nem no especial", () => {
  const c = computeQuote(quote([{ room: "Cozinha", description: "x", unitCost: 6000 }, { room: "Metalon", description: "x", unitCost: 2000, included: false }]), SEM_REF);
  assert.equal(c.specialTotal, 0);
  assert.equal(c.commissionBase, c.total);
});

test("número do contrato refeito: 377, 377-1, 377-2", () => {
  assert.equal(revisionNumber("377", 1), "377");
  assert.equal(revisionNumber("377", 2), "377-1");
  assert.equal(revisionNumber("377", 3), "377-2");
});

test("aviso de substituição preenchido; marcador desconhecido fica à vista", () => {
  const when = new Date("2026-11-05T15:00:00Z");
  const t = replacementNotice(DEFAULT_REPLACEMENT_NOTICE, { previous: "377", previousDate: when, current: "377-1" });
  assert.match(t, /Contrato Nº 377, emitido em 05\/11\/2026/);
  assert.equal(replacementNotice("{{contrato.numero}} substitui {{contrato.anterior}} {{x.y}}", { previous: "377-1", previousDate: when, current: "377-2" }), "377-2 substitui 377-1 {{x.y}}");
});

test("aviso configurado: vazio volta ao padrão e é limitado", () => {
  assert.equal(normalizeNotice("  "), DEFAULT_REPLACEMENT_NOTICE);
  assert.equal(normalizeNotice(null), DEFAULT_REPLACEMENT_NOTICE);
  assert.equal(normalizeNotice(" Texto da loja "), "Texto da loja");
  assert.equal(normalizeNotice("a".repeat(3000)).length, 2000);
});

test("texto editado que já começa com o aviso não o recebe de novo", () => {
  const aviso = "Este contrato substitui o 377.";
  assert.equal(docStartsWith([{ t: "p", runs: [{ text: "Este contrato " }, { text: "substitui o 377." }] }, { t: "p", runs: [{ text: "Cláusula 1" }] }], aviso), true);
  assert.equal(docStartsWith([{ t: "p", runs: [{ text: "Cláusula 1" }] }], aviso), false);
  assert.equal(docStartsWith([{ t: "table" }], aviso), false);
});
