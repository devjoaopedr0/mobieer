/**
 * Comissões por vendedor no CRM: /api/commercial/commissions?from&to
 *
 * Lê as comissões que o orçamento já registra (vendedor, %, valor). Prevista =
 * orçamentos em aberto; a receber e histórico = orçamentos aceitos no período.
 * Financeiro e gestão veem todos; o vendedor, só as próprias.
 */
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { defaultMonth } from "./closed.rules";
import { OPEN_QUOTE, commissionsBySeller, seesAllCommissions } from "./commissions.rules";

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
          OR: [{ status: { in: [...OPEN_QUOTE] }, ...latest }, { status: "APPROVED", approvedAt: { gte: from, lte: to } }],
        },
      },
      select: {
        id: true, name: true, role: true, percent: true, amount: true, userId: true,
        quote: { select: { id: true, number: true, version: true, status: true, total: true, approvedAt: true, client: { select: { id: true, name: true } } } },
      },
    });
    const lines = rows.map((r) => ({ userId: r.userId, name: r.name, amount: num(r.amount), quoteStatus: r.quote.status, approvedAt: r.quote.approvedAt }));
    const history = rows
      .filter((r) => r.quote.status === "APPROVED")
      .sort((a, b) => (b.quote.approvedAt?.getTime() ?? 0) - (a.quote.approvedAt?.getTime() ?? 0))
      .map((r) => ({ id: r.id, name: r.name, role: r.role, percent: num(r.percent), amount: num(r.amount), quote: { ...r.quote, total: num(r.quote.total) } }));
    return ok(res, { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), scope: all ? "all" : "own", sellers: commissionsBySeller(lines, from, to), history });
  })
);

export default router;
