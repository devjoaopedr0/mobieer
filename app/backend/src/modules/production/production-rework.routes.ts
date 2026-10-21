/**
 * Peça a refazer: /api/production
 *
 *   GET    /reworks?open=1                     todas (ou só as em aberto), com o resumo dos motivos do mês
 *   GET    /projects/:projectId/reworks        as do projeto
 *   POST   /projects/:projectId/reworks        { piece, reason, note?, person?, dueDay? } — vira tarefa no planejamento da semana
 *   POST   /reworks/:id/done                   peça refeita
 *
 * Feita a tarefa no planejamento, a peça conta como refeita.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { REWORK_CODES, REWORK_REASONS, reasonLabel, reasonsSummary, reworkPerson, reworkTaskTitle } from "./production-rework.rules";
import { dateToDay, dayToDate, isDone, normalizeItems, todayIso } from "./week-plan.rules";

const router = Router();
router.use(authenticate);

type ReworkRow = Awaited<ReturnType<typeof prisma.productionRework.findMany>>[number];

/** Peça com a situação: refeita quando marcada ou quando a tarefa do planejamento foi feita. */
async function withStatus(rows: ReworkRow[]) {
  const taskIds = rows.map((r) => r.planTaskId).filter((x): x is string => Boolean(x));
  const tasks = taskIds.length ? await prisma.productionPlanTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, done: true, items: true, doneAt: true } }) : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const projects = await prisma.project.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.projectId))] } }, select: { id: true, code: true, name: true, client: { select: { name: true } } } });
  const pById = new Map(projects.map((p) => [p.id, p]));
  return rows.map((r) => {
    const t = r.planTaskId ? byId.get(r.planTaskId) : undefined;
    const taskDone = t ? isDone({ done: t.done, items: normalizeItems(t.items) }) : false;
    const p = pById.get(r.projectId);
    return {
      id: r.id,
      piece: r.piece,
      reason: r.reason,
      reasonLabel: reasonLabel(r.reason),
      note: r.note,
      person: r.person,
      dueDay: r.dueDate ? dateToDay(r.dueDate) : null,
      done: Boolean(r.doneAt) || taskDone,
      doneAt: r.doneAt ?? (taskDone ? t?.doneAt ?? null : null),
      createdAt: r.createdAt,
      project: p ? { id: p.id, code: p.code, name: p.name, client: p.client?.name ?? null } : null,
    };
  });
}

router.get(
  "/reworks",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const rows = await prisma.productionRework.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 300 });
    const list = await withStatus(rows);
    const month = todayIso().slice(0, 7);
    const thisMonth = list.filter((r) => r.createdAt.toISOString().slice(0, 7) === month);
    const onlyOpen = req.query.open === "1";
    return ok(res, {
      reasons: REWORK_REASONS,
      items: onlyOpen ? list.filter((r) => !r.done) : list,
      month: { count: thisMonth.length, reasons: reasonsSummary(thisMonth) },
      open: list.filter((r) => !r.done).length,
    });
  })
);

router.get(
  "/projects/:projectId/reworks",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.productionRework.findMany({ where: { organizationId: req.user!.organizationId, projectId: req.params.projectId }, orderBy: { createdAt: "desc" } });
    return ok(res, { reasons: REWORK_REASONS, items: await withStatus(rows) });
  })
);

router.post(
  "/projects/:projectId/reworks",
  requirePermission("organization.manage"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const project = await prisma.project.findFirst({ where: { id: req.params.projectId, organizationId: orgId }, select: { id: true, code: true, client: { select: { name: true } } } });
    if (!project) throw new NotFoundError("Projeto não encontrado");
    const input = z
      .object({
        piece: z.string().trim().min(2, "Diga qual peça").max(160),
        reason: z.enum(REWORK_CODES),
        note: z.string().trim().max(500).optional().nullable(),
        person: z.string().trim().max(60).optional().nullable(),
        dueDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      })
      .parse(req.body);
    const day = input.dueDay || todayIso();
    const person = reworkPerson(input.person);
    const created = await prisma.$transaction(async (tx) => {
      // vai para o planejamento da semana, no dia e para quem vai refazer
      const last = await tx.productionPlanTask.aggregate({ where: { organizationId: orgId, date: dayToDate(day), person }, _max: { position: true } });
      const task = await tx.productionPlanTask.create({
        data: {
          organizationId: orgId,
          date: dayToDate(day),
          person,
          title: reworkTaskTitle(input.piece, input.reason),
          reference: `${project.code}${project.client?.name ? ` — ${project.client.name}` : ""}`.slice(0, 120),
          items: [],
          position: (last._max.position ?? -1) + 1,
          createdById: req.user!.id,
        },
      });
      return tx.productionRework.create({
        data: { organizationId: orgId, projectId: project.id, piece: input.piece, reason: input.reason, note: input.note || null, person: input.person?.trim() || null, dueDate: dayToDate(day), planTaskId: task.id, createdById: req.user!.id },
      });
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PRODUCTION_REWORK_CREATED", entity: "ProductionRework", entityId: created.id, details: { projectId: project.id, piece: input.piece, reason: input.reason } } });
    return ok(res, (await withStatus([created]))[0], `Peça para refazer registrada e colocada no planejamento de ${day.split("-").reverse().slice(0, 2).join("/")} (${person})`);
  })
);

router.post(
  "/reworks/:id/done",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const r = await prisma.productionRework.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!r) throw new NotFoundError("Peça não encontrada");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.productionRework.update({ where: { id: r.id }, data: { doneAt: r.doneAt ?? now } });
      if (r.planTaskId) await tx.productionPlanTask.updateMany({ where: { id: r.planTaskId, done: false }, data: { done: true, doneAt: now, updatedAt: now } });
    });
    const fresh = await prisma.productionRework.findUniqueOrThrow({ where: { id: r.id } });
    return ok(res, (await withStatus([fresh]))[0], "Peça refeita");
  })
);

export default router;
