import { requisitionsPdf, type PerPage } from "./requisitions.pdf";
import { InspectionResult, MovementType, Prisma, RequisitionItemStatus, RequisitionStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../../prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/ApiError";
import { nextCode } from "../../utils/helpers";
import { buildStorageKey, storage } from "../../lib/storage";
import type { LabelSuggestion } from "./requisitions.label";
import { createExitWithClient } from "../stock/stock.service";
import { SUPPLY_TYPE_LABEL, type CreateRequisitionInput, type ReservationInput, type UpdateRequisitionInput } from "./requisitions.schema";

const STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: "Rascunho", REQUESTED: "Solicitada", IN_REVIEW: "Em análise", WAITING_MATERIAL: "Aguardando material",
  RELEASED: "Liberada para corte", IN_CUTTING: "Em corte", INSPECTION: "Conferência", COMPLETED: "Concluída", CANCELLED: "Cancelada",
};

const include = {
  requester: { select: { id: true, name: true, sector: true, position: true } },
  approvedBy: { select: { id: true, name: true } }, responsible: { select: { id: true, name: true } },
  cutter: { select: { id: true, name: true } }, inspector: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, name: true, client: { select: { name: true } } } },
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: { select: { id: true, name: true, code: true, unit: true, stock: true, reservedStock: true } },
      reservations: { where: { status: ReservationStatus.ACTIVE }, select: { id: true, quantity: true, status: true } },
      receivedBy: { select: { id: true, name: true } },
      separatedBy: { select: { id: true, name: true } },
      photos: { select: { id: true, kind: true, createdAt: true, ocrConfirmedAt: true }, orderBy: { createdAt: "asc" as const } },
    },
  },
  history: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" as const } },
  attachments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.RequisitionInclude;

type FullRequisition = Prisma.RequisitionGetPayload<{ include: typeof include }>;

/** Quantas vezes cada item faltou, pelo histórico desta requisição. */
function missingTimesFromHistory(history: { action: string; toValue: Prisma.JsonValue }[]) {
  const out = new Map<string, number>();
  for (const h of history) {
    if (h.action !== "REQUISITION_ITEM_MISSING") continue;
    const itemId = (h.toValue as { itemId?: string } | null)?.itemId;
    if (itemId) out.set(itemId, (out.get(itemId) ?? 0) + 1);
  }
  return out;
}

function serialize(r: FullRequisition, missingByCode: Map<string, number> = new Map()) {
  // peça cancelada sai da conta
  const live = r.items.filter((item) => item.status !== RequisitionItemStatus.CANCELLED);
  const totalQty = live.reduce((sum, item) => sum + item.quantity, 0);
  const missingTimes = missingTimesFromHistory(r.history);
  const completedQty = live.reduce((sum, item) => sum + (isItemDone(item.status) ? item.quantity : 0), 0);
  return {
    ...r, statusLabel: STATUS_LABEL[r.status], itemCount: r.items.length, totalQty, completedQty,
    progress: totalQty ? Math.round((completedQty / totalQty) * 100) : 0,
    overdue: Boolean(r.neededAt && r.neededAt < new Date() && !(r.status === RequisitionStatus.COMPLETED || r.status === RequisitionStatus.CANCELLED)),
    items: r.items.map((item) => ({
      ...item, thickness: item.thickness === null ? null : Number(item.thickness), length: item.length === null ? null : Number(item.length), width: item.width === null ? null : Number(item.width),
      reservedQuantity: item.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0),
      // quantas vezes esta peça faltou (nesta requisição; com código, em todas)
      missingTimes: missingTimes.get(item.id) ?? 0,
      missingTimesByCode: item.pieceCode ? missingByCode.get(item.pieceCode.toUpperCase()) ?? 0 : null,
      availability: item.product ? { physical: item.product.stock, reserved: item.product.reservedStock, available: Math.max(0, item.product.stock - item.product.reservedStock), situation: item.product.stock - item.product.reservedStock >= item.quantity ? "AVAILABLE" : item.product.stock - item.product.reservedStock > 0 ? "PARTIAL" : "UNAVAILABLE" } : null,
    })),
  };
}

async function requireRequisition(id: string) {
  const requisition = await prisma.requisition.findUnique({ where: { id }, include });
  if (!requisition) throw new NotFoundError("Requisição não encontrada");
  return requisition;
}

async function logHistory(tx: Prisma.TransactionClient, requisitionId: string, userId: string, action: string, fromValue?: Prisma.InputJsonValue, toValue?: Prisma.InputJsonValue, note?: string | null) {
  await Promise.all([
    tx.requisitionHistory.create({ data: { requisitionId, userId, action, fromValue, toValue, note: note ?? null } }),
    tx.auditLog.create({ data: { userId, action, entity: "Requisition", entityId: requisitionId, details: { from: fromValue, to: toValue, note } } }),
  ]);
}

/** Itens que contam como prontos no progresso (faltando não conta). */
export const isItemDone = (status: RequisitionItemStatus) => status === RequisitionItemStatus.CUT || status === RequisitionItemStatus.INSPECTED;

