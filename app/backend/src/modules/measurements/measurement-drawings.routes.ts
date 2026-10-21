/**
 * Todos os desenhos de medição num lugar só, como os quadros do iPad:
 *   GET /api/measurements/drawings?q=   desenhos de todas as medições, mais recentes primeiro,
 *                                       com cliente, projeto e a medição de cada um
 * Abrir, continuar e criar desenho seguem nas rotas da medição (/:id/drawings).
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";

const router = Router();
router.use(authenticate);

router.get(
  "/drawings",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(80).optional() }).parse(req.query);
    const text = q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { visit: { project: { name: { contains: q, mode: "insensitive" as const } } } },
            { visit: { project: { code: { contains: q, mode: "insensitive" as const } } } },
            { visit: { project: { client: { name: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {};
    const rows = await prisma.measurementAttachment.findMany({
      where: { organizationId: req.user!.organizationId, kind: "DRAWING", ...text },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true, title: true, mimeType: true, updatedAt: true, createdAt: true,
        createdBy: { select: { name: true } },
        visit: { select: { id: true, scheduledAt: true, status: true, project: { select: { id: true, code: true, name: true, client: { select: { id: true, name: true } } } } } },
      },
    });
    return ok(
      res,
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        mimeType: r.mimeType,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        author: r.createdBy?.name ?? null,
        visitId: r.visit.id,
        visitDate: r.visit.scheduledAt,
        project: { id: r.visit.project.id, code: r.visit.project.code, name: r.visit.project.name },
        client: r.visit.project.client ? { id: r.visit.project.client.id, name: r.visit.project.client.name } : null,
      }))
    );
  })
);

export default router;
