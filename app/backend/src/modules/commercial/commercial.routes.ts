import { Router } from "express";
import { z } from "zod";
import { CommercialInteractionType, CommercialLeadStatus, Prisma } from "@prisma/client";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { accessMessage, grantPortalAccess, sendUpgradeEmail } from "../portal/portal-access.service";
import { enumQuery } from "../../utils/query";
import { isValidCpf, onlyDigits } from "../../utils/document";
import { sendAutomation } from "../../lib/automations";
import { closeRate, closedWhere, defaultMonth, lostWhere } from "./closed.rules";
import { crmClientScope } from "./clients-central.rules";
import { channelPanel, leadStatusProblem, leadTemperature, normalizeOrigin, opportunityScore, opportunityTemperature, ORIGIN_LABEL, ORIGINS, type Origin, type Temperature } from "./crm.rules";

const router = Router();
router.use(authenticate);

const nullable = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal(""));
const money = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const nn = (v: string | null | undefined) => (v ? v : null);

async function audit(userId: string, action: string, entity: string, entityId: string, details?: object) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, details } });
}

/** Escopo: quem não tem commercial.read.all só enxerga a própria carteira. */
function sellerScope(req: { user?: { id: string; permissions: string[] } }) {
  return req.user!.permissions.includes("commercial.read.all") ? {} : { sellerId: req.user!.id };
}

const OPEN_LEAD: string[] = ["NEW", "CONTACTED", "QUALIFIED"];
const LOST_REASONS = ["PRECO", "PRAZO", "CONCORRENCIA", "SEM_RESPOSTA", "DESISTIU", "ESCOPO", "OUTRO"] as const;
const TEMPERATURES = ["QUENTE", "MORNO", "FRIO"] as const;
const temperatureFilter = (raw: unknown): Temperature | null => (TEMPERATURES as readonly string[]).includes(String(raw ?? "")) ? (String(raw) as Temperature) : null;

/**
 * Origem: o item da lista fixa (escolhido ou reconhecido no texto) e o texto
 * como veio. Escolher da lista sem texto grava o nome do item como texto.
 */
function originFields(origin: Origin | null | undefined, source: string | null | undefined) {
  const o = origin ?? normalizeOrigin(source);
  return { origin: o, source: nn(source ?? null) ?? (o ? ORIGIN_LABEL[o] : null) };
}

// ============================================================
// ETAPAS DO FUNIL (SalesStage)
// ============================================================

router.get(
  "/stages",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.salesStage.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { position: "asc" },
      include: { _count: { select: { opportunities: true } } },
    });
    return ok(res, rows);
  })
);

router.post(
  "/stages",
  requirePermission("commercial.manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        probability: z.coerce.number().int().min(0).max(100).default(0),
        isWon: z.boolean().default(false),
        isLost: z.boolean().default(false),
      })
      .parse(req.body);
    const max = await prisma.salesStage.aggregate({ where: { organizationId: req.user!.organizationId }, _max: { position: true } });
    const stage = await prisma.salesStage.create({
      data: { ...input, position: (max._max.position ?? 0) + 1, organizationId: req.user!.organizationId },
    });
    return ok(res, stage, "Etapa criada");
  })
);

router.patch(
  "/stages/:id",
  requirePermission("commercial.manage"),
  asyncHandler(async (req, res) => {
    const cur = await prisma.salesStage.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!cur) throw new NotFoundError("Etapa não encontrada");
    const input = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        probability: z.coerce.number().int().min(0).max(100).optional(),
        position: z.coerce.number().int().min(1).optional(),
        active: z.boolean().optional(),
        isWon: z.boolean().optional(),
        isLost: z.boolean().optional(),
      })
      .parse(req.body);
    const stage = await prisma.salesStage.update({ where: { id: cur.id }, data: input });
    return ok(res, stage, "Etapa atualizada");
  })
);

// ============================================================
// LEADS
// ============================================================

const leadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: nullable(30),
  email: z.string().email().optional().nullable().or(z.literal("")),
  source: nullable(80),
  origin: z.enum(ORIGINS).optional().nullable(),
  interest: nullable(200),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]).optional(),
  /** obrigatório ao marcar o lead como perdido */
  lostReasonCode: z.enum(LOST_REASONS).optional().nullable(),
  notes: nullable(5000),
  sellerId: z.string().min(1).optional().nullable(),
  nextContactAt: z.coerce.date().optional().nullable(),
  /** "já é cliente": o lead fica ligado ao cadastro existente (e a conversão usa ele) */
  clientId: z.string().min(1).optional().nullable(),
});

/** Cliente ligado ao lead: da organização e dentro da carteira de quem cadastra. */
async function ensureLeadClient(clientId: string, req: { user?: { id: string; organizationId: string; permissions: string[] } }) {
  // a mesma carteira da central de clientes: vendedor ou atendente do cliente
  const c = await prisma.client.findFirst({ where: { AND: [crmClientScope(req.user!), { id: clientId }] }, select: { id: true } });
  if (!c) throw new NotFoundError("Cliente não encontrado na sua carteira");
  return c;
}

