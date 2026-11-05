import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { prisma } from "../../prisma";
import { BadRequestError } from "../../utils/ApiError";
import { deliverDueReminders } from "../agenda/reminders.service";

const router = Router();

router.use(authenticate);

// cada um vê as próprias notificações; as sem destinatário (avisos gerais de estoque) são de todos
const mine = (userId: string) => ({ OR: [{ userId }, { userId: null }] });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const unread = req.query.unread === "true";
    // o sino consulta a cada minuto: é aqui que os lembretes da agenda vencidos viram aviso
    await deliverDueReminders(req.user!.id).catch((e) => console.error("[agenda] lembretes:", e));
    const notifications = await prisma.notification.findMany({
      where: { ...mine(req.user!.id), ...(unread ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { product: { select: { id: true, name: true, code: true } } },
    });
    const unreadCount = await prisma.notification.count({ where: { ...mine(req.user!.id), read: false } });
    return ok(res, { items: notifications, unreadCount });
  })
);

router.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({ where: { id: req.params.id, ...mine(req.user!.id) } });
    if (!notification) throw new BadRequestError("Notificação não encontrada");
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
    return ok(res, updated);
  })
);

router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { ...mine(req.user!.id), read: false }, data: { read: true } });
    return ok(res, { updated: true });
  })
);

export default router;
