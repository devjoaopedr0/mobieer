/**
 * Comissão por faixa: busca os contratos do mês, calcula a estimativa e
 * consolida a apuração (commission-tiers.rules.ts tem as contas).
 *
 * Nada de lançamento paralelo: no aceite o orçamento já gera a comissão do
 * consultor no financeiro, paga conforme a loja recebe. Consolidar o mês só
 * troca o valor dessa comissão pelo da faixa — refaz as parcelas ainda não
 * pagas da linha do consultor; o que já foi pago fica, e o pago a mais vira
 * crédito a descontar na próxima apuração.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { CATEGORY_COMMISSION, CATEGORY_SALE, planCommissions } from "./quote.finance";
import { monthRange, parseMonth } from "./goals.service";
import {
  allocate,
  applyCredit,
  canConsolidate,
  computeCommission,
  participations,
  pickPolicy,
  settleLine,
  type CommissionMode,
  type Contract,
  type ContractIssue,
  type Participation,
  type Tier,
  type TierResult,
} from "./commission-tiers.rules";

type Tx = Prisma.TransactionClient;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const D2 = (v: number) => new Prisma.Decimal(v.toFixed(2));
const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const todayDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const monthLabel = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

export const policyInclude = { tiers: { orderBy: { position: "asc" } }, createdBy: { select: { id: true, name: true } }, _count: { select: { settlements: true } } } as const;
type PolicyRow = Prisma.CommissionPolicyGetPayload<{ include: typeof policyInclude }>;

export const tiersOf = (p: { tiers: { minAmount: Prisma.Decimal; maxAmount: Prisma.Decimal | null; percent: Prisma.Decimal }[] }): Tier[] =>
  p.tiers.map((t) => ({ min: n(t.minAmount), max: t.maxAmount == null ? null : n(t.maxAmount), percent: n(t.percent) }));

export function serializePolicy(p: PolicyRow) {
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    role: p.role,
    validFrom: p.validFrom,
    active: p.active,
    notes: p.notes,
    tiers: tiersOf(p),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    /** usada em apuração: não se edita mais, cria-se outra vigência */
    locked: p._count.settlements > 0,
  };
}

/** A vigência que vale no mês (ou nenhuma: aí a comissão segue a do orçamento). */
export async function policyFor(organizationId: string, month: string) {
  const rows = await prisma.commissionPolicy.findMany({ where: { organizationId, active: true, validFrom: { lte: month } }, include: policyInclude });
  return pickPolicy(rows, month);
}

const contractSelect = {
  id: true, number: true, version: true, kind: true, total: true, commissionBase: true, sellerId: true, status: true, costTotal: true, competenceDate: true, approvedAt: true,
  client: { select: { id: true, name: true } },
  commissions: { select: { id: true, userId: true, referrerId: true, name: true, role: true, percent: true, amount: true } },
} satisfies Prisma.CommercialQuoteSelect;
type ContractRow = Prisma.CommercialQuoteGetPayload<{ select: typeof contractSelect }>;

/**
 * Contratos do mês: orçamento aceito com o mês da venda (competência; sem ela,
 * o aceite) no mês. Padrão e adendo; a versão substituída já sai cancelada.
 */
export async function contractsOfMonth(organizationId: string, month: string): Promise<ContractRow[]> {
  const { from, to } = monthRange(month);
  return prisma.commercialQuote.findMany({
    where: { organizationId, status: "APPROVED", OR: [{ competenceDate: { gte: from, lt: to } }, { competenceDate: null, approvedAt: { gte: from, lt: to } }] },
    select: contractSelect,
    orderBy: [{ competenceDate: "asc" }, { approvedAt: "asc" }],
  });
}

const toContract = (q: ContractRow): Contract => ({
  id: q.id,
  number: q.number,
  total: n(q.total),
  commissionBase: q.commissionBase == null ? null : n(q.commissionBase),
  sellerId: q.sellerId,
  lines: q.commissions.map((c) => ({ id: c.id, userId: c.userId, referrerId: c.referrerId, name: c.name, role: c.role, percent: n(c.percent) })),
});