router.get(
  "/leads",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.commercialLead.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...sellerScope(req),
        ...(req.query.status ? { status: enumQuery(req.query.status, CommercialLeadStatus, "status") } : {}),
        ...(req.query.clientId ? { convertedClientId: String(req.query.clientId) } : {}),
      },
      include: {
        seller: { select: { id: true, name: true } },
        // vínculo do lead: o cliente (já era ou virou na conversão) e as oportunidades criadas
        convertedClient: { select: { id: true, name: true } },
        opportunities: { select: { id: true, title: true, status: true }, orderBy: { createdAt: "asc" } },
        briefing: { select: { id: true, submittedAt: true, environments: true, origin: true } },
        _count: { select: { opportunities: true, interactions: true } },
      },
      orderBy: [{ status: "asc" }, { enteredAt: "desc" }],
    });
    // temperatura do lead: tempo sem contato e próximo contato vencido
    const now = new Date();
    const wanted = temperatureFilter(req.query.temperatura);
    const withTemp = rows.map((l) => {
      const t = leadTemperature(l, now);
      return { ...l, temperature: t?.temperature ?? null, temperatureReason: t?.reason ?? null, overdue: t?.overdue ?? false };
    });
    // ?aberto=1: só os leads em aberto (novo, contatado, qualificado); ?atrasado=1: próximo contato vencido
    const open = req.query.aberto === "1" ? withTemp.filter((l) => OPEN_LEAD.includes(l.status)) : withTemp;
    const late = req.query.atrasado === "1" ? open.filter((l) => l.overdue) : open;
    return ok(res, wanted ? late.filter((l) => l.temperature === wanted) : late);
  })
);

const briefingBody = z.object({
  address: nullable(400),
  investmentEstimate: z.coerce.number().min(0).optional().nullable(),
  investmentText: nullable(120),
  hasProject: z.boolean().default(false),
  environments: z.array(z.string().trim().max(60)).max(20).default([]),
  userCount: z.coerce.number().int().min(0).max(999).optional().nullable(),
  discoveryChannel: nullable(60),
  notes: nullable(5000),
});

router.get(
  "/leads/:id/briefing",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.commercialLead.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { briefing: true },
    });
    if (!lead) throw new NotFoundError("Lead não encontrado");
    return ok(res, {
      lead: { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email },
      briefing: lead.briefing
        ? { ...lead.briefing, investmentEstimate: lead.briefing.investmentEstimate == null ? null : Number(lead.briefing.investmentEstimate) }
        : null,
    });
  })
);

router.post(
  "/leads/:id/briefing",
  requirePermission("commercial.leads.manage"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.commercialLead.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!lead) throw new NotFoundError("Lead não encontrado");
    const input = briefingBody.parse(req.body);
    const data = {
      address: nn(input.address),
      investmentEstimate: input.investmentEstimate == null ? null : new Prisma.Decimal(Number(input.investmentEstimate).toFixed(2)),
      investmentText: nn(input.investmentText),
      hasProject: input.hasProject,
      environments: input.environments,
      userCount: input.userCount ?? null,
      discoveryChannel: nn(input.discoveryChannel),
      notes: nn(input.notes),
      origin: "CONSULTANT" as const,
    };
    const briefing = await prisma.leadBriefing.upsert({
      where: { leadId: lead.id },
      create: { leadId: lead.id, ...data },
      update: data,
    });
    if (input.discoveryChannel && !lead.source) {
      await prisma.commercialLead.update({ where: { id: lead.id }, data: originFields(null, input.discoveryChannel) });
    }
    return ok(res, briefing, "Briefing salvo");
  })
);

router.post(
  "/leads",
  requirePermission("commercial.leads.manage"),
  asyncHandler(async (req, res) => {
    const input = leadSchema.parse(req.body);
    const statusProblem = leadStatusProblem(input.status, input.lostReasonCode, null);
    if (statusProblem) throw new BadRequestError(statusProblem, { field: input.status === "LOST" ? "lostReasonCode" : "status" }, "VALIDATION_ERROR");
    if (input.clientId) await ensureLeadClient(input.clientId, req);
    const lead = await prisma.commercialLead.create({
      data: {
        organizationId: req.user!.organizationId,
        name: input.name,
        phone: nn(input.phone),
        email: nn(input.email),
        ...originFields(input.origin, input.source),
        lostReasonCode: input.status === "LOST" ? input.lostReasonCode : null,
        interest: nn(input.interest),
        notes: nn(input.notes),
        status: input.status ?? "NEW",
        sellerId: input.sellerId ?? req.user!.id,
        nextContactAt: input.nextContactAt ?? null,
        // contatado/qualificado já na entrada: conta como o primeiro contato
        lastContactAt: input.status === "CONTACTED" || input.status === "QUALIFIED" ? new Date() : null,
        convertedClientId: input.clientId ?? null,
      },
    });
    await audit(req.user!.id, "COMMERCIAL_LEAD_CREATED", "CommercialLead", lead.id, { name: lead.name, clientId: input.clientId ?? null });
    return ok(res, lead, "Lead criado");
  })
);

