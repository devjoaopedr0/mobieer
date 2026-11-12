import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { uploadDocument } from "../../middlewares/upload";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { storage, buildStorageKey } from "../../lib/storage";
import {
  MERGE_FIELDS,
  DEFAULT_CONTRACT_BODY,
  buildContractContext,
  contractChecklist,
  renderContractBody,
  renderTemplate,
  CONTRACT_CONTACTS,
  contractPdf,
} from "./contract.service";
import { BLOCK, drawOrderBlock, drawPaymentBlock, loadContractOrder, mergeOrders, quotesForProjects } from "./contract-order";
import { CONTRACT_TITLE_SIZE, contractDocPdf, contractHtml, docBlocksSchema, docHasBlanks } from "./contract-doc";
import { discardContractText, loadContractText, saveContractText } from "./contract-text";
import { ORDER_TYPES, contractOptionsSchema, suggestedDays } from "./contract-options";
import { contractNumberFor, contractRevision, getReplacementNotice, nextContractNumber, nextQuoteSequence, peekContractNumber, renumberOldQuotes, setNextContractNumber, setNextQuoteNumber, setReplacementNotice } from "./contract-number";
import { DEFAULT_REPLACEMENT_NOTICE, MAX_NOTICE_LENGTH, NOTICE_FIELDS, docStartsWith } from "./contract-revision.rules";
import { pipeToResponse } from "../../utils/stream";

const router = Router();
router.use(authenticate);

const DOC_TYPES = [
  "MANUAL_GARANTIA",
  "VISTORIA_CHECKLIST",
  "CRONOGRAMA",
  "VISTORIA_FOTOGRAFICA",
  "CONTRATO",
  "PROJETO_3D",
  "OUTRO",
] as const;

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === "true" || v === "1")
  .optional();

const rolesFromInput = (v: unknown): string[] =>
  (typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : [])
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean);

const serialize = (t: {
  id: string; name: string; type: string; description: string | null; fileName: string | null; mimeType: string | null;
  sizeBytes: number | null; bodyHtml?: string | null; requiresSignature: boolean; signerRoles: string[];
  visibleToClient: boolean; active: boolean; createdAt: Date; _count?: { documents: number };
}) => ({
  id: t.id,
  name: t.name,
  type: t.type,
  description: t.description,
  fileName: t.fileName,
  mimeType: t.mimeType,
  sizeBytes: t.sizeBytes,
  hasFile: Boolean(t.fileName),
  body: t.bodyHtml ?? null,
  hasBody: Boolean(t.bodyHtml && t.bodyHtml.trim()),
  requiresSignature: t.requiresSignature,
  signerRoles: t.signerRoles,
  visibleToClient: t.visibleToClient,
  active: t.active,
  createdAt: t.createdAt,
  generatedCount: t._count?.documents ?? 0,
  downloadUrl: t.fileName ? `/api/templates/${t.id}/download` : null,
});

// ---------------- texto do contrato no editor (salvo enquanto a pessoa edita) ----------------

const textTarget = z.object({ clientId: z.string().min(1), projectId: z.string().min(1).optional().nullable() });

async function ensureTextTarget(organizationId: string, clientId: string, projectId?: string | null) {
  const [client, project] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, organizationId }, select: { id: true } }),
    projectId ? prisma.project.findFirst({ where: { id: projectId, organizationId, clientId }, select: { id: true } }) : null,
  ]);
  if (!client) throw new NotFoundError("Cliente não encontrado");
  if (projectId && !project) throw new NotFoundError("Projeto não encontrado");
}

// GET /api/templates/contract-text?clientId&projectId -> texto salvo do contrato deste cliente/projeto (ou null)
router.get(
  "/contract-text",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const t = textTarget.parse({ clientId: req.query.clientId, projectId: req.query.projectId || null });
    await ensureTextTarget(req.user!.organizationId, t.clientId, t.projectId);
    return ok(res, await loadContractText(t.clientId, t.projectId));
  })
);

