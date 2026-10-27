/**
 * Conversa do cliente no portal.
 *
 * - /api/portal/chat (conta do portal): o cliente lê a conversa e manda
 *   mensagem para a equipe ou para o assistente virtual.
 * - /api/portal-chat (equipe): lista das conversas dos clientes da carteira,
 *   leitura e resposta.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { authenticateClient } from "../../middlewares/portalAuth";
import { clientScope } from "../../lib/scope";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { rateLimit } from "../../utils/rate-limit";
import { aiProvider } from "../ai/provider";
import { answerAsAssistant, notifyTeamOfClientMessage, portalMessageSelect, serializePortalMessage } from "./portal-chat.service";

const PAGE = 100;
const bodySchema = z.string().trim().min(1, "Escreva a mensagem").max(2000, "Mensagem muito longa (máx. 2.000 caracteres)");
const afterQuery = (v: unknown) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Últimas mensagens (ou só as novas, com `after`), em ordem de envio. */
async function loadMessages(clientId: string, after: Date | null) {
  const rows = await prisma.portalMessage.findMany({
    where: { clientId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE,
    select: portalMessageSelect,
  });
  return rows.reverse();
}

// ============================================================
// CLIENTE
// ============================================================

export const portalChatClientRouter = Router();
portalChatClientRouter.use(authenticateClient);

// GET /api/portal/chat?after=ISO
portalChatClientRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clientId = req.portal!.clientId;
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, attendant: { select: { name: true } }, seller: { select: { name: true } } },
    });
    const messages = await loadMessages(clientId, afterQuery(req.query.after));
    await prisma.portalMessage.updateMany({
      where: { clientId, authorKind: { not: "CLIENT" }, readByClientAt: null },
      data: { readByClientAt: new Date() },
    });
    return ok(res, {
      assistantEnabled: aiProvider().enabled,
      team: client?.attendant?.name ?? client?.seller?.name ?? null,
      messages: messages.map((m) => serializePortalMessage(m, client?.name ?? "Você")),
    });
  })
);

// GET /api/portal/chat/unread — respostas da equipe ainda não vistas
portalChatClientRouter.get(
  "/unread",
  asyncHandler(async (req, res) => {
    const count = await prisma.portalMessage.count({
      where: { clientId: req.portal!.clientId, authorKind: "STAFF", readByClientAt: null },
    });
    return ok(res, { count });
  })
);

// POST /api/portal/chat { body, to: "team" | "assistant" }
portalChatClientRouter.post(
  "/",
  rateLimit({ name: "portal-chat", windowMs: 60 * 1000, max: 12 }),
  asyncHandler(async (req, res) => {
    const { body, to } = z.object({ body: bodySchema, to: z.enum(["team", "assistant"]) }).parse(req.body);
    const clientId = req.portal!.clientId;
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, organizationId: true } });
    if (!client) throw new NotFoundError("Cliente não encontrado");

    const question = await prisma.portalMessage.create({
      data: { organizationId: client.organizationId, clientId, authorKind: "CLIENT", clientAccountId: req.portal!.accountId, toTeam: to === "team", body },
      select: portalMessageSelect,
    });
    const created = [question];

    if (to === "assistant") {
      const answer = await answerAsAssistant(clientId, body);
      if (answer) {
        created.push(
          await prisma.portalMessage.create({
            data: { organizationId: client.organizationId, clientId, authorKind: "AI", body: answer, readByClientAt: new Date() },
            select: portalMessageSelect,
          })
        );
      } else {
        // sem IA (ou falhou): a pergunta vai para a equipe, que responde
        created[0] = await prisma.portalMessage.update({ where: { id: question.id }, data: { toTeam: true }, select: portalMessageSelect });
        created.push(
          await prisma.portalMessage.create({
            data: {
              organizationId: client.organizationId,
              clientId,
              authorKind: "AI",
              body: "Não consegui responder agora. Encaminhei sua pergunta para a equipe, que vai te responder por aqui.",
              readByClientAt: new Date(),
            },
            select: portalMessageSelect,
          })
        );
      }
    }
    if (created[0].toTeam) await notifyTeamOfClientMessage(clientId, body);

    return ok(res, created.map((m) => serializePortalMessage(m, client.name)), created[0].toTeam ? "Mensagem enviada para a equipe" : undefined);
  })
);

// ============================================================
// EQUIPE
// ============================================================

export const portalChatStaffRouter = Router();
portalChatStaffRouter.use(authenticate, requirePermission("organization.read"));

async function clientInScope(clientId: string, user: Parameters<typeof clientScope>[0]) {
  const client = await prisma.client.findFirst({ where: { id: clientId, ...clientScope(user) }, select: { id: true, name: true, organizationId: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado");
  return client;
}

// GET /api/portal-chat/conversations — clientes da carteira que já usaram o chat
portalChatStaffRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { ...clientScope(req.user!), portalMessages: { some: {} } },
      select: {
        id: true,
        name: true,
        status: true,
        attendant: { select: { name: true } },
        portalMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { authorKind: true, body: true, createdAt: true } },
      },
    });
    const unread = await prisma.portalMessage.groupBy({
      by: ["clientId"],
      where: { clientId: { in: clients.map((c) => c.id) }, authorKind: "CLIENT", toTeam: true, readByStaffAt: null },
      _count: { _all: true },
    });
    const unreadBy = new Map(unread.map((u) => [u.clientId, u._count._all]));
    const list = clients
      .map((c) => ({
        clientId: c.id,
        name: c.name,
        active: c.status === "ACTIVE",
        attendant: c.attendant?.name ?? null,
        unread: unreadBy.get(c.id) ?? 0,
        lastMessage: c.portalMessages[0] ?? null,
      }))
      .sort((a, b) => b.unread - a.unread || +new Date(b.lastMessage?.createdAt ?? 0) - +new Date(a.lastMessage?.createdAt ?? 0));
    return ok(res, list);
  })
);

// GET /api/portal-chat/unread — total para o menu
portalChatStaffRouter.get(
  "/unread",
  asyncHandler(async (req, res) => {
    const count = await prisma.portalMessage.count({
      where: { authorKind: "CLIENT", toTeam: true, readByStaffAt: null, client: clientScope(req.user!) },
    });
    return ok(res, { count });
  })
);

// GET /api/portal-chat/conversations/:clientId/messages?after=ISO
portalChatStaffRouter.get(
  "/conversations/:clientId/messages",
  asyncHandler(async (req, res) => {
    const client = await clientInScope(req.params.clientId, req.user!);
    const messages = await loadMessages(client.id, afterQuery(req.query.after));
    await prisma.portalMessage.updateMany({
      where: { clientId: client.id, authorKind: "CLIENT", readByStaffAt: null },
      data: { readByStaffAt: new Date() },
    });
    return ok(res, { client: { id: client.id, name: client.name }, messages: messages.map((m) => serializePortalMessage(m, client.name)) });
  })
);

// POST /api/portal-chat/conversations/:clientId/messages { body }
portalChatStaffRouter.post(
  "/conversations/:clientId/messages",
  asyncHandler(async (req, res) => {
    const client = await clientInScope(req.params.clientId, req.user!);
    const { body } = z.object({ body: bodySchema }).parse(req.body);
    const m = await prisma.portalMessage.create({
      data: { organizationId: client.organizationId, clientId: client.id, authorKind: "STAFF", userId: req.user!.id, body, readByStaffAt: new Date() },
      select: portalMessageSelect,
    });
    return ok(res, serializePortalMessage(m, client.name));
  })
);