router.patch(
  "/leads/:id",
  requirePermission("commercial.leads.manage"),
  asyncHandler(async (req, res) => {
    const cur = await prisma.commercialLead.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!cur) throw new NotFoundError("Lead não encontrado");
    const input = leadSchema.partial().parse(req.body);
    if (input.clientId) await ensureLeadClient(input.clientId, req);
    // perdido: o motivo é obrigatório (a mesma lista das oportunidades)
    const becomesLost = input.status === "LOST" && cur.status !== "LOST";
    const statusProblem = leadStatusProblem(input.status, input.lostReasonCode, cur.status);
    if (statusProblem) throw new BadRequestError(statusProblem, { field: becomesLost ? "lostReasonCode" : "status" }, "VALIDATION_ERROR");
    const lostReasonCode = input.status && input.status !== "LOST" ? null : input.lostReasonCode ?? undefined;
    // só a origem mudou: o texto antigo fica se ainda bate com ela; senão vira o nome do item
    const keepText = input.source === undefined && input.origin != null && normalizeOrigin(cur.source) === input.origin;
    const origin = input.origin === undefined && input.source === undefined ? {} : originFields(input.origin, input.source !== undefined ? input.source : keepText ? cur.source : null);
    const lead = await prisma.commercialLead.update({
      where: { id: cur.id },
      data: {
        name: input.name,
        phone: input.phone === undefined ? undefined : nn(input.phone),
        email: input.email === undefined ? undefined : nn(input.email),
        ...origin,
        lostReasonCode,
        interest: input.interest === undefined ? undefined : nn(input.interest),
        notes: input.notes === undefined ? undefined : nn(input.notes),
        status: input.status,
        sellerId: input.sellerId === undefined ? undefined : input.sellerId,
        nextContactAt: input.nextContactAt === undefined ? undefined : input.nextContactAt,
        lastContactAt: input.status === "CONTACTED" ? new Date() : undefined,
        // lead convertido não troca de cliente: o vínculo com o cliente e a oportunidade fica
        convertedClientId: input.clientId === undefined || cur.status === "CONVERTED" ? undefined : input.clientId,
      },
    });
    if (becomesLost) await audit(req.user!.id, "COMMERCIAL_LEAD_LOST", "CommercialLead", lead.id, { reason: input.lostReasonCode });
    return ok(res, lead, "Lead atualizado");
  })
);

// Atualização rápida da lista: registra o contato feito agora e já marca o próximo.
router.post(
  "/leads/:id/contact",
  requirePermission("commercial.leads.manage"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.commercialLead.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId, ...sellerScope(req) } });
    if (!lead) throw new NotFoundError("Lead não encontrado");
    if (!OPEN_LEAD.includes(lead.status)) throw new BadRequestError("Este lead não está mais em aberto");
    const input = z
      .object({
        type: z.nativeEnum(CommercialInteractionType).default("WHATSAPP"),
        summary: z.string().trim().max(500).optional().nullable(),
        nextContactAt: z.coerce.date().optional().nullable(),
      })
      .parse(req.body ?? {});
    const now = new Date();
    if (input.nextContactAt && input.nextContactAt.getTime() < now.getTime() - 86_400_000) throw new BadRequestError("O próximo contato precisa ser de hoje em diante", { field: "nextContactAt" }, "VALIDATION_ERROR");
    const [, updated] = await prisma.$transaction([
      prisma.commercialInteraction.create({
        data: { leadId: lead.id, clientId: lead.convertedClientId, type: input.type, summary: input.summary || "Contato registrado", occurredAt: now, nextActionAt: input.nextContactAt ?? null, responsibleId: req.user!.id },
      }),
      prisma.commercialLead.update({
        where: { id: lead.id },
        // o contato combinado foi feito: o próximo é o novo (ou nenhum)
        data: { lastContactAt: now, nextContactAt: input.nextContactAt ?? null, status: lead.status === "NEW" ? "CONTACTED" : undefined },
      }),
    ]);
    await audit(req.user!.id, "COMMERCIAL_LEAD_CONTACT", "CommercialLead", lead.id, { type: input.type, next: input.nextContactAt ?? null });
    return ok(res, updated, input.nextContactAt ? `Contato registrado; próximo em ${input.nextContactAt.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}` : "Contato registrado");
  })
);