// PUT /api/templates/contract-text { clientId, projectId, templateId, doc } -> salva o que está no editor
router.put(
  "/contract-text",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const input = textTarget.extend({ templateId: z.string().min(1), doc: docBlocksSchema, options: contractOptionsSchema.nullable().optional() }).parse(req.body);
    await ensureTextTarget(req.user!.organizationId, input.clientId, input.projectId);
    const prev = await loadContractText(input.clientId, input.projectId);
    const saved = await saveContractText(input.clientId, input.projectId, { templateId: input.templateId, doc: input.doc, savedBy: req.user!.name, documentId: prev?.documentId ?? null, options: input.options ?? prev?.options ?? null });
    return ok(res, saved, "Texto do contrato salvo");
  })
);

// POST /api/templates/contract-text/discard { clientId, projectId } -> volta a montar o contrato pelo modelo
router.post(
  "/contract-text/discard",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const t = textTarget.parse(req.body);
    await ensureTextTarget(req.user!.organizationId, t.clientId, t.projectId);
    await discardContractText(t.clientId, t.projectId);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "CONTRACT_TEXT_DISCARDED", entity: "Client", entityId: t.clientId, details: { projectId: t.projectId ?? null } } });
    return ok(res, { discarded: true }, "Texto descartado: o contrato volta a sair do modelo");
  })
);