/** Comissão paga (ou com pagamento parcial) a um consultor, nas linhas dos contratos e nos ajustes da apuração. */
async function paidTo(userId: string, quoteIds: string[], settlementId: string | null) {
  const rows = await prisma.financeTransaction.findMany({
    where: {
      category: CATEGORY_COMMISSION,
      payeeUserId: userId,
      OR: [{ originQuoteId: { in: quoteIds } }, ...(settlementId ? [{ commissionSettlementId: settlementId }] : [])],
    },
    select: { amount: true, status: true, paidAmount: true },
  });
  return {
    paid: r2(rows.reduce((s, r) => s + (r.status === "PAGO" ? n(r.amount) : n(r.paidAmount)), 0)),
    scheduled: r2(rows.reduce((s, r) => s + n(r.amount), 0)),
  };
}

export type SellerMonth = {
  userId: string;
  name: string;
  month: string;
  goal: number | null;
  base: number;
  contracts: {
    quoteId: string; number: string; version: number; kind: string; client: string; day: string; total: number; base: number;
    /** comissão do consultor gravada no orçamento hoje */
    lineAmount: number;
    /** pela faixa (estimada ou consolidada) */
    tierAmount: number | null;
    /** contrato de apuração fechada que depois foi cancelado */
    cancelledAfter?: boolean;
  }[];
  /** null: sem política de faixa no mês — vale a comissão do orçamento */
  tier: TierResult | null;
  estimated: number;
  settlement: null | { id: string; status: string; commissionTotal: number; baseTotal: number; effectivePercent: number; creditIn: number; creditOut: number; consolidatedAt: Date; consolidatedBy: string | null; adjustments: { id: string; amount: number; reason: string | null; createdAt: Date }[] };
  paid: number;
  scheduled: number;
};

const dayOf = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }) : "");

/**
 * O mês de cada consultor: contratos, faixa, estimada, consolidada e paga.
 * `onlyUserId` restringe a um consultor (o próprio, para quem não vê todos).
 */