/** Converte o lead em Cliente + Oportunidade na 1ª etapa. */
router.post(
  "/leads/:id/convert",
  requirePermission("commercial.leads.manage"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.commercialLead.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { briefing: { select: { address: true } }, account: { select: { id: true } } },
    });
    if (!lead) throw new NotFoundError("Lead não encontrado");
    if (lead.status === "CONVERTED") throw new BadRequestError("Lead já convertido");

    const input = z
      .object({
        clientId: z.string().min(1).optional(),
        title: z.string().trim().min(2).max(200).optional(),
        estimatedValue: z.coerce.number().min(0).default(0),
        stageId: z.string().min(1).optional(),
        // "completar o cadastro": dados do cliente conferidos pela equipe
        client: z
          .object({
            name: z.string().trim().min(2).max(255).optional(),
            document: z.string().trim().max(30).optional().nullable(),
            email: z.string().trim().email().optional().nullable().or(z.literal("")),
            phone: z.string().trim().max(30).optional().nullable(),
            address: z.string().trim().max(500).optional().nullable(),
          })
          .optional(),
      })
      .parse(req.body);

    const document = onlyDigits(input.client?.document ?? lead.document) || null;
    if (document && document.length === 11 && !isValidCpf(document)) throw new BadRequestError("CPF inválido", { field: "document" }, "VALIDATION_ERROR");

    const result = await prisma.$transaction(async (tx) => {
      // "já é cliente": o cadastro ligado ao lead vale antes de procurar pelo CPF
      let clientId = input.clientId ?? lead.convertedClientId ?? null;
      if (!clientId && document) {
        // mesmo CPF já é cliente: liga ao cadastro existente em vez de duplicar
        const existing = await tx.client.findFirst({ where: { organizationId: req.user!.organizationId, document }, select: { id: true } });
        clientId = existing?.id ?? null;
      }
      if (!clientId) {
        const client = await tx.client.create({
          data: {
            organizationId: req.user!.organizationId,
            name: input.client?.name ?? lead.name,
            document,
            email: (input.client?.email || lead.email) ?? null,
            phone: input.client?.phone ?? lead.phone,
            address: input.client?.address ?? lead.briefing?.address ?? null,
            notes: lead.interest ? `Interesse: ${lead.interest}` : null,
            // a origem do lead acompanha o cliente novo
            leadSource: lead.source,
            origin: lead.origin,
            sellerId: lead.sellerId,
          },
        });
        clientId = client.id;
      }
      const stage =
        (input.stageId
          ? await tx.salesStage.findFirst({ where: { id: input.stageId, organizationId: req.user!.organizationId } })
          : null) ??
        (await tx.salesStage.findFirst({
          where: { organizationId: req.user!.organizationId, isWon: false, isLost: false, active: true },
          orderBy: { position: "asc" },
        }));
      if (!stage) throw new BadRequestError("Nenhuma etapa de funil cadastrada");

      const opp = await tx.commercialOpportunity.create({
        data: {
          organizationId: req.user!.organizationId,
          title: input.title ?? `${lead.name}${lead.interest ? ` — ${lead.interest}` : ""}`,
          stageId: stage.id,
          probability: stage.probability,
          estimatedValue: new Prisma.Decimal(input.estimatedValue.toFixed(2)),
          source: lead.source,
          origin: lead.origin,
          clientId,
          leadId: lead.id,
          sellerId: lead.sellerId ?? req.user!.id,
        },
      });
      await tx.commercialLead.update({
        where: { id: lead.id },
        data: { status: "CONVERTED", convertedAt: new Date(), convertedClientId: clientId },
      });
      // Quem se cadastrou pelo site ganha acesso completo ao portal.
      let accessUpgraded = false;
      if (lead.account) {
        await tx.clientAccount.update({ where: { id: lead.account.id }, data: { clientId, accessLevel: "FULL" } });
        accessUpgraded = true;
      }
      return { clientId, opportunityId: opp.id, accessUpgraded };
    });

    await audit(req.user!.id, "COMMERCIAL_LEAD_CONVERTED", "CommercialLead", lead.id, result);
    // Acesso ao portal por e-mail: quem fez o cadastro rápido recebe o aviso de
    // liberação; quem não tem conta ganha uma com senha provisória.
    let accessNote: string | null;
    if (result.accessUpgraded) {
      const { delivered } = await sendUpgradeEmail(lead.account!.id);
      accessNote = delivered ? "o cliente recebeu por e-mail o aviso de que o portal completo foi liberado" : "portal completo liberado (o e-mail de aviso não saiu)";
    } else {
      const client = await prisma.client.findUnique({ where: { id: result.clientId! }, select: { name: true, email: true } });
      accessNote = accessMessage(await grantPortalAccess({ clientId: result.clientId!, name: client?.name ?? lead.name, email: client?.email, createdById: req.user!.id }));
    }
    void sendAutomation("PORTAL_ACCESS", {
      organizationId: req.user!.organizationId,
      clientId: result.clientId,
      dedupeKey: `portal-access:${result.clientId}`,
    });
    return ok(res, result, `Lead convertido em oportunidade${accessNote ? ` — ${accessNote}` : ""}`);
  })
);

// ============================================================
// OPORTUNIDADES (funil)
// ============================================================

const oppSchema = z.object({
  title: z.string().trim().min(2).max(200),
  stageId: z.string().min(1),
  clientId: z.string().min(1).optional().nullable(),
  estimatedValue: z.coerce.number().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.coerce.date().optional().nullable(),
  source: nullable(80),
  origin: z.enum(ORIGINS).optional().nullable(),
  notes: nullable(5000),
  nextAction: nullable(200),
  nextActionAt: z.coerce.date().optional().nullable(),
  sellerId: z.string().min(1).optional(),
});

