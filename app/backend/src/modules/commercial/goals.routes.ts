/**
 * Metas comerciais: /api/commercial/goals
 *
 * Quem não tem commercial.read.all (o CONSULTOR) só vê a própria meta e as
 * próprias vendas — o mesmo escopo que o funil já aplica.
 * Cada consultor define a própria meta (commercial.goals.self); a da loja e a
 * dos outros consultores é da gestão (commercial.goals.manage).
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { conversionRate, goalOwner, goalProgress, monthRange, parseMonth } from "./goals.service";
import { goalSuggestion } from "./reminders.service";
import { adaptiveProposal, explainProposal, shiftMonth, type MonthStat, type PastProposal } from "./adaptive-goal.rules";
import { closedWhere } from "./closed.rules";
import { signedContracts } from "../overview/overview.routes";

const router = Router();
router.use(authenticate);

const money = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

async function monthNumbers(organizationId: string, month: string, sellerId: string | null) {
  const { from, to } = monthRange(month);
  const bySeller = sellerId ? { sellerId } : {};

  // vendido = contratos aceitos no mês da venda (a mesma conta do painel comercial e da DRE);
  // propostas = orçamentos enviados no mês, um por número (as versões não contam de novo)
  const [sales, sent, openOpps, goalRow] = await Promise.all([
    signedContracts(organizationId, from, to, sellerId),
    prisma.commercialQuote.findMany({ where: { organizationId, kind: "PADRAO", sentAt: { gte: from, lt: to }, ...bySeller }, select: { number: true }, distinct: ["number"] }),
    prisma.commercialOpportunity.findMany({
      where: { organizationId, status: { notIn: ["WON", "LOST"] }, expectedCloseAt: { gte: from, lt: to }, ...bySeller },
      select: { estimatedValue: true, probability: true },
    }),
    prisma.salesGoal.findFirst({ where: { organizationId, month, userId: sellerId } }),
  ]);

  const proposals = sent.length;
  const sold = sales.reduce((s, v) => s + v.total, 0);
  const weighted = openOpps.reduce((s, o) => s + money(o.estimatedValue) * (o.probability / 100), 0);
  const progress = goalProgress({ goal: goalRow ? money(goalRow.amount) : null, sold, weightedPipeline: weighted, month });

  return {
    ...progress,
    salesCount: sales.length,
    ticketMedio: sales.length ? Math.round(sold / sales.length) : 0,
    proposals,
    conversion: conversionRate(proposals, sales.length),
    openOpportunities: openOpps.length,
    forecastLabel: "Estimativa: vendido no mês mais as oportunidades previstas para fechar, ponderadas pela probabilidade.",
  };
}

// GET /api/commercial/goals/dashboard?month=aaaa-mm&sellerId=
router.get(
  "/dashboard",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const month = parseMonth(req.query.month);
    const organizationId = req.user!.organizationId;
    const seeAll = req.user!.permissions.includes("commercial.read.all");

    // consultor: sempre ele mesmo, ignora o sellerId pedido
    const sellerId = seeAll ? (req.query.sellerId ? String(req.query.sellerId) : null) : req.user!.id;
    const main = await monthNumbers(organizationId, month, sellerId);

    // quem vê tudo recebe também a quebra por consultor
    let bySeller: ({ sellerId: string; name: string } & Awaited<ReturnType<typeof monthNumbers>>)[] = [];
    if (seeAll && !req.query.sellerId) {
      const sellers = await prisma.user.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          // consultor sem venda ainda aparece: a gestão define a meta dele por aqui
          OR: [{ createdQuotes: { some: { status: "APPROVED" } } }, { assignedOpportunities: { some: {} } }, { salesGoals: { some: { month } } }, { role: { name: "CONSULTOR" } }],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      bySeller = await Promise.all(sellers.map(async (s) => ({ sellerId: s.id, name: s.name, ...(await monthNumbers(organizationId, month, s.id)) })));
    }

    return ok(res, { month, scope: sellerId ? "seller" : "store", ...main, bySeller });
  })
);

// GET /api/commercial/goals/suggestion?month=&profit=  meta sugerida pelas despesas fixas
router.get(
  "/suggestion",
  requirePermission("commercial.goals.manage"),
  asyncHandler(async (req, res) => {
    const month = parseMonth(req.query.month);
    const profit = z.coerce.number().min(0).max(300).catch(20).parse(req.query.profit ?? 20);
    return ok(res, await goalSuggestion(req.user!.organizationId, month, profit));
  })
);

// GET /api/commercial/goals?month=
router.get(
  "/",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const month = parseMonth(req.query.month);
    const seeAll = req.user!.permissions.includes("commercial.read.all");
    const rows = await prisma.salesGoal.findMany({
      where: { organizationId: req.user!.organizationId, month, ...(seeAll ? {} : { userId: req.user!.id }) },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return ok(res, rows.map((r) => ({ id: r.id, month: r.month, amount: money(r.amount), user: r.user })));
  })
);

// PUT /api/commercial/goals  { month, amount, userId? }  userId null = meta da loja
// (sem userId: a gestão grava a da loja; o consultor, a própria)
router.put(
  "/",
  requireAnyPermission(["commercial.goals.manage", "commercial.goals.self"]),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        month: z.string(),
        amount: z.coerce.number().min(0).max(1_000_000_000),
        userId: z.string().min(1).nullable().optional(),
      })
      .parse(req.body);
    const month = parseMonth(input.month);
    const organizationId = req.user!.organizationId;
    const userId = goalOwner(req.user!.permissions, req.user!.id, input.userId);

    if (userId) {
      const u = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
      if (!u) throw new BadRequestError("Consultor inválido");
    }

    // upsert manual: o índice único trata NULL como distinto, então a meta da loja
    // é procurada explicitamente (há um índice parcial que impede duplicar)
    const existing = await prisma.salesGoal.findFirst({ where: { organizationId, month, userId } });
    const amount = new Prisma.Decimal(input.amount.toFixed(2));
    // meta adaptativa já aprovada para o mês: a mudança vira o ajuste da equipe (alimenta a próxima proposta)
    if (userId) {
      const decided = await prisma.salesGoalProposal.findFirst({ where: { organizationId, userId, month, status: { in: ["APROVADA", "AJUSTADA"] } } });
      if (decided && Number(decided.adjustedAmount ?? decided.approvedAmount) !== input.amount) {
        await prisma.salesGoalProposal.update({ where: { id: decided.id }, data: { adjustedAmount: amount, adjustedById: req.user!.id, adjustedAt: new Date() } });
      }
    }
    const goal = existing
      ? await prisma.salesGoal.update({ where: { id: existing.id }, data: { amount } })
      : await prisma.salesGoal.create({ data: { organizationId, month, userId, amount } });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "SALES_GOAL_SET",
        entity: "SalesGoal",
        entityId: goal.id,
        details: { month, userId, from: existing ? money(existing.amount) : null, to: input.amount },
      },
    });
    return ok(res, { id: goal.id, month, amount: input.amount, userId }, "Meta salva");
  })
);

// ============================================================
// Meta adaptativa (só com histórico): proposta por vendedor, aprovada pela gestão
// ============================================================

/** Leads e fechados do vendedor mês a mês, nos 13 meses antes de `month`. */
async function sellerStats(organizationId: string, userId: string, month: string): Promise<MonthStat[]> {
  const start = monthRange(shiftMonth(month, -13)).from;
  const end = monthRange(month).from;
  const [leads, won] = await Promise.all([
    prisma.commercialLead.findMany({ where: { organizationId, sellerId: userId, enteredAt: { gte: start, lt: end } }, select: { enteredAt: true } }),
    prisma.commercialOpportunity.findMany({ where: { organizationId, sellerId: userId, ...closedWhere({ gte: start, lt: end }) }, select: { wonAt: true, estimatedValue: true } }),
  ]);
  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }).slice(0, 7);
  const map = new Map<string, MonthStat>();
  const row = (m: string) => {
    let r = map.get(m);
    if (!r) map.set(m, (r = { month: m, leads: 0, won: 0, wonValue: 0 }));
    return r;
  };
  for (const l of leads) row(key(l.enteredAt)).leads += 1;
  for (const o of won) {
    const r = row(key(o.wonAt!));
    r.won += 1;
    r.wonValue += money(o.estimatedValue);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

async function pastProposals(organizationId: string, userId: string): Promise<PastProposal[]> {
  const rows = await prisma.salesGoalProposal.findMany({ where: { organizationId, userId, status: { in: ["APROVADA", "AJUSTADA"] } }, orderBy: { month: "desc" }, take: 12 });
  return rows.map((r) => ({ month: r.month, proposed: money(r.proposedAmount), final: money(r.adjustedAmount ?? r.approvedAmount) }));
}

async function computeFor(organizationId: string, userId: string, month: string) {
  const [stats, past] = await Promise.all([sellerStats(organizationId, userId, month), pastProposals(organizationId, userId)]);
  const p = adaptiveProposal(stats, month, past);
  return { proposal: p, explanation: p.active ? explainProposal(p) : p.reason };
}

const proposalInclude = { decidedBy: { select: { name: true } }, adjustedBy: { select: { name: true } } } as const;
const serializeProposal = (r: Prisma.SalesGoalProposalGetPayload<{ include: typeof proposalInclude }>) => ({
  id: r.id,
  month: r.month,
  status: r.status,
  proposedAmount: money(r.proposedAmount),
  basis: r.basis,
  approvedAmount: r.approvedAmount == null ? null : money(r.approvedAmount),
  decidedBy: r.decidedBy?.name ?? null,
  decidedAt: r.decidedAt,
  adjustedAmount: r.adjustedAmount == null ? null : money(r.adjustedAmount),
  adjustedBy: r.adjustedBy?.name ?? null,
  adjustedAt: r.adjustedAt,
});

// GET /api/commercial/goals/adaptive?month=  por vendedor: ativa ou não, a conta, a proposta guardada e o histórico
router.get(
  "/adaptive",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const month = parseMonth(req.query.month);
    const organizationId = req.user!.organizationId;
    const manage = req.user!.permissions.includes("commercial.goals.manage");
    const sellers = manage
      ? await prisma.user.findMany({
          where: { organizationId, status: "ACTIVE", OR: [{ role: { name: "CONSULTOR" } }, { assignedOpportunities: { some: {} } }, { assignedLeads: { some: {} } }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [{ id: req.user!.id, name: req.user!.name }];
    const out = await Promise.all(
      sellers.map(async (s) => {
        const [calc, stored, history] = await Promise.all([
          computeFor(organizationId, s.id, month),
          prisma.salesGoalProposal.findFirst({ where: { organizationId, userId: s.id, month }, include: proposalInclude }),
          prisma.salesGoalProposal.findMany({ where: { organizationId, userId: s.id, month: { not: month } }, include: proposalInclude, orderBy: { month: "desc" }, take: 6 }),
        ]);
        return { userId: s.id, name: s.name, ...calc, stored: stored ? serializeProposal(stored) : null, history: history.map(serializeProposal) };
      })
    );
    return ok(res, { month, canDecide: manage, sellers: out });
  })
);

// POST /api/commercial/goals/adaptive  { month, userId } — guarda a proposta de agora para aprovação
router.post(
  "/adaptive",
  requirePermission("commercial.goals.manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ month: z.string(), userId: z.string().min(1) }).parse(req.body);
    const month = parseMonth(input.month);
    const organizationId = req.user!.organizationId;
    const u = await prisma.user.findFirst({ where: { id: input.userId, organizationId }, select: { id: true } });
    if (!u) throw new BadRequestError("Vendedor inválido");
    const { proposal } = await computeFor(organizationId, u.id, month);
    if (!proposal.active) throw new BadRequestError(proposal.reason);
    const existing = await prisma.salesGoalProposal.findFirst({ where: { organizationId, userId: u.id, month } });
    if (existing && (existing.status === "APROVADA" || existing.status === "AJUSTADA")) throw new BadRequestError("A meta deste mês já foi aprovada; para mudar, ajuste a meta do vendedor");
    const data = {
      proposedAmount: new Prisma.Decimal(proposal.amount.toFixed(2)),
      basis: proposal.basis as unknown as Prisma.InputJsonValue,
      status: "PENDENTE" as const,
      approvedAmount: null,
      decidedById: null,
      decidedAt: null,
    };
    const row = existing
      ? await prisma.salesGoalProposal.update({ where: { id: existing.id }, data, include: proposalInclude })
      : await prisma.salesGoalProposal.create({ data: { organizationId, userId: u.id, month, ...data }, include: proposalInclude });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "SALES_GOAL_PROPOSED", entity: "SalesGoalProposal", entityId: row.id, details: { month, userId: u.id, amount: proposal.amount } } });
    return ok(res, serializeProposal(row), "Proposta guardada para aprovação");
  })
);