/**
 * Conferência: as peças que não estão faltando nem canceladas precisam estar
 * cortadas. Peça faltando não segura a conferência das outras.
 */
export function readyForInspection(items: { status: RequisitionItemStatus }[]) {
  return items.every((i) => i.status === RequisitionItemStatus.MISSING || i.status === RequisitionItemStatus.CANCELLED || isItemDone(i.status));
}

/** Conclusão: trava enquanto houver peça faltando (até ser recebida ou cancelada). */
export function assertNoMissing(items: { status: RequisitionItemStatus; description: string }[]) {
  const missing = items.filter((i) => i.status === RequisitionItemStatus.MISSING);
  if (missing.length) throw new BadRequestError(`Há peça faltando (${missing.map((i) => i.description).join(", ")}): receba ou cancele a peça antes de concluir`);
}

/**
 * Andamento da peça no corte e na conferência. Faltando (MISSING) entra pelo
 * registro de falta (com quantidade e foto); quando a peça chega, volta para a fila.
 */
export const ITEM_TRANSITIONS: Record<RequisitionItemStatus, RequisitionItemStatus[]> = {
  PENDING: [RequisitionItemStatus.CUTTING],
  CUTTING: [RequisitionItemStatus.PENDING, RequisitionItemStatus.CUT],
  CUT: [RequisitionItemStatus.CUTTING, RequisitionItemStatus.INSPECTED],
  INSPECTED: [RequisitionItemStatus.CUT],
  MISSING: [RequisitionItemStatus.PENDING, RequisitionItemStatus.CUTTING, RequisitionItemStatus.CUT],
  // cancelada é final: entra pelo cancelamento da peça faltante
  CANCELLED: [],
};

/** Mover de ambiente, registrar falta e recebimento: depois de enviada e antes de cancelar. */
export function assertItemFollowUp(status: RequisitionStatus) {
  if (status === RequisitionStatus.DRAFT) throw new BadRequestError("Rascunho: ajuste o item editando a requisição");
  if (status === RequisitionStatus.CANCELLED) throw new BadRequestError("Requisição cancelada");
}

export async function listRequisitions(params: { page: number; perPage: number; kind?: string; status?: RequisitionStatus; priority?: string; search?: string; userId?: string; overdue?: boolean; sort?: string }) {
  const where: Prisma.RequisitionWhereInput = {};
  if (params.kind) where.kind = params.kind;
  if (params.status) where.status = params.status;
  if (params.priority) where.priority = params.priority as never;
  if (params.userId) where.requesterId = params.userId;
  if (params.overdue) where.AND = [{ neededAt: { lt: new Date() } }, { status: { notIn: [RequisitionStatus.COMPLETED, RequisitionStatus.CANCELLED] } }];
  if (params.search) where.OR = [{ number: { contains: params.search, mode: "insensitive" } }, { clientName: { contains: params.search, mode: "insensitive" } }, { projectReference: { contains: params.search, mode: "insensitive" } }, { requester: { name: { contains: params.search, mode: "insensitive" } } }, { items: { some: { description: { contains: params.search, mode: "insensitive" } } } }, { items: { some: { pieceCode: { contains: params.search, mode: "insensitive" } } } }, { project: { name: { contains: params.search, mode: "insensitive" } } }];
  const orderBy: Prisma.RequisitionOrderByWithRelationInput[] = params.sort === "oldest" ? [{ createdAt: "asc" }] : params.sort === "deadline" ? [{ neededAt: "asc" }] : params.sort === "priority" ? [{ priority: "desc" }, { neededAt: "asc" }] : [{ createdAt: "desc" }];
  const [total, rows] = await prisma.$transaction([prisma.requisition.count({ where }), prisma.requisition.findMany({ where, include, orderBy, skip: (params.page - 1) * params.perPage, take: params.perPage })]);
  return { items: rows.map((r) => serialize(r)), meta: { page: params.page, perPage: params.perPage, total, pages: Math.max(1, Math.ceil(total / params.perPage)) } };
}

/** Faltas registradas de cada código de peça, em todas as requisições (histórico). */
async function missingByPieceCode(codes: string[]) {
  const out = new Map<string, number>();
  const wanted = [...new Set(codes.filter(Boolean).map((c) => c.toUpperCase()))];
  if (!wanted.length) return out;
  const rows = await prisma.requisitionHistory.findMany({ where: { action: "REQUISITION_ITEM_MISSING", OR: wanted.map((c) => ({ toValue: { path: ["pieceCode"], equals: c } })) }, select: { toValue: true } });
  for (const r of rows) {
    const code = (r.toValue as { pieceCode?: string } | null)?.pieceCode;
    if (code) out.set(code, (out.get(code) ?? 0) + 1);
  }
  return out;
}

export async function getRequisition(id: string) {
  const r = await requireRequisition(id);
  return serialize(r, await missingByPieceCode(r.items.map((i) => i.pieceCode ?? "")));
}