// GET /api/templates/contracts -> contratos gerados (a versão atual de cada um) e orçamentos aceitos ainda sem contrato
router.get(
  "/contracts",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const all = await prisma.projectDocument.findMany({
      where: { organizationId: orgId, type: "CONTRATO", supersededBy: { none: {} } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true, number: true, title: true, version: true, createdAt: true, signatureStatus: true, visibleToClient: true, templateId: true,
        client: { select: { id: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
        _count: { select: { signatures: true } },
      },
    });
    // gerado mais de uma vez antes de haver versões: fica o mais recente de cada cliente/projeto/número
    const seen = new Set<string>();
    const docs = all.filter((d) => {
      const k = `${d.client.id}:${d.project?.id ?? "-"}:${d.number ?? d.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // o orçamento de cada contrato fica no registro da geração
    const logs = await prisma.auditLog.findMany({
      where: { action: "CONTRACT_GENERATED", entityId: { in: docs.map((d) => d.id) } },
      select: { entityId: true, details: true },
    });
    const quoteOf = new Map(logs.map((l) => [l.entityId, ((l.details ?? {}) as { quoteId?: string | null }).quoteId ?? null]));
    const quoteIds = [...new Set([...quoteOf.values()].filter((x): x is string => !!x))];
    const [quotes, approved] = await Promise.all([
      prisma.commercialQuote.findMany({ where: { id: { in: quoteIds }, organizationId: orgId }, select: { id: true, number: true, version: true, status: true } }),
      prisma.commercialQuote.findMany({
        where: { organizationId: orgId, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
        take: 200,
        select: { id: true, number: true, version: true, total: true, approvedAt: true, client: { select: { id: true, name: true } }, project: { select: { id: true, code: true, name: true } } },
      }),
    ]);
    const quoteById = new Map(quotes.map((q) => [q.id, q]));
    const texts = await Promise.all(docs.map((d) => loadContractText(d.client.id, d.project?.id ?? null)));
    const withContract = new Set(docs.map((d) => `${d.client.id}:${d.project?.id ?? "-"}`));
    return ok(res, {
      contracts: docs.map((d, i) => {
        const qid = quoteOf.get(d.id) ?? null;
        const q = qid ? quoteById.get(qid) : null;
        return {
          id: d.id, number: d.number, title: d.title, version: d.version, createdAt: d.createdAt, signatureStatus: d.signatureStatus, signatures: d._count.signatures,
          visibleToClient: d.visibleToClient, templateId: d.templateId, client: d.client, project: d.project,
          quote: q ? { id: q.id, number: q.number, version: q.version, status: q.status } : null,
          // há texto corrigido no editor guardado para este contrato
          edited: Boolean(texts[i]),
        };
      }),
      pending: approved
        .filter((q) => !withContract.has(`${q.client.id}:${q.project?.id ?? "-"}`) && !(q.project && withContract.has(`${q.client.id}:-`)))
        .map((q) => ({ id: q.id, number: q.number, version: q.version, total: Number(q.total), approvedAt: q.approvedAt, client: q.client, project: q.project })),
    });
  })
);

// GET /api/templates
router.get(
  "/",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.documentTemplate.findMany({
      where: { organizationId: req.user!.organizationId },
      include: { _count: { select: { documents: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return ok(res, rows.map(serialize));
  })
);

// POST /api/templates  (multipart: file + campos)
router.post(
  "/",
  requirePermission("templates.manage"),
  uploadDocument.single("file"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(200),
        type: z.enum(DOC_TYPES).default("OUTRO"),
        description: z.string().trim().max(5000).optional().nullable(),
        body: z.string().max(100000).optional().nullable(),
        requiresSignature: bool,
        visibleToClient: bool,
      })
      .parse(req.body);
    const body = input.body && input.body.trim() ? input.body : null;
    if (!req.file && !body) throw new BadRequestError("Envie um arquivo ou escreva o corpo do modelo");

    const signerRoles = rolesFromInput(req.body.signerRoles);
    let key: string | null = null;
    if (req.file) {
      key = buildStorageKey(`templates/${req.user!.organizationId}`, req.file.originalname);
      await storage.put(key, req.file.buffer, req.file.mimetype);
    }

    const t = await prisma.documentTemplate.create({
      data: {
        organizationId: req.user!.organizationId,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        storageKey: key,
        fileName: req.file?.originalname ?? null,
        mimeType: req.file?.mimetype ?? null,
        sizeBytes: req.file?.size ?? null,
        bodyHtml: body,
        requiresSignature: input.requiresSignature ?? false,
        signerRoles: (input.requiresSignature ?? false) ? (signerRoles.length ? signerRoles : ["MOBIEER", "CLIENTE"]) : [],
        visibleToClient: input.visibleToClient ?? true,
        createdById: req.user!.id,
      },
      include: { _count: { select: { documents: true } } },
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "DOCUMENT_TEMPLATE_CREATED", entity: "DocumentTemplate", entityId: t.id, details: { name: t.name } },
    });
    return ok(res, serialize(t), "Modelo criado");
  })
);

// PATCH /api/templates/:id
router.patch(
  "/:id",
  requirePermission("templates.manage"),
  asyncHandler(async (req, res) => {
    const current = await prisma.documentTemplate.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!current) throw new NotFoundError("Modelo não encontrado");
    const input = z
      .object({
        name: z.string().trim().min(2).max(200).optional(),
        type: z.enum(DOC_TYPES).optional(),
        description: z.string().trim().max(5000).optional().nullable(),
        requiresSignature: z.boolean().optional(),
        visibleToClient: z.boolean().optional(),
        active: z.boolean().optional(),
        body: z.string().max(100000).optional().nullable(),
        signerRoles: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const t = await prisma.documentTemplate.update({
      where: { id: current.id },
      data: {
        name: input.name,
        type: input.type,
        description: input.description === undefined ? undefined : input.description,
        requiresSignature: input.requiresSignature,
        visibleToClient: input.visibleToClient,
        active: input.active,
        bodyHtml: input.body === undefined ? undefined : input.body && input.body.trim() ? input.body : null,
        signerRoles: input.signerRoles ? input.signerRoles.map((r) => r.trim().toUpperCase()).filter(Boolean) : undefined,
      },
      include: { _count: { select: { documents: true } } },
    });
    return ok(res, serialize(t), "Modelo atualizado");
  })
);

// DELETE /api/templates/:id
router.delete(
  "/:id",
  requirePermission("templates.manage"),
  asyncHandler(async (req, res) => {
    const current = await prisma.documentTemplate.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!current) throw new NotFoundError("Modelo não encontrado");
    if (current.storageKey) await storage.remove(current.storageKey).catch(() => undefined);
    await prisma.documentTemplate.delete({ where: { id: current.id } });
    return ok(res, { id: current.id }, "Modelo removido");
  })
);

// GET /api/templates/:id/download
router.get(
  "/:id/download",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const t = await prisma.documentTemplate.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!t) throw new NotFoundError("Modelo não encontrado");
    if (!t.storageKey || !t.fileName) throw new BadRequestError("Este modelo não tem arquivo — use a geração de contrato");
    const signed = await storage.getSignedUrl(t.storageKey, t.fileName);
    if (signed) return res.redirect(signed);
    const stream = await storage.getStream(t.storageKey);
    res.setHeader("Content-Type", t.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(t.fileName)}"`);
    return pipeToResponse(stream, res);
  })
);

// POST /api/templates/:id/generate  { clientId, projectId? }
router.post(
  "/:id/generate",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const t = await prisma.documentTemplate.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } });
    if (!t) throw new NotFoundError("Modelo não encontrado");

    const input = z.object({ clientId: z.string().min(1), projectId: z.string().min(1).optional().nullable() }).parse(req.body);
    const client = await prisma.client.findFirst({ where: { id: input.clientId, organizationId: req.user!.organizationId }, select: { id: true } });
    if (!client) throw new BadRequestError("Cliente inválido");
    let projectId: string | null = null;
    if (input.projectId) {
      const p = await prisma.project.findFirst({ where: { id: input.projectId, clientId: client.id, organizationId: req.user!.organizationId }, select: { id: true } });
      if (!p) throw new BadRequestError("Projeto inválido para este cliente");
      projectId = p.id;
    }

    if (!t.storageKey || !t.fileName) throw new BadRequestError("Modelo sem arquivo — use POST /api/templates/:id/contract");
    const bytes = await storage.getBytes(t.storageKey);
    const key = buildStorageKey(`clients/${client.id}`, t.fileName);
    await storage.put(key, bytes, t.mimeType ?? "application/octet-stream");

    const doc = await prisma.projectDocument.create({
      data: {
        organizationId: req.user!.organizationId,
        projectId,
        clientId: client.id,
        templateId: t.id,
        type: t.type,
        title: t.name,
        description: t.description,
        storageKey: key,
        fileName: t.fileName,
        mimeType: t.mimeType ?? "application/octet-stream",
        sizeBytes: bytes.byteLength,
        checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
        visibleToClient: t.visibleToClient,
        requiresSignature: t.requiresSignature,
        signerRoles: t.signerRoles,
        signatureStatus: t.requiresSignature ? "PENDING" : "NOT_REQUIRED",
        uploadedById: req.user!.id,
      },
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "DOCUMENT_GENERATED_FROM_TEMPLATE", entity: "ProjectDocument", entityId: doc.id, details: { templateId: t.id, clientId: client.id } },
    });
    return ok(res, { id: doc.id, title: doc.title, requiresSignature: doc.requiresSignature }, "Documento gerado para o cliente");
  })
);

