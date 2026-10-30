/**
 * Comissão do consultor por faixa do total vendido no mês: progressivo (padrão)
 * e percentual da faixa sobre o total, limites, vigência, rateio por contrato,
 * crédito a descontar e contrato contado uma vez só.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  TierRuleError,
  allocate,
  applyCredit,
  canConsolidate,
  computeCommission,
  participations,
  pickPolicy,
  settleLine,
  tierIndex,
  validateTiers,
  type Contract,
  type Tier,
} from "../src/modules/commercial/commission-tiers.rules";

// o exemplo do cliente: até 50 mil 1%, até 100 mil 2%, acima 3%
const TIERS: Tier[] = [
  { min: 0, max: 50_000, percent: 1 },
  { min: 50_000, max: 100_000, percent: 2 },
  { min: 100_000, max: null, percent: 3 },
];

test("abaixo da primeira faixa: 1% nos dois modos", () => {
  for (const mode of ["PROGRESSIVE", "FLAT_ON_TOTAL"] as const) {
    const r = computeCommission(TIERS, mode, 30_000);
    assert.equal(r.commission, 300);
    assert.equal(r.tier.index, 0);
    assert.deepEqual(r.next, { index: 1, min: 50_000, percent: 2, missing: 20_000.01 });
  }
});

test("exatamente no limite fica na faixa de baixo; 1 centavo acima já sobe", () => {
  assert.equal(tierIndex(validateTiers(TIERS), 50_000), 0);
  assert.equal(tierIndex(validateTiers(TIERS), 50_000.01), 1);
  const at = computeCommission(TIERS, "FLAT_ON_TOTAL", 50_000);
  assert.equal(at.commission, 500);
  assert.equal(at.next?.missing, 0.01);
  const above = computeCommission(TIERS, "FLAT_ON_TOTAL", 50_000.01);
  assert.equal(above.percent, 2);
  assert.equal(above.commission, 1000);
  // progressivo: o centavo acima paga 2% só sobre ele
  assert.equal(computeCommission(TIERS, "PROGRESSIVE", 50_000.01).commission, 500);
});

test("exemplo do João: 20 + 15 + 25 mil = 60 mil", () => {
  const prog = computeCommission(TIERS, "PROGRESSIVE", 20_000 + 15_000 + 25_000);
  // 50.000 × 1% + 10.000 × 2%
  assert.equal(prog.commission, 700);
  assert.equal(prog.percent, 2);
  assert.equal(prog.effectivePercent, 1.1667);
  assert.equal(prog.next?.missing, 40_000.01);
  // percentual da faixa sobre o total
  assert.equal(computeCommission(TIERS, "FLAT_ON_TOTAL", 60_000).commission, 1200);
});

test("última faixa (sem teto): não há próxima", () => {
  const prog = computeCommission(TIERS, "PROGRESSIVE", 150_000);
  assert.equal(prog.commission, 500 + 1000 + 1500);
  assert.equal(prog.next, null);
  assert.equal(computeCommission(TIERS, "FLAT_ON_TOTAL", 150_000).commission, 4500);
});

test("sem venda: zero, na primeira faixa", () => {
  const r = computeCommission(TIERS, "PROGRESSIVE", 0);
  assert.equal(r.commission, 0);
  assert.equal(r.tier.index, 0);
  assert.equal(r.effectivePercent, 1);
});

test("faixas: começo em zero, sem buraco, sem sobreposição, percentual válido", () => {
  assert.throws(() => validateTiers([]), TierRuleError);
  assert.throws(() => validateTiers([{ min: 10, max: null, percent: 1 }]), /começa em R\$ 0,00/);
  assert.throws(() => validateTiers([{ min: 0, max: 50_000, percent: 1 }, { min: 60_000, max: null, percent: 2 }]), /intervalo sem faixa/);
  assert.throws(() => validateTiers([{ min: 0, max: 50_000, percent: 1 }, { min: 40_000, max: null, percent: 2 }]), /sobrepõe/);
  assert.throws(() => validateTiers([{ min: 0, max: null, percent: 1 }, { min: 50_000, max: null, percent: 2 }]), /só a última/);
  assert.throws(() => validateTiers([{ min: 0, max: 0, percent: 1 }]), /maior que o inicial/);
  assert.throws(() => validateTiers([{ min: 0, max: null, percent: 60 }]), /entre 0% e 50%/);
  // a ordem digitada não importa
  assert.deepEqual(validateTiers([...TIERS].reverse()).map((t) => t.percent), [1, 2, 3]);
});

test("vigência: vale a ativa com o maior início até o mês; mudança futura não mexe no passado", () => {
  const jan = { id: "jan", validFrom: "2026-01", active: true, createdAt: new Date("2026-01-01") };
  const mar = { id: "mar", validFrom: "2026-03", active: true, createdAt: new Date("2026-02-20") };
  const off = { id: "off", validFrom: "2026-02", active: false, createdAt: new Date("2026-02-01") };
  assert.equal(pickPolicy([jan, mar, off], "2026-01")?.id, "jan");
  assert.equal(pickPolicy([jan, mar, off], "2026-02")?.id, "jan");
  assert.equal(pickPolicy([jan, mar, off], "2026-03")?.id, "mar");
  assert.equal(pickPolicy([mar], "2026-01"), null);
  // regra de janeiro (1%) x de março (1,5%) para o mesmo total
  const janRule: Tier[] = [{ min: 0, max: null, percent: 1 }];
  const marRule: Tier[] = [{ min: 0, max: null, percent: 1.5 }];
  assert.equal(computeCommission(janRule, "PROGRESSIVE", 40_000).commission, 400);
  assert.equal(computeCommission(marRule, "PROGRESSIVE", 40_000).commission, 600);
});

const contract = (id: string, total: number, sellerId: string, lines: [string | null, number, string?][]): Contract => ({
  id,
  number: id.toUpperCase(),
  total,
  sellerId,
  lines: lines.map(([userId, percent, role], i) => ({ id: `${id}-${i}`, userId, referrerId: null, name: userId ?? "sem usuário", role: role ?? "VENDEDOR", percent })),
});

test("várias vendas e consultores diferentes: cada um soma só as suas", () => {
  const { items } = participations(
    [contract("a", 20_000, "joao", [["joao", 3]]), contract("b", 15_000, "joao", [["joao", 3]]), contract("c", 25_000, "joao", [["joao", 3]]), contract("d", 80_000, "maria", [["maria", 3]])],
    "VENDEDOR"
  );
  const sum = (u: string) => items.filter((i) => i.userId === u).reduce((s, i) => s + i.base, 0);
  assert.equal(sum("joao"), 60_000);
  assert.equal(sum("maria"), 80_000);
});

test("o mesmo contrato não conta duas vezes; projetista e indicador não entram na faixa", () => {
  const a = contract("a", 20_000, "joao", [["joao", 3], ["proj", 0.5, "PROJETISTA"]]);
  const { items } = participations([a, a], "VENDEDOR");
  assert.equal(items.length, 1);
  assert.equal(items[0].base, 20_000);
  const rt: Contract = { ...a, id: "rt", lines: [{ id: "x", userId: "joao", referrerId: "arq", name: "Arquiteto", role: "VENDEDOR", percent: 5 }] };
  assert.equal(participations([rt], "VENDEDOR").items.length, 0);
});

test("dois consultores no contrato: a base é dividida pelo % de cada um", () => {
  const { items } = participations([contract("a", 30_000, "joao", [["joao", 2], ["maria", 1]])], "VENDEDOR");
  assert.deepEqual(items.map((i) => [i.userId, i.base]), [["joao", 20_000], ["maria", 10_000]]);
});

test("avisos: contrato sem consultor e consultor diferente do vendedor", () => {
  const { items, issues } = participations([contract("a", 10_000, "joao", [[null, 3]]), contract("b", 10_000, "joao", [["maria", 3]])], "VENDEDOR");
  assert.deepEqual(issues.map((i) => i.kind), ["SEM_CONSULTOR", "CONSULTOR_DIFERENTE"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].userId, "maria");
});

test("venda cancelada antes de fechar o mês sai da conta e muda a faixa", () => {
  // a fonte só traz contrato aceito: o cancelado simplesmente não vem
  const all = [contract("a", 40_000, "joao", [["joao", 3]]), contract("b", 20_000, "joao", [["joao", 3]])];
  const before = participations(all, "VENDEDOR").items.reduce((s, i) => s + i.base, 0);
  const after = participations(all.slice(0, 1), "VENDEDOR").items.reduce((s, i) => s + i.base, 0);
  assert.equal(computeCommission(TIERS, "FLAT_ON_TOTAL", before).percent, 2);
  assert.equal(computeCommission(TIERS, "FLAT_ON_TOTAL", after).percent, 1);
});

test("rateio da comissão do mês pelos contratos fecha no centavo", () => {
  const parts = allocate(700, [20_000, 15_000, 25_000]);
  assert.deepEqual(parts, [233.33, 175, 291.67]);
  assert.equal(Math.round(parts.reduce((s, v) => s + v, 0) * 100), 70_000);
  assert.deepEqual(allocate(10, [0, 0]), [5, 5]);
});

test("comissão já paga: paga só o que falta; pago a mais vira crédito", () => {
  assert.deepEqual(settleLine(1200, 600), { pending: 600, over: 0 });
  assert.deepEqual(settleLine(700, 900), { pending: 0, over: 200 });
  assert.deepEqual(settleLine(700, 700), { pending: 0, over: 0 });
});

test("crédito a descontar sai das últimas parcelas e não fica negativo", () => {
  assert.deepEqual(applyCredit([100, 100, 50], 120), { amounts: [100, 30, 0], used: 120 });
  assert.deepEqual(applyCredit([30], 100), { amounts: [0], used: 30 });
  assert.deepEqual(applyCredit([30], 0), { amounts: [30], used: 0 });
});

test("só consolida mês encerrado", () => {
  assert.equal(canConsolidate("2026-09", "2026-10"), true);
  assert.equal(canConsolidate("2026-10", "2026-10"), false);
  assert.equal(canConsolidate("2025-12", "2026-01"), true);
});

test("consultor só vê a própria comissão, mesmo pedindo a de outro; gestão e financeiro escolhem", async () => {
  const { commissionViewer } = await import("../src/modules/commercial/commissions.rules");
  assert.equal(commissionViewer(["commercial.read"], "joao", "maria"), "joao");
  assert.equal(commissionViewer(["commercial.read"], "joao", null), "joao");
  assert.equal(commissionViewer(["commercial.read", "commercial.commissions.manage"], "g", "maria"), "maria");
  assert.equal(commissionViewer(["finance.read"], "f", null), null);
});

test("comissão no financeiro sabe quem recebe; reserva técnica não", async () => {
  const { planCommissions } = await import("../src/modules/commercial/quote.finance");
  const out = planCommissions(
    [
      { name: "João", percent: 3, amount: 300, role: "VENDEDOR", userId: "joao" },
      { name: "Arq. Ana", percent: 5, amount: 500, role: "INDICADOR", referrerId: "ana", userId: null },
    ],
    [{ amount: 5000, dueDay: "2026-11-01", index: 0 }, { amount: 5000, dueDay: "2026-12-01", index: 1 }],
    "Orçamento 100",
    "2026-10-30"
  );
  assert.deepEqual(out.filter((e) => e.category === "Comissão de venda").map((e) => [e.payeeUserId, e.amount]), [["joao", 150], ["joao", 150]]);
  assert.ok(out.filter((e) => e.category === "Reserva técnica").every((e) => e.payeeUserId === null));
});