export async function monthSummary(organizationId: string, month: string, onlyUserId: string | null) {
  const [policy, rows, goals, settlements] = await Promise.all([
    policyFor(organizationId, month),
    contractsOfMonth(organizationId, month),
    prisma.salesGoal.findMany({ where: { organizationId, month, userId: onlyUserId ?? { not: null } }, select: { userId: true, amount: true } }),
    prisma.commissionSettlement.findMany({
      where: { organizationId, month, ...(onlyUserId ? { userId: onlyUserId } : {}) },
      include: { consolidatedBy: { select: { name: true } }, items: { include: { quote: { select: { id: true, number: true, version: true, kind: true, status: true, total: true, competenceDate: true, approvedAt: true, client: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } } },
    }),
  ]);
  const role = policy?.role ?? "VENDEDOR";
  const { items, issues } = participations(rows.map(toContract), role);
  const byQuote = new Map(rows.map((q) => [q.id, q]));

  const userIds = new Set<string>(items.map((i) => i.userId));
  for (const g of goals) if (g.userId) userIds.add(g.userId);
  for (const s of settlements) userIds.add(s.userId);
  if (!onlyUserId) {
    const consultants = await prisma.user.findMany({ where: { organizationId, status: "ACTIVE", role: { name: "CONSULTOR" } }, select: { id: true } });
    for (const c of consultants) userIds.add(c.id);
  }
  if (onlyUserId) {
    for (const id of [...userIds]) if (id !== onlyUserId) userIds.delete(id);
    userIds.add(onlyUserId);
  }
  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const sellers: SellerMonth[] = [];
  for (const userId of userIds) {
    const mine = items.filter((i) => i.userId === userId);
    const s = settlements.find((x) => x.userId === userId) ?? null;
    const closed = s?.status === "CONSOLIDADA" ? s : null;
    const base = r2(mine.reduce((acc, i) => acc + i.base, 0));
    const tier = policy ? computeCommission(tiersOf(policy), policy.mode as CommissionMode, base) : null;
    const tierShares = tier ? allocate(tier.commission, mine.map((i) => i.base)) : [];
    const lineAmount = (p: Participation) => n(byQuote.get(p.quoteId)?.commissions.find((c) => c.id === p.lineId)?.amount);

    let contracts: SellerMonth["contracts"];
    if (closed) {
      // fechado: vale o que foi apurado, inclusive contrato cancelado depois
      contracts = closed.items
        .filter((it) => it.kind === "SALE" && it.quote)
        .map((it) => {
          const q = it.quote!;
          const live = mine.find((p) => p.quoteId === q.id);
          return {
            quoteId: q.id, number: q.number, version: q.version, kind: q.kind, client: q.client.name, day: dayOf(q.competenceDate ?? q.approvedAt), total: n(q.total),
            base: n(it.baseAmount), lineAmount: live ? lineAmount(live) : 0, tierAmount: n(it.commissionAmount), cancelledAfter: q.status !== "APPROVED",
          };
        });
    } else {
      contracts = mine.map((p, i) => {
        const q = byQuote.get(p.quoteId)!;
        return { quoteId: q.id, number: q.number, version: q.version, kind: q.kind, client: q.client.name, day: dayOf(q.competenceDate ?? q.approvedAt), total: n(q.total), base: p.base, lineAmount: lineAmount(p), tierAmount: tier ? tierShares[i] : null };
      });
    }
    const quoteIds = contracts.map((c) => c.quoteId);
    const { paid, scheduled } = await paidTo(userId, quoteIds, s?.id ?? null);
    const goal = goals.find((g) => g.userId === userId);
    sellers.push({
      userId,
      name: names.get(userId) ?? mine[0]?.name ?? "—",
      month,
      goal: goal ? n(goal.amount) : null,
      base: closed ? n(closed.baseTotal) : base,
      contracts,
      tier,
      estimated: tier ? tier.commission : r2(mine.reduce((acc, p) => acc + lineAmount(p), 0)),
      settlement: s && {
        id: s.id,
        status: s.status,
        commissionTotal: n(s.commissionTotal),
        baseTotal: n(s.baseTotal),
        effectivePercent: n(s.effectivePercent),
        creditIn: n(s.creditIn),
        creditOut: n(s.creditOut),
        consolidatedAt: s.consolidatedAt,
        consolidatedBy: s.consolidatedBy?.name ?? null,
        adjustments: s.items.filter((it) => it.kind === "MANUAL_ADJUSTMENT").map((it) => ({ id: it.id, amount: n(it.commissionAmount), reason: it.reason, createdAt: it.createdAt })),
      },
      paid,
      scheduled,
    });
  }
  sellers.sort((a, b) => b.base - a.base || a.name.localeCompare(b.name));

  const relevant = onlyUserId ? issues.filter((i) => rows.find((q) => q.id === i.quoteId)?.sellerId === onlyUserId || items.some((p) => p.quoteId === i.quoteId && p.userId === onlyUserId)) : issues;
  return {
    month,
    currentMonth: parseMonth(undefined),
    policy: policy && { id: policy.id, name: policy.name, mode: policy.mode, role: policy.role, validFrom: policy.validFrom, tiers: tiersOf(policy) },
    sellers,
    issues: relevant as ContractIssue[],
  };
}

/** Crédito a descontar ainda não usado: o que sobrou das apurações fechadas do consultor. */
async function creditAvailable(tx: Tx, organizationId: string, userId: string, exceptMonth: string) {
  const rows = await tx.commissionSettlement.findMany({ where: { organizationId, userId, status: "CONSOLIDADA", month: { not: exceptMonth } }, select: { creditIn: true, creditOut: true } });
  return Math.max(0, r2(rows.reduce((s, r) => s + n(r.creditOut) - n(r.creditIn), 0)));
}

/**
 * Consolida o mês de um consultor: grava a apuração com a regra copiada e troca
 * a comissão do consultor em cada contrato pela da faixa (linha do orçamento e
 * parcelas a pagar no financeiro). Refazer depois de reabrir dá o mesmo
 * resultado: as contas partem do que já está pago.
 */
export async function consolidate(organizationId: string, userId: string, month: string, actorId: string) {
  if (!canConsolidate(month, parseMonth(undefined))) throw new BadRequestError("Só dá para consolidar um mês que já terminou");
  const summary = await monthSummary(organizationId, month, userId);
  const policy = await policyFor(organizationId, month);
  if (!policy) throw new BadRequestError(`Não há faixa de comissão vigente em ${monthLabel(month)}`);
  const seller = summary.sellers.find((s) => s.userId === userId);
  if (!seller) throw new NotFoundError("Consultor sem dados no mês");
  if (seller.settlement?.status === "CONSOLIDADA") throw new BadRequestError("Esta apuração já está consolidada — reabra para refazer");
  const tier = seller.tier!;
  const contracts = seller.contracts;
  const ref = (q: { number: string; version: number }) => `Orçamento ${q.number}${q.version > 1 ? ` v${q.version}` : ""}`;
  const today = todayDay();
  const percent = Math.round(tier.effectivePercent * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const quotes = await tx.commercialQuote.findMany({ where: { id: { in: contracts.map((c) => c.quoteId) } }, select: { ...contractSelect, organizationId: true, projectId: true, clientId: true, opportunityId: true, score: true, result: true } });
    let over = 0;
    const planned: { q: (typeof quotes)[number]; entry: ReturnType<typeof planCommissions>[number]; payee: string }[] = [];

    for (const c of contracts) {
      const q = quotes.find((x) => x.id === c.quoteId)!;
      const target = c.tierAmount ?? 0;
      const line = q.commissions.find((l) => l.userId === userId && l.role === policy.role && !l.referrerId)!;
      const rows = await tx.financeTransaction.findMany({ where: { originQuoteId: q.id }, select: { id: true, type: true, category: true, amount: true, status: true, paidAmount: true, dueDate: true, payeeUserId: true, description: true }, orderBy: { dueDate: "asc" } });
      // linhas do consultor: as que sabem quem recebe e, das antigas sem isso, as com o nome dele na descrição
      const named = `comissão ${line.name} (`;
      const mineRows = rows.filter((r) => r.category === CATEGORY_COMMISSION && (r.payeeUserId === userId || (r.payeeUserId == null && (r.description ?? "").includes(named))));
      const isLocked = (r: { status: string; paidAmount: Prisma.Decimal }) => r.status === "PAGO" || n(r.paidAmount) > 0;
      const locked = r2(mineRows.filter(isLocked).reduce((s, r) => s + n(r.amount), 0));
      const { pending, over: extra } = settleLine(target, locked);
      over = r2(over + extra);
      if (rows.length) {
        await tx.financeTransaction.deleteMany({ where: { id: { in: mineRows.filter((r) => !isLocked(r)).map((r) => r.id) } } });
        if (pending > 0) {
          // o que falta da comissão acompanha o que a loja ainda vai receber
          const receivables = rows
            .filter((r) => r.type === "RECEITA" && r.category === CATEGORY_SALE && r.status !== "PAGO" && r.dueDate)
            .map((r) => ({ amount: n(r.amount), dueDay: r.dueDate!.toISOString().slice(0, 10) < today ? today : r.dueDate!.toISOString().slice(0, 10) }));
          for (const entry of planCommissions([{ name: line.name, percent, amount: pending, role: line.role }], receivables, `${ref(q)} — faixa ${monthLabel(month)}`, today)) planned.push({ q, entry, payee: line.name });
        }
      }
      // a linha do orçamento passa a valer o da faixa; o preço não muda, muda o resultado
      const delta = r2(n(line.amount) - target);
      await tx.commercialQuoteCommission.update({ where: { id: line.id }, data: { percent: D2(percent), amount: D2(target) } });
      const lines = q.commissions.map((l) => (l.id === line.id ? percent : n(l.percent)));
      const cost = n(q.costTotal);
      await tx.commercialQuote.update({
        where: { id: q.id },
        data: {
          commissionPercent: D2(lines.reduce((s, p) => s + p, 0)),
          result: D2(n(q.result) + delta),
          ...(q.score != null && cost > 0 ? { score: new Prisma.Decimal((Math.round((n(q.score) + delta / cost) * 10000) / 10000).toFixed(4)) } : {}),
        },
      });
    }

    // crédito de apurações anteriores (pago a mais, ajuste negativo) sai das parcelas novas
    const available = await creditAvailable(tx, organizationId, userId, month);
    const credited = applyCredit(planned.map((p) => p.entry.amount), available);
    const previous = await tx.commissionSettlement.findUnique({ where: { organizationId_userId_month: { organizationId, userId, month } }, include: { items: { where: { kind: "MANUAL_ADJUSTMENT" } } } });
    const negativeAdjustments = r2((previous?.items ?? []).reduce((s, it) => s + Math.max(0, -n(it.commissionAmount)), 0));
    const data = {
      policyId: policy.id,
      policySnapshot: { name: policy.name, mode: policy.mode, role: policy.role, validFrom: policy.validFrom, tiers: tiersOf(policy) } as Prisma.InputJsonValue,
      mode: policy.mode,
      baseTotal: D2(seller.base),
      commissionTotal: D2(tier.commission),
      effectivePercent: new Prisma.Decimal(tier.effectivePercent.toFixed(4)),
      creditIn: D2(credited.used),
      creditOut: D2(over + negativeAdjustments),
      status: "CONSOLIDADA" as const,
      consolidatedById: actorId,
      consolidatedAt: new Date(),
    };
    const settlement = previous
      ? await tx.commissionSettlement.update({ where: { id: previous.id }, data })
      : await tx.commissionSettlement.create({ data: { ...data, organizationId, userId, month } });
    await tx.commissionSettlementItem.deleteMany({ where: { settlementId: settlement.id, kind: "SALE" } });
    await tx.commissionSettlementItem.createMany({
      data: contracts.map((c) => ({ settlementId: settlement.id, kind: "SALE" as const, quoteId: c.quoteId, baseAmount: D2(c.base), commissionAmount: D2(c.tierAmount ?? 0), createdById: actorId })),
    });
    const toCreate = planned.map((p, i) => ({ ...p, amount: credited.amounts[i] })).filter((p) => p.amount > 0);
    if (toCreate.length) {
      await tx.financeTransaction.createMany({
        data: toCreate.map(({ q, entry, amount, payee }) => ({
          organizationId,
          type: "DESPESA" as const,
          category: CATEGORY_COMMISSION,
          amount: D2(amount),
          date: q.competenceDate ?? q.approvedAt ?? new Date(),
          dueDate: dayToDate(entry.dueDay),
          description: entry.description,
          status: "PENDENTE" as const,
          method: "Comissão",
          originQuoteId: q.id,
          originOpportunityId: q.opportunityId,
          clientId: q.clientId,
          projectId: q.projectId,
          purchaseRef: `${q.number}${q.version > 1 ? ` v${q.version}` : ""}`,
          payee,
          payeeUserId: userId,
          commissionSettlementId: settlement.id,
          createdById: actorId,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId, action: "COMMISSION_SETTLEMENT_CONSOLIDATED", entity: "CommissionSettlement", entityId: settlement.id,
        details: { month, userId, base: seller.base, commission: tier.commission, effectivePercent: tier.effectivePercent, policyId: policy.id, mode: policy.mode, creditIn: credited.used, creditOut: over + negativeAdjustments, financeLines: toCreate.length, reconsolidated: Boolean(previous) },
      },
    });
    return { id: settlement.id, commission: tier.commission, base: seller.base, financeLines: toCreate.length, creditIn: credited.used, creditOut: r2(over + negativeAdjustments) };
  }, { timeout: 60_000 });
}

/** Contrato numa apuração fechada: comissão e mês da venda não mudam por fora. */
export async function settledQuote(quoteId: string) {
  return prisma.commissionSettlementItem.findFirst({
    where: { quoteId, kind: "SALE", settlement: { status: "CONSOLIDADA" } },
    select: { settlement: { select: { month: true, user: { select: { name: true } } } } },
  });
}

/** Algum consultor do contrato já tem o mês fechado? */
export async function closedMonthFor(organizationId: string, month: string, userIds: string[]) {
  if (!userIds.length) return null;
  return prisma.commissionSettlement.findFirst({ where: { organizationId, month, status: "CONSOLIDADA", userId: { in: userIds } }, select: { user: { select: { name: true } } } });
}
