/**
 * Vistoria por ambiente (montado em /api/aftersales). Tudo com inspections.manage.
 *
 *   POST   /inspections/:id/rooms                 acrescenta um ambiente à vistoria
 *   PATCH  /inspection-rooms/:roomId              situação e observação do ambiente
 *   DELETE /inspection-rooms/:roomId              tira o ambiente (rascunho e sem pendências)
 *   POST   /inspection-rooms/:roomId/pendencies   abre uma pendência no ambiente
 *   PATCH  /inspection-pendencies/:id             resolve ou reabre
 *   POST   /inspection-pendencies/:id/transfer    passa a pendência para outro ambiente (fica registrado)
 *
 * Os ambientes e as pendências seguem editáveis depois de concluída a vistoria:
 * é o acompanhamento até a entrega de cada ambiente. O checklist não muda.
 * Fotos de cada ambiente: registro central de arquivos, entidade "SiteInspectionRoom".
 */
import { Router } from "express";
import { z } from "zod";
import { InspectionPendencyKind, InspectionRoomStatus } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { projectScope } from "../../lib/scope";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { registerFileEntity } from "../files/files.service";
import { PENDENCY_KIND_LABEL, ROOM_STATUS_LABEL, roomStatusProblem, statusAfterNewPendency, transferProblem } from "./inspection-rooms.rules";

registerFileEntity("SiteInspectionRoom", {
  label: "Ambiente da vistoria",
  read: ["organization.read"],
  write: ["inspections.manage"],
  resolve: async (u, id) => {
    const r = await prisma.siteInspectionRoom.findFirst({
      where: { id, inspection: { organizationId: u.organizationId, project: projectScope(u) } },
      select: { name: true, inspection: { select: { project: { select: { id: true, code: true, clientId: true } } } } },
    });
    return r ? { projectId: r.inspection.project.id, clientId: r.inspection.project.clientId, label: `Vistoria ${r.inspection.project.code} — ${r.name}` } : null;
  },
});

const router = Router();
router.use(authenticate);
const canManage = requirePermission("inspections.manage");

type User = NonNullable<Express.Request["user"]>;
const inScope = (u: User) => ({ organizationId: u.organizationId, project: projectScope(u) });

async function roomFor(roomId: string, u: User) {
  const room = await prisma.siteInspectionRoom.findFirst({
    where: { id: roomId, inspection: inScope(u) },
    include: { inspection: { select: { id: true, status: true } }, pendencies: { select: { id: true, kind: true, status: true } } },
  });
  if (!room) throw new NotFoundError("Ambiente da vistoria não encontrado");
  return room;
}

async function pendencyFor(id: string, u: User) {
  const p = await prisma.inspectionPendency.findFirst({ where: { id, inspection: inScope(u) }, include: { room: { select: { id: true, name: true } } } });
  if (!p) throw new NotFoundError("Pendência não encontrada");
  return p;
}

const log = (userId: string, action: string, entityId: string, details: Record<string, unknown>) =>
  prisma.auditLog.create({ data: { userId, action, entity: "SiteInspection", entityId, details: details as object } });

router.post(
  "/inspections/:id/rooms",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1, "Dê o nome do ambiente").max(120), projectRoomId: z.string().min(1).nullable().optional() }).parse(req.body);
    const insp = await prisma.siteInspection.findFirst({ where: { id: req.params.id, ...inScope(req.user!) }, select: { id: true, projectId: true, rooms: { select: { name: true } } } });
    if (!insp) throw new NotFoundError("Vistoria não encontrada");
    if (insp.rooms.some((r) => r.name.toLowerCase() === input.name.toLowerCase())) throw new BadRequestError("Este ambiente já está na vistoria");
    if (input.projectRoomId) {
      const pr = await prisma.projectRoom.findFirst({ where: { id: input.projectRoomId, projectId: insp.projectId }, select: { id: true } });
      if (!pr) throw new BadRequestError("Ambiente não é deste projeto");
    }
    const room = await prisma.siteInspectionRoom.create({ data: { inspectionId: insp.id, name: input.name, projectRoomId: input.projectRoomId ?? null, position: insp.rooms.length, updatedById: req.user!.id } });
    return ok(res, { id: room.id }, "Ambiente acrescentado");
  })
);

router.patch(
  "/inspection-rooms/:roomId",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ status: z.nativeEnum(InspectionRoomStatus).optional(), note: z.string().trim().max(1000).nullable().optional() }).parse(req.body);
    const room = await roomFor(req.params.roomId, req.user!);
    if (input.status) {
      const problem = roomStatusProblem(input.status, room.pendencies);
      if (problem) throw new BadRequestError(problem);
    }
    await prisma.siteInspectionRoom.update({ where: { id: room.id }, data: { status: input.status, note: input.note === undefined ? undefined : input.note || null, updatedById: req.user!.id } });
    if (input.status && input.status !== room.status) await log(req.user!.id, "INSPECTION_ROOM_STATUS", room.inspection.id, { room: room.name, from: room.status, to: input.status });
    return ok(res, { id: room.id }, input.status ? `${room.name}: ${ROOM_STATUS_LABEL[input.status].toLowerCase()}` : "Ambiente salvo");
  })
);