// ---------------- Contrato automático ----------------
// Modelo de contrato (corpo de texto com {{marcadores}}) + dados do cliente +
// valores do orçamento do Promob -> PDF anexado ao cliente/projeto.

// GET/PUT /api/templates/contract-numbering  -> próximo número de contrato e de orçamento (sequências separadas)
const numbering = async () => ({
  next: await nextContractNumber(),
  quoteNext: await nextQuoteSequence(),
  // aviso que sai no início do contrato refeito (377-1), com os marcadores que aceita
  replacementNotice: await getReplacementNotice(),
  replacementNoticeDefault: DEFAULT_REPLACEMENT_NOTICE,
  replacementNoticeFields: NOTICE_FIELDS,
});
router.get(
  "/contract-numbering",
  requirePermission("documents.read"),
  asyncHandler(async (_req, res) => ok(res, await numbering()))
);
router.put(
  "/contract-numbering",
  requirePermission("templates.manage"),
  asyncHandler(async (req, res) => {
    const n = z.coerce.number().int().min(1).max(99_999_999);
    const { next, quoteNext, replacementNotice } = z
      .object({ next: n.optional(), quoteNext: n.optional(), replacementNotice: z.string().max(MAX_NOTICE_LENGTH, `O aviso pode ter até ${MAX_NOTICE_LENGTH} caracteres`).optional() })
      .parse(req.body);
    if (next !== undefined) await setNextContractNumber(next);
    if (quoteNext !== undefined) await setNextQuoteNumber(quoteNext);
    // vazio volta ao texto padrão
    if (replacementNotice !== undefined) {
      await setReplacementNotice(replacementNotice);
      await prisma.auditLog.create({ data: { userId: req.user!.id, action: "CONTRACT_NOTICE_UPDATED", entity: "Setting", entityId: "contracts.replacementNotice", details: { text: replacementNotice } } });
    }
    // nunca volta para um número já usado
    return ok(res, await numbering(), "Numeração salva");
  })
);

