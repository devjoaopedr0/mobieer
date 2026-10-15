/**
 * Arquivos do pedido de produção enviados direto: /api/production
 *
 *   GET    /projects/:projectId/files        planos de corte, etiquetas e outros
 *   POST   /projects/:projectId/files        multipart: file, kind (PLANO_CORTE | ETIQUETA | OUTRO)
 *   GET    /files/:fileId/download
 *   DELETE /files/:fileId
 *
 * Serve para o pedido que não veio do Promob e para os projetos que já estavam
 * na fábrica quando entraram no sistema.
 */
import { Router } from "express";
import { z } from "zod";
import { buildStorageKey, storage } from "../../lib/storage";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { uploadDocument } from "../../middlewares/upload";
import { prisma } from "../../prisma";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { pipeToResponse } from "../../utils/stream";
import { getOrCreateOrder } from "./production.service";

export const PRODUCTION_FILE_KINDS = ["PLANO_CORTE", "ETIQUETA", "OUTRO"] as const;
export const PRODUCTION_FILE_LABEL: Record<string, string> = { PLANO_CORTE: "Plano de corte", ETIQUETA: "Etiquetas", OUTRO: "Outro" };

const router = Router();
router.use(authenticate);

async function ensureProject(id: string, organizationId: string) {
  const p = await prisma.project.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!p) throw new NotFoundError("Projeto não encontrado");
  return p;
}

const view = (f: { id: string; kind: string; fileName: string; mimeType: string | null; size: number | null; createdAt: Date; uploadedById: string | null }, names: Map<string, string>) => ({
  id: f.id,
  kind: f.kind,
  kindLabel: PRODUCTION_FILE_LABEL[f.kind] ?? f.kind,
  fileName: f.fileName,
  mimeType: f.mimeType,
  size: f.size,
  createdAt: f.createdAt,
  uploadedBy: f.uploadedById ? (names.get(f.uploadedById) ?? null) : null,
  downloadUrl: `/api/production/files/${f.id}/download`,
});

async function list(orderId: string) {
  const files = await prisma.productionFile.findMany({ where: { orderId }, orderBy: [{ kind: "asc" }, { createdAt: "desc" }] });
  const ids = [...new Set(files.map((f) => f.uploadedById).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return files.map((f) => view(f, names));
}

router.get(
  "/projects/:projectId/files",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    await ensureProject(req.params.projectId, req.user!.organizationId);
    const order = await prisma.productionOrder.findUnique({ where: { projectId: req.params.projectId }, select: { id: true } });
    return ok(res, order ? await list(order.id) : []);
  })
);

router.post(
  "/projects/:projectId/files",
  requirePermission("organization.manage"),
  uploadDocument.single("file"),
  asyncHandler(async (req, res) => {
    const project = await ensureProject(req.params.projectId, req.user!.organizationId);
    if (!req.file) throw new BadRequestError("Escolha o arquivo");
    const { kind } = z.object({ kind: z.enum(PRODUCTION_FILE_KINDS).default("PLANO_CORTE") }).parse(req.body);
    const order = await getOrCreateOrder(project.id, req.user!.organizationId, req.user!.id);
    const key = buildStorageKey(`production/${order.id}`, req.file.originalname);
    await storage.put(key, req.file.buffer, req.file.mimetype);
    await prisma.productionFile.create({
      data: { orderId: order.id, kind, fileName: req.file.originalname, storageKey: key, mimeType: req.file.mimetype, size: req.file.size, uploadedById: req.user!.id },
    });
    return ok(res, await list(order.id), `${PRODUCTION_FILE_LABEL[kind]} anexado`);
  })
);

async function fileFor(id: string, organizationId: string) {
  const f = await prisma.productionFile.findFirst({ where: { id, order: { organizationId } } });
  if (!f) throw new NotFoundError("Arquivo não encontrado");
  return f;
}

router.get(
  "/files/:fileId/download",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const f = await fileFor(req.params.fileId, req.user!.organizationId);
    const signed = await storage.getSignedUrl(f.storageKey, f.fileName);
    if (signed) return res.redirect(signed);
    res.setHeader("Content-Type", f.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.fileName)}"`);
    return pipeToResponse(await storage.getStream(f.storageKey), res);
  })
);

router.delete(
  "/files/:fileId",
  requirePermission("organization.manage"),
  asyncHandler(async (req, res) => {
    const f = await fileFor(req.params.fileId, req.user!.organizationId);
    await prisma.productionFile.delete({ where: { id: f.id } });
    await storage.remove(f.storageKey).catch(() => undefined);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PRODUCTION_FILE_REMOVED", entity: "ProductionFile", entityId: f.id, details: { fileName: f.fileName, kind: f.kind } } });
    return ok(res, await list(f.orderId), "Arquivo removido");
  })
);

export default router;
