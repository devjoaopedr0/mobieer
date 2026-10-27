/**
 * Pedido de orçamento da landing page (mobieer.com.br) SEM login.
 *
 * Vira lead no comercial (origem "Site") e avisa no sino quem cuida dos leads.
 * Proteções: limite por IP, campo invisível contra robô e tamanho dos campos.
 */
import { Router } from "express";
import { z } from "zod";
import { notifyUsersWithPermission } from "../../lib/notify";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { rateLimit } from "../../utils/rate-limit";

const router = Router();

const PROJECT_TYPES = ["Residencial", "Empresarial", "Corporativo"] as const;

// POST /api/public/orcamento { name, email, phone, projectType, hasProject }
router.post(
  "/orcamento",
  rateLimit({ name: "public-quote", windowMs: 60 * 60 * 1000, max: 8 }),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(3, "Informe seu nome").max(160),
        email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
        phone: z.string().trim().min(8, "Telefone inválido").max(30),
        projectType: z.enum(PROJECT_TYPES, { errorMap: () => ({ message: "Selecione o tipo de projeto" }) }),
        hasProject: z.enum(["Sim", "Não"], { errorMap: () => ({ message: "Informe se já possui projeto" }) }),
        // campo invisível no formulário: robô preenche, pessoa não
        website: z.string().max(0).optional(),
      })
      .parse(req.body);

    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!org) throw new BadRequestError("Organização não configurada");

    const lead = await prisma.commercialLead.create({
      data: {
        organizationId: org.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: "Site",
        interest: `${input.projectType} — ${input.hasProject === "Sim" ? "já possui projeto" : "ainda sem projeto"}`,
        notes: "Pedido de orçamento pela landing page.",
      },
      select: { id: true },
    });
    await notifyUsersWithPermission({
      organizationId: org.id,
      permission: "commercial.leads.manage",
      title: "Novo pedido de orçamento pelo site",
      message: `${input.name} · ${input.phone} · ${input.projectType}`,
    });
    return ok(res, { id: lead.id }, "Recebemos seu pedido! Em breve entraremos em contato.");
  })
);

export default router;