export async function getIndicators(userId?: string) {
  const now = new Date();
  const scope = userId ? { requesterId: userId } : {};
  const grouped = await prisma.requisition.groupBy({ by: ["status"], where: scope, _count: true });
  const count = Object.fromEntries(grouped.map((row) => [row.status, row._count]));
  const overdue = await prisma.requisition.count({ where: { ...scope, neededAt: { lt: now }, status: { notIn: [RequisitionStatus.COMPLETED, RequisitionStatus.CANCELLED] } } });
  return { open: Object.entries(count).filter(([status]) => !["COMPLETED", "CANCELLED"].includes(status)).reduce((sum, [, value]) => sum + value, 0), inReview: count.IN_REVIEW ?? 0, waitingMaterial: count.WAITING_MATERIAL ?? 0, released: count.RELEASED ?? 0, inCutting: count.IN_CUTTING ?? 0, inspection: count.INSPECTION ?? 0, completed: count.COMPLETED ?? 0, overdue };
}

function itemData(item: CreateRequisitionInput["items"][number]) { return { room: item.room ?? null, supplyType: item.supplyType ?? null, description: item.description, material: item.material ?? null, productId: item.productId ?? null, thickness: item.thickness ?? null, length: item.length ?? null, width: item.width ?? null, quantity: item.quantity, unit: item.unit, edgeFinish: item.edgeFinish ?? null, note: item.note ?? null, observation: item.observation ?? null, pieceCode: item.pieceCode ?? null, moduleRef: item.moduleRef ?? null, cutPlanRef: item.cutPlanRef ?? null }; }

/** Obra escolhida: precisa ser projeto da organização de quem lança. */
async function checkProject(projectId: string | null | undefined, organizationId: string) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
  if (!project) throw new BadRequestError("Projeto (obra) não encontrado");
  return project.id;
}

/**
 * Cria os itens um a um para ligar a foto da etiqueta lida no formulário.
 * Salvar o item com a foto é a confirmação humana da leitura.
 */
async function createItems(tx: Prisma.TransactionClient, requisitionId: string, items: CreateRequisitionInput["items"], actorId: string, permissions: string[]) {
  for (const item of items) {
    const created = await tx.requisitionItem.create({ data: { ...itemData(item), requisitionId } });
    if (!item.labelPhotoId) continue;
    const photo = await tx.requisitionPhoto.findUnique({ where: { id: item.labelPhotoId }, select: { id: true, kind: true, uploadedById: true, requisitionItemId: true, ocrConfirmedAt: true } });
    if (!photo || photo.kind !== "ETIQUETA") throw new BadRequestError("Foto da etiqueta não encontrada");
    if (photo.requisitionItemId) throw new BadRequestError("Esta foto de etiqueta já está em outro item");
    if (photo.uploadedById !== actorId && !permissions.includes("requisitions.edit.all")) throw new ForbiddenError("A foto da etiqueta foi enviada por outra pessoa");
    await tx.requisitionPhoto.update({ where: { id: photo.id }, data: { requisitionItemId: created.id, ...(photo.ocrConfirmedAt ? {} : { ocrConfirmedAt: new Date(), ocrConfirmedById: actorId }) } });
  }
}

export async function createRequisition(input: CreateRequisitionInput, requesterId: string, organizationId: string, permissions: string[] = []) {
  // insumo sem produto do estoque vale (o estoque pode não estar cadastrado): só não dá baixa na entrega
  const projectId = await checkProject(input.projectId, organizationId);
  const number = await nextCode("requisition", "REQ");
  const id = await prisma.$transaction(async (tx) => {
    const req = await tx.requisition.create({ data: { number, kind: input.kind, sector: input.sector ?? null, destination: input.destination ?? null, clientName: input.clientName ?? null, projectReference: input.projectReference ?? null, projectId, priority: input.priority, orderedAt: input.orderedAt ? new Date(input.orderedAt) : null, neededAt: input.neededAt ? new Date(input.neededAt) : null, responsibleId: input.responsibleId ?? null, note: input.note ?? null, requesterId, status: input.submit ? RequisitionStatus.REQUESTED : RequisitionStatus.DRAFT, submittedAt: input.submit ? new Date() : null, attachments: { create: input.attachments.map((a) => ({ name: a.name, url: a.url, mimeType: a.mimeType ?? null, size: a.size ?? null })) } }, select: { id: true } });
    await createItems(tx, req.id, input.items, requesterId, permissions);
    await logHistory(tx, req.id, requesterId, input.submit ? "REQUISITION_SUBMITTED" : "REQUISITION_CREATED", undefined, { number, itemCount: input.items.length });
    return req.id;
  });
  return getRequisition(id);
}

export const EDITABLE_STATUSES: RequisitionStatus[] = [RequisitionStatus.DRAFT, RequisitionStatus.REQUESTED];

