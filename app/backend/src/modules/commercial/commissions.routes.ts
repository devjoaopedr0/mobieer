/**
 * Comissões por vendedor no CRM: /api/commercial/commissions
 *
 *   GET  /?from&to                     comissões que o orçamento registra (vendedor, %, valor).
 *                                      Prevista = orçamentos em aberto; a receber e histórico =
 *                                      contratos com o mês da venda (competência) no período.
 *   GET  /tiers?month                  comissão por faixa: vendido, faixa, estimada, consolidada, paga
 *   GET  /policies                     vigências das faixas
 *   POST /policies                     nova vigência
 *   PATCH /policies/:id                edita vigência ainda não usada (ou só ativa/desativa)
 *   POST /settlements                  consolida o mês de um consultor { month, userId }
 *   POST /settlements/:id/reopen       reabre para refazer
 *   POST /settlements/:id/adjustments  ajuste manual com motivo
 *
 * Financeiro e gestão veem todos; o vendedor, só as próprias. Configurar e
 * consolidar: commercial.commissions.manage.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { defaultMonth } from "./closed.rules";
import { OPEN_QUOTE, commissionViewer, commissionsBySeller, seesAllCommissions } from "./commissions.rules";
import { TierRuleError, validateTiers } from "./commission-tiers.rules";
import { consolidate, monthSummary, policyInclude, serializePolicy } from "./commission-tiers.service";
import { parseMonth } from "./goals.service";
import { CATEGORY_COMMISSION } from "./quote.finance";

const router = Router();
router.use(authenticate);

const num = (v: unknown) => (v == null ? 0 : Number(v));
// só a versão mais nova de cada orçamento em aberto (padrão e adendo)
const latest: Prisma.CommercialQuoteWhereInput = {
  OR: [
    { kind: "PADRAO", versions: { none: { kind: "PADRAO" } } },
    { kind: "ADENDO", versions: { none: { kind: "ADENDO" } } },
  ],
};

router.get(
  "/",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const def = defaultMonth();
    const from = req.query.from ? new Date(`${String(req.query.from).slice(0, 10)}T00:00:00`) : def.from;
    const to = req.query.to ? new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999`) : def.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestError("Período inválido");
    const all = seesAllCommissions(req.user!.permissions);
    const rows = await prisma.commercialQuoteCommission.findMany({
      where: {
        // reserva técnica (arquiteto, parceiro) não é comissão de vendedor
        referrerId: null,
        ...(all ? {} : { userId: req.user!.id }),
        quote: {
          organizationId: req.user!.organizationId,
          OR: [
            { status: { in: [...OPEN_QUOTE] }, ...latest },
            // mês da venda: a competência (transferível); sem ela, o aceite
            { status: "APPROVED", competenceDate: { gte: from, lte: to } },
            { status: "APPROVED", competenceDate: null, approvedAt: { gte: from, lte: to } },
          ],
        },
      },
      select: {
        id: true, name: true, role: true, percent: true, amount: true, userId: true,
        quote: { select: { id: true, number: true, version: true, status: true, total: true, approvedAt: true, competenceDate: true, client: { select: { id: true, name: true } } } },
      },
    });
    const lines = rows.map((r) => ({ userId: r.userId, name: r.name, amount: num(r.amount), quoteStatus: r.quote.status, approvedAt: r.quote.competenceDate ?? r.quote.approvedAt }));
    const history = rows
      .filter((r) => r.quote.status === "APPROVED")
      .sort((a, b) => ((b.quote.competenceDate ?? b.quote.approvedAt)?.getTime() ?? 0) - ((a.quote.competenceDate ?? a.quote.approvedAt)?.getTime() ?? 0))
      .map((r) => ({ id: r.id, name: r.name, role: r.role, percent: num(r.percent), amount: num(r.amount), quote: { ...r.quote, total: num(r.quote.total) } }));
    return ok(res, { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), scope: all ? "all" : "own", sellers: commissionsBySeller(lines, from, to), history });
  })
);

// GET /api/commercial/commissions/tiers?month=aaaa-mm[&userId=]
router.get(
  "/tiers",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const month = parseMonth(req.query.month);
    const all = seesAllCommissions(req.user!.permissions);
    const userId = commissionViewer(req.user!.permissions, req.user!.id, req.query.userId ? String(req.query.userId) : null);
    const data = await monthSummary(req.user!.organizationId, month, userId);
    return ok(res, { ...data, scope: all ? "all" : "own", canManage: req.user!.permissions.includes("commercial.commissions.manage") });
  })
);

// ------------------------------------------------------------------ vigências

const monthField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM");
const tiersField = z
  .array(z.object({ min: z.coerce.number().min(0).max(1_000_000_000), max: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(), percent: z.coerce.number().min(0).max(50) }))
  .min(1, "Cadastre pelo menos uma faixa")
  .max(20);
const policyBody = z.object({
  name: z.string().trim().min(2).max(120),
  mode: z.enum(["PROGRESSIVE", "FLAT_ON_TOTAL"]).default("PROGRESSIVE"),
  validFrom: monthField,
  notes: z.string().trim().max(1000).optional().nullable(),
  tiers: tiersField,
});

function checkTiers(tiers: z.infer<typeof tiersField>) {
  try {
    return validateTiers(tiers.map((t) => ({ min: t.min, max: t.max ?? null, percent: t.percent })));
  } catch (e) {
    if (e instanceof TierRuleError) throw new BadRequestError(e.message, { field: "tiers" }, "VALIDATION_ERROR");
    throw e;
  }
}
const tierRows = (tiers: ReturnType<typeof validateTiers>) =>
  tiers.map((t, i) => ({ position: i, minAmount: new Prisma.Decimal(t.min.toFixed(2)), maxAmount: t.max == null ? null : new Prisma.Decimal(t.max.toFixed(2)), percent: new Prisma.Decimal(t.percent.toFixed(3)) }));

router.get(
  "/policies",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.commissionPolicy.findMany({ where: { organizationId: req.user!.organizationId }, include: policyInclude, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] });
    return ok(res, rows.map(serializePolicy));
  })
);

router.post(
  "/policies",
  requirePermission("commercial.commissions.manage"),
  asyncHandler(async (req, res) => {
    const input = policyBody.parse(req.body);
    const tiers = checkTiers(input.tiers);
    const row = await prisma.commissionPolicy.create({
      data: { organizationId: req.user!.organizationId, name: input.name, mode: input.mode, validFrom: input.validFrom, notes: input.notes || null, createdById: req.user!.id, tiers: { create: tierRows(tiers) } },
      include: policyInclude,
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "COMMISSION_POLICY_CREATED", entity: "CommissionPolicy", entityId: row.id, details: { name: row.name, mode: row.mode, validFrom: row.validFrom, tiers } } });
    return ok(res, serializePolicy(row), `Faixas salvas — valem a partir de ${input.validFrom.slice(5)}/${input.validFrom.slice(0, 4)}`);
  })
);

router.patch(
  "/policies/:id",
  requirePermission("commercial.commissions.manage"),
  asyncHandler(async (req, res) => {
    const input = policyBody.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const cur = await prisma.commissionPolicy.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, include: policyInclude });
    if (!cur) throw new NotFoundError("Vigência não encontrada");
    const changesRule = input.mode !== undefined || input.validFrom !== undefined || input.tiers !== undefined;
    // regra usada em apuração fechada fica como estava: o histórico depende dela
    if (changesRule && cur._count.settlements > 0) throw new BadRequestError("Estas faixas já foram usadas numa apuração. Para mudar, crie uma nova vigência a partir do próximo mês.");
    const tiers = input.tiers ? checkTiers(input.tiers) : null;
    const row = await prisma.$transaction(async (tx) => {
      if (tiers) await tx.commissionTier.deleteMany({ where: { policyId: cur.id } });
      return tx.commissionPolicy.update({
        where: { id: cur.id },
        data: {
          name: input.name, mode: input.mode, validFrom: input.validFrom, active: input.active,
          notes: input.notes === undefined ? undefined : input.notes || null,
          ...(tiers ? { tiers: { create: tierRows(tiers) } } : {}),
        },
        include: policyInclude,
      });
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id, action: "COMMISSION_POLICY_UPDATED", entity: "CommissionPolicy", entityId: cur.id,
        details: { before: serializePolicy(cur), after: serializePolicy(row) } as unknown as Prisma.InputJsonValue,
      },
    });
    return ok(res, serializePolicy(row), "Vigência atualizada");
  })
);

// ------------------------------------------------------------------ apuração

router.post(
  "/settlements",
  requirePermission("commercial.commissions.manage"),
  asyncHandler(async (req, res) => {
    const { month, userId } = z.object({ month: monthField, userId: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId: req.user!.organizationId }, select: { id: true, name: true } });
    if (!user) throw new NotFoundError("Consultor não encontrado");
    const r = await consolidate(req.user!.organizationId, user.id, month, req.user!.id);
    return ok(res, r, `Comissão de ${user.name} consolidada: ${r.commission.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${r.financeLines ? ` — ${r.financeLines} parcela(s) a pagar no financeiro` : ""}`);
  })
);

router.post(
  "/settlements/:id/reopen",
  requirePermission("commercial.commissions.manage"),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, "Diga o motivo").max(500) }).parse(req.body);
    const s = await prisma.commissionSettlement.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!s) throw new NotFoundError("Apuração não encontrada");
    if (s.status !== "CONSOLIDADA") throw new BadRequestError("A apuração já está reaberta");
    await prisma.commissionSettlement.update({ where: { id: s.id }, data: { status: "REABERTA", reopenedAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "COMMISSION_SETTLEMENT_REOPENED", entity: "CommissionSettlement", entityId: s.id, details: { month: s.month, userId: s.userId, reason, commissionTotal: num(s.commissionTotal) } } });
    return ok(res, { id: s.id }, "Apuração reaberta — consolide de novo para valer");
  })
);

router.post(
  "/settlements/:id/adjustments",
  requirePermission("commercial.commissions.manage"),
  asyncHandler(async (req, res) => {
    const { amount, reason } = z
      .object({ amount: z.coerce.number().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Informe um valor diferente de zero"), reason: z.string().trim().min(3, "Diga o motivo").max(500) })
      .parse(req.body);
    const s = await prisma.commissionSettlement.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, include: { user: { select: { id: true, name: true } } } });
    if (!s) throw new NotFoundError("Apuração não encontrada");
    if (s.status !== "CONSOLIDADA") throw new BadRequestError("Consolide a apuração antes de ajustar");
    const value = Math.round(amount * 100) / 100;
    const label = `${s.month.slice(5)}/${s.month.slice(0, 4)}`;
    await prisma.$transaction(async (tx) => {
      await tx.commissionSettlementItem.create({ data: { settlementId: s.id, kind: "MANUAL_ADJUSTMENT", commissionAmount: new Prisma.Decimal(value.toFixed(2)), reason, createdById: req.user!.id } });
      if (value > 0) {
        // a pagar: entra nas contas a pagar como as outras comissões
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
        await tx.financeTransaction.create({
          data: {
            organizationId: s.organizationId, type: "DESPESA", category: CATEGORY_COMMISSION, amount: new Prisma.Decimal(value.toFixed(2)),
            date: new Date(), dueDate: new Date(`${today}T00:00:00.000Z`), description: `Ajuste de comissão ${label} — ${s.user.name}: ${reason}`,
            status: "PENDENTE", method: "Comissão", payee: s.user.name, payeeUserId: s.userId, commissionSettlementId: s.id, createdById: req.user!.id,
          },
        });
      } else {
        // a descontar: sai da próxima apuração do consultor
        await tx.commissionSettlement.update({ where: { id: s.id }, data: { creditOut: { increment: new Prisma.Decimal((-value).toFixed(2)) } } });
      }
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "COMMISSION_SETTLEMENT_ADJUSTED", entity: "CommissionSettlement", entityId: s.id, details: { month: s.month, userId: s.userId, amount: value, reason } } });
    return ok(res, { id: s.id }, value > 0 ? "Ajuste lançado nas contas a pagar" : "Ajuste registrado — será descontado na próxima apuração");
  })
);

export default router;
