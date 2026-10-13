/**
 * Frentes de produção do pedido: /api/production/projects/:projectId/fronts
 *
 *   GET            as frentes do pedido e as que ainda podem ser acrescentadas
 *   PUT  /:front   acrescenta a frente ou altera situação, responsável, prazo e observação
 *   DELETE /:front tira a frente do pedido
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { projectScope } from "../../lib/scope";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { getOrCreateOrder } from "./production.service";
import { EXTRA_FRONTS, FRONT_CODES, FRONT_STATUSES, FRONT_STATUS_LABEL, frontDates, frontDaysLate, frontLabel, type FrontStatus } from "./fronts.rules";

const router = Router();
router.use(authenticate);
const canEdit = requireAnyPermission(["organization.manage", "production.steps"]);
const include = { responsible: { select: { id: true, name: true } } } as const;

type Row = { id: string; front: string; status: string; dueAt: Date | null; notes: string | null; startedAt: Date | null; completedAt: Date | null; responsible: { id: string; name: string } | null };
export const serializeFront = (f: Row, now = new Date()) => ({
  id: f.id, front: f.front, label: frontLabel(f.front), status: f.status, statusLabel: FRONT_STATUS_LABEL[f.status as FrontStatus] ?? f.status,
  responsible: f.responsible, dueAt: f.dueAt, notes: f.notes, startedAt: f.startedAt, completedAt: f.completedAt, daysLate: frontDaysLate(f.dueAt, f.status, now),
});

async function orderOf(projectId: string, user: Express.Request["user"]) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectScope(user!) }, select: { id: true } });
  if (!project) throw new NotFoundError("Projeto não encontrado");
  return getOrCreateOrder(project.id, user!.organizationId, user!.id);
}

router.get(
  "/projects/:projectId/fronts",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const order = await orderOf(req.params.projectId, req.user);
    const rows = await prisma.productionFront.findMany({ where: { orderId: order.id }, include, orderBy: { createdAt: "asc" } });
    const used = new Set(rows.map((r) => r.front));
    return ok(res, { fronts: rows.map((r) => serializeFront(r)), available: EXTRA_FRONTS.filter((f) => !used.has(f.code)), statuses: FRONT_STATUSES.map((s) => ({ code: s, label: FRONT_STATUS_LABEL[s] })) });
  })
);

router.put(
  "/projects/:projectId/fronts/:front",
  canEdit,
  asyncHandler(async (req, res) => {
    const front = z.enum(FRONT_CODES).parse(req.params.front);
    const input = z
      .object({ status: z.enum(FRONT_STATUSES).optional(), responsibleId: z.string().min(1).nullable().optional(), dueAt: z.coerce.date().nullable().optional(), notes: z.string().trim().max(2000).nullable().optional() })
      .parse(req.body);
    const order = await orderOf(req.params.projectId, req.user);
    if (order.stage === "DELIVERED") throw new BadRequestError("Pedido já entregue: as frentes estão encerradas");
    if (input.responsibleId) {
      const u = await prisma.user.findFirst({ where: { id: input.responsibleId, organizationId: req.user!.organizationId, status: "ACTIVE" }, select: { id: true } });
      if (!u) throw new BadRequestError("Responsável inválido");
    }
    const now = new Date();
    const cur = await prisma.productionFront.findUnique({ where: { orderId_front: { orderId: order.id, front } } });
    const status = input.status ?? (cur?.status as FrontStatus | undefined) ?? "PENDING";
    const dates = frontDates(cur ?? { status: "PENDING", startedAt: null, completedAt: null }, status, now);
    const data = { status, ...dates, responsibleId: input.responsibleId, dueAt: input.dueAt, notes: input.notes === undefined ? undefined : input.notes || null, updatedAt: now };
    const saved = cur
      ? await prisma.productionFront.update({ where: { id: cur.id }, data, include })
      : await prisma.productionFront.create({ data: { orderId: order.id, front, ...data }, include });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: cur ? "PRODUCTION_FRONT_UPDATED" : "PRODUCTION_FRONT_ADDED", entity: "ProductionFront", entityId: saved.id, details: { front, from: cur?.status ?? null, to: status } } });
    return ok(res, serializeFront(saved), cur ? `${frontLabel(front)}: ${FRONT_STATUS_LABEL[status].toLowerCase()}` : `${frontLabel(front)} acrescentada ao pedido`);
  })
);

router.delete(
  "/projects/:projectId/fronts/:front",
  canEdit,
  asyncHandler(async (req, res) => {
    const front = z.enum(FRONT_CODES).parse(req.params.front);
    const order = await orderOf(req.params.projectId, req.user);
    const cur = await prisma.productionFront.findUnique({ where: { orderId_front: { orderId: order.id, front } } });
    if (!cur) throw new NotFoundError("Este pedido não tem essa frente");
    await prisma.productionFront.delete({ where: { id: cur.id } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PRODUCTION_FRONT_REMOVED", entity: "ProductionFront", entityId: cur.id, details: { front, status: cur.status } } });
    return ok(res, null, `${frontLabel(front)} retirada do pedido`);
  })
);

export default router;
