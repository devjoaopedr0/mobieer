/**
 * Painéis no formato que a loja já usava: /api/overview
 *
 *   GET /commercial               novos projetos, quentes, futuros, em atraso, vendas por mês e meta
 *   GET /finance                  fluxo previsto de 7 dias, contas que vencem hoje e vencidas, liberações
 *   GET /break-even               análise do ponto de equilíbrio pelos contratos do mês
 *                                 (?year=&month=&fixed=&profit=&tax= — sem os três últimos, usa o salvo)
 *   PUT /break-even               salva custos fixos, meta de lucro e impostos
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { fortalezaMonthStart, fortalezaToday } from "../store/store.service";
import { breakEven, cashflowAhead, contractTotals, dailyAccumulated, dueSummary, type DueRow, type SignedContract } from "./overview.rules";

const router = Router();
router.use(authenticate);

const num = (v: unknown) => Number(v ?? 0);
const todayDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const DAY = 86_400_000;

/** Orçamentos aceitos com o mês da venda (competência; sem ela, o aceite) entre `from` e `to`. */
export async function signedContracts(organizationId: string, from: Date, to: Date, sellerId?: string | null): Promise<SignedContract[]> {
  const rows = await prisma.commercialQuote.findMany({
    where: {
      organizationId,
      status: "APPROVED",
      ...(sellerId ? { sellerId } : {}),
      OR: [{ competenceDate: { gte: from, lt: to } }, { competenceDate: null, approvedAt: { gte: from, lt: to } }],
    },
    select: {
      id: true, number: true, total: true, financingFee: true, netRevenue: true, costTotal: true, freight: true, otherCosts: true,
      competenceDate: true, approvedAt: true, client: { select: { name: true } }, commissions: { select: { amount: true } },
    },
  });
  return rows.map((q) => ({
    id: q.id,
    number: q.number,
    client: q.client.name,
    day: dayOf(q.competenceDate ?? q.approvedAt ?? new Date()),
    total: num(q.total),
    financingFee: num(q.financingFee),
    netRevenue: num(q.netRevenue),
    cost: num(q.costTotal),
    commissions: q.commissions.reduce((s, c) => s + num(c.amount), 0),
    freight: num(q.freight),
    otherCosts: num(q.otherCosts),
  }));
}

// ---------------------------------------------------------------- comercial
router.get(
  "/commercial",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    // quem não vê a loja toda vê só a própria carteira
    const own = req.user!.permissions.includes("commercial.read.all") ? null : req.user!.id;
    const t = fortalezaToday();
    const from = fortalezaMonthStart(t.year, t.monthIndex);
    const to = fortalezaMonthStart(t.year, t.monthIndex + 1);
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * DAY);
    const openOpp = { organizationId: orgId, status: { notIn: ["WON" as const, "LOST" as const] }, ...(own ? { sellerId: own } : {}) };

    const [month, hot, late, future, history, goal] = await Promise.all([
      signedContracts(orgId, from, to, own),
      prisma.commercialOpportunity.findMany({ where: { ...openOpp, expectedCloseAt: { gte: now, lt: in30 } }, select: { estimatedValue: true } }),
      prisma.commercialOpportunity.findMany({ where: { ...openOpp, expectedCloseAt: { lt: now } }, select: { estimatedValue: true } }),
      // venda futura aceita que ainda não foi liberada para produzir
      prisma.commercialQuote.findMany({
        where: { organizationId: orgId, status: "APPROVED", futureSale: true, ...(own ? { sellerId: own } : {}), OR: [{ projectId: null }, { project: { futureReleasedAt: null } }] },
        select: { total: true, futureReleaseDate: true },
      }),
      signedContracts(orgId, fortalezaMonthStart(t.year, t.monthIndex - 5), to, own),
      prisma.salesGoal.findFirst({ where: { organizationId: orgId, month: `${t.year}-${String(t.monthIndex + 1).padStart(2, "0")}`, userId: own } }),
    ]);
    const sum = (l: { v: number }[]) => Math.round(l.reduce((s, x) => s + x.v, 0) * 100) / 100;
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(t.year, t.monthIndex - 5 + i, 1));
      const key = d.toISOString().slice(0, 7);
      return { month: key, total: sum(history.filter((c) => c.day.startsWith(key)).map((c) => ({ v: c.total }))) };
    });
    const sold = sum(month.map((c) => ({ v: c.total })));
    return ok(res, {
      period: { from: dayOf(from), to: dayOf(new Date(to.getTime() - 1)), today: todayDay() },
      newProjects: { count: month.length, amount: sold },
      hot: { count: hot.length, amount: sum(hot.map((o) => ({ v: num(o.estimatedValue) }))), until: dayOf(in30) },
      future: { count: future.length, amount: sum(future.map((q) => ({ v: num(q.total) }))) },
      late: { count: late.length, amount: sum(late.map((o) => ({ v: num(o.estimatedValue) }))) },
      salesByMonth: months,
      goal: goal ? { amount: num(goal.amount), sold, pct: num(goal.amount) > 0 ? Math.round((sold / num(goal.amount)) * 1000) / 10 : null } : null,
      scope: own ? "own" : "store",
    });
  })
);