const oppInclude = {
  stage: { select: { id: true, name: true, position: true, isWon: true, isLost: true } },
  client: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  interactions: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" as const }, take: 1 },
  _count: { select: { interactions: true, quotes: true } },
};

const serializeOpp = (o: {
  id: string; title: string; status: string; estimatedValue: Prisma.Decimal; probability: number;
  expectedCloseAt: Date | null; nextAction: string | null; nextActionAt: Date | null; position: number;
  createdAt: Date; lostReason: string | null; origin?: Origin | null; source?: string | null;
  stage: { id: string; name: string; position: number; isWon: boolean; isLost: boolean };
  client: { id: string; name: string } | null;
  seller: { id: string; name: string };
  interactions: { occurredAt: Date }[];
  _count: { interactions: number; quotes: number };
}) => ({
  id: o.id,
  title: o.title,
  status: o.status,
  estimatedValue: money(o.estimatedValue),
  probability: o.probability,
  weightedValue: Math.round(money(o.estimatedValue) * (o.probability / 100)),
  expectedCloseAt: o.expectedCloseAt,
  nextAction: o.nextAction,
  nextActionAt: o.nextActionAt,
  lostReason: o.lostReason,
  position: o.position,
  createdAt: o.createdAt,
  stage: o.stage,
  client: o.client,
  seller: o.seller,
  lastInteractionAt: o.interactions[0]?.occurredAt ?? null,
  interactionCount: o._count.interactions,
  quoteCount: o._count.quotes,
  score: opportunityScore(o),
  // quente / morno / frio pelo score; só para oportunidade em aberto
  temperature: opportunityTemperature(opportunityScore(o), o.status),
  origin: o.origin ?? null,
  source: o.source ?? null,
});

// Kanban: oportunidades abertas agrupadas por etapa
router.get(
  "/opportunities",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const includeClosed = req.query.closed === "1";
    const rows = await prisma.commercialOpportunity.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...sellerScope(req),
        ...(includeClosed ? {} : { status: { notIn: ["WON", "LOST"] } }),
        ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {}),
      },
      include: oppInclude,
      orderBy: [{ stage: { position: "asc" } }, { position: "asc" }, { createdAt: "desc" }],
    });
    const wanted = temperatureFilter(req.query.temperatura);
    const list = rows.map(serializeOpp);
    return ok(res, wanted ? list.filter((o) => o.temperature === wanted) : list);
  })
);

router.post(
  "/opportunities",
  // gestão cria qualquer uma; quem cadastra leads põe cliente da própria carteira no funil
  requireAnyPermission(["commercial.manage", "commercial.leads.manage"]),
  asyncHandler(async (req, res) => {
    const input = oppSchema.parse(req.body);
    const manage = req.user!.permissions.includes("commercial.manage");
    if (!manage && !input.clientId) throw new BadRequestError("Escolha o cliente para colocar no funil");
    const stage = await prisma.salesStage.findFirst({ where: { id: input.stageId, organizationId: req.user!.organizationId } });
    if (!stage) throw new BadRequestError("Etapa inválida");
    let clientOrigin: { origin: Origin | null; leadSource: string | null } | null = null;
    if (input.clientId) {
      const c = await prisma.client.findFirst({ where: { AND: [manage ? { organizationId: req.user!.organizationId } : crmClientScope(req.user!), { id: input.clientId }] }, select: { origin: true, leadSource: true } });
      if (!c) throw new BadRequestError(manage ? "Cliente inválido" : "Cliente não encontrado na sua carteira");
      clientOrigin = c;
    }
    // sem origem informada, a oportunidade herda a do cliente
    if (input.origin === undefined && input.source === undefined && clientOrigin) {
      input.origin = clientOrigin.origin;
      input.source = clientOrigin.leadSource;
    }
    if (!manage) input.sellerId = undefined;
    const opp = await prisma.commercialOpportunity.create({
      data: {
        organizationId: req.user!.organizationId,
        title: input.title,
        stageId: stage.id,
        clientId: input.clientId ?? null,
        estimatedValue: new Prisma.Decimal(input.estimatedValue.toFixed(2)),
        probability: input.probability ?? stage.probability,
        expectedCloseAt: input.expectedCloseAt ?? null,
        ...originFields(input.origin, input.source),
        notes: nn(input.notes),
        nextAction: nn(input.nextAction),
        nextActionAt: input.nextActionAt ?? null,
        sellerId: input.sellerId ?? req.user!.id,
      },
      include: oppInclude,
    });
    await audit(req.user!.id, "COMMERCIAL_OPPORTUNITY_CREATED", "CommercialOpportunity", opp.id, { title: opp.title });
    return ok(res, serializeOpp(opp), "Oportunidade criada");
  })
);

