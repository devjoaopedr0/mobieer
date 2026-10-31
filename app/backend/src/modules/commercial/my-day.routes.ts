/**
 * O dia do consultor e as atividades da equipe: /api/commercial
 *
 *   GET /my-day?sellerId=            o que fazer hoje, o que atrasou, quem precisa de atenção,
 *                                    e os números do mês (pipeline, vendido, meta, comissão)
 *   GET /activities?from&to&sellerId&type&clientId&opportunityId
 *                                    atividades feitas e pendentes por consultor
 *
 * Quem não tem commercial.read.all vê só o próprio (o sellerId pedido é ignorado).
 */
import { Router } from "express";
import { z } from "zod";
import { CommercialInteractionType, type Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { signedContracts } from "../overview/overview.routes";
import { monthSummary } from "./commission-tiers.service";
import { monthRange, parseMonth } from "./goals.service";
import { buildReminders } from "./reminders.rules";
import { loadReminderData } from "./reminders.service";
import { INTERACTION_LABEL, activityBySeller, dayKey, splitAgenda, type Todo } from "./my-day.rules";

const router = Router();
router.use(authenticate);

const n = (v: unknown) => (v == null ? 0 : Number(v));
const seeAll = (perms: string[]) => perms.includes("commercial.read.all");
const OPEN_QUOTES = ["SENT", "VIEWED", "NEGOTIATION"] as const;
/** Meia-noite de Fortaleza (UTC-3) do dia aaaa-mm-dd. */
const dayStart = (day: string) => new Date(`${day}T03:00:00.000Z`);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Pendências com data: próxima ação do funil, retorno do lead, agenda e tarefas. */
async function loadTodos(organizationId: string, sellerId: string | null, until: Date): Promise<Todo[]> {
  const bySeller = sellerId ? { sellerId } : {};
  const person = { select: { id: true, name: true } } as const;
  const [opps, leads, events, tasks, diary] = await Promise.all([
    prisma.commercialOpportunity.findMany({
      where: { organizationId, ...bySeller, status: { notIn: ["WON", "LOST"] }, nextActionAt: { not: null, lt: until } },
      select: { id: true, title: true, nextAction: true, nextActionAt: true, client: { select: { name: true } }, lead: { select: { name: true } }, seller: person },
    }),
    prisma.commercialLead.findMany({
      where: { organizationId, ...bySeller, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, nextContactAt: { not: null, lt: until } },
      select: { id: true, name: true, nextContactAt: true, seller: person },
    }),
    prisma.agendaEvent.findMany({
      where: { organizationId, ...(sellerId ? { responsibleId: sellerId } : {}), status: { notIn: ["CANCELLED", "COMPLETED"] }, startAt: { gte: dayStart(dayKey(new Date())), lt: until } },
      select: { id: true, title: true, startAt: true, clientName: true, client: { select: { name: true } }, responsible: person },
    }),
    prisma.kanbanTask.findMany({
      where: { ...(sellerId ? { assigneeId: sellerId } : { OR: [{ leadId: { not: null } }, { opportunityId: { not: null } }, { quoteId: { not: null } }] }), completedAt: null, dueAt: { not: null, lt: until }, createdBy: { organizationId } },
      select: { id: true, title: true, dueAt: true, client: { select: { name: true } }, lead: { select: { name: true } }, assignee: person },
    }),
    // próximo passo anotado no diário do cliente (o do funil já está na oportunidade); só de hoje em diante
    prisma.commercialInteraction.findMany({
      where: { opportunityId: null, clientId: { not: null }, responsible: { organizationId }, ...(sellerId ? { responsibleId: sellerId } : {}), nextActionAt: { gte: dayStart(dayKey(new Date())), lt: until } },
      select: { id: true, nextAction: true, nextActionAt: true, client: { select: { id: true, name: true } }, responsible: person },
    }),
  ]);
  return [
    ...opps.map((o): Todo => ({ kind: "OPORTUNIDADE", id: o.id, title: o.nextAction || `Próxima ação — ${o.title}`, client: o.client?.name ?? o.lead?.name ?? null, at: o.nextActionAt!, link: "/comercial?aba=funil", sellerId: o.seller.id, sellerName: o.seller.name })),
    ...leads.map((l): Todo => ({ kind: "LEAD", id: l.id, title: "Retorno combinado", client: l.name, at: l.nextContactAt!, link: "/comercial?aba=leads", sellerId: l.seller?.id ?? null, sellerName: l.seller?.name ?? null })),
    ...events.map((e): Todo => ({ kind: "AGENDA", id: e.id, title: e.title, client: e.client?.name ?? e.clientName ?? null, at: e.startAt, link: "/agenda", sellerId: e.responsible.id, sellerName: e.responsible.name })),
    ...diary.map((d): Todo => ({ kind: "DIARIO", id: d.id, title: d.nextAction || "Próximo passo do diário", client: d.client?.name ?? null, at: d.nextActionAt!, link: `/clientes/${d.client?.id ?? ""}`, sellerId: d.responsible.id, sellerName: d.responsible.name })),
    ...tasks.map((t): Todo => ({ kind: "TAREFA", id: t.id, title: t.title, client: t.client?.name ?? t.lead?.name ?? null, at: t.dueAt!, link: "/minhas-tarefas", sellerId: t.assignee?.id ?? null, sellerName: t.assignee?.name ?? null })),
  ];
}

router.get(
  "/my-day",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const sellerId = seeAll(req.user!.permissions) && req.query.sellerId ? String(req.query.sellerId) : req.user!.id;
    const now = new Date();
    const today = dayKey(now);
    const month = parseMonth(undefined, now);
    const { from, to } = monthRange(month);

    const [todos, reminderData, openOpps, openQuotes, contracts, goal, doneToday, commission] = await Promise.all([
      loadTodos(organizationId, sellerId, addDays(dayStart(today), 8)),
      loadReminderData({ organizationId, sellerId }),
      prisma.commercialOpportunity.findMany({ where: { organizationId, sellerId, status: { notIn: ["WON", "LOST"] } }, select: { estimatedValue: true, probability: true } }),
      prisma.commercialQuote.findMany({
        where: { organizationId, sellerId, status: { in: [...OPEN_QUOTES] }, OR: [{ kind: "PADRAO", versions: { none: { kind: "PADRAO" } } }, { kind: "ADENDO", versions: { none: { kind: "ADENDO" } } }] },
        select: { total: true },
      }),
      signedContracts(organizationId, from, to, sellerId),
      prisma.salesGoal.findFirst({ where: { organizationId, month, userId: sellerId }, select: { amount: true } }),
      prisma.commercialInteraction.count({ where: { responsibleId: sellerId, occurredAt: { gte: dayStart(today), lt: addDays(dayStart(today), 1) } } }),
      monthSummary(organizationId, month, sellerId),
    ]);
    const sold = contracts.reduce((s, c) => s + c.total, 0);
    const goalAmount = goal ? n(goal.amount) : null;
    const mine = commission.sellers.find((s) => s.userId === sellerId);
    const seller = await prisma.user.findFirst({ where: { id: sellerId, organizationId }, select: { id: true, name: true } });

    return ok(res, {
      seller,
      today,
      agenda: splitAgenda(todos, now),
      attention: buildReminders(reminderData, now),
      doneToday,
      month: {
        month,
        sold: Math.round(sold * 100) / 100,
        contracts: contracts.length,
        goal: goalAmount,
        goalPercent: goalAmount ? Math.round((sold / goalAmount) * 1000) / 10 : null,
        missing: goalAmount ? Math.max(0, Math.round((goalAmount - sold) * 100) / 100) : null,
      },
      pipeline: {
        open: openOpps.length,
        value: openOpps.reduce((s, o) => s + n(o.estimatedValue), 0),
        weighted: Math.round(openOpps.reduce((s, o) => s + (n(o.estimatedValue) * o.probability) / 100, 0) * 100) / 100,
        quotesWaiting: openQuotes.length,
        quotesWaitingValue: openQuotes.reduce((s, q) => s + n(q.total), 0),
      },
      commission: mine ? { base: mine.base, estimated: mine.estimated, tier: mine.tier, policy: commission.policy } : null,
    });
  })
);

const dayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get(
  "/activities",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const q = z
      .object({
        from: dayParam.optional(),
        to: dayParam.optional(),
        sellerId: z.string().optional(),
        type: z.nativeEnum(CommercialInteractionType).optional(),
        status: z.enum(["all", "done", "pending", "overdue"]).default("all"),
        clientId: z.string().optional(),
        opportunityId: z.string().optional(),
      })
      .parse(req.query);
    const today = dayKey(new Date());
    const fromDay = q.from ?? today;
    const toDay = q.to ?? today;
    if (fromDay > toDay) throw new BadRequestError("Período inválido");
    const from = dayStart(fromDay);
    const to = addDays(dayStart(toDay), 1);
    const all = seeAll(req.user!.permissions);
    const sellerId = all ? q.sellerId || null : req.user!.id;

    const interactionWhere: Prisma.CommercialInteractionWhereInput = {
      occurredAt: { gte: from, lt: to },
      responsible: { organizationId },
      ...(sellerId ? { responsibleId: sellerId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}),
    };
    const bySeller = sellerId ? { sellerId } : {};
    const [done, sent, moved, won, todos] = await Promise.all([
      prisma.commercialInteraction.findMany({
        where: interactionWhere,
        orderBy: { occurredAt: "desc" },
        take: 500,
        select: {
          id: true, type: true, summary: true, result: true, occurredAt: true, nextAction: true, nextActionAt: true, responsibleId: true,
          responsible: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
        },
      }),
      prisma.commercialQuote.findMany({ where: { organizationId, ...bySeller, sentAt: { gte: from, lt: to }, ...(q.clientId ? { clientId: q.clientId } : {}) }, select: { sellerId: true } }),
      prisma.commercialHistory.findMany({
        where: { opportunityId: { not: null }, createdAt: { gte: from, lt: to }, opportunity: { organizationId, ...bySeller }, ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}) },
        select: { opportunityId: true, opportunity: { select: { sellerId: true } } },
      }),
      signedContracts(organizationId, from, to, sellerId),
      loadTodos(organizationId, sellerId, to),
    ]);

    // pendente: com data até o fim do período e ainda não feito; atrasado: antes de hoje
    const agenda = splitAgenda(todos, new Date(), 0);
    const pendingInRange = todos.filter((t) => dayKey(t.at) >= fromDay || dayKey(t.at) < today);
    const stats = activityBySeller(done.map((d) => ({ type: d.type, responsibleId: d.responsibleId })), sent);
    const contractsBySeller = new Map<string, { count: number; value: number }>();
    if (won.length) {
      const ids = await prisma.commercialQuote.findMany({ where: { id: { in: won.map((w) => w.id) } }, select: { id: true, sellerId: true } });
      const sellerOf = new Map(ids.map((r) => [r.id, r.sellerId]));
      for (const w of won) {
        const s = sellerOf.get(w.id)!;
        const cur = contractsBySeller.get(s) ?? { count: 0, value: 0 };
        contractsBySeller.set(s, { count: cur.count + 1, value: cur.value + w.total });
      }
    }
    const movedBySeller = new Map<string, Set<string>>();
    for (const m of moved) {
      const s = m.opportunity?.sellerId;
      if (!s) continue;
      movedBySeller.set(s, (movedBySeller.get(s) ?? new Set()).add(m.opportunityId!));
    }

    const ids = new Set<string>([...stats.map((s) => s.sellerId), ...contractsBySeller.keys(), ...movedBySeller.keys(), ...todos.map((t) => t.sellerId).filter((x): x is string => Boolean(x))]);
    if (sellerId) ids.add(sellerId);
    const users = await prisma.user.findMany({ where: { id: { in: [...ids] }, organizationId }, select: { id: true, name: true } });
    const sellers = users
      .filter((u) => !sellerId || u.id === sellerId)
      .map((u) => {
        const st = stats.find((s) => s.sellerId === u.id);
        const c = contractsBySeller.get(u.id);
        return {
          sellerId: u.id,
          name: u.name,
          done: st?.total ?? 0,
          contacts: st?.contacts ?? 0,
          followUps: st?.followUps ?? 0,
          meetings: st?.meetings ?? 0,
          proposals: st?.proposals ?? 0,
          byType: st?.byType ?? {},
          pending: pendingInRange.filter((t) => t.sellerId === u.id && dayKey(t.at) >= today).length,
          overdue: agenda.overdue.filter((t) => t.sellerId === u.id).length,
          opportunitiesMoved: movedBySeller.get(u.id)?.size ?? 0,
          contracts: c?.count ?? 0,
          contractsValue: Math.round((c?.value ?? 0) * 100) / 100,
        };
      })
      .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));

    const pendingList = q.status === "overdue" ? agenda.overdue : pendingInRange;
    return ok(res, {
      from: fromDay,
      to: toDay,
      scope: all ? "all" : "own",
      types: INTERACTION_LABEL,
      sellers,
      done: q.status === "pending" || q.status === "overdue" ? [] : done,
      pending: q.status === "done" ? [] : pendingList.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 300),
    });
  })
);

export default router;