// POST /api/templates/contract-numbering/renumber-quotes { dryRun } -> orçamentos antigos entram na sequência
router.post(
  "/contract-numbering/renumber-quotes",
  requirePermission("templates.manage"),
  asyncHandler(async (req, res) => {
    const { dryRun } = z.object({ dryRun: z.boolean().default(true) }).parse(req.body ?? {});
    const changes = await renumberOldQuotes(req.user!.organizationId, dryRun);
    if (!dryRun && changes.length) await prisma.auditLog.create({ data: { userId: req.user!.id, action: "QUOTES_RENUMBERED", entity: "CommercialQuote", entityId: "-", details: { changes } } });
    const message = !changes.length ? "Nenhum orçamento antigo fora da sequência" : dryRun ? `${changes.length} orçamento(s) entram na sequência` : `${changes.length} orçamento(s) renumerados`;
    return ok(res, { changes, ...(await numbering()) }, message);
  })
);

// GET /api/templates/merge-fields  -> campos disponíveis + modelo padrão
router.get(
  "/merge-fields",
  requirePermission("documents.read"),
  asyncHandler(async (_req, res) => ok(res, { fields: MERGE_FIELDS, defaultBody: DEFAULT_CONTRACT_BODY }))
);

const contractInput = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  /** vários projetos do mesmo cliente num contrato só */
  projectIds: z.array(z.string().min(1)).max(20).optional().nullable(),
  promobImportId: z.string().min(1).optional().nullable(),
  /** orçamento aceito: o pedido, o pagamento e as parcelas saem dele */
  quoteId: z.string().min(1).optional().nullable(),
  entrada: z.coerce.number().min(0).optional().nullable(),
  parcelas: z.coerce.number().int().min(0).max(240).optional().nullable(),
  valorParcela: z.coerce.number().min(0).optional().nullable(),
  condicaoPagamento: z.string().trim().max(2000).optional().nullable(),
  prazoEntregaDias: z.coerce.number().int().min(0).max(999).optional().nullable(),
  cidade: z.string().trim().max(120).optional().nullable(),
  totalOverride: z.coerce.number().min(0).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  visibleToClient: z.boolean().optional(),
  /** contrato corrigido no editor: o PDF sai deste documento, não do modelo */
  doc: docBlocksSchema.optional().nullable(),
  /** cláusulas variáveis: tipo de pedido, prazo e pré-montagem */
  opcoes: contractOptionsSchema.optional().nullable(),
});

/** Orçamento do contrato, conferindo que é do mesmo cliente. */
async function orderFor(input: z.infer<typeof contractInput>, organizationId: string) {
  if (input.quoteId) {
    const order = await loadContractOrder(organizationId, input.quoteId);
    if (order.clientId !== input.clientId) throw new BadRequestError("O orçamento é de outro cliente");
    return order;
  }
  // projetos escolhidos: usa o orçamento de cada um (o Promob escolhido à mão vale mais)
  const ids = input.projectIds?.length ? input.projectIds : input.projectId ? [input.projectId] : [];
  if (input.promobImportId) return null;
  const { quoteIds } = ids.length ? await quotesForProjects(organizationId, input.clientId, ids) : { quoteIds: [] as string[] };
  if (quoteIds.length) return mergeOrders(await Promise.all(quoteIds.map((id) => loadContractOrder(organizationId, id))));
  // orçamento feito sem projeto: vale o último do cliente (o aceito primeiro)
  const last = await prisma.commercialQuote.findFirst({
    where: { organizationId, clientId: input.clientId, kind: "PADRAO", status: { not: "CANCELLED" } },
    orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true },
  });
  return last ? loadContractOrder(organizationId, last.id) : null;
}

/** Título do contrato: "Contrato Nº 1520", com o nome do cliente pequeno embaixo. */
const contractHeading = (number: string) => `Contrato Nº ${number}`;

async function loadContractTemplate(id: string, organizationId: string) {
  const t = await prisma.documentTemplate.findFirst({ where: { id, organizationId } });
  if (!t) throw new NotFoundError("Modelo não encontrado");
  if (!t.bodyHtml || !t.bodyHtml.trim()) {
    throw new BadRequestError("Este modelo não tem corpo de texto. Edite o modelo e escreva o contrato com os marcadores {{...}}.");
  }
  return t;
}

