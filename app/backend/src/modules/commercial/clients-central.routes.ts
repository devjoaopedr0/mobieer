/**
 * Central de clientes do CRM: /api/commercial/clients
 *
 *   GET /           lista com busca e filtros (status, vendedor, atendente, origem)
 *   GET /:id        ficha: dados, contatos, leads, oportunidades, orçamentos,
 *                   contratos e chamados de assistência, num lugar só
 *   POST /:id/diary diário do cliente: reunião, anotação, alteração de projeto…
 *                   com projeto e próximo passo opcionais; pode marcar a reunião
 *                   na agenda com lembrete (vira aviso no sino na hora)
 *   DELETE /:id/diary/:entryId  apaga a anotação (o autor ou a gestão)
 *
 * Carteira: quem não tem commercial.read.all vê só os clientes em que é o
 * vendedor ou o atendente. O "Novo lead" da ficha usa POST /commercial/leads
 * com clientId (mesma regra do cadastro de lead).
 */
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/ApiError";
import { create as createAgendaEvent } from "../agenda/agenda.service";
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
    const [interactions, projects, meetings] = await Promise.all([
      prisma.commercialInteraction.findMany({
        where: { OR: [{ clientId }, { leadId: { in: leads.map((l) => l.id) } }, { opportunityId: { in: opportunities.map((o) => o.id) } }] },
        select: {
          id: true, type: true, summary: true, result: true, occurredAt: true, nextAction: true, nextActionAt: true, responsible: person,
          opportunity: { select: { id: true, title: true } }, lead: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } }, agendaEvent: { select: { id: true, startAt: true, status: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 200,
      }),
      prisma.project.findMany({ where: { organizationId, clientId }, select: { id: true, code: true, name: true }, orderBy: { createdAt: "desc" } }),
      // reuniões e visitas marcadas com o cliente, de hoje em diante
      prisma.agendaEvent.findMany({
        where: { organizationId, clientId, status: { notIn: ["CANCELLED", "COMPLETED"] }, endAt: { gte: new Date() } },
        select: { id: true, title: true, startAt: true, location: true, responsible: person, type: { select: { name: true } } },
        orderBy: { startAt: "asc" },
        take: 20,
      }),
    ]);
    return ok(res, {
      client: { ...client, originLabel: client.origin ? ORIGIN_LABEL[client.origin] : client.leadSource ? "Sem origem na lista" : null },
      interactions,
      projects,
      meetings,
      leads,
      opportunities: opportunities.map((o) => ({ ...o, estimatedValue: num(o.estimatedValue) })),
      quotes: quotes.map((q) => ({ ...q, total: num(q.total) })),
      contracts,
      assistances,
    });
  })
);

// ------------------------------------------------------------------ diário do cliente

const DIARY_TYPES = ["NOTE", "MEETING", "PROJECT_CHANGE", "CALL", "WHATSAPP", "VISIT", "EMAIL", "OTHER"] as const;
const diaryBody = z.object({
  type: z.enum(DIARY_TYPES),
  summary: z.string().trim().min(2, "Escreva a anotação").max(5000),
  projectId: z.string().min(1).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
  nextAction: z.string().trim().max(200).optional().nullable(),
  nextActionAt: z.coerce.date().optional().nullable(),
  // marcar a reunião na agenda, com lembrete para quem anotou
  meeting: z
    .object({
      startAt: z.coerce.date(),
      durationMinutes: z.coerce.number().int().min(15).max(600).default(60),
      reminderMinutes: z.coerce.number().int().min(0).max(10080).default(60),
      location: z.string().trim().max(500).optional().nullable(),
    })
    .optional()
    .nullable(),
});

/** Tipo de compromisso "Reunião" da organização — cria na primeira vez. */
async function meetingTypeId(organizationId: string) {
  const found = await prisma.agendaEventType.findFirst({ where: { organizationId, active: true, name: { startsWith: "Reuni", mode: "insensitive" } }, select: { id: true } });
  if (found) return found.id;
  const created = await prisma.agendaEventType.upsert({
    where: { organizationId_name: { organizationId, name: "Reunião com cliente" } },
    create: { organizationId, name: "Reunião com cliente", color: "violet" },
    update: { active: true },
  });
  return created.id;
}

router.post(
  "/:id/diary",
  requireAnyPermission(["commercial.manage", "commercial.leads.manage"]),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const client = await prisma.client.findFirst({ where: { AND: [crmClientScope(req.user!), { id: req.params.id }] }, select: { id: true, name: true } });
    if (!client) throw new NotFoundError("Cliente não encontrado na sua carteira");
    const input = diaryBody.parse(req.body);
    const project = input.projectId ? await prisma.project.findFirst({ where: { id: input.projectId, organizationId, clientId: client.id }, select: { id: true, code: true } }) : null;
    if (input.projectId && !project) throw new BadRequestError("Projeto não é deste cliente");

    let agendaEventId: string | null = null;
    if (input.meeting) {
      const startAt = input.meeting.startAt;
      if (startAt.getTime() < Date.now() - 5 * 60000) throw new BadRequestError("A reunião precisa ser numa data futura");
      // conflito de horário volta como 409 — a agenda é quem decide
      const created = await createAgendaEvent(
        {
          title: `Reunião — ${client.name}${project ? ` (${project.code})` : ""}`,
          typeId: await meetingTypeId(organizationId),
          description: input.summary,
          startAt,
          endAt: new Date(startAt.getTime() + input.meeting.durationMinutes * 60000),
          allDay: false,
          responsibleId: req.user!.id,
          participantIds: [],
          clientId: client.id,
          clientName: client.name,
          projectId: project?.id ?? null,
          location: input.meeting.location || null,
          status: "SCHEDULED",
          visibility: "TEAM",
          reminderMinutes: [input.meeting.reminderMinutes],
          attachments: [],
          forceConflict: false,
        },
        req.user!
      );
      agendaEventId = created.event.id;
    }

    const entry = await prisma.commercialInteraction.create({
      data: {
        type: input.type,
        summary: input.summary,
        occurredAt: input.occurredAt ?? new Date(),
        nextAction: input.nextAction || null,
        nextActionAt: input.nextActionAt ?? null,
        clientId: client.id,
        projectId: project?.id ?? null,
        agendaEventId,
        responsibleId: req.user!.id,
      },
      select: { id: true },
    });
    return ok(res, entry, agendaEventId ? "Anotado e reunião marcada na agenda" : "Anotado no diário");
  })
);

router.delete(
  "/:id/diary/:entryId",
  requireAnyPermission(["commercial.manage", "commercial.leads.manage"]),
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findFirst({ where: { AND: [crmClientScope(req.user!), { id: req.params.id }] }, select: { id: true } });
    if (!client) throw new NotFoundError("Cliente não encontrado na sua carteira");
    const entry = await prisma.commercialInteraction.findFirst({ where: { id: req.params.entryId, clientId: client.id }, select: { id: true, responsibleId: true } });
    if (!entry) throw new NotFoundError("Anotação não encontrada");
    if (entry.responsibleId !== req.user!.id && !req.user!.permissions.includes("commercial.manage")) throw new ForbiddenError("Só quem anotou ou a gestão pode apagar");
    await prisma.commercialInteraction.delete({ where: { id: entry.id } });
    return ok(res, { id: entry.id }, "Anotação apagada");
  })
);

export default router;