router.patch(
  "/opportunities/:id",
  requirePermission("commercial.manage"),
  asyncHandler(async (req, res) => {
    const cur = await prisma.commercialOpportunity.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!cur) throw new NotFoundError("Oportunidade não encontrada");

    const input = z
      .object({
        title: z.string().trim().min(2).max(200).optional(),
        stageId: z.string().min(1).optional(),
        estimatedValue: z.coerce.number().min(0).optional(),
        probability: z.coerce.number().int().min(0).max(100).optional(),
        expectedCloseAt: z.coerce.date().optional().nullable(),
        notes: nullable(5000),
        nextAction: nullable(200),
        nextActionAt: z.coerce.date().optional().nullable(),
        position: z.coerce.number().int().min(0).optional(),
        action: z.enum(["win", "lose", "reopen"]).optional(),
        lostReason: nullable(300),
        lostReasonCode: z.enum(LOST_REASONS).optional(),
        generateReceivable: z.boolean().optional(),
        origin: z.enum(ORIGINS).optional().nullable(),
      })
      .parse(req.body);

    const data: Prisma.CommercialOpportunityUpdateInput = {
      title: input.title,
      estimatedValue: input.estimatedValue === undefined ? undefined : new Prisma.Decimal(input.estimatedValue.toFixed(2)),
      probability: input.probability,
      expectedCloseAt: input.expectedCloseAt === undefined ? undefined : input.expectedCloseAt,
      notes: input.notes === undefined ? undefined : nn(input.notes),
      nextAction: input.nextAction === undefined ? undefined : nn(input.nextAction),
      nextActionAt: input.nextActionAt === undefined ? undefined : input.nextActionAt,
      position: input.position,
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
    };

    if (input.stageId && input.stageId !== cur.stageId) {
      const stage = await prisma.salesStage.findFirst({ where: { id: input.stageId, organizationId: req.user!.organizationId } });
      if (!stage) throw new BadRequestError("Etapa inválida");
      data.stage = { connect: { id: stage.id } };
      data.probability = input.probability ?? stage.probability;
      if (stage.isWon) data.status = "WON";
      else if (stage.isLost) data.status = "LOST";
      else if (cur.status === "WON" || cur.status === "LOST") data.status = "OPEN";
    }

    if (input.action === "win") data.status = "WON";
    if (input.action === "lose") {
      data.status = "LOST";
      data.lostReason = nn(input.lostReason);
      if (input.lostReasonCode) data.lostReasonCode = input.lostReasonCode;
    }
    if (input.action === "reopen") data.status = "OPEN";

    // Carimbo da venda: grava ao ganhar; limpa se reabrir ou perder.
    if (data.status === "WON" && cur.status !== "WON") data.wonAt = new Date();
    else if (data.status && data.status !== "WON" && cur.status === "WON") data.wonAt = null;

    const opp = await prisma.commercialOpportunity.update({ where: { id: cur.id }, data, include: oppInclude });

    // Contrato ganho -> gera o recebível no financeiro (uma vez).
    const becameWon = opp.status === "WON" && cur.status !== "WON";
    if (becameWon && input.generateReceivable !== false && opp.client) {
      const exists = await prisma.financeTransaction.findFirst({ where: { originOpportunityId: opp.id }, select: { id: true } });
      if (!exists) {
        await prisma.financeTransaction.create({
          data: {
            organizationId: req.user!.organizationId,
            type: "RECEITA",
            category: "Contrato — venda",
            amount: new Prisma.Decimal(money(opp.estimatedValue).toFixed(2)),
            date: new Date(),
            dueDate: opp.expectedCloseAt ?? new Date(Date.now() + 30 * 86400000),
            description: `Oportunidade ganha: ${opp.title}`,
            status: "PENDENTE",
            clientId: opp.client.id,
            originOpportunityId: opp.id,
            createdById: req.user!.id,
          },
        });
      }
    }

    await audit(req.user!.id, "COMMERCIAL_OPPORTUNITY_UPDATED", "CommercialOpportunity", opp.id, {
      from: cur.stageId,
      to: opp.stageId,
      status: opp.status,
    });
    return ok(res, serializeOpp(opp), "Oportunidade atualizada");
  })
);

router.post(
  "/opportunities/:id/interactions",
  requirePermission("commercial.manage"),
  asyncHandler(async (req, res) => {
    const opp = await prisma.commercialOpportunity.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      select: { id: true, leadId: true, clientId: true },
    });
    if (!opp) throw new NotFoundError("Oportunidade não encontrada");
    const input = z
      .object({
        type: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "VISIT", "INTERNAL_MESSAGE", "OTHER"]),
        summary: z.string().trim().min(2).max(2000),
        result: nullable(500),
        occurredAt: z.coerce.date().optional(),
        nextAction: nullable(200),
        nextActionAt: z.coerce.date().optional().nullable(),
      })
      .parse(req.body);

    const interaction = await prisma.commercialInteraction.create({
      data: {
        type: input.type,
        summary: input.summary,
        result: nn(input.result),
        occurredAt: input.occurredAt ?? new Date(),
        nextAction: nn(input.nextAction),
        nextActionAt: input.nextActionAt ?? null,
        opportunityId: opp.id,
        leadId: opp.leadId,
        clientId: opp.clientId,
        responsibleId: req.user!.id,
      },
    });
    if (input.nextAction || input.nextActionAt) {
      await prisma.commercialOpportunity.update({
        where: { id: opp.id },
        data: { nextAction: nn(input.nextAction) ?? undefined, nextActionAt: input.nextActionAt ?? undefined },
      });
    }
    return ok(res, interaction, "Interação registrada");
  })
);