// POST /api/commercial/goals/adaptive/:id/decide  { action: approve|reject, amount? } — a gestão decide
router.post(
  "/adaptive/:id/decide",
  requirePermission("commercial.goals.manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ action: z.enum(["approve", "reject"]), amount: z.coerce.number().min(0).max(1_000_000_000).optional() }).parse(req.body);
    const organizationId = req.user!.organizationId;
    const p = await prisma.salesGoalProposal.findFirst({ where: { id: req.params.id, organizationId } });
    if (!p) throw new BadRequestError("Proposta não encontrada");
    if (p.status !== "PENDENTE") throw new BadRequestError("Esta proposta já foi decidida");
    const now = new Date();
    if (input.action === "reject") {
      const row = await prisma.salesGoalProposal.update({ where: { id: p.id }, data: { status: "RECUSADA", decidedById: req.user!.id, decidedAt: now }, include: proposalInclude });
      await prisma.auditLog.create({ data: { userId: req.user!.id, action: "SALES_GOAL_PROPOSAL_REJECTED", entity: "SalesGoalProposal", entityId: p.id, details: { month: p.month } } });
      return ok(res, serializeProposal(row), "Proposta recusada: a meta segue manual");
    }
    const proposed = money(p.proposedAmount);
    const final = input.amount ?? proposed;
    const amount = new Prisma.Decimal(final.toFixed(2));
    const row = await prisma.$transaction(async (tx) => {
      const goal = await tx.salesGoal.findFirst({ where: { organizationId, month: p.month, userId: p.userId } });
      if (goal) await tx.salesGoal.update({ where: { id: goal.id }, data: { amount } });
      else await tx.salesGoal.create({ data: { organizationId, month: p.month, userId: p.userId, amount } });
      return tx.salesGoalProposal.update({
        where: { id: p.id },
        data: { status: final === proposed ? "APROVADA" : "AJUSTADA", approvedAmount: amount, decidedById: req.user!.id, decidedAt: now },
        include: proposalInclude,
      });
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "SALES_GOAL_PROPOSAL_APPROVED", entity: "SalesGoalProposal", entityId: p.id, details: { month: p.month, userId: p.userId, proposed, final } } });
    return ok(res, serializeProposal(row), final === proposed ? "Meta aprovada" : "Meta aprovada com ajuste");
  })
);

export default router;
