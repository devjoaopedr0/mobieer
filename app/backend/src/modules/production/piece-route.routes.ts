/**
 * Roteiro de produção por peça (montado em /api/production).
 *
 *   GET    /piece-route/config                         roteiro base, tipos de peça e ajustes por tipo
 *   PUT    /piece-route/steps/:id                      editar etapa base (só administrador)
 *   POST   /piece-route/types  · PATCH /piece-route/types/:id   tipos de peça (só administrador)
 *   PUT    /piece-route/overrides                      pular / acrescentar / trocar instrução por tipo (só administrador)
 *   GET    /projects/:projectId/piece-routes           cartões das peças do pedido, etapa por etapa
 *   GET    /piece-routes/by-code/:code                 cartão da peça lida no leitor (chão de fábrica)
 *   PATCH  /piece-routes/:itemId/type                  confirmar o tipo da peça (sugerido pela etiqueta)
 *   POST   /piece-routes/:itemId/steps/:stepId/done    marcar etapa feita (multipart: photo opcional ou exigida)
 *   POST   /piece-routes/:itemId/steps/:stepId/undo    desfazer a última etapa feita
 *   GET    /piece-steps/:progressId/photo              foto da etapa
 *
 * A peça é o ProductionItem e o código da etiqueta é o code dele: o tipo fica
 * no item, o andamento em PieceStepProgress (ligado ao item) e cada passo
 * também entra no histórico do item (ProductionItemEvent).
 *
 * Quando todas as peças do pedido fecham as etapas ligadas a uma etapa do pedido
 * (ProductionStep), essa etapa do pedido é concluída — sem mexer no que já existe.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { ProductionStepKey, RouteOverrideAction, type PieceStepStatus, type Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { uploadPhoto } from "../../middlewares/upload";
import { prisma } from "../../prisma";
import { projectScope } from "../../lib/scope";
import { buildStorageKey, storage } from "../../lib/storage";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { pipeToResponse } from "../../utils/stream";
import { getOrCreateOrder } from "./production.service";
import { impliedStage, syncOrderStage } from "./steps.service";
import { isOpenStep, STEP_LABEL } from "./steps.rules";
import { BASE_ROUTE, canMarkDone, canUndo, currentPieceStep, DEFAULT_PIECE_TYPES, initialStatus, orderStepComplete, PIECE_STEP_STATUS_LABEL, resolveStep, suggestPieceType, type OverrideDef } from "./piece-route.rules";

const router = Router();
router.use(authenticate);

const canRead = requirePermission("organization.read");
const canWork = requireAnyPermission(["organization.manage", "production.steps"]);
const canManage = requirePermission("production.route.manage");

/** Primeira vez da organização: entram as 9 etapas e os tipos de peça de partida (sem ajustes por tipo). */
async function ensureRouteDefaults(organizationId: string) {
  if (!(await prisma.routeStep.count({ where: { organizationId } }))) {
    await prisma.routeStep.createMany({ data: BASE_ROUTE.map((s) => ({ organizationId, ...s })), skipDuplicates: true });
  }
  if (!(await prisma.pieceType.count({ where: { organizationId } }))) {
    await prisma.pieceType.createMany({ data: DEFAULT_PIECE_TYPES.map((name) => ({ organizationId, name })), skipDuplicates: true });
  }
}

async function loadConfig(organizationId: string) {
  await ensureRouteDefaults(organizationId);
  const [steps, types] = await Promise.all([
    prisma.routeStep.findMany({ where: { organizationId }, orderBy: { position: "asc" } }),
    prisma.pieceType.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { overrides: true } }),
  ]);
  return { steps, types };
}

type Config = Awaited<ReturnType<typeof loadConfig>>;

const overrideFor = (types: Config["types"], pieceTypeId: string | null, routeStepId: string): OverrideDef | null =>
  (pieceTypeId ? types.find((t) => t.id === pieceTypeId)?.overrides.find((o) => o.routeStepId === routeStepId) : null) ?? null;

