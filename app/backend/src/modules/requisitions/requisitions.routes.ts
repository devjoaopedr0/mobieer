import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { uploadAttachment } from "../../middlewares/upload";
import * as controller from "./requisitions.controller";

const router = Router();
router.use(authenticate);
router.get("/indicators", requirePermission("requisitions.read"), controller.indicators);
router.get("/cutting-board", requirePermission("requisitions.cut"), controller.cuttingBoard);
router.get("/", requirePermission("requisitions.read"), controller.listRequisitions);
// PDF para imprimir, três por folha (?porFolha=2 para duas): ?ids=a,b (sem ids, as em aberto)
router.get("/print", requirePermission("requisitions.read"), controller.print);
router.post("/attachments", requirePermission("requisitions.create"), uploadAttachment.single("file"), controller.uploadAttachment);
router.post("/", requirePermission("requisitions.create"), controller.createRequisition);
router.get("/:id", requirePermission("requisitions.read"), controller.getRequisition);
router.patch("/:id", requireAnyPermission(["requisitions.edit", "requisitions.edit.all"]), controller.updateRequisition);
router.patch("/:id/status", requireAnyPermission(["requisitions.create", "requisitions.analyze", "requisitions.release", "requisitions.cut", "requisitions.inspect", "requisitions.cancel"]), controller.updateStatus);
router.patch("/:id/items/:itemId/status", requireAnyPermission(["requisitions.cut", "requisitions.inspect"]), controller.updateItemStatus);
router.post("/:id/reservations", requirePermission("requisitions.reserve"), controller.reserve);
router.post("/:id/inspection", requirePermission("requisitions.inspect"), controller.inspect);
// almoxarifado entrega a requisição de insumos (baixa no estoque)
router.post("/:id/deliver", requirePermission("stock.exit"), controller.deliver);

export default router;
