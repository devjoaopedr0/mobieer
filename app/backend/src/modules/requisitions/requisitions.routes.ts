import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { uploadAttachment, uploadPhoto } from "../../middlewares/upload";
import * as controller from "./requisitions.controller";

const router = Router();
router.use(authenticate);
router.get("/indicators", requirePermission("requisitions.read"), controller.indicators);
router.get("/cutting-board", requirePermission("requisitions.cut"), controller.cuttingBoard);
router.get("/", requirePermission("requisitions.read"), controller.listRequisitions);
// PDF para imprimir, quantas couberem por folha (?porFolha=2 ou 3 para dividir a folha): ?ids=a,b (sem ids, as em aberto)
router.get("/print", requirePermission("requisitions.read"), controller.print);
router.post("/attachments", requirePermission("requisitions.create"), uploadAttachment.single("file"), controller.uploadAttachment);
// obra: projetos cadastrados com os ambientes, para o formulário
router.get("/projects", requireAnyPermission(["requisitions.create", "requisitions.edit", "requisitions.edit.all", "requisitions.cut"]), controller.projects);
// foto da etiqueta da peça: guarda e devolve a leitura como sugestão (nada vai para o item sem confirmar)
router.post("/label-photo", requireAnyPermission(["requisitions.create", "requisitions.edit", "requisitions.edit.all"]), uploadPhoto.single("photo"), controller.readLabel);
router.get("/photos/:photoId/file", requirePermission("requisitions.read"), controller.photoFile);
router.post("/", requirePermission("requisitions.create"), controller.createRequisition);
router.get("/:id", requirePermission("requisitions.read"), controller.getRequisition);
router.patch("/:id", requireAnyPermission(["requisitions.edit", "requisitions.edit.all"]), controller.updateRequisition);
router.patch("/:id/status", requireAnyPermission(["requisitions.create", "requisitions.analyze", "requisitions.release", "requisitions.cut", "requisitions.inspect", "requisitions.cancel"]), controller.updateStatus);
router.patch("/:id/items/:itemId/status", requireAnyPermission(["requisitions.cut", "requisitions.inspect"]), controller.updateItemStatus);
// durante corte e entrega: mover de ambiente, registrar falta (com foto da etiqueta) e recebimento
router.patch("/:id/items/:itemId/room", requireAnyPermission(["requisitions.cut", "requisitions.inspect", "requisitions.edit", "requisitions.edit.all", "stock.exit.supplies"]), controller.changeItemRoom);
router.post("/:id/items/:itemId/missing", requireAnyPermission(["requisitions.create", "requisitions.cut", "requisitions.inspect", "stock.exit.supplies"]), uploadPhoto.single("photo"), controller.markItemMissing);
router.post("/:id/items/:itemId/cancel", requireAnyPermission(["requisitions.cut", "requisitions.inspect", "requisitions.cancel", "stock.exit.supplies"]), controller.cancelMissingItem);
router.post("/:id/items/:itemId/receive", requireAnyPermission(["requisitions.create", "requisitions.cut", "requisitions.inspect", "stock.exit.supplies"]), uploadPhoto.single("photo"), controller.receiveItem);
router.post("/:id/reservations", requirePermission("requisitions.reserve"), controller.reserve);
router.post("/:id/inspection", requirePermission("requisitions.inspect"), controller.inspect);
// almoxarifado entrega a requisição de insumos (baixa no estoque)
router.post("/:id/deliver", requirePermission("stock.exit.supplies"), controller.deliver);
// marcar como concluída de uma vez (feita por fora, já entregue)
router.post("/:id/done", requireAnyPermission(["requisitions.inspect", "requisitions.release", "requisitions.read.all", "stock.exit"]), controller.markDone);

export default router;