/** Cada peça ganha a linha de cada etapa do roteiro (e das etapas novas que o administrador criar). */
async function ensureProgress(itemWhere: Prisma.ProductionItemWhereInput, organizationId: string) {
  const config = await loadConfig(organizationId);
  const items = await prisma.productionItem.findMany({
    where: { ...itemWhere, organizationId, status: { not: "CANCELLED" } },
    select: { id: true, pieceTypeId: true, routeSteps: { select: { routeStepId: true } } },
  });
  const data = items.flatMap((item) =>
    config.steps
      .filter((s) => !item.routeSteps.some((p) => p.routeStepId === s.id))
      .map((s) => ({ itemId: item.id, routeStepId: s.id, status: initialStatus(s, overrideFor(config.types, item.pieceTypeId, s.id)) }))
  );
  if (data.length) await prisma.pieceStepProgress.createMany({ data, skipDuplicates: true });
  return config;
}

async function orderOf(projectId: string, user: Request["user"]) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectScope(user!) }, select: { id: true } });
  if (!project) throw new NotFoundError("Projeto não encontrado");
  return getOrCreateOrder(project.id, user!.organizationId, user!.id);
}

const cardInclude = {
  pieceType: { select: { id: true, name: true } },
  order: { select: { project: { select: { id: true, code: true, name: true } } } },
  routeSteps: { include: { doneBy: { select: { id: true, name: true } } } },
} satisfies Prisma.ProductionItemInclude;

type CardItem = Prisma.ProductionItemGetPayload<{ include: typeof cardInclude }>;

function toCard(item: CardItem, { steps, types }: Config) {
  const progress = steps.map((s) => {
    const p = item.routeSteps.find((x) => x.routeStepId === s.id);
    const status = (p?.status ?? "PENDING") as PieceStepStatus;
    return {
      progressId: p?.id ?? null,
      routeStepId: s.id,
      position: s.position,
      name: s.name,
      instruction: resolveStep(s, overrideFor(types, item.pieceTypeId, s.id)).instruction,
      requirePhoto: s.requirePhoto,
      status,
      statusLabel: PIECE_STEP_STATUS_LABEL[status],
      doneBy: p?.doneBy ?? null,
      doneAt: p?.doneAt ?? null,
      hasPhoto: Boolean(p?.photoKey),
      note: p?.note ?? null,
    };
  });
  const cur = currentPieceStep(progress);
  return {
    itemId: item.id,
    // o código da etiqueta é o code do item: a mesma peça em todas as etapas
    code: item.code,
    item: { id: item.id, descricao: item.descricao, ambiente: item.ambiente, medidas: item.medidas, modulo: item.modulo, material: item.material, quantidade: item.quantidade },
    project: item.order.project,
    pieceType: item.pieceType,
    pieceTypeSource: item.pieceTypeSource,
    // sugestão pela descrição que veio da etiqueta; vale depois que alguém confirma
    suggestedType: item.pieceType ? null : suggestPieceType(item.descricao, types.filter((t) => t.active)),
    currentStepId: cur?.routeStepId ?? null,
    done: !cur,
    steps: progress,
  };
}

/**
 * Liga os dois níveis: depois que a peça anda, confere se a etapa do pedido
 * ligada àquela etapa do roteiro já pode ser concluída. Só conclui etapa aberta
 * e não bloqueada; nunca reabre nem desfaz o que a equipe marcou.
 */
async function syncOrderStepFromPieces(orderId: string, key: ProductionStepKey | null, organizationId: string, actorId: string) {
  if (!key) return null;
  const step = await prisma.productionStep.findUnique({ where: { orderId_step: { orderId, step: key } } });
  if (!step || !isOpenStep(step.status) || step.status === "BLOCKED") return null;
  const stepIds = (await prisma.routeStep.findMany({ where: { organizationId, productionStep: key, active: true }, select: { id: true } })).map((s) => s.id);
  const items = (await prisma.productionItem.findMany({ where: { orderId, status: { not: "CANCELLED" } }, select: { id: true } })).map((i) => i.id);
  const rows = await prisma.pieceStepProgress.findMany({ where: { routeStepId: { in: stepIds }, itemId: { in: items } }, select: { itemId: true, routeStepId: true, status: true } });
  if (!orderStepComplete(items, stepIds, rows)) return null;
  const now = new Date();
  await prisma.productionStep.update({ where: { id: step.id }, data: { status: "DONE", completedAt: now, startedAt: step.startedAt ?? now } });
  await prisma.auditLog.create({ data: { userId: actorId, action: "PRODUCTION_STEP_COMPLETE", entity: "ProductionStep", entityId: step.id, details: { step: key, before: { status: step.status }, after: { status: "DONE" }, source: "PIECE_ROUTE" } } });
  await syncOrderStage(orderId, impliedStage(key, "COMPLETE"), actorId, `${STEP_LABEL[key]} concluída (todas as peças)`);
  return key;
}

