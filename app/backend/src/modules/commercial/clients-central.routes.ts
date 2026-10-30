/**
 * Central de clientes do CRM: /api/commercial/clients
 *
 *   GET /           lista com busca e filtros (status, vendedor, atendente, origem)
 *   GET /:id        ficha: dados, contatos, leads, oportunidades, orçamentos,
 *                   contratos e chamados de assistência, num lugar só
 *
 * Carteira: quem não tem commercial.read.all vê só os clientes em que é o
 * vendedor ou o atendente. O "Novo lead" da ficha usa POST /commercial/leads
 * com clientId (mesma regra do cadastro de lead).
 */
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { ORIGINS, ORIGIN_LABEL } from "./crm.rules";
import { crmClientScope, originFilter } from "./clients-central.rules";

const router = Router();
router.use(authenticate);
router.use(requirePermission("commercial.read"));

const num = (v: unknown) => (v == null ? 0 : Number(v));
const person = { select: { id: true, name: true } } as const;

const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  sellerId: z.string().min(1).optional(),
  attendantId: z.string().min(1).optional(),
  origin: z.enum([...ORIGINS, "SEM_ORIGEM"]).optional(),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: Prisma.ClientWhereInput = {
      AND: [
        crmClientScope(req.user!),
        q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { document: { contains: q.search } }, { email: { contains: q.search, mode: "insensitive" } }, { phone: { contains: q.search } }] } : {},
        q.status ? { status: q.status } : {},
        q.sellerId ? { sellerId: q.sellerId } : {},
        q.attendantId ? { attendantId: q.attendantId } : {},
        originFilter(q.origin),
      ],
    };
    const rows = await prisma.client.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, status: true, origin: true, leadSource: true, createdAt: true,
        seller: person, attendant: person,
        _count: { select: { convertedLeads: true, opportunities: true, quotes: true, assistances: true } },
        opportunities: { where: { status: "OPEN" }, select: { estimatedValue: true } },
      },
      orderBy: { name: "asc" },
      take: 500,
    });
    return ok(
      res,
      rows.map(({ opportunities, ...c }) => ({
        ...c,
        originLabel: c.origin ? ORIGIN_LABEL[c.origin] : c.leadSource ? "Sem origem na lista" : null,
        openOpportunities: opportunities.length,
        openValue: Math.round(opportunities.reduce((a, o) => a + num(o.estimatedValue), 0)),
      }))
    );
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { AND: [crmClientScope(req.user!), { id: req.params.id }] },
      select: {
        id: true, name: true, document: true, email: true, phone: true, status: true, origin: true, leadSource: true, address: true, deliveryAddress: true,
        city: true, state: true, notes: true, createdAt: true, seller: person, attendant: person,
      },
    });
    if (!client) throw new NotFoundError("Cliente não encontrado");
    const clientId = client.id;
    const organizationId = req.user!.organizationId;
    const [leads, opportunities, quotes, contracts, assistances] = await Promise.all([
      prisma.commercialLead.findMany({
        where: { organizationId, convertedClientId: clientId },
        select: { id: true, name: true, status: true, origin: true, source: true, interest: true, enteredAt: true, lastContactAt: true, nextContactAt: true, lostReasonCode: true, seller: person },
        orderBy: { enteredAt: "desc" },
      }),
      prisma.commercialOpportunity.findMany({
        where: { organizationId, clientId },
        select: { id: true, title: true, status: true, estimatedValue: true, createdAt: true, wonAt: true, lostReason: true, stage: { select: { name: true } }, seller: person },
        orderBy: { createdAt: "desc" },
      }),
      prisma.commercialQuote.findMany({
        where: { organizationId, clientId },
        select: { id: true, number: true, version: true, kind: true, status: true, total: true, createdAt: true, approvedAt: true, seller: person },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      // contrato: a versão atual de cada um
      prisma.projectDocument.findMany({
        where: { organizationId, clientId, type: "CONTRATO", supersededBy: { none: {} } },
        select: { id: true, number: true, title: true, version: true, signatureStatus: true, createdAt: true, project: { select: { id: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.assistanceTicket.findMany({
        where: { organizationId, clientId },
        select: { id: true, number: true, title: true, status: true, kind: true, createdAt: true, resolvedAt: true, project: { select: { id: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    // contatos do cliente: os dele, os dos leads ligados e os das oportunidades
    const interactions = await prisma.commercialInteraction.findMany({
      where: { OR: [{ clientId }, { leadId: { in: leads.map((l) => l.id) } }, { opportunityId: { in: opportunities.map((o) => o.id) } }] },
      select: { id: true, type: true, summary: true, result: true, occurredAt: true, nextAction: true, nextActionAt: true, responsible: person, opportunity: { select: { id: true, title: true } }, lead: { select: { id: true, name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return ok(res, {
      client: { ...client, originLabel: client.origin ? ORIGIN_LABEL[client.origin] : client.leadSource ? "Sem origem na lista" : null },
      interactions,
      leads,
      opportunities: opportunities.map((o) => ({ ...o, estimatedValue: num(o.estimatedValue) })),
      quotes: quotes.map((q) => ({ ...q, total: num(q.total) })),
      contracts,
      assistances,
    });
  })
);

export default router;