router.get(
  "/opportunities/:id",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const opp = await prisma.commercialOpportunity.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        ...oppInclude,
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { responsible: { select: { id: true, name: true } } },
        },
        quotes: { select: { id: true, number: true, status: true, total: true, issuedAt: true } },
      },
    });
    if (!opp) throw new NotFoundError("Oportunidade não encontrada");
    return ok(res, opp);
  })
);

// ============================================================
// RESUMO DO FUNIL
// ============================================================

router.get(
  "/pipeline",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const stages = await prisma.salesStage.findMany({
      where: { organizationId: req.user!.organizationId, active: true },
      orderBy: { position: "asc" },
    });
    const opps = await prisma.commercialOpportunity.findMany({
      where: { organizationId: req.user!.organizationId, ...sellerScope(req) },
      select: { stageId: true, status: true, estimatedValue: true, probability: true, createdAt: true, lostReasonCode: true },
    });

    const open = opps.filter((o) => o.status !== "WON" && o.status !== "LOST");
    const byStage = stages.map((s) => {
      const items = open.filter((o) => o.stageId === s.id);
      const total = items.reduce((a, o) => a + money(o.estimatedValue), 0);
      const weighted = items.reduce((a, o) => a + money(o.estimatedValue) * (o.probability / 100), 0);
      return { id: s.id, name: s.name, count: items.length, total: Math.round(total), weighted: Math.round(weighted) };
    });

    const won = opps.filter((o) => o.status === "WON");
    const lost = opps.filter((o) => o.status === "LOST");
    const closed = won.length + lost.length;
    const wonValue = won.reduce((a, o) => a + money(o.estimatedValue), 0);

    const LOST_LABELS: Record<string, string> = {
      PRECO: "Preço", PRAZO: "Prazo", CONCORRENCIA: "Concorrência", SEM_RESPOSTA: "Sem resposta",
      DESISTIU: "Desistiu", ESCOPO: "Escopo", OUTRO: "Outro",
    };
    const lostReasons = Object.entries(
      lost.reduce<Record<string, number>>((acc, o) => {
        const k = o.lostReasonCode ?? "OUTRO";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {})
    )
      .map(([code, count]) => ({ code, label: LOST_LABELS[code] ?? code, count }))
      .sort((a, b) => b.count - a.count);

    return ok(res, {
      byStage,
      openCount: open.length,
      openValue: Math.round(open.reduce((a, o) => a + money(o.estimatedValue), 0)),
      forecast: Math.round(open.reduce((a, o) => a + money(o.estimatedValue) * (o.probability / 100), 0)),
      wonCount: won.length,
      wonValue: Math.round(wonValue),
      ticketMedio: won.length ? Math.round(wonValue / won.length) : 0,
      lostCount: lost.length,
      lostReasons,
      winRate: closed > 0 ? Math.round((won.length / closed) * 100) : 0,
    });
  })
);