router.delete(
  "/inspection-rooms/:roomId",
  canManage,
  asyncHandler(async (req, res) => {
    const room = await roomFor(req.params.roomId, req.user!);
    if (room.inspection.status !== "DRAFT") throw new BadRequestError("Vistoria concluída: o ambiente não pode sair do relatório");
    if (room.pendencies.length) throw new BadRequestError("O ambiente tem pendências: passe-as para outro ambiente antes de tirá-lo");
    await prisma.siteInspectionRoom.delete({ where: { id: room.id } });
    return ok(res, null, "Ambiente retirado da vistoria");
  })
);

router.post(
  "/inspection-rooms/:roomId/pendencies",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        kind: z.nativeEnum(InspectionPendencyKind),
        description: z.string().trim().min(2, "Descreva a pendência").max(500),
        targetRoomName: z.string().trim().max(120).nullable().optional(),
      })
      .parse(req.body);
    if (input.kind === "MUDANCA_AMBIENTE" && !input.targetRoomName) throw new BadRequestError("Diga para qual ambiente a peça vai");
    const room = await roomFor(req.params.roomId, req.user!);
    await prisma.$transaction([
      prisma.inspectionPendency.create({
        data: { inspectionId: room.inspection.id, roomId: room.id, kind: input.kind, description: input.description, targetRoomName: input.kind === "MUDANCA_AMBIENTE" ? input.targetRoomName : null, createdById: req.user!.id },
      }),
      prisma.siteInspectionRoom.update({ where: { id: room.id }, data: { status: statusAfterNewPendency(room.status), updatedById: req.user!.id } }),
    ]);
    await log(req.user!.id, "INSPECTION_PENDENCY_CREATED", room.inspection.id, { room: room.name, kind: input.kind, description: input.description });
    return ok(res, null, `${PENDENCY_KIND_LABEL[input.kind]} registrada em ${room.name}`);
  })
);

router.patch(
  "/inspection-pendencies/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ status: z.enum(["ABERTA", "RESOLVIDA"]), resolutionNote: z.string().trim().max(500).nullable().optional() }).parse(req.body);
    const p = await pendencyFor(req.params.id, req.user!);
    const resolved = input.status === "RESOLVIDA";
    await prisma.inspectionPendency.update({
      where: { id: p.id },
      data: { status: input.status, resolutionNote: resolved ? input.resolutionNote || null : null, resolvedAt: resolved ? p.resolvedAt ?? new Date() : null, resolvedById: resolved ? p.resolvedById ?? req.user!.id : null },
    });
    if (!resolved) await prisma.siteInspectionRoom.updateMany({ where: { id: p.roomId, status: "APROVADO" }, data: { status: "COM_PENDENCIA", updatedById: req.user!.id } });
    await log(req.user!.id, resolved ? "INSPECTION_PENDENCY_RESOLVED" : "INSPECTION_PENDENCY_REOPENED", p.inspectionId, { room: p.room.name, description: p.description });
    return ok(res, null, resolved ? "Pendência resolvida" : "Pendência reaberta");
  })
);

router.post(
  "/inspection-pendencies/:id/transfer",
  canManage,
  asyncHandler(async (req, res) => {
    const input = z.object({ toRoomId: z.string().min(1), reason: z.string().trim().max(300).nullable().optional() }).parse(req.body);
    const p = await pendencyFor(req.params.id, req.user!);
    const to = await prisma.siteInspectionRoom.findFirst({ where: { id: input.toRoomId }, select: { id: true, inspectionId: true, name: true, status: true } });
    const problem = transferProblem(p, to);
    if (problem) throw new BadRequestError(problem);
    await prisma.$transaction([
      prisma.inspectionPendencyTransfer.create({ data: { pendencyId: p.id, fromRoomId: p.roomId, toRoomId: to!.id, reason: input.reason || null, byId: req.user!.id } }),
      prisma.inspectionPendency.update({ where: { id: p.id }, data: { roomId: to!.id } }),
      prisma.siteInspectionRoom.update({ where: { id: to!.id }, data: { status: statusAfterNewPendency(to!.status), updatedById: req.user!.id } }),
    ]);
    await log(req.user!.id, "INSPECTION_PENDENCY_TRANSFERRED", p.inspectionId, { description: p.description, from: p.room.name, to: to!.name, reason: input.reason || null });
    return ok(res, null, `Pendência passada de ${p.room.name} para ${to!.name}`);
  })
);

export default router;