export async function updateRequisition(id: string, input: UpdateRequisitionInput, actorId: string, permissions: string[], organizationId: string) {
  const current = await requireRequisition(id);
  const projectId = input.projectId === undefined ? undefined : await checkProject(input.projectId, organizationId);
  // rascunho, ou já enviada mas ainda sem ninguém ter começado a análise (não há reserva de material nessa fase)
  if (!EDITABLE_STATUSES.includes(current.status)) throw new BadRequestError("A requisição já está em análise: só dá para editar o rascunho ou a enviada que ainda não foi analisada");
  if (current.requesterId !== actorId && !permissions.includes("requisitions.edit.all")) throw new ForbiddenError("Você só pode editar as suas próprias requisições");
  const updated = await prisma.$transaction(async (tx) => {
    // os itens são refeitos; a foto da etiqueta volta a ser ligada pelo labelPhotoId que o formulário manda
    if (input.items) { await tx.requisitionItem.deleteMany({ where: { requisitionId: id } }); await createItems(tx, id, input.items, actorId, permissions); }
    const req = await tx.requisition.update({ where: { id }, data: { sector: input.sector, destination: input.destination, clientName: input.clientName, projectReference: input.projectReference, projectId, priority: input.priority, orderedAt: input.orderedAt === undefined ? undefined : input.orderedAt ? new Date(input.orderedAt) : null, neededAt: input.neededAt === undefined ? undefined : input.neededAt ? new Date(input.neededAt) : null, responsibleId: input.responsibleId, note: input.note }, include });
    await logHistory(tx, id, actorId, "REQUISITION_UPDATED", { updatedAt: current.updatedAt.toISOString() }, { items: input.items?.length });
    return req;
  });
  return serialize(updated);
}

const TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  DRAFT: [RequisitionStatus.REQUESTED, RequisitionStatus.CANCELLED], REQUESTED: [RequisitionStatus.IN_REVIEW, RequisitionStatus.CANCELLED],
  IN_REVIEW: [RequisitionStatus.WAITING_MATERIAL, RequisitionStatus.RELEASED, RequisitionStatus.CANCELLED], WAITING_MATERIAL: [RequisitionStatus.IN_REVIEW, RequisitionStatus.RELEASED, RequisitionStatus.CANCELLED],
  RELEASED: [RequisitionStatus.IN_CUTTING, RequisitionStatus.CANCELLED], IN_CUTTING: [RequisitionStatus.INSPECTION, RequisitionStatus.CANCELLED],
  INSPECTION: [RequisitionStatus.IN_CUTTING, RequisitionStatus.COMPLETED, RequisitionStatus.CANCELLED], COMPLETED: [], CANCELLED: [],
};
const REQUIRED_PERMISSION: Partial<Record<RequisitionStatus, string>> = { IN_REVIEW: "requisitions.analyze", WAITING_MATERIAL: "requisitions.analyze", RELEASED: "requisitions.release", IN_CUTTING: "requisitions.cut", INSPECTION: "requisitions.cut", COMPLETED: "requisitions.inspect", CANCELLED: "requisitions.cancel" };

export function assertRequisitionTransition(current: RequisitionStatus, next: RequisitionStatus, permissions: string[]) {
  if (!TRANSITIONS[current].includes(next)) throw new BadRequestError(`Transição inválida: ${STATUS_LABEL[current]} → ${STATUS_LABEL[next]}`);
  const required = REQUIRED_PERMISSION[next];
  if (current === RequisitionStatus.DRAFT && next === RequisitionStatus.REQUESTED) return;
  if (required && !permissions.includes(required)) throw new ForbiddenError(`Permissão necessária: ${required}`);
}

async function cancelReservations(tx: Prisma.TransactionClient, requisitionId: string, actorId: string) {
  const reservations = await tx.stockReservation.findMany({ where: { requisitionId, status: ReservationStatus.ACTIVE } });
  for (const reservation of reservations) {
    await tx.product.update({ where: { id: reservation.productId }, data: { reservedStock: { decrement: reservation.quantity } } });
    await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: ReservationStatus.CANCELLED } });
    await tx.stockMovement.create({ data: { type: MovementType.RELEASE, productId: reservation.productId, quantity: reservation.quantity, responsibleId: actorId, reservationId: reservation.id, requisitionId, note: "Reserva liberada pelo cancelamento da requisição" } });
  }
}