// ============================================================
// PAINEL POR CANAL (origem): entrou, qualificou, converteu, perdeu, vendido
// ============================================================
router.get(
  "/channels",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const to = req.query.to ? new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999`) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestError("Período inválido");
    const scope = sellerScope(req);
    const [leads, opps] = await Promise.all([
      prisma.commercialLead.findMany({ where: { organizationId, ...scope, enteredAt: { gte: from, lte: to } }, select: { origin: true, source: true, status: true } }),
      prisma.commercialOpportunity.findMany({
        where: { organizationId, ...scope, OR: [{ createdAt: { gte: from, lte: to } }, { wonAt: { gte: from, lte: to } }] },
        select: { origin: true, source: true, status: true, estimatedValue: true, createdAt: true, wonAt: true },
      }),
    ]);
    const inPeriod = (d: Date | null) => Boolean(d && d >= from && d <= to);
    const rows = channelPanel(
      // registro antigo sem a coluna preenchida: reconhece pelo texto
      leads.map((l) => ({ origin: l.origin ?? normalizeOrigin(l.source), status: l.status })),
      opps.map((o) => ({ origin: o.origin ?? normalizeOrigin(o.source), createdInPeriod: inPeriod(o.createdAt), wonInPeriod: o.status === "WON" && inPeriod(o.wonAt), estimatedValue: money(o.estimatedValue) }))
    );
    const sum = (k: "entrou" | "converteu" | "valorVendido") => rows.reduce((a, r) => a + r[k], 0);
    return ok(res, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      rows,
      total: { entrou: sum("entrou"), converteu: sum("converteu"), valorVendido: sum("valorVendido"), taxaConversao: sum("entrou") ? Math.round((sum("converteu") / sum("entrou")) * 1000) / 10 : 0 },
    });
  })
);

// Painel comercial do período (padrão: mês atual): leads que entraram, clientes
// novos, fechados (definição única: closedWhere), taxa de conversão e a quebra
// por origem. Respeita a carteira de quem não vê tudo.
router.get(
  "/panel",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const def = defaultMonth();
    const from = req.query.from ? new Date(`${String(req.query.from).slice(0, 10)}T00:00:00`) : def.from;
    const to = req.query.to ? new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999`) : def.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestError("Período inválido");
    const scope = sellerScope(req);
    const range = { gte: from, lte: to };
    const [leads, newClients, won, lost, created] = await Promise.all([
      prisma.commercialLead.findMany({ where: { organizationId, ...scope, enteredAt: range }, select: { origin: true, source: true, status: true } }),
      prisma.client.count({ where: { organizationId, ...scope, createdAt: range } }),
      prisma.commercialOpportunity.findMany({ where: { organizationId, ...scope, ...closedWhere(range) }, select: { origin: true, source: true, estimatedValue: true } }),
      prisma.commercialOpportunity.count({ where: { organizationId, ...scope, ...lostWhere(range) } }),
      prisma.commercialOpportunity.findMany({ where: { organizationId, ...scope, createdAt: range }, select: { origin: true, source: true } }),
    ]);
    const rows = channelPanel(
      leads.map((l) => ({ origin: l.origin ?? normalizeOrigin(l.source), status: l.status })),
      [
        ...created.map((o) => ({ origin: o.origin ?? normalizeOrigin(o.source), createdInPeriod: true, wonInPeriod: false, estimatedValue: 0 })),
        ...won.map((o) => ({ origin: o.origin ?? normalizeOrigin(o.source), createdInPeriod: false, wonInPeriod: true, estimatedValue: money(o.estimatedValue) })),
      ]
    );
    return ok(res, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      leadsEntraram: leads.length,
      clientesNovos: newClients,
      fechados: { quantidade: won.length, valor: Math.round(won.reduce((a, o) => a + money(o.estimatedValue), 0)) },
      perdidos: lost,
      taxaConversao: closeRate(won.length, lost),
      porOrigem: rows,
    });
  })
);

// ============================================================
// FUNIL DE CONVERSÃO DE LEADS (estilo MRV: volume por etapa + taxa de conversão)
// ============================================================
router.get(
  "/funnel",
  requirePermission("commercial.read"),
  asyncHandler(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const to = req.query.to ? new Date(String(req.query.to)) : now;

    const [leads, opps] = await Promise.all([
      prisma.commercialLead.findMany({
        where: { organizationId, enteredAt: { gte: from, lte: to } },
        select: { status: true, lastContactAt: true },
      }),
      prisma.commercialOpportunity.findMany({
        where: { organizationId, createdAt: { gte: from, lte: to }, ...sellerScope(req) },
        select: { status: true, estimatedValue: true },
      }),
    ]);

    const leadsTotal = leads.length;
    const contatados = leads.filter((l) => l.status !== "NEW" || l.lastContactAt).length;
    const qualificados = leads.filter((l) => l.status === "QUALIFIED" || l.status === "CONVERTED").length;
    const oppsTotal = opps.length;
    const emNegociacao = opps.filter((o) => ["NEGOTIATION", "WAITING_CLIENT", "WON", "LOST"].includes(o.status)).length;
    const ganhos = opps.filter((o) => o.status === "WON").length;
    const ganhosValor = opps.filter((o) => o.status === "WON").reduce((a, o) => a + money(o.estimatedValue), 0);

    const raw = [
      { key: "LEADS", label: "Leads", count: leadsTotal },
      { key: "CONTATADOS", label: "Contatados", count: contatados },
      { key: "QUALIFICADOS", label: "Qualificados", count: qualificados },
      { key: "OPORTUNIDADES", label: "Oportunidades", count: oppsTotal },
      { key: "NEGOCIACAO", label: "Em negociação / proposta", count: emNegociacao },
      { key: "GANHOS", label: "Fechados (contrato)", count: ganhos },
    ];
    const top = raw[0].count || 0;
    const steps = raw.map((s, i) => ({
      ...s,
      conversionFromPrev: i === 0 ? 100 : raw[i - 1].count > 0 ? Math.round((s.count / raw[i - 1].count) * 1000) / 10 : 0,
      conversionFromTop: top > 0 ? Math.round((s.count / top) * 1000) / 10 : 0,
      dropFromPrev: i === 0 ? 0 : Math.max(0, raw[i - 1].count - s.count),
    }));

    return ok(res, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      steps,
      leadToContract: leadsTotal > 0 ? Math.round((ganhos / leadsTotal) * 1000) / 10 : 0,
      oppToContract: oppsTotal > 0 ? Math.round((ganhos / oppsTotal) * 1000) / 10 : 0,
      wonValue: Math.round(ganhosValor),
      leadsLost: leads.filter((l) => l.status === "LOST").length,
    });
  })
);

export default router;