// POST /api/templates/:id/contract/preview  -> texto já substituído (sem salvar)
router.post(
  "/:id/contract/preview",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const t = await loadContractTemplate(req.params.id, req.user!.organizationId);
    const input = contractInput.parse(req.body);
    const order = await orderFor(input, req.user!.organizationId);
    const ctx = await buildContractContext(req.user!.organizationId, input, order);
    const base = t.type === "CONTRATO" ? await peekContractNumber(req.user!.organizationId, ctx.meta.clientId, ctx.meta.projectId) : "";
    // já existe contrato deste número: este sai como revisão (377-1) e com o aviso no início
    const revision = base ? await contractRevision(req.user!.organizationId, ctx.meta.clientId, ctx.meta.projectId, base) : null;
    const numero = revision?.display ?? base;
    ctx.values["contrato.numero"] = numero;
    const rendered = renderContractBody(t.bodyHtml!, ctx);
    const marked = renderContractBody(t.bodyHtml!, ctx, { mark: true });
    // orçamento alterado depois do texto salvo: a tela compara com a data do texto
    const quote = order ? await prisma.commercialQuote.findUnique({ where: { id: order.quoteId }, select: { updatedAt: true } }) : null;
    const baseDays = order?.deliveryDays ?? input.prazoEntregaDias ?? null;
    // na prévia em texto, o quadro vira um resumo
    const body = order
      ? rendered.text
          .replace(BLOCK.pedido, order.items.map((i) => `${i.code} — ${i.room} — ${i.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join("\n"))
          .replace(BLOCK.pagamento, order.installments.map((p) => `${p.label}: ${p.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join("\n"))
      : rendered.text;
    // revisão: o aviso sai no início do PDF (não entra no editor, para não repetir na próxima revisão)
    const text = revision?.notice ? `${revision.notice}\n\n${body}` : body;
    // `html`: o contrato inteiro, com os quadros como tabelas, para corrigir no editor
    return ok(res, {
      title: numero ? `${contractHeading(numero)} — ${ctx.meta.clientName}` : input.title || t.name,
      text,
      html: contractHtml(marked.text, order, marked.keys),
      missing: rendered.missing,
      // o que falta cadastrar, com onde corrigir (aparece antes de abrir o editor)
      checklist: contractChecklist(rendered.missing),
      meta: { ...ctx.meta, quoteUpdatedAt: quote?.updatedAt ?? null },
      /** este contrato substitui outro: número com o sufixo e o aviso que sai no início do PDF */
      revision: revision?.notice ? { number: revision.display, version: revision.version, notice: revision.notice } : null,
      values: ctx.values,
      fieldLabels: Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.label])),
      options: { chosen: ctx.options, orderTypes: ORDER_TYPES.map((o) => ({ code: o.code, label: o.label, days: suggestedDays(o.code, baseDays) })), baseDays },
    });
  })
);