async function itemFor(itemId: string, organizationId: string) {
  await ensureProgress({ id: itemId }, organizationId);
  const item = await prisma.productionItem.findFirst({ where: { id: itemId, organizationId }, include: { routeSteps: { include: { routeStep: true } } } });
  if (!item) throw new NotFoundError("Peça não encontrada");
  if (item.status === "CANCELLED") throw new BadRequestError("Peça cancelada");
  return item;
}

const progressOf = (item: Awaited<ReturnType<typeof itemFor>>) => item.routeSteps.map((p) => ({ routeStepId: p.routeStepId, position: p.routeStep.position, status: p.status }));
const stepLabel = (s: { position: number; name: string }) => `${String(s.position).padStart(2, "0")} ${s.name}`;

// ---------------------------------------------------------------- configuração

router.get(
  "/piece-route/config",
  canRead,
  asyncHandler(async (req, res) => {
    const { steps, types } = await loadConfig(req.user!.organizationId);
    return ok(res, { steps, types, productionSteps: Object.entries(STEP_LABEL).map(([key, label]) => ({ key, label })) });
  })
);

router.put(
  "/piece-route/steps/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(60).optional(),
        instruction: z.string().trim().max(1000).nullable().optional(),
        requirePhoto: z.boolean().optional(),
        productionStep: z.nativeEnum(ProductionStepKey).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const cur = await prisma.routeStep.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!cur) throw new NotFoundError("Etapa não encontrada");
    const updated = await prisma.routeStep.update({ where: { id: cur.id }, data: { ...input, instruction: input.instruction === undefined ? undefined : input.instruction || null } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PIECE_ROUTE_STEP_UPDATED", entity: "RouteStep", entityId: cur.id, details: { before: { name: cur.name, instruction: cur.instruction, requirePhoto: cur.requirePhoto, productionStep: cur.productionStep, active: cur.active }, after: input } } });
    return ok(res, updated, `Etapa ${String(cur.position).padStart(2, "0")} salva`);
  })
);

router.post(
  "/piece-route/types",
  canManage,
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const exists = await prisma.pieceType.findFirst({ where: { organizationId: req.user!.organizationId, name: { equals: name, mode: "insensitive" } } });
    if (exists) throw new BadRequestError("Já existe um tipo de peça com esse nome");
    const t = await prisma.pieceType.create({ data: { organizationId: req.user!.organizationId, name } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PIECE_TYPE_CREATED", entity: "PieceType", entityId: t.id, details: { name } } });
    return ok(res, t, "Tipo de peça criado");
  })
);

router.patch(
  "/piece-route/types/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(2).max(60).optional(), active: z.boolean().optional() }).parse(req.body);
    const cur = await prisma.pieceType.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!cur) throw new NotFoundError("Tipo de peça não encontrado");
    const t = await prisma.pieceType.update({ where: { id: cur.id }, data: input });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PIECE_TYPE_UPDATED", entity: "PieceType", entityId: cur.id, details: { before: { name: cur.name, active: cur.active }, after: input } } });
    return ok(res, t, "Tipo de peça salvo");
  })
);