export async function updateRequisitionStatus(id: string, next: RequisitionStatus, note: string | null, actorId: string, permissions: string[], responsibleId?: string | null) {
  const current = await requireRequisition(id);
  if (current.status === RequisitionStatus.DRAFT && next === RequisitionStatus.REQUESTED && current.requesterId !== actorId && !permissions.includes("requisitions.edit.all")) throw new ForbiddenError("Você só pode enviar seus próprios rascunhos");
  if (next === RequisitionStatus.CANCELLED && !permissions.includes("requisitions.read.all") && (current.requesterId !== actorId || !(current.status === RequisitionStatus.DRAFT || current.status === RequisitionStatus.REQUESTED))) throw new ForbiddenError("Solicitantes só podem cancelar suas próprias requisições antes da análise");
  assertRequisitionTransition(current.status, next, permissions);
  // insumos não passam pelo corte; concluir é a entrega do almoxarifado (com baixa no estoque)
  if (current.kind === "INSUMOS" && ([RequisitionStatus.RELEASED, RequisitionStatus.IN_CUTTING, RequisitionStatus.INSPECTION, RequisitionStatus.COMPLETED] as RequisitionStatus[]).includes(next)) throw new BadRequestError("Requisição de insumos: use Entregar insumos");
  if (next === RequisitionStatus.RELEASED) {
    const insufficient = current.items.find((item) => item.product && (item.product.stock - item.product.reservedStock) + item.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0) < item.quantity);
    if (insufficient) throw new BadRequestError(`Material insuficiente para liberar a peça "${insufficient.description}"`);
  }
  if (next === RequisitionStatus.INSPECTION && !readyForInspection(current.items)) throw new BadRequestError("Todas as peças precisam estar cortadas antes da conferência (as que estão faltando podem ficar)");
  if (next === RequisitionStatus.COMPLETED) assertNoMissing(current.items);
  const updated = await prisma.$transaction(async (tx) => {
    if (next === RequisitionStatus.CANCELLED) await cancelReservations(tx, id, actorId);
    const data: Prisma.RequisitionUpdateInput = { status: next, ...(responsibleId !== undefined ? { responsible: responsibleId ? { connect: { id: responsibleId } } : { disconnect: true } } : {}) };
    if (next === RequisitionStatus.REQUESTED) data.submittedAt = new Date();
    if (next === RequisitionStatus.IN_REVIEW) data.approvedBy = { connect: { id: actorId } };
    if (next === RequisitionStatus.RELEASED) data.approvedAt = new Date();
    if (next === RequisitionStatus.IN_CUTTING) { data.cutter = { connect: { id: actorId } }; if (!current.cuttingStartedAt) data.cuttingStartedAt = new Date(); }
    if (next === RequisitionStatus.COMPLETED) data.completedAt = new Date();
    if (next === RequisitionStatus.CANCELLED) data.cancelledAt = new Date();
    const req = await tx.requisition.update({ where: { id }, data, include });
    await logHistory(tx, id, actorId, "REQUISITION_STATUS_CHANGED", { status: current.status }, { status: next }, note);
    return req;
  });
  return serialize(updated);
}

