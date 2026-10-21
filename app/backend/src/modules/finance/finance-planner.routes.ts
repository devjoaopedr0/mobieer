/**
 * Planner do financeiro: /api/finance/planner
 *
 *   GET   /planner?week=AAAA-MM-DD   contas da semana por dia (segunda a sábado; domingo vai no sábado)
 *                                    e as atrasadas de antes da semana
 *   GET   /planner/people            pendências por pessoa (a pagar, a descontar, saldo)
 *   GET   /planner/list              lista com filtro, para somar o que estiver marcado
 *   POST  /planner/quick             { day, text, type } — "NOME: descrição valor" vira uma conta
 *   PATCH /planner/:id               { dueDay?, payee? } — arrastar para outro dia, trocar a pessoa
 *
 * Pagar é o mesmo "Marcar pago" dos lançamentos (POST /finance/documents/:id/payments).
 */
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { addDays, byPerson, dayTotals, mondayOf, openOf, parseQuickPayable, type PlannerRow } from "./finance-planner.rules";

const router = Router();
router.use(authenticate);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
// vencimento gravado à meia-noite UTC: o dia é o da data
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

const select = {
  id: true, type: true, category: true, description: true, payee: true, amount: true, paidAmount: true, dueDate: true, status: true, method: true,
  supplier: { select: { name: true } }, client: { select: { name: true } },
} satisfies Prisma.FinanceTransactionSelect;
type Row = Prisma.FinanceTransactionGetPayload<{ select: typeof select }>;

const view = (r: Row, now: string) => {
  const amount = Number(r.amount);
  const paidAmount = Number(r.paidAmount);
  const dueDay = dayOf(r.dueDate);
  const open = openOf({ amount, paidAmount });
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    description: r.description,
    // sem pessoa escrita, vale o fornecedor (despesa) ou o cliente (receita)
    payee: r.payee ?? (r.type === "DESPESA" ? r.supplier?.name : r.client?.name) ?? null,
    amount,
    paidAmount,
    open,
    status: r.status,
    method: r.method,
    dueDay,
    late: open > 0 && dueDay !== null && dueDay < now,
  };
};
const asRow = (v: ReturnType<typeof view>): PlannerRow => ({ id: v.id, type: v.type, payee: v.payee, amount: v.amount, paidAmount: v.paidAmount, dueDay: v.dueDay });
const live = { status: { not: "CANCELADO" as const } };

router.get(
  "/planner",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const now = today();
    const week = mondayOf(typeof req.query.week === "string" && dayRe.test(req.query.week) ? req.query.week : now);
    const end = addDays(week, 7);
    const [rows, late] = await Promise.all([
      prisma.financeTransaction.findMany({ where: { organizationId: orgId, ...live, dueDate: { gte: dayToDate(week), lt: dayToDate(end) } }, select, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] }),
      // o que venceu antes desta semana e continua em aberto
      prisma.financeTransaction.findMany({
        where: { organizationId: orgId, status: { in: ["PENDENTE", "PARCIAL"] }, dueDate: { lt: dayToDate(week), gte: dayToDate(addDays(week, -90)) } },
        select,
        orderBy: { dueDate: "asc" },
        take: 200,
      }),
    ]);
    const items = rows.map((r) => view(r, now));
    // segunda a sábado; o domingo entra no sábado
    const days = Array.from({ length: 6 }, (_, i) => {
      const day = addDays(week, i);
      const list = items.filter((x) => x.dueDay === day || (i === 5 && x.dueDay === addDays(week, 6)));
      return { day, items: list, totals: dayTotals(list.map(asRow)) };
    });
    const lateItems = late.map((r) => view(r, now));
    return ok(res, { week, today: now, days, totals: dayTotals(items.map(asRow)), late: { items: lateItems, totals: dayTotals(lateItems.map(asRow)) } });
  })
);

router.get(
  "/planner/people",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const now = today();
    const rows = await prisma.financeTransaction.findMany({
      where: { organizationId: req.user!.organizationId, status: { in: ["PENDENTE", "PARCIAL"] } },
      select,
      orderBy: { dueDate: "asc" },
      take: 3000,
    });
    const items = rows.map((r) => view(r, now));
    const groups = byPerson(items.map(asRow)).map((g) => ({ ...g, items: items.filter((i) => i.payee?.trim().toLowerCase() === g.person.toLowerCase()) }));
    return ok(res, { people: groups });
  })
);

router.get(
  "/planner/list",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        from: z.string().regex(dayRe).optional(),
        to: z.string().regex(dayRe).optional(),
        type: z.enum(["RECEITA", "DESPESA"]).optional(),
        status: z.enum(["ABERTO", "PAGO", "TODOS"]).default("ABERTO"),
        q: z.string().trim().max(80).optional(),
      })
      .parse(req.query);
    const now = today();
    const text = q.q ? { OR: [{ description: { contains: q.q, mode: "insensitive" as const } }, { payee: { contains: q.q, mode: "insensitive" as const } }, { category: { contains: q.q, mode: "insensitive" as const } }] } : {};
    const rows = await prisma.financeTransaction.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...live,
        ...(q.type ? { type: q.type } : {}),
        ...(q.status === "ABERTO" ? { status: { in: ["PENDENTE" as const, "PARCIAL" as const] } } : q.status === "PAGO" ? { status: "PAGO" as const } : {}),
        ...(q.from || q.to ? { dueDate: { ...(q.from ? { gte: dayToDate(q.from) } : {}), ...(q.to ? { lt: dayToDate(addDays(q.to, 1)) } : {}) } } : {}),
        ...text,
      },
      select,
      orderBy: { dueDate: "asc" },
      take: 1000,
    });
    return ok(res, { items: rows.map((r) => view(r, now)) });
  })
);

router.post(
  "/planner/quick",
  requirePermission("finance.manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ day: z.string().regex(dayRe), text: z.string().trim().min(2).max(400), type: z.enum(["RECEITA", "DESPESA"]).default("DESPESA") }).parse(req.body);
    const parsed = parseQuickPayable(input.text);
    if ("error" in parsed) throw new BadRequestError(parsed.error);
    const t = await prisma.financeTransaction.create({
      data: {
        organizationId: req.user!.organizationId,
        type: input.type,
        category: input.type === "RECEITA" && parsed.category === "Outros" ? "Outros" : parsed.category,
        amount: new Prisma.Decimal(parsed.amount.toFixed(2)),
        date: dayToDate(input.day),
        dueDate: dayToDate(input.day),
        description: parsed.description,
        payee: parsed.payee,
        status: "PENDENTE",
        createdById: req.user!.id,
      },
      select,
    });
    return ok(res, view(t, today()), `${parsed.payee ? `${parsed.payee}: ` : ""}${parsed.description} lançado`);
  })
);

router.patch(
  "/planner/:id",
  requirePermission("finance.manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ dueDay: z.string().regex(dayRe).optional(), payee: z.string().trim().max(80).nullable().optional() }).parse(req.body);
    const t = await prisma.financeTransaction.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, select: { id: true, status: true } });
    if (!t) throw new NotFoundError("Lançamento não encontrado");
    if (input.dueDay && t.status === "PAGO") throw new BadRequestError("Conta já paga não muda de vencimento");
    const updated = await prisma.financeTransaction.update({
      where: { id: t.id },
      data: { ...(input.dueDay ? { dueDate: dayToDate(input.dueDay) } : {}), ...(input.payee !== undefined ? { payee: input.payee || null } : {}) },
      select,
    });
    return ok(res, view(updated, today()), "Lançamento atualizado");
  })
);

export default router;