// action null = tira o ajuste (o tipo segue o roteiro base nessa etapa)
router.put(
  "/piece-route/overrides",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ pieceTypeId: z.string().min(1), routeStepId: z.string().min(1), action: z.nativeEnum(RouteOverrideAction).nullable(), instruction: z.string().trim().max(1000).nullable().optional() })
      .parse(req.body);
    const [type, step] = await Promise.all([
      prisma.pieceType.findFirst({ where: { id: input.pieceTypeId, organizationId: req.user!.organizationId } }),
      prisma.routeStep.findFirst({ where: { id: input.routeStepId, organizationId: req.user!.organizationId } }),
    ]);
    if (!type || !step) throw new NotFoundError("Tipo de peça ou etapa não encontrados");
    if ((input.action === "APPEND" || input.action === "REPLACE") && !input.instruction) throw new BadRequestError("Escreva a instrução");
    const where = { pieceTypeId_routeStepId: { pieceTypeId: type.id, routeStepId: step.id } };
    const saved = input.action
      ? await prisma.routeOverride.upsert({ where, create: { pieceTypeId: type.id, routeStepId: step.id, action: input.action, instruction: input.instruction || null }, update: { action: input.action, instruction: input.instruction || null } })
      : await prisma.routeOverride.deleteMany({ where: { pieceTypeId: type.id, routeStepId: step.id } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PIECE_ROUTE_OVERRIDE_SAVED", entity: "PieceType", entityId: type.id, details: { step: step.position, action: input.action, instruction: input.instruction ?? null } } });
    return ok(res, saved, `${type.name}: etapa ${String(step.position).padStart(2, "0")} ${input.action === "SKIP" ? "pulada" : input.action ? "com instrução própria" : "segue o roteiro base"}`);
  })
);

// ---------------------------------------------------------------- execução

router.get(
  "/projects/:projectId/piece-routes",
  canRead,
  asyncHandler(async (req, res) => {
    const order = await orderOf(req.params.projectId, req.user);
    const config = await ensureProgress({ orderId: order.id }, req.user!.organizationId);
    const items = await prisma.productionItem.findMany({ where: { orderId: order.id, status: { not: "CANCELLED" } }, include: cardInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    return ok(res, items.map((i) => toCard(i, config)));
  })
);

// leitor de etiquetas no chão de fábrica: o código da etiqueta abre o cartão da peça
router.get(
  "/piece-routes/by-code/:code",
  canRead,
  asyncHandler(async (req, res) => {
    const code = req.params.code.trim();
    const found = await prisma.productionItem.findFirst({ where: { organizationId: req.user!.organizationId, code, status: { not: "CANCELLED" } }, select: { id: true } });
    if (!found) throw new NotFoundError(`Nenhuma peça com o código ${code}`);
    const config = await ensureProgress({ id: found.id }, req.user!.organizationId);
    const item = await prisma.productionItem.findUniqueOrThrow({ where: { id: found.id }, include: cardInclude });
    return ok(res, toCard(item, config));
  })
);

router.patch(
  "/piece-routes/:itemId/type",
  canWork,
  asyncHandler(async (req, res) => {
    const input = z.object({ pieceTypeId: z.string().min(1).nullable(), source: z.enum(["LABEL", "MANUAL"]).default("MANUAL") }).parse(req.body);
    const item = await itemFor(req.params.itemId, req.user!.organizationId);
    const { steps, types } = await loadConfig(req.user!.organizationId);
    const type = input.pieceTypeId ? types.find((t) => t.id === input.pieceTypeId) : null;
    if (input.pieceTypeId && !type) throw new BadRequestError("Tipo de peça inválido");
    await prisma.$transaction(async (tx) => {
      await tx.productionItem.update({
        where: { id: item.id },
        data: { pieceTypeId: input.pieceTypeId, pieceTypeSource: input.pieceTypeId ? input.source : null, pieceTypeConfirmedById: input.pieceTypeId ? req.user!.id : null },
      });
      // etapas ainda não feitas seguem o tipo novo; o que já foi feito fica como está
      for (const p of item.routeSteps.filter((x) => x.status !== "DONE")) {
        const s = steps.find((x) => x.id === p.routeStepId);
        if (!s) continue;
        const status = initialStatus(s, overrideFor(types, input.pieceTypeId, s.id));
        if (status !== p.status) await tx.pieceStepProgress.update({ where: { id: p.id }, data: { status } });
      }
      await tx.productionItemEvent.create({
        data: {
          itemId: item.id,
          action: "ROUTE_TYPE",
          note: type ? `Tipo da peça: ${type.name}${input.source === "LABEL" ? " (sugestão da etiqueta confirmada)" : ""}` : "Tipo da peça retirado: segue o roteiro base",
          createdById: req.user!.id,
        },
      });
    });
    // pular etapas pode fechar a etapa do pedido
    const keys = [...new Set(steps.map((s) => s.productionStep).filter((k): k is ProductionStepKey => Boolean(k)))];
    for (const k of keys) await syncOrderStepFromPieces(item.orderId, k, req.user!.organizationId, req.user!.id);
    return ok(res, { itemId: item.id }, "Tipo da peça confirmado");
  })
);

router.post(
  "/piece-routes/:itemId/steps/:stepId/done",
  canWork,
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    const note = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {}).note;
    const item = await itemFor(req.params.itemId, req.user!.organizationId);
    const p = item.routeSteps.find((x) => x.routeStepId === req.params.stepId);
    if (!p) throw new NotFoundError("Etapa não encontrada no roteiro da peça");
    const check = canMarkDone(progressOf(item), p.routeStepId, { requirePhoto: p.routeStep.requirePhoto, hasPhoto: Boolean(req.file) });
    if (!check.ok) throw new BadRequestError(check.motivo);
    let photo: { photoKey: string; photoName: string; photoMime: string } | null = null;
    if (req.file) {
      const key = buildStorageKey(`production/piece-steps/${item.id}`, req.file.originalname);
      await storage.put(key, req.file.buffer, req.file.mimetype);
      photo = { photoKey: key, photoName: req.file.originalname, photoMime: req.file.mimetype };
    }
    await prisma.$transaction([
      prisma.pieceStepProgress.update({ where: { id: p.id }, data: { status: "DONE", doneAt: new Date(), doneById: req.user!.id, note: note || null, ...(photo ?? {}) } }),
      // histórico da própria peça
      prisma.productionItemEvent.create({ data: { itemId: item.id, action: "ROUTE_DONE", note: `${stepLabel(p.routeStep)} feita${photo ? " (com foto)" : ""}${note ? `: ${note}` : ""}`, createdById: req.user!.id } }),
    ]);
    const closed = await syncOrderStepFromPieces(item.orderId, p.routeStep.productionStep, req.user!.organizationId, req.user!.id);
    return ok(res, { itemId: item.id, orderStepCompleted: closed }, closed ? `${p.routeStep.name} feita. Todas as peças passaram: etapa "${STEP_LABEL[closed]}" do pedido concluída.` : `${p.routeStep.name} feita`);
  })
);

