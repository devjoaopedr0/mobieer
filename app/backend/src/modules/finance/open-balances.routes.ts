/**
 * Aba "Comissões e dívidas" do financeiro: /api/finance
 *
 *   GET  /open-balances   comissões a pagar (por pessoa), dívidas anteriores (por credor)
 *                         e contas a pagar vencidas de meses anteriores
 *   POST /old-debts       cadastra uma dívida anterior, já parcelada
 *   POST /old-commissions lança uma comissão de venda antiga (de antes do sistema)
 *
 * Pagar é o mesmo "Marcar pago" dos lançamentos (POST /finance/documents/:id/payments).
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { CATEGORY_COMMISSION } from "../commercial/quote.finance";
import { COMMISSION_CATEGORIES, OLD_DEBT_CATEGORY, commissionPayee, creditorOf, groupOpen, planDebt } from "./open-balances.rules";

const router = Router();
router.use(authenticate);

const todayDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const select = {
  id: true,
  type: true,
  category: true,
  description: true,
  amount: true,
  paidAmount: true,
  dueDate: true,
  method: true,
  installmentNumber: true,
  installmentTotal: true,
  client: { select: { name: true } },
  supplier: { select: { name: true } },
  referrer: { select: { name: true } },
  originQuote: { select: { number: true } },
} satisfies Prisma.FinanceTransactionSelect;
type Row = Prisma.FinanceTransactionGetPayload<{ select: typeof select }>;

const view = (r: Row) => ({
  id: r.id,
  type: r.type,
  category: r.category,
  description: r.description,
  amount: Number(r.amount),
  paidAmount: Number(r.paidAmount),
  dueDay: dayOf(r.dueDate),
  method: r.method,
  installment: r.installmentNumber && r.installmentTotal ? `${r.installmentNumber}/${r.installmentTotal}` : null,
  client: r.client?.name ?? null,
  quote: r.originQuote?.number ?? null,
  supplier: r.supplier?.name ?? null,
  referrer: r.referrer?.name ?? null,
});

router.get(
  "/open-balances",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const today = todayDay();
    const monthStart = `${today.slice(0, 7)}-01`;
    const open = { organizationId: orgId, type: "DESPESA" as const, status: { in: ["PENDENTE" as const, "PARCIAL" as const] } };
    const [commissions, debts, bills] = await Promise.all([
      prisma.financeTransaction.findMany({ where: { ...open, category: { in: COMMISSION_CATEGORIES } }, select, orderBy: { dueDate: "asc" } }),
      prisma.financeTransaction.findMany({ where: { ...open, category: OLD_DEBT_CATEGORY }, select, orderBy: { dueDate: "asc" } }),
      // contas que venceram antes deste mês e ficaram sem pagar
      prisma.financeTransaction.findMany({
        where: { ...open, category: { notIn: [...COMMISSION_CATEGORIES, OLD_DEBT_CATEGORY] }, dueDate: { lt: dayToDate(monthStart) } },
        select,
        orderBy: { dueDate: "asc" },
      }),
    ]);
    const commissionGroups = groupOpen(commissions.map(view), (r) => commissionPayee(r.description, r.referrer), today);
    const debtGroups = groupOpen(debts.map(view), (r) => creditorOf(r.description), today);
    const billGroups = groupOpen(bills.map(view), (r) => r.supplier ?? r.category, today);
    const sum = (gs: { open: number }[]) => Math.round(gs.reduce((s, g) => s + g.open, 0) * 100) / 100;
    return ok(res, {
      today,
      commissions: commissionGroups,
      debts: debtGroups,
      overdueBills: billGroups,
      totals: { commissions: sum(commissionGroups), debts: sum(debtGroups), overdueBills: sum(billGroups) },
    });
  })
);

const debtInput = z.object({
  creditor: z.string().trim().min(2, "Informe o credor").max(120),
  description: z.string().trim().max(300).optional().nullable(),
  /** saldo que ainda falta pagar */
  total: z.coerce.number().positive("Informe o valor em aberto").max(100_000_000),
  installments: z.coerce.number().int().min(1).max(240).default(1),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento da primeira parcela"),
  /** quando a dívida foi feita: é a competência (DRE) dos lançamentos */
  originDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  method: z.string().trim().max(60).optional().nullable(),
  supplierId: z.string().min(1).optional().nullable(),
});

