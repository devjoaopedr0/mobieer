import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { ForbiddenError } from "../../utils/ApiError";
import { BadRequestError } from "../../utils/ApiError";
import { pipeToResponse } from "../../utils/stream";
import { storage } from "../../lib/storage";
import { visionProvider } from "../ai/provider/vision";
import { createRequisitionSchema, inspectionSchema, itemCancelSchema, itemMissingSchema, itemReceiveSchema, itemRoomSchema, itemSeparateSchema, requisitionsQuery, reservationSchema, updateItemStatusSchema, updateRequisitionSchema, updateStatusSchema } from "./requisitions.schema";
import { isEmptySuggestion, labelPrompt, parseLabelReading } from "./requisitions.label";
import * as service from "./requisitions.service";

export const listRequisitions = asyncHandler(async (req: Request, res: Response) => {
  const q = requisitionsQuery.parse(req.query);
  const onlyOwn = q.my === "true" || !req.user!.permissions.includes("requisitions.read.all");
  const result = await service.listRequisitions({ ...q, overdue: q.overdue === "true", userId: onlyOwn ? req.user!.id : undefined });
  res.json({ success: true, data: result.items, meta: result.meta });
});
export const indicators = asyncHandler(async (req: Request, res: Response) => ok(res, await service.getIndicators(req.user!.permissions.includes("requisitions.read.all") ? undefined : req.user!.id)));
export const cuttingBoard = asyncHandler(async (_req: Request, res: Response) => ok(res, await service.listCuttingBoard()));
export const getRequisition = asyncHandler(async (req: Request, res: Response) => { const requisition = await service.getRequisition(req.params.id); if (!req.user!.permissions.includes("requisitions.read.all") && requisition.requester.id !== req.user!.id) throw new ForbiddenError("Você não pode acessar esta requisição"); return ok(res, requisition); });
export const createRequisition = asyncHandler(async (req: Request, res: Response) => ok(res, await service.createRequisition(createRequisitionSchema.parse(req.body), req.user!.id, req.user!.organizationId, req.user!.permissions), "Requisição criada"));
export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Selecione um arquivo" });
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return ok(res, { name: req.file.originalname, url: `${baseUrl}/uploads/${req.file.filename}`, mimeType: req.file.mimetype, size: req.file.size }, "Arquivo enviado");
});
export const updateRequisition = asyncHandler(async (req: Request, res: Response) => ok(res, await service.updateRequisition(req.params.id, updateRequisitionSchema.parse(req.body), req.user!.id, req.user!.permissions, req.user!.organizationId), "Requisição atualizada"));
export const changeItemRoom = asyncHandler(async (req: Request, res: Response) => { const input = itemRoomSchema.parse(req.body); return ok(res, await service.changeItemRoom(req.params.id, req.params.itemId, input.room, input.note, req.user!.id), "Ambiente do item alterado"); });
export const markItemMissing = asyncHandler(async (req: Request, res: Response) => { const input = itemMissingSchema.parse(req.body ?? {}); return ok(res, await service.markItemMissing(req.params.id, req.params.itemId, input.missingQuantity, input.note, req.file, req.user!.id), "Falta registrada"); });
export const cancelMissingItem = asyncHandler(async (req: Request, res: Response) => { const input = itemCancelSchema.parse(req.body ?? {}); return ok(res, await service.cancelMissingItem(req.params.id, req.params.itemId, input.note, req.user!.id), "Peça cancelada"); });
export const separateItem = asyncHandler(async (req: Request, res: Response) => { const input = itemSeparateSchema.parse(req.body ?? {}); return ok(res, await service.separateItem(req.params.id, req.params.itemId, input.separatedQuantity, input.note, req.user!.id), input.separatedQuantity > 0 ? "Separação registrada" : "Separação desfeita"); });
export const receiveItem = asyncHandler(async (req: Request, res: Response) => { const input = itemReceiveSchema.parse(req.body ?? {}); return ok(res, await service.receiveItem(req.params.id, req.params.itemId, input.receivedQuantity, input.note, req.file, req.user!.id), "Recebimento registrado"); });
export const projects = asyncHandler(async (req: Request, res: Response) => ok(res, await service.listProjectsForRequisition(req.user!.organizationId, typeof req.query.search === "string" ? req.query.search : undefined)));
// foto da etiqueta: a leitura volta como sugestão; o item só recebe os dados quando o montador salva
export const readLabel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError("Tire ou escolha a foto da etiqueta");
  const vision = visionProvider();
  const result = await service.readLabelPhoto(req.file, req.user!.id, async (bytes, mime) => {
    if (!vision.enabled) return null;
    const s = parseLabelReading(await vision.readJson({ bytes, mime, prompt: labelPrompt() }));
    return isEmptySuggestion(s) ? null : s;
  });
  if (!vision.enabled) return ok(res, { ...result, ai: false }, "Foto guardada. A leitura com IA não está configurada: preencha os campos à mão.");
  return ok(res, { ...result, ai: true }, result.suggestion ? "Etiqueta lida. Confira os campos antes de salvar." : "Não deu para ler a etiqueta. Tente outra foto ou preencha à mão.");
});
export const photoFile = asyncHandler(async (req: Request, res: Response) => {
  const photo = await service.photoForViewer(req.params.photoId, req.user!.id, req.user!.permissions.includes("requisitions.read.all"));
  const signed = await storage.getSignedUrl(photo.storageKey, photo.fileName);
  if (signed) return res.redirect(signed);
  const stream = await storage.getStream(photo.storageKey);
  res.setHeader("Content-Type", photo.mimeType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(photo.fileName)}"`);
  return pipeToResponse(stream, res);
});
export const updateStatus = asyncHandler(async (req: Request, res: Response) => { const input = updateStatusSchema.parse(req.body); return ok(res, await service.updateRequisitionStatus(req.params.id, input.status, input.note ?? null, req.user!.id, req.user!.permissions, input.responsibleId), "Status atualizado"); });
export const updateItemStatus = asyncHandler(async (req: Request, res: Response) => { const input = updateItemStatusSchema.parse(req.body); return ok(res, await service.updateItemStatus(req.params.id, req.params.itemId, input.status, req.user!.id, input.note), "Peça atualizada"); });
export const inspect = asyncHandler(async (req: Request, res: Response) => { const input = inspectionSchema.parse(req.body); return ok(res, await service.inspectRequisition(req.params.id, input.result, input.note ?? null, req.user!.id), "Conferência registrada"); });
export const reserve = asyncHandler(async (req: Request, res: Response) => ok(res, await service.reserveMaterials(req.params.id, reservationSchema.parse(req.body), req.user!.id), "Materiais reservados"));
export const print = asyncHandler(async (req: Request, res: Response) => {
  const ids = String(req.query.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  // sem porFolha: quantas couberem, com as linhas que os itens pedem
  const perPage = req.query.porFolha === "2" ? 2 : req.query.porFolha === "3" ? 3 : "auto";
  const pdf = await service.printRequisitions(ids, req.user!.permissions.includes("requisitions.read.all") ? undefined : req.user!.id, perPage);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="requisicoes.pdf"`);
  res.send(pdf);
});
export const deliver = asyncHandler(async (req: Request, res: Response) => ok(res, await service.deliverSupplies(req.params.id, req.user!.id, req.user!.name), "Insumos entregues e baixados do estoque"));
export const markDone = asyncHandler(async (req: Request, res: Response) => ok(res, await service.markRequisitionDone(req.params.id, typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null, req.user!.id), "Requisição marcada como concluída"));