export async function updateItemStatus(requisitionId: string, itemId: string, status: RequisitionItemStatus, actorId: string, note?: string | null) {
  const req = await requireRequisition(requisitionId);
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Peça não encontrada");
  // a peça que faltava pode chegar depois do corte (na entrega); o resto só no corte ou na conferência
  if (item.status === RequisitionItemStatus.MISSING) assertItemFollowUp(req.status);
  else if (!(req.status === RequisitionStatus.IN_CUTTING || req.status === RequisitionStatus.INSPECTION)) throw new BadRequestError("O andamento das peças só pode ser alterado durante corte ou conferência");
  if (status === RequisitionItemStatus.MISSING) throw new BadRequestError("Use Registrar falta, com a quantidade que faltou");
  if (status === RequisitionItemStatus.CANCELLED || item.status === RequisitionItemStatus.CANCELLED) throw new BadRequestError("Peça cancelada não muda de andamento");
  if (!ITEM_TRANSITIONS[item.status].includes(status)) throw new BadRequestError("Transição inválida para a peça");
  // a peça que faltava chegou: a falta fica no histórico, não no item
  const data = item.status === RequisitionItemStatus.MISSING ? { status, missingQuantity: null } : { status };
  await prisma.$transaction(async (tx) => { await tx.requisitionItem.update({ where: { id: itemId }, data }); await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_STATUS_CHANGED", { itemId, status: item.status }, { itemId, status }, note); });
  return getRequisition(requisitionId);
}

type PhotoUpload = { buffer: Buffer; originalname: string; mimetype: string; size: number };

async function savePhoto(tx: Prisma.TransactionClient, kind: "ETIQUETA" | "FALTANDO" | "RECEBIMENTO", file: PhotoUpload, itemId: string | null, actorId: string) {
  const key = buildStorageKey(`requisitions/${kind.toLowerCase()}`, file.originalname);
  await storage.put(key, file.buffer, file.mimetype);
  return tx.requisitionPhoto.create({ data: { kind, storageKey: key, fileName: file.originalname, mimeType: file.mimetype, size: file.size, requisitionItemId: itemId, uploadedById: actorId }, select: { id: true } });
}

/** Mover o item para outro ambiente durante o corte e a entrega (fica no histórico). */
export async function changeItemRoom(requisitionId: string, itemId: string, room: string, note: string | null | undefined, actorId: string) {
  const req = await requireRequisition(requisitionId);
  assertItemFollowUp(req.status);
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Item não encontrado");
  if ((item.room ?? "") === room) throw new BadRequestError("O item já está nesse ambiente");
  await prisma.$transaction(async (tx) => {
    await tx.requisitionItem.update({ where: { id: itemId }, data: { room } });
    await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_ROOM_CHANGED", { itemId, room: item.room }, { itemId, room }, note ?? `${item.description}: ${item.room || "sem ambiente"} → ${room}`);
  });
  return getRequisition(requisitionId);
}

/** Peça faltando: quantas não vieram e a foto da etiqueta (opcional). */
export async function markItemMissing(requisitionId: string, itemId: string, missingQuantity: number, note: string | null | undefined, photo: PhotoUpload | undefined, actorId: string) {
  const req = await requireRequisition(requisitionId);
  assertItemFollowUp(req.status);
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Item não encontrado");
  if (item.status === RequisitionItemStatus.CANCELLED) throw new BadRequestError("Peça cancelada");
  if (missingQuantity > item.quantity) throw new BadRequestError(`Faltando mais do que o pedido (${item.quantity})`);
  await prisma.$transaction(async (tx) => {
    if (photo) await savePhoto(tx, "FALTANDO", photo, itemId, actorId);
    await tx.requisitionItem.update({ where: { id: itemId }, data: { status: RequisitionItemStatus.MISSING, missingQuantity } });
    await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_MISSING", { itemId, status: item.status }, { itemId, status: RequisitionItemStatus.MISSING, missingQuantity, photo: Boolean(photo), pieceCode: item.pieceCode?.toUpperCase() ?? null, description: item.description }, note ?? `${item.description}: faltando ${missingQuantity} de ${item.quantity}`);
  });
  return getRequisition(requisitionId);
}

/** Peça faltante cancelada: não vai mais ser feita/entregue; libera a conclusão. */
export async function cancelMissingItem(requisitionId: string, itemId: string, note: string, actorId: string) {
  const req = await requireRequisition(requisitionId);
  assertItemFollowUp(req.status);
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Item não encontrado");
  if (item.status !== RequisitionItemStatus.MISSING) throw new BadRequestError("Só a peça que está faltando pode ser cancelada");
  await prisma.$transaction(async (tx) => {
    await tx.requisitionItem.update({ where: { id: itemId }, data: { status: RequisitionItemStatus.CANCELLED } });
    await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_CANCELLED", { itemId, status: item.status, missingQuantity: item.missingQuantity }, { itemId, status: RequisitionItemStatus.CANCELLED }, note);
  });
  return getRequisition(requisitionId);
}

/** Recebimento pelo montador: quantidade, quem recebeu, quando e foto (opcional). */
export async function receiveItem(requisitionId: string, itemId: string, receivedQuantity: number, note: string | null | undefined, photo: PhotoUpload | undefined, actorId: string) {
  const req = await requireRequisition(requisitionId);
  assertItemFollowUp(req.status);
  if (req.status === RequisitionStatus.REQUESTED || req.status === RequisitionStatus.IN_REVIEW) {
    if (req.kind !== "INSUMOS") throw new BadRequestError("A peça ainda não foi liberada para o corte");
  }
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Item não encontrado");
  if (item.status === RequisitionItemStatus.CANCELLED) throw new BadRequestError("Peça cancelada");
  if (receivedQuantity > item.quantity) throw new BadRequestError(`Recebido mais do que o pedido (${item.quantity})`);
  await prisma.$transaction(async (tx) => {
    if (photo) await savePhoto(tx, "RECEBIMENTO", photo, itemId, actorId);
    // recebeu tudo do que estava faltando: a falta sai do item (fica no histórico)
    const arrived = item.status === RequisitionItemStatus.MISSING && receivedQuantity >= item.quantity;
    await tx.requisitionItem.update({ where: { id: itemId }, data: { receivedQuantity, receivedAt: new Date(), receivedById: actorId, ...(arrived ? { status: req.kind === "INSUMOS" ? RequisitionItemStatus.PENDING : RequisitionItemStatus.CUT, missingQuantity: null } : {}) } });
    await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_RECEIVED", { itemId, receivedQuantity: item.receivedQuantity }, { itemId, receivedQuantity, photo: Boolean(photo) }, note ?? `${item.description}: recebido ${receivedQuantity} de ${item.quantity}`);
  });
  return getRequisition(requisitionId);
}

/** Separação: quantas peças do item já foram separadas. Separar só parte do pedido é normal; zero desfaz. */
export async function separateItem(requisitionId: string, itemId: string, separatedQuantity: number, note: string | null | undefined, actorId: string) {
  const req = await requireRequisition(requisitionId);
  assertItemFollowUp(req.status);
  const item = req.items.find((entry) => entry.id === itemId); if (!item) throw new NotFoundError("Item não encontrado");
  if (item.status === RequisitionItemStatus.CANCELLED) throw new BadRequestError("Peça cancelada");
  const problem = separationProblem(separatedQuantity, item.quantity);
  if (problem) throw new BadRequestError(problem);
  await prisma.$transaction(async (tx) => {
    await tx.requisitionItem.update({ where: { id: itemId }, data: separatedQuantity > 0 ? { separatedQuantity, separatedAt: new Date(), separatedById: actorId } : { separatedQuantity: null, separatedAt: null, separatedById: null } });
    await logHistory(tx, requisitionId, actorId, "REQUISITION_ITEM_SEPARATED", { itemId, separatedQuantity: item.separatedQuantity }, { itemId, separatedQuantity }, note ?? `${item.description}: separado ${separatedQuantity} de ${item.quantity}`);
  });
  return getRequisition(requisitionId);
}

/** Quantidade separada válida (null = ok). */
export function separationProblem(separated: number, ordered: number): string | null {
  if (!Number.isInteger(separated) || separated < 0) return "Quantidade inválida";
  if (separated > ordered) return `Separado mais do que o pedido (${ordered})`;
  return null;
}

/**
 * Foto da etiqueta no formulário: guarda a foto e a leitura da IA como sugestão.
 * O item só recebe os dados quando o montador confere e salva (labelPhotoId).
 */
export async function readLabelPhoto(photo: PhotoUpload, actorId: string, read: (bytes: Buffer, mime: string) => Promise<LabelSuggestion | null>) {
  const suggestion = await read(photo.buffer, photo.mimetype).catch(() => null);
  const saved = await prisma.$transaction((tx) => savePhoto(tx, "ETIQUETA", photo, null, actorId));
  if (suggestion) await prisma.requisitionPhoto.update({ where: { id: saved.id }, data: { ocrJson: suggestion as unknown as Prisma.InputJsonValue } });
  return { photoId: saved.id, suggestion };
}

/** Quem pode ver a foto: quem tem acesso a todas, quem lançou a requisição ou quem tirou a foto. */
export async function photoForViewer(photoId: string, userId: string, readAll: boolean) {
  const photo = await prisma.requisitionPhoto.findUnique({ where: { id: photoId }, include: { requisitionItem: { select: { requisition: { select: { requesterId: true } } } } } });
  if (!photo) throw new NotFoundError("Foto não encontrada");
  if (!readAll && photo.uploadedById !== userId && photo.requisitionItem?.requisition.requesterId !== userId) throw new ForbiddenError("Você não pode ver esta foto");
  return photo;
}

/** Obras para o seletor: projetos da organização com os ambientes cadastrados. */
export async function listProjectsForRequisition(organizationId: string, search?: string) {
  const term = search?.trim();
  return prisma.project.findMany({
    where: { organizationId, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { code: { contains: term, mode: "insensitive" } }, { client: { name: { contains: term, mode: "insensitive" } } }] } : {}) },
    select: { id: true, code: true, name: true, status: true, client: { select: { name: true } }, rooms: { select: { id: true, name: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

export async function inspectRequisition(id: string, result: InspectionResult, note: string | null, actorId: string) {
  const current = await requireRequisition(id); if (current.status !== RequisitionStatus.INSPECTION) throw new BadRequestError("A requisição não está em conferência");
  const nextStatus = result === InspectionResult.APPROVED ? RequisitionStatus.COMPLETED : RequisitionStatus.IN_CUTTING;
  if (result === InspectionResult.APPROVED) assertNoMissing(current.items);
  const updated = await prisma.$transaction(async (tx) => {
    if (result === InspectionResult.APPROVED) await tx.requisitionItem.updateMany({ where: { requisitionId: id, status: { not: RequisitionItemStatus.CANCELLED } }, data: { status: RequisitionItemStatus.INSPECTED } });
    const req = await tx.requisition.update({ where: { id }, data: { status: nextStatus, inspectorId: actorId, inspectedAt: new Date(), inspectionResult: result, inspectionNote: note, completedAt: result === InspectionResult.APPROVED ? new Date() : null }, include });
    await logHistory(tx, id, actorId, "REQUISITION_INSPECTED", { status: current.status }, { status: nextStatus, result }, note); return req;
  }); return serialize(updated);
}

export async function reserveMaterials(id: string, input: ReservationInput, actorId: string) {
  const req = await requireRequisition(id); if (!(req.status === RequisitionStatus.IN_REVIEW || req.status === RequisitionStatus.WAITING_MATERIAL)) throw new BadRequestError("Materiais só podem ser reservados durante a análise");
  await prisma.$transaction(async (tx) => {
    for (const requested of input.items) {
      const item = req.items.find((entry) => entry.id === requested.requisitionItemId); if (!item?.productId || !item.product) throw new BadRequestError("A peça precisa estar vinculada a um produto do estoque");
      const alreadyReserved = item.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
      if (alreadyReserved + requested.quantity > item.quantity) throw new BadRequestError(`Reserva superior ao necessário para "${item.description}"`);
      const changed = await tx.$executeRaw`UPDATE "Product" SET "reservedStock" = "reservedStock" + ${requested.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${item.productId} AND ("stock" - "reservedStock") >= ${requested.quantity}`;
      if (!changed) throw new BadRequestError(`Estoque disponível insuficiente para "${item.product.name}"`);
      const reservation = await tx.stockReservation.create({ data: { productId: item.productId, quantity: requested.quantity, requesterId: actorId, requisitionId: id, requisitionItemId: item.id, warehouseId: null, note: `Reserva para ${req.number}` } });
      await tx.stockMovement.create({ data: { type: MovementType.RESERVE, productId: item.productId, quantity: requested.quantity, responsibleId: actorId, reservationId: reservation.id, requisitionId: id, note: `Reserva para ${req.number}` } });
    }
    await logHistory(tx, id, actorId, "REQUISITION_MATERIAL_RESERVED", undefined, { items: input.items });
  });
  return getRequisition(id);
}

export async function listCuttingBoard() {
  const rows = await prisma.requisition.findMany({ where: { kind: "PECAS", status: { in: [RequisitionStatus.RELEASED, RequisitionStatus.IN_CUTTING, RequisitionStatus.INSPECTION, RequisitionStatus.COMPLETED] } }, include, orderBy: [{ priority: "desc" }, { neededAt: "asc" }, { createdAt: "asc" }], take: 200 });
  return rows.map((r) => serialize(r));
}

/** Requisições para imprimir (três por folha): as escolhidas, ou as em aberto. */

export async function printRequisitions(ids: string[], userId?: string, perPage: PerPage = "auto") {
  const rows = await prisma.requisition.findMany({
    where: {
      ...(ids.length ? { id: { in: ids } } : { status: { notIn: [RequisitionStatus.DRAFT, RequisitionStatus.COMPLETED, RequisitionStatus.CANCELLED] } }),
      ...(userId ? { requesterId: userId } : {}),
    },
    orderBy: { number: "asc" },
    include: { requester: { select: { name: true } }, cutter: { select: { name: true } }, items: { orderBy: { createdAt: "asc" }, include: { product: { select: { category: { select: { name: true } } } } } } },
  });
  return requisitionsPdf(
    rows.map((r) => ({
      kind: r.kind,
      number: r.number,
      // SOLICITADO POR: quem lançou; MONTADOR: o campo "Montador" da tela (guardado em setor)
      requester: r.requester.name,
      fitter: r.sector,
      clientName: r.clientName,
      projectReference: r.projectReference,
      priority: r.priority,
      orderedAt: r.orderedAt ?? r.submittedAt ?? r.createdAt,
      neededAt: r.neededAt,
      cutter: r.cutter?.name ?? null,
      note: r.note,
      items: r.items.map((i) => ({ room: i.room, kindLabel: (i.supplyType && SUPPLY_TYPE_LABEL[i.supplyType as keyof typeof SUPPLY_TYPE_LABEL]) ?? i.product?.category?.name ?? null, quantity: i.quantity, unit: i.unit, description: i.description, material: i.material, thickness: i.thickness == null ? null : Number(i.thickness), length: i.length == null ? null : Number(i.length), width: i.width == null ? null : Number(i.width), edgeFinish: i.edgeFinish, note: i.note, observation: i.observation, pieceCode: i.pieceCode, moduleRef: i.moduleRef, cutPlanRef: i.cutPlanRef, missingQuantity: i.status === "MISSING" ? i.missingQuantity : null })),
    })),
    perPage
  );
}

/**
 * Almoxarifado entrega os insumos: dá baixa no estoque de cada item (saída
 * ligada à requisição) e conclui a requisição.
 */
export async function deliverSupplies(id: string, actorId: string, actorName: string) {
  const current = await requireRequisition(id);
  if (current.kind !== "INSUMOS") throw new BadRequestError("Só a requisição de insumos é entregue pelo almoxarifado");
  if (!([RequisitionStatus.REQUESTED, RequisitionStatus.IN_REVIEW, RequisitionStatus.WAITING_MATERIAL] as RequisitionStatus[]).includes(current.status)) throw new BadRequestError("Envie a requisição antes de entregar");
  assertNoMissing(current.items);
  // item cancelado não sai do estoque
  const live = current.items.filter((i) => i.status !== RequisitionItemStatus.CANCELLED);
  const items = live.filter((i) => i.productId).map((i) => ({ productId: i.productId!, quantity: i.quantity }));
  const updated = await prisma.$transaction(async (tx) => {
    // reserva feita para a requisição volta antes da saída
    await cancelReservations(tx, id, actorId);
    if (items.length) await createExitWithClient(tx, { items, requisitionId: id, sector: current.sector, destination: [current.clientName, current.projectReference].filter(Boolean).join(" — ") || current.destination, reason: "Requisição de insumos", note: current.number }, actorId, actorName);
    const req = await tx.requisition.update({ where: { id }, data: { status: RequisitionStatus.COMPLETED, completedAt: new Date(), approvedBy: { connect: { id: actorId } } }, include });
    await logHistory(tx, id, actorId, "REQUISITION_SUPPLIES_DELIVERED", { status: current.status }, { status: RequisitionStatus.COMPLETED, items: items.length });
    return req;
  });
  return serialize(updated);
}

/**
 * Marca como concluída de uma vez (o que já foi feito por fora do sistema,
 * ou entregue sem passar pelas etapas). Não mexe no estoque; reservas da
 * requisição são liberadas para não prender material.
 */
export async function markRequisitionDone(id: string, note: string | null, actorId: string) {
  const current = await requireRequisition(id);
  if (current.status === RequisitionStatus.COMPLETED || current.status === RequisitionStatus.CANCELLED) throw new BadRequestError("Esta requisição já está encerrada");
  assertNoMissing(current.items);
  const updated = await prisma.$transaction(async (tx) => {
    await cancelReservations(tx, id, actorId);
    const req = await tx.requisition.update({ where: { id }, data: { status: RequisitionStatus.COMPLETED, completedAt: new Date(), submittedAt: current.submittedAt ?? new Date() }, include });
    await logHistory(tx, id, actorId, "REQUISITION_MARKED_DONE", { status: current.status }, { status: RequisitionStatus.COMPLETED }, note);
    return req;
  });
  return serialize(updated);
}