// POST /api/templates/:id/contract  -> gera o PDF e anexa ao cliente
router.post(
  "/:id/contract",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const t = await loadContractTemplate(req.params.id, req.user!.organizationId);
    const input = contractInput.parse(req.body);
    const order = await orderFor(input, req.user!.organizationId);
    const ctx = await buildContractContext(req.user!.organizationId, input, order);
    // contrato da loja: número na sequência dos contratos antigos
    const numero = t.type === "CONTRATO" ? (await contractNumberFor(req.user!.organizationId, ctx.meta.clientId, ctx.meta.projectId)).number : null;
    // contrato refeito: sai como 377-1, 377-2…, com o aviso de que o anterior fica desconsiderado
    const revision = numero ? await contractRevision(req.user!.organizationId, ctx.meta.clientId, ctx.meta.projectId, numero) : null;
    const previous = revision?.previous ?? null;
    const shown = revision?.display ?? numero;
    ctx.values["contrato.numero"] = shown ?? "";
    const rendered = renderContractBody(t.bodyHtml!, ctx);
    const text = revision?.notice ? `${revision.notice}\n\n${rendered.text}` : rendered.text;
    // editado: o que faltava pode ter sido preenchido à mão; sobra o que ainda tem "____"
    const missing = input.doc ? (docHasBlanks(input.doc) ? rendered.missing : []) : rendered.missing;

    const title = shown ? `${contractHeading(shown)} — ${ctx.meta.clientName}` : input.title || `${t.name} — ${ctx.meta.clientName}`;
    const footer = `Gerado pelo sistema MOBIEER em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}${
      ctx.meta.promobImportId ? ` • orçamento Promob ${ctx.values["promob.arquivo"]}` : ""
    }`;
    const heading = { title: shown ? contractHeading(shown) : title, subtitle: shown ? ctx.meta.clientName : undefined, footer, contacts: CONTRACT_CONTACTS };
    // no texto editado, o aviso entra como primeiro parágrafo (em negrito), sem repetir se já estiver lá
    const docBlocks = input.doc && revision?.notice && !docStartsWith(input.doc, revision.notice)
      ? [{ t: "p" as const, runs: [{ text: revision.notice, b: true }], align: "justify" as const }, ...input.doc]
      : input.doc;
    const pdf = docBlocks
      ? await contractDocPdf({ ...heading, blocks: docBlocks })
      : await contractPdf({
          ...heading,
          titleSize: CONTRACT_TITLE_SIZE,
          body: text,
          blocks: order ? { [BLOCK.pedido]: (doc) => drawOrderBlock(doc, order), [BLOCK.pagamento]: (doc) => drawPaymentBlock(doc, order) } : undefined,
        });

    const fileName = `contrato-${(shown || ctx.meta.projectCode || ctx.meta.clientName).replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`;
    const key = buildStorageKey(`clients/${ctx.meta.clientId}`, fileName);
    await storage.put(key, pdf, "application/pdf");

    // contrato refeito (pagamento corrigido, cláusula mudada): vira a versão seguinte do anterior,
    // com o mesmo número gravado (o -1 é só como sai); o anterior que ninguém assinou sai do portal
    // para o cliente não ver dois
    const doc = await prisma.projectDocument.create({
      data: {
        version: previous ? previous.version + 1 : 1,
        replacesId: previous?.id ?? null,
        organizationId: req.user!.organizationId,
        projectId: ctx.meta.projectId,
        clientId: ctx.meta.clientId,
        templateId: t.id,
        type: "CONTRATO",
        number: numero,
        title,
        description: t.description,
        storageKey: key,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: pdf.byteLength,
        checksum: crypto.createHash("sha256").update(pdf).digest("hex"),
        visibleToClient: input.visibleToClient ?? t.visibleToClient,
        requiresSignature: t.requiresSignature,
        signerRoles: t.signerRoles.length ? t.signerRoles : ["MOBIEER", "CLIENTE"],
        signatureStatus: t.requiresSignature ? "PENDING" : "NOT_REQUIRED",
        uploadedById: req.user!.id,
      },
    });
    if (previous && previous._count.signatures === 0) {
      await prisma.projectDocument.update({ where: { id: previous.id }, data: { visibleToClient: false, signatureStatus: "NOT_REQUIRED" } });
    }
    // o texto do editor fica guardado: "Editar contrato" reabre exatamente o que gerou este PDF
    if (input.doc) await saveContractText(ctx.meta.clientId, ctx.meta.projectId, { templateId: t.id, doc: input.doc, savedBy: req.user!.name, documentId: doc.id });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CONTRACT_GENERATED",
        entity: "ProjectDocument",
        entityId: doc.id,
        details: { templateId: t.id, clientId: ctx.meta.clientId, quoteId: order?.quoteId ?? null, total: ctx.meta.total, totalSource: ctx.meta.totalSource, edited: !!input.doc, replaces: previous?.id ?? null, version: doc.version },
      },
    });

    return ok(
      res,
      {
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        sizeBytes: doc.sizeBytes,
        requiresSignature: doc.requiresSignature,
        version: doc.version,
        missing,
        meta: ctx.meta,
        downloadUrl: `/api/documents/${doc.id}/download`,
      },
      missing.length ? `Contrato gerado — ${missing.length} campo(s) sem valor` : "Contrato gerado"
    );
  })
);

export default router;