router.post(
  "/piece-routes/:itemId/steps/:stepId/undo",
  canWork,
  asyncHandler(async (req, res) => {
    const item = await itemFor(req.params.itemId, req.user!.organizationId);
    const p = item.routeSteps.find((x) => x.routeStepId === req.params.stepId);
    if (!p) throw new NotFoundError("Etapa não encontrada no roteiro da peça");
    const check = canUndo(progressOf(item), p.routeStepId);
    if (!check.ok) throw new BadRequestError(check.motivo);
    // a foto continua guardada; a etapa volta a pendente
    await prisma.$transaction([
      prisma.pieceStepProgress.update({ where: { id: p.id }, data: { status: "PENDING", doneAt: null, doneById: null } }),
      prisma.productionItemEvent.create({ data: { itemId: item.id, action: "ROUTE_UNDO", note: `${stepLabel(p.routeStep)} desfeita`, createdById: req.user!.id } }),
    ]);
    return ok(res, { itemId: item.id }, `${p.routeStep.name} desfeita`);
  })
);

router.get(
  "/piece-steps/:progressId/photo",
  canRead,
  asyncHandler(async (req, res) => {
    const p = await prisma.pieceStepProgress.findFirst({ where: { id: req.params.progressId, item: { organizationId: req.user!.organizationId } } });
    if (!p?.photoKey) throw new NotFoundError("Foto não encontrada");
    const signed = await storage.getSignedUrl(p.photoKey, p.photoName ?? "foto.jpg");
    if (signed) return res.redirect(signed);
    const stream = await storage.getStream(p.photoKey);
    res.setHeader("Content-Type", p.photoMime ?? "image/jpeg");
    return pipeToResponse(stream, res);
  })
);

export default router;
