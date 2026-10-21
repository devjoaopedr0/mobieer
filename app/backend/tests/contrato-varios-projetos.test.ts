/**
 * Um contrato para vários projetos do mesmo cliente: os orçamentos se juntam.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mergeOrders, type ContractOrder } from "../src/modules/templates/contract-order";

const order = (o: Partial<ContractOrder>): ContractOrder => ({
  quoteId: "q", number: "ORC-1", clientId: "c", projectId: "p", seller: "Ana", soldAt: new Date("2026-10-01T12:00:00Z"),
  items: [], subtotal: 0, discount: 0, total: 0, condition: "", method: "PIX", installments: [], deliveryText: "45 dias úteis", deliveryDays: 45, ...o,
});
const item = (room: string, total: number) => ({ code: "AA", room, line: "RESIDENCIAL", deadline: "45 dias úteis", total, corpo: "", porta: "", puxador: "", obs: "" });
const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("dois projetos: ambientes em sequência, valores somados e entradas do mesmo dia juntas", () => {
  const a = order({ number: "ORC-1", items: [item("Guarda-roupa Kelvia", 9471.41)], subtotal: 9471.41, total: 9471.41, condition: "à vista", installments: [{ label: "ENTRADA", due: d("2026-10-21"), amount: 4000 }, { label: "PARC 1", due: d("2026-11-21"), amount: 5471.41 }] });
  const b = order({ number: "ORC-2", seller: "Joana", items: [item("Guarda-roupa Keila", 7501.64)], subtotal: 7501.64, total: 7501.64, deliveryDays: 60, condition: "boleto", installments: [{ label: "ENTRADA", due: d("2026-10-21"), amount: 1500 }, { label: "PARC 1", due: d("2026-11-10"), amount: 6001.64 }] });
  const m = mergeOrders([a, b]);
  assert.equal(m.number, "ORC-1 + ORC-2");
  assert.deepEqual(m.items.map((i) => [i.code, i.room]), [["AA", "Guarda-roupa Kelvia"], ["AB", "Guarda-roupa Keila"]]);
  assert.equal(m.total, 16973.05);
  assert.equal(m.seller, "Ana, Joana");
  assert.equal(m.deliveryDays, 60);
  assert.deepEqual(m.installments.map((p) => [p.label, p.due?.toISOString().slice(0, 10), p.amount]), [
    ["ENTRADA", "2026-10-21", 5500],
    ["PARC 1", "2026-11-10", 6001.64],
    ["PARC 2", "2026-11-21", 5471.41],
  ]);
  assert.equal(m.condition, "ORC-1: à vista | ORC-2: boleto");
});

test("um projeto só: o orçamento fica como está", () => {
  const a = order({ number: "ORC-9" });
  assert.equal(mergeOrders([a]), a);
});
