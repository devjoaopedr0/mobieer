/**
 * Planejamento da semana da produção: /api/production/week-plan
 *
 *   GET    ?week=aaaa-mm-dd   tarefas da semana (segunda a sábado), pessoas e sugestões de nome
 *   POST   /tasks             cria uma tarefa
 *   PATCH  /tasks/:id         altera texto, pessoa, dia, subtarefas ou a marca de feito
 *   PATCH  /tasks/:id/check   marca a tarefa ou uma subtarefa como feita (quem executa também pode)
 *   PATCH  /tasks/:id/missed  não cumprida: registra o motivo e, para quem monta, passa para outro dia
 *   DELETE /tasks/:id         remove
 *   POST   /parse             lê o texto colado do WhatsApp e devolve a prévia (não grava)
 *   POST   /import            grava as tarefas da prévia
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { MISSED_CODES, MISSED_REASONS, addDays, dateToDay, dayToDate, isDone, mondayOf, normalizeItems, parseWeekPlan, pendingItems, summarize, todayIso, weekDays, weekSummary } from "./week-plan.rules";

const router = Router();
router.use(authenticate);

const canRead = requirePermission("organization.read");
// montar o planejamento: a administração e quem atualiza as etapas da produção
const canManage = requireAnyPermission(["organization.manage", "production.steps"]);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const text = (max: number) => z.string().trim().min(1, "é obrigatório").max(max);
const itemInput = z.object({ text: z.string().trim().max(200), done: z.boolean().default(false) });
const taskInput = z.object({
  date: day,
  person: text(60),
  title: text(200),
  reference: z.string().trim().max(160).nullable().optional(),
  items: z.array(itemInput).max(30).default([]),
});

type Row = Prisma.ProductionPlanTaskGetPayload<Record<string, never>>;
const serialize = (t: Row) => {
  const items = normalizeItems(t.items);
  const done = isDone({ done: t.done, items });
  return {
    id: t.id, date: dateToDay(t.date), person: t.person, title: t.title, reference: t.reference, items, done, position: t.position,
    // feita depois de justificada: o motivo deixa de valer
    missedReason: done ? null : t.missedReason, missedNote: done ? null : t.missedNote,
    movedTo: t.movedToDate ? dateToDay(t.movedToDate) : null, moved: Boolean(t.movedFromId),
  };
};

router.get(
  "/week-plan",
  canRead,
  asyncHandler(async (req, res) => {
    const asked = day.safeParse(req.query.week);
    const weekStart = mondayOf(asked.success ? asked.data : todayIso());
    const organizationId = req.user!.organizationId;
    const [rows, employees, recent] = await Promise.all([
      prisma.productionPlanTask.findMany({ where: { organizationId, date: { gte: dayToDate(weekStart), lt: dayToDate(addDays(weekStart, 7)) } }, orderBy: [{ date: "asc" }, { position: "asc" }, { createdAt: "asc" }] }),
      // nomes do RH como sugestão; a pessoa não precisa ter usuário
      prisma.employee.findMany({ where: { organizationId, terminatedAt: null }, select: { fullName: true }, orderBy: { fullName: "asc" }, take: 200 }),
      prisma.productionPlanTask.findMany({ where: { organizationId, date: { gte: dayToDate(addDays(weekStart, -56)) } }, select: { person: true }, distinct: ["person"], take: 100 }),
    ]);
    const tasks = rows.map(serialize);
    // quem aparece na grade: na ordem em que entrou no planejamento da semana
    const people = [...new Set(tasks.map((t) => t.person))];
    const suggestions = [...new Set([...recent.map((r) => r.person), ...employees.map((e) => e.fullName.split(" ")[0].toUpperCase())])].sort();
    const today = todayIso();
    return ok(res, { weekStart, days: weekDays(weekStart), today, people, tasks, summary: summarize(tasks), week: weekSummary(tasks, today), reasons: MISSED_REASONS, suggestions });
  })
);

router.post(
  "/week-plan/tasks",
  canManage,
  asyncHandler(async (req, res) => {
    const input = taskInput.parse(req.body);
    const organizationId = req.user!.organizationId;
    const person = input.person.toUpperCase();
    const last = await prisma.productionPlanTask.aggregate({ where: { organizationId, date: dayToDate(input.date), person }, _max: { position: true } });
    const t = await prisma.productionPlanTask.create({
      data: { organizationId, date: dayToDate(input.date), person, title: input.title, reference: input.reference || null, items: normalizeItems(input.items), position: (last._max.position ?? -1) + 1, createdById: req.user!.id },
    });
    return ok(res, serialize(t), "Tarefa adicionada");
  })
);

async function ensureTask(id: string, organizationId: string) {
  const t = await prisma.productionPlanTask.findFirst({ where: { id, organizationId } });
  if (!t) throw new NotFoundError("Tarefa não encontrada");
  return t;
}

router.patch(
  "/week-plan/tasks/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const current = await ensureTask(req.params.id, req.user!.organizationId);
    const input = taskInput.partial().extend({ done: z.boolean().optional() }).parse(req.body);
    const items = input.items ? normalizeItems(input.items) : normalizeItems(current.items);
    // com subtarefas, "feito" é todas marcadas; marcar a tarefa inteira marca (ou desmarca) todas
    const finalItems = input.done !== undefined && items.length ? items.map((i) => ({ ...i, done: input.done! })) : items;
    const done = finalItems.length ? finalItems.every((i) => i.done) : input.done ?? current.done;
    const t = await prisma.productionPlanTask.update({
      where: { id: current.id },
      data: {
        date: input.date ? dayToDate(input.date) : undefined,
        person: input.person ? input.person.toUpperCase() : undefined,
        title: input.title,
        reference: input.reference === undefined ? undefined : input.reference || null,
        items: finalItems,
        done,
        doneAt: done ? current.doneAt ?? new Date() : null,
        updatedAt: new Date(),
      },
    });
    return ok(res, serialize(t), "Tarefa atualizada");
  })
);

// Marcar como feito: quem executa também marca. Só mexe na marca da tarefa ou de uma
// subtarefa — texto, pessoa e dia continuam com quem monta o planejamento.
router.patch(
  "/week-plan/tasks/:id/check",
  canRead,
  asyncHandler(async (req, res) => {
    const current = await ensureTask(req.params.id, req.user!.organizationId);
    const input = z.object({ done: z.boolean(), item: z.number().int().min(0).max(29).optional() }).parse(req.body);
    const items = normalizeItems(current.items);
    let next = items;
    if (input.item !== undefined) {
      if (!items[input.item]) throw new NotFoundError("Subtarefa não encontrada");
      next = items.map((i, k) => (k === input.item ? { ...i, done: input.done } : i));
    } else if (items.length) next = items.map((i) => ({ ...i, done: input.done }));
    const done = next.length ? next.every((i) => i.done) : input.done;
    const t = await prisma.productionPlanTask.update({ where: { id: current.id }, data: { items: next, done, doneAt: done ? current.doneAt ?? new Date() : null, updatedAt: new Date() } });
    return ok(res, serialize(t));
  })
);

// Não cumprida: quem executa diz o motivo. Passar para outro dia cria a tarefa lá
// (só com os passos que faltaram) e é de quem monta o planejamento.
router.patch(
  "/week-plan/tasks/:id/missed",
  canRead,
  asyncHandler(async (req, res) => {
    const current = await ensureTask(req.params.id, req.user!.organizationId);
    const input = z
      .object({ reason: z.enum(MISSED_CODES).nullable(), note: z.string().trim().max(300).nullable().optional(), moveTo: day.nullable().optional() })
      .parse(req.body);
    if (input.reason === null) {
      const t = await prisma.productionPlanTask.update({ where: { id: current.id }, data: { missedReason: null, missedNote: null, missedAt: null, updatedAt: new Date() } });
      return ok(res, serialize(t), "Justificativa removida");
    }
    const items = normalizeItems(current.items);
    if (isDone({ done: current.done, items })) throw new BadRequestError("Esta tarefa já está marcada como feita");
    if (input.reason === "OUTRO" && !input.note) throw new BadRequestError("Escreva o motivo");
    const from = dateToDay(current.date);
    if (input.moveTo) {
      if (!["organization.manage", "production.steps"].some((p) => req.user!.permissions.includes(p))) throw new ForbiddenError("Passar a tarefa para outro dia é de quem monta o planejamento");
      if (current.movedToDate) throw new BadRequestError("Esta tarefa já foi passada para outro dia");
      if (input.moveTo <= from || input.moveTo < todayIso()) throw new BadRequestError("Escolha um dia de hoje em diante, depois do dia da tarefa");
      if (input.moveTo > addDays(from, 60)) throw new BadRequestError("Escolha um dia mais próximo");
    }
    const t = await prisma.$transaction(async (tx) => {
      if (input.moveTo) {
        const last = await tx.productionPlanTask.aggregate({ where: { organizationId: current.organizationId, date: dayToDate(input.moveTo), person: current.person }, _max: { position: true } });
        await tx.productionPlanTask.create({
          data: { organizationId: current.organizationId, date: dayToDate(input.moveTo), person: current.person, title: current.title, reference: current.reference, items: pendingItems(items), position: (last._max.position ?? -1) + 1, movedFromId: current.id, createdById: req.user!.id },
        });
      }
      return tx.productionPlanTask.update({
        where: { id: current.id },
        data: { missedReason: input.reason, missedNote: input.note || null, missedAt: new Date(), movedToDate: input.moveTo ? dayToDate(input.moveTo) : undefined, updatedAt: new Date() },
      });
    });
    return ok(res, serialize(t), input.moveTo ? `Motivo registrado e tarefa passada para ${input.moveTo.split("-").reverse().slice(0, 2).join("/")}` : "Motivo registrado");
  })
);

router.delete(
  "/week-plan/tasks/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const current = await ensureTask(req.params.id, req.user!.organizationId);
    await prisma.productionPlanTask.delete({ where: { id: current.id } });
    return ok(res, null, "Tarefa removida");
  })
);

// Prévia do texto colado: nada é gravado aqui.
router.post(
  "/week-plan/parse",
  canManage,
  asyncHandler(async (req, res) => {
    const { text: raw } = z.object({ text: z.string().max(20_000) }).parse(req.body);
    return ok(res, parseWeekPlan(raw));
  })
);

router.post(
  "/week-plan/import",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ tasks: z.array(taskInput).min(1, "Nenhuma tarefa para importar").max(300) }).parse(req.body);
    const organizationId = req.user!.organizationId;
    const position = new Map<string, number>();
    await prisma.productionPlanTask.createMany({
      data: input.tasks.map((t) => {
        const person = t.person.toUpperCase();
        const k = `${t.date}|${person}`;
        const pos = position.get(k) ?? 100; // depois do que já existir naquele dia
        position.set(k, pos + 1);
        return { organizationId, date: dayToDate(t.date), person, title: t.title, reference: t.reference || null, items: normalizeItems(t.items), position: pos, createdById: req.user!.id };
      }),
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PRODUCTION_WEEK_PLAN_IMPORTED", entity: "ProductionPlanTask", entityId: organizationId, details: { tasks: input.tasks.length } } });
    return ok(res, { created: input.tasks.length }, `${input.tasks.length} ${input.tasks.length > 1 ? "tarefas adicionadas" : "tarefa adicionada"} ao planejamento`);
  })
);

export default router;