router.post(
  "/old-debts",
  requirePermission("finance.manage"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const input = debtInput.parse(req.body);
    if (input.supplierId && !(await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }))) {
      throw new BadRequestError("Fornecedor não encontrado");
    }
    const plan = planDebt(input.total, input.installments, input.firstDue);
    const group = plan.length > 1 ? randomUUID() : null;
    const base = `${input.creditor}${input.description ? ` — ${input.description}` : ""}`;
    await prisma.financeTransaction.createMany({
      data: plan.map((p) => ({
        organizationId: orgId,
        type: "DESPESA" as const,
        category: OLD_DEBT_CATEGORY,
        amount: new Prisma.Decimal(p.amount.toFixed(2)),
        date: dayToDate(input.originDate ?? todayDay()),
        dueDate: dayToDate(p.dueDay),
        description: plan.length > 1 ? `${base} — parcela ${p.number}/${plan.length}` : base,
        status: "PENDENTE" as const,
        method: input.method ?? null,
        installmentGroup: group,
        installmentNumber: plan.length > 1 ? p.number : null,
        installmentTotal: plan.length > 1 ? plan.length : null,
        supplierId: input.supplierId ?? null,
        createdById: req.user!.id,
      })),
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "FINANCE_OLD_DEBT_CREATED", entity: "FinanceTransaction", entityId: group ?? "single", details: { creditor: input.creditor, total: input.total, installments: plan.length } },
    });
    return ok(res, { created: plan.length }, plan.length > 1 ? `Dívida cadastrada em ${plan.length} parcelas` : "Dívida cadastrada");
  })
);

const commissionInput = z.object({
  payee: z.string().trim().min(2, "Informe quem recebe").max(120),
  /** venda a que se refere: cliente, contrato */
  reference: z.string().trim().min(2, "Informe a venda (cliente ou contrato)").max(200),
  total: z.coerce.number().positive("Informe o valor a pagar").max(10_000_000),
  installments: z.coerce.number().int().min(1).max(60).default(1),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento"),
});

router.post(
  "/old-commissions",
  requirePermission("finance.manage"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const input = commissionInput.parse(req.body);
    const plan = planDebt(input.total, input.installments, input.firstDue);
    const group = plan.length > 1 ? randomUUID() : null;
    // mesmo formato do aceite do orçamento, para a aba saber de quem é
    const base = `${input.reference} — comissão ${input.payee}`;
    await prisma.financeTransaction.createMany({
      data: plan.map((p) => ({
        organizationId: orgId,
        type: "DESPESA" as const,
        category: CATEGORY_COMMISSION,
        amount: new Prisma.Decimal(p.amount.toFixed(2)),
        date: dayToDate(todayDay()),
        dueDate: dayToDate(p.dueDay),
        description: plan.length > 1 ? `${base} — parcela ${p.number}/${plan.length}` : base,
        status: "PENDENTE" as const,
        installmentGroup: group,
        installmentNumber: plan.length > 1 ? p.number : null,
        installmentTotal: plan.length > 1 ? plan.length : null,
        createdById: req.user!.id,
      })),
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "FINANCE_OLD_COMMISSION_CREATED", entity: "FinanceTransaction", entityId: group ?? "single", details: { payee: input.payee, total: input.total, installments: plan.length } },
    });
    return ok(res, { created: plan.length }, plan.length > 1 ? `Comissão lançada em ${plan.length} parcelas` : "Comissão lançada");
  })
);

export default router;