// ---------------------------------------------------------------- financeiro
router.get(
  "/finance",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const today = todayDay();
    const start = new Date(new Date(`${today}T00:00:00Z`).getTime() - 31 * DAY);
    const end = new Date(new Date(`${today}T00:00:00Z`).getTime() + 8 * DAY);
    const [rows, approvals] = await Promise.all([
      prisma.financeTransaction.findMany({
        where: { organizationId: orgId, status: { in: ["PENDENTE", "PARCIAL"] }, dueDate: { gte: start, lt: end } },
        select: { type: true, amount: true, paidAmount: true, dueDate: true },
      }),
      prisma.commercialQuote.findMany({
        where: { organizationId: orgId, approvalStatus: "PENDING" },
        orderBy: { approvalRequestedAt: "asc" },
        take: 20,
        select: { id: true, number: true, total: true, approvalRequestedAt: true, client: { select: { name: true } } },
      }),
    ]);
    // vencimento gravado à meia-noite UTC: o dia é o da data, sem fuso
    const due: DueRow[] = rows.map((r) => ({ type: r.type, amount: num(r.amount), paid: num(r.paidAmount), dueDay: r.dueDate!.toISOString().slice(0, 10) }));
    return ok(res, {
      today,
      cashflow: cashflowAhead(due, today, 7),
      payables: dueSummary(due, "DESPESA", today),
      receivables: dueSummary(due, "RECEITA", today),
      approvals: approvals.map((q) => ({ id: q.id, number: q.number, client: q.client.name, total: num(q.total), since: q.approvalRequestedAt })),
    });
  })
);

// ---------------------------------------------------------------- ponto de equilíbrio
const cfgKey = (org: string) => `overview.breakeven.${org}`;
type Cfg = { fixedCost: number; profitGoal: number; taxPct: number };

export async function loadCfg(orgId: string): Promise<Cfg & { suggestedFixedCost: number; saved: boolean }> {
  const [row, fixed] = await Promise.all([
    prisma.setting.findUnique({ where: { key: cfgKey(orgId) } }),
    // sugestão: as despesas fixas cadastradas em Financeiro → Fixos
    prisma.financeRecurring.aggregate({ where: { organizationId: orgId, active: true, type: "DESPESA" }, _sum: { amount: true } }),
  ]);
  const suggestedFixedCost = num(fixed._sum.amount);
  try {
    const v = JSON.parse(row?.value ?? "") as Partial<Cfg>;
    return { fixedCost: num(v.fixedCost), profitGoal: num(v.profitGoal), taxPct: num(v.taxPct), suggestedFixedCost, saved: true };
  } catch {
    return { fixedCost: suggestedFixedCost, profitGoal: 0, taxPct: 0, suggestedFixedCost, saved: false };
  }
}

router.get(
  "/break-even",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const t = fortalezaToday();
    const q = z
      .object({
        year: z.coerce.number().int().min(2020).max(2100).default(t.year),
        month: z.coerce.number().int().min(1).max(12).default(t.monthIndex + 1),
        fixed: z.coerce.number().min(0).max(1e9).optional(),
        profit: z.coerce.number().min(0).max(1e9).optional(),
        tax: z.coerce.number().min(0).max(100).optional(),
      })
      .parse(req.query);
    const cfg = await loadCfg(orgId);
    // na simulação os valores vêm na consulta e não são salvos
    const input = { fixedCost: q.fixed ?? cfg.fixedCost, profitGoal: q.profit ?? cfg.profitGoal, taxPct: q.tax ?? cfg.taxPct };
    const from = fortalezaMonthStart(q.year, q.month - 1);
    const to = fortalezaMonthStart(q.year, q.month);
    const contracts = await signedContracts(orgId, from, to);
    const totals = contractTotals(contracts, input.taxPct);
    // sem contrato no mês, a margem de referência é a dos 3 meses anteriores
    let marginPct = totals.marginPct;
    let marginSource: "MES" | "ULTIMOS_3_MESES" | null = marginPct !== null ? "MES" : null;
    if (marginPct === null) {
      const before = contractTotals(await signedContracts(orgId, fortalezaMonthStart(q.year, q.month - 4), from), input.taxPct);
      if (before.marginPct !== null) {
        marginPct = before.marginPct;
        marginSource = "ULTIMOS_3_MESES";
      }
    }
    return ok(res, {
      year: q.year,
      month: q.month,
      config: cfg,
      input,
      totals,
      analysis: { ...breakEven(totals, input, marginPct), marginPct, marginSource },
      daily: dailyAccumulated(contracts, q.year, q.month),
      contracts: contracts.sort((a, b) => a.day.localeCompare(b.day)).map((c) => ({ id: c.id, number: c.number, client: c.client, day: c.day, total: c.total, net: c.netRevenue })),
    });
  })
);

router.put(
  "/break-even",
  requirePermission("finance.manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ fixedCost: z.coerce.number().min(0).max(1e9), profitGoal: z.coerce.number().min(0).max(1e9), taxPct: z.coerce.number().min(0).max(100) }).parse(req.body);
    const key = cfgKey(req.user!.organizationId);
    const value = JSON.stringify(input);
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return ok(res, input, "Custos fixos e meta salvos");
  })
);

export default router;
