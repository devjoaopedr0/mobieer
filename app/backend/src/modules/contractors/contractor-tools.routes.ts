/**
 * Ferramentas do montador e documentos padrão para ele assinar.
 *
 * Gestão (/api/contractors):
 *   GET  /tool-catalog                      lista de ferramentas que o montador marca
 *   PUT  /tool-catalog                      { items: string[] }
 *   GET  /:id/tools                         o que está com o montador + histórico
 *   GET  /tools/:toolId/photo?kind=released foto da ferramenta (ou da retirada)
 *   POST /:id/documents/from-template       { templateId, kind, send } — contrato, código de conduta…
 *
 * Montador (/api/me/contractor):
 *   GET  /tools                             o que está comigo, catálogo e colegas
 *   POST /tools                             multipart: photo, name, quantity?, notes?
 *   POST /tools/:id/release                 multipart: photo, toContractorId? | toName?
 *   GET  /tools/:id/photo?kind=released
 *   POST /tools/term                        gera o termo de ferramentas para assinar
 */
import crypto from "node:crypto";
import { ContractorDocumentStatus, ContractorDocumentType } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { BRAND, PAGE, brandDocument, brandOneLine, brandSection, brandTable, brandTitle, ensureSpace } from "../../lib/brand-pdf";
import { buildStorageKey, storage } from "../../lib/storage";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { uploadPhoto } from "../../middlewares/upload";
import { prisma } from "../../prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { pipeToResponse } from "../../utils/stream";
import { CONTRACT_CONTACTS, contractPdf, renderTemplate } from "../templates/contract.service";
import { contractorValues, normalizeCatalog, termIsCurrent, toolTermIntro } from "./contractor-tools.rules";

const catalogKey = (org: string) => `contractors.tool-catalog.${org}`;
const TERM_PREFIX = "termo-ferramentas-";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function loadCatalog(org: string) {
  const row = await prisma.setting.findUnique({ where: { key: catalogKey(org) } });
  try {
    return normalizeCatalog(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizeCatalog(null);
  }
}

const brDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");

type ToolRow = Awaited<ReturnType<typeof prisma.contractorTool.findMany>>[number];
const viewTool = (t: ToolRow, names: Map<string, string>) => ({
  id: t.id,
  name: t.name,
  quantity: t.quantity,
  notes: t.notes,
  status: t.status,
  receivedAt: t.receivedAt,
  /** de quem veio, quando foi repassada por outro montador */
  from: t.fromToolId ? (names.get(t.fromToolId) ?? null) : null,
  releasedAt: t.releasedAt,
  releasedTo: t.releasedTo,
  hasReleasedPhoto: Boolean(t.releasedPhotoKey),
});

/** O que está com o montador, o histórico e se o termo assinado ainda vale. */
async function toolsView(contractorId: string) {
  const tools = await prisma.contractorTool.findMany({ where: { contractorId }, orderBy: [{ status: "asc" }, { receivedAt: "desc" }] });
  // nome de quem repassou cada ferramenta recebida
  const fromIds = tools.map((t) => t.fromToolId).filter((x): x is string => Boolean(x));
  const origins = fromIds.length ? await prisma.contractorTool.findMany({ where: { id: { in: fromIds } }, select: { id: true, contractor: { select: { name: true } } } }) : [];
  const names = new Map(origins.map((o) => [o.id, o.contractor.name]));
  const holding = tools.filter((t) => t.status === "COM_ELE");
  const lastTerm = await prisma.contractorDocument.findFirst({
    where: { contractorId, kind: ContractorDocumentType.TERMO_RESPONSABILIDADE, fileName: { startsWith: TERM_PREFIX } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, signedAt: true, createdAt: true },
  });
  const lastSigned = await prisma.contractorDocument.findFirst({
    where: { contractorId, kind: ContractorDocumentType.TERMO_RESPONSABILIDADE, fileName: { startsWith: TERM_PREFIX }, status: ContractorDocumentStatus.ASSINADO },
    orderBy: { signedAt: "desc" },
    select: { signedAt: true },
  });
  return {
    holding: holding.map((t) => viewTool(t, names)),
    history: tools.filter((t) => t.status !== "COM_ELE").slice(0, 30).map((t) => viewTool(t, names)),
    term: {
      current: termIsCurrent(tools.flatMap((t) => [t.receivedAt, t.releasedAt]), lastSigned?.signedAt ?? null, holding.length),
      lastSignedAt: lastSigned?.signedAt ?? null,
      pendingDocumentId: lastTerm && lastTerm.status !== ContractorDocumentStatus.ASSINADO && lastTerm.status !== ContractorDocumentStatus.RECUSADO ? lastTerm.id : null,
    },
  };
}

async function sendPhoto(res: Parameters<typeof pipeToResponse>[1], key: string) {
  const signed = await storage.getSignedUrl(key, "foto.jpg");
  if (signed) return res.redirect(signed);
  return pipeToResponse(await storage.getStream(key), res);
}

/** Cria o documento do montador a partir de um PDF pronto. */
async function createContractorDoc(o: { contractorId: string; kind: ContractorDocumentType; title: string; fileName: string; pdf: Buffer; userId: string; send: boolean }) {
  const key = buildStorageKey(`contractors/${o.contractorId}`, o.fileName);
  await storage.put(key, o.pdf, "application/pdf");
  return prisma.contractorDocument.create({
    data: {
      contractorId: o.contractorId,
      kind: o.kind,
      title: o.title,
      storageKey: key,
      fileName: o.fileName,
      mimeType: "application/pdf",
      size: o.pdf.byteLength,
      uploadedById: o.userId,
      requiresSignature: true,
      status: o.send ? ContractorDocumentStatus.ENVIADO : ContractorDocumentStatus.AGUARDANDO_ENVIO,
      sentAt: o.send ? new Date() : null,
    },
    select: { id: true, title: true, status: true },
  });
}

/** PDF do termo: texto, lista e as fotos de cada ferramenta. */
export async function toolTermPdf(c: { name: string; document: string | null }, tools: ToolRow[]): Promise<Buffer> {
  const { doc, done, width: W } = brandDocument({ contacts: CONTRACT_CONTACTS });
  brandTitle(doc, "Termo de responsabilidade de ferramentas", `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`);
  for (const p of toolTermIntro(c.name, c.document)) {
    doc.font("Helvetica").fontSize(10).fillColor(BRAND.ink).text(p, PAGE.left, doc.y, { width: W, align: "justify", lineGap: 2.5 });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.3);
  brandSection(doc, "Ferramentas sob a minha guarda");
  brandTable(
    doc,
    [
      { label: "#", w: 0.06, align: "center", bold: true },
      { label: "FERRAMENTA / EQUIPAMENTO", w: 0.5, bold: true },
      { label: "QTD", w: 0.1, align: "center" },
      { label: "DESDE", w: 0.16, align: "center" },
      { label: "OBSERVAÇÃO", w: 0.18, size: 7.5 },
    ],
    tools.map((t, i) => [String(i + 1), t.name, String(t.quantity), brDate(t.receivedAt), t.notes ?? ""]),
    18,
    true
  );
  doc.moveDown(0.8);
  brandSection(doc, "Fotos registradas");
  // três fotos por linha, cada uma com o número e o nome embaixo
  const per = 3;
  const cw = W / per;
  const ph = 120;
  for (let i = 0; i < tools.length; i += per) {
    ensureSpace(doc, ph + 26);
    const y = doc.y;
    for (const [j, t] of tools.slice(i, i + per).entries()) {
      const x = PAGE.left + j * cw;
      try {
        doc.image(await storage.getBytes(t.photoKey), x + 4, y, { fit: [cw - 8, ph], align: "center", valign: "center" });
      } catch {
        // foto em formato que o PDF não abre (HEIC…): fica o quadro com o aviso
        doc.rect(x + 4, y, cw - 8, ph).lineWidth(0.6).strokeColor(BRAND.line).stroke();
        brandOneLine(doc, "foto no sistema", x + 8, y + ph / 2 - 4, cw - 16, { size: 8, color: BRAND.muted, align: "center" });
      }
      brandOneLine(doc, `${i + j + 1}. ${t.name}`, x + 4, y + ph + 4, cw - 8, { size: 8, bold: true });
    }
    doc.y = y + ph + 20;
  }
  doc.x = PAGE.left;
  doc.end();
  return done;
}

// =========================================================== gestão
export const toolsManageRouter = Router();
toolsManageRouter.use(authenticate);

toolsManageRouter.get(
  "/tool-catalog",
  requirePermission("hr.read"),
  asyncHandler(async (req, res) => ok(res, { items: await loadCatalog(req.user!.organizationId) }))
);

toolsManageRouter.put(
  "/tool-catalog",
  requirePermission("hr.employees.manage"),
  asyncHandler(async (req, res) => {
    const items = normalizeCatalog(z.object({ items: z.array(z.string()).max(200) }).parse(req.body).items);
    const key = catalogKey(req.user!.organizationId);
    const value = JSON.stringify(items);
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return ok(res, { items }, "Lista de ferramentas salva");
  })
);

toolsManageRouter.get(
  "/tools/:toolId/photo",
  requirePermission("hr.read"),
  asyncHandler(async (req, res) => {
    const t = await prisma.contractorTool.findFirst({ where: { id: req.params.toolId, organizationId: req.user!.organizationId } });
    if (!t) throw new NotFoundError("Ferramenta não encontrada");
    const key = req.query.kind === "released" ? t.releasedPhotoKey : t.photoKey;
    if (!key) throw new NotFoundError("Sem foto");
    return sendPhoto(res, key);
  })
);

toolsManageRouter.get(
  "/:id/tools",
  requirePermission("hr.read"),
  asyncHandler(async (req, res) => {
    const c = await prisma.contractor.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, select: { id: true } });
    if (!c) throw new NotFoundError("Montador não encontrado");
    return ok(res, await toolsView(c.id));
  })
);

toolsManageRouter.post(
  "/:id/documents/from-template",
  requirePermission("hr.employees.manage"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const input = z
      .object({ templateId: z.string().min(1), kind: z.nativeEnum(ContractorDocumentType).default(ContractorDocumentType.OUTRO), send: z.boolean().default(true) })
      .parse(req.body);
    const [c, t, org] = await Promise.all([
      prisma.contractor.findFirst({ where: { id: req.params.id, organizationId: orgId } }),
      prisma.documentTemplate.findFirst({ where: { id: input.templateId, organizationId: orgId } }),
      prisma.organization.findUnique({ where: { id: orgId }, include: { enterprise: true } }),
    ]);
    if (!c) throw new NotFoundError("Montador não encontrado");
    if (!t?.bodyHtml?.trim()) throw new BadRequestError("Escolha um modelo com texto (Modelos de documentos)");
    const now = new Date();
    const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
    const { text, missing } = renderTemplate(t.bodyHtml, {
      ...contractorValues({ ...c, dailyRate: Number(c.dailyRate) }),
      "contrato.data": brDate(now),
      "contrato.dataExtenso": `${local.getDate()} de ${MESES[local.getMonth()]} de ${local.getFullYear()}`,
      "contrato.cidade": org?.enterprise?.municipio || "Fortaleza",
      "empresa.razaoSocial": org?.enterprise?.legalName ?? "",
      "empresa.cnpj": org?.enterprise?.document ?? "",
    });
    const pdf = await contractPdf({ title: t.name, body: text, contacts: CONTRACT_CONTACTS, footer: `Gerado pelo sistema MOBIEER em ${now.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}` });
    const slug = t.name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const doc = await createContractorDoc({ contractorId: c.id, kind: input.kind, title: t.name, fileName: `${slug}-${c.name.split(" ")[0].toLowerCase()}.pdf`, pdf, userId: req.user!.id, send: input.send });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "CONTRACTOR_DOCUMENT_GENERATED", entity: "ContractorDocument", entityId: doc.id, details: { templateId: t.id, missing } } });
    const msg = input.send ? "Documento gerado e enviado ao montador para assinar" : "Documento gerado. Envie ao montador quando estiver pronto.";
    return ok(res, { ...doc, missing }, missing.length ? `${msg} (${missing.length} campo(s) sem valor: ${missing.join(", ")})` : msg);
  })
);

// =========================================================== montador
export const toolsSelfRouter = Router();
toolsSelfRouter.use(authenticate, requirePermission("contractors.self"));

async function me(req: Request) {
  const c = await prisma.contractor.findFirst({ where: { userId: req.user!.id, organizationId: req.user!.organizationId } });
  if (!c) throw new ForbiddenError("Seu usuário não está ligado a um cadastro de montador. Fale com a gestão.");
  if (!c.active) throw new ForbiddenError("Seu cadastro de montador está inativo");
  return c;
}

toolsSelfRouter.get(
  "/tools",
  asyncHandler(async (req, res) => {
    const c = await me(req);
    const [view, catalog, colleagues] = await Promise.all([
      toolsView(c.id),
      loadCatalog(c.organizationId),
      prisma.contractor.findMany({ where: { organizationId: c.organizationId, active: true, id: { not: c.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return ok(res, { ...view, catalog, colleagues });
  })
);

const toolInput = z.object({
  name: z.string().trim().min(2, "Informe a ferramenta").max(80),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().trim().max(300).optional().nullable(),
});

toolsSelfRouter.post(
  "/tools",
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    const c = await me(req);
    if (!req.file) throw new BadRequestError("Tire a foto da ferramenta");
    const input = toolInput.parse(req.body);
    const key = buildStorageKey(`contractors/${c.id}/tools`, req.file.originalname || "foto.jpg");
    await storage.put(key, req.file.buffer, req.file.mimetype);
    const t = await prisma.contractorTool.create({
      data: { organizationId: c.organizationId, contractorId: c.id, name: input.name, quantity: input.quantity, notes: input.notes || null, photoKey: key, createdById: req.user!.id },
    });
    return ok(res, { id: t.id }, "Ferramenta registrada. Assine o termo para confirmar.");
  })
);

toolsSelfRouter.post(
  "/tools/:id/release",
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    const c = await me(req);
    if (!req.file) throw new BadRequestError("Tire a foto da ferramenta saindo");
    const t = await prisma.contractorTool.findFirst({ where: { id: req.params.id, contractorId: c.id, status: "COM_ELE" } });
    if (!t) throw new NotFoundError("Ferramenta não está com você");
    const input = z.object({ toContractorId: z.string().min(1).optional().nullable(), toName: z.string().trim().max(120).optional().nullable() }).parse(req.body);
    const target = input.toContractorId
      ? await prisma.contractor.findFirst({ where: { id: input.toContractorId, organizationId: c.organizationId, active: true }, select: { id: true, name: true } })
      : null;
    if (input.toContractorId && !target) throw new BadRequestError("Montador não encontrado");
    const toName = target?.name ?? input.toName?.trim();
    if (!toName) throw new BadRequestError("Diga para quem a ferramenta vai (ou se volta para a empresa)");
    const key = buildStorageKey(`contractors/${c.id}/tools`, req.file.originalname || "retirada.jpg");
    await storage.put(key, req.file.buffer, req.file.mimetype);
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.contractorTool.update({ where: { id: t.id }, data: { status: "RETIRADA", releasedAt: now, releasedPhotoKey: key, releasedTo: toName, releasedToContractorId: target?.id ?? null } });
      // passou para outro montador: a ferramenta entra na lista dele, com a foto da retirada
      if (target) {
        await tx.contractorTool.create({
          data: { organizationId: c.organizationId, contractorId: target.id, name: t.name, quantity: t.quantity, notes: t.notes, photoKey: key, receivedAt: now, fromToolId: t.id, createdById: req.user!.id },
        });
      }
    });
    return ok(res, null, target ? `Ferramenta passada para ${target.name}` : "Retirada registrada");
  })
);

toolsSelfRouter.get(
  "/tools/:id/photo",
  asyncHandler(async (req, res) => {
    const c = await me(req);
    const t = await prisma.contractorTool.findFirst({ where: { id: req.params.id, contractorId: c.id } });
    if (!t) throw new NotFoundError("Ferramenta não encontrada");
    const key = req.query.kind === "released" ? t.releasedPhotoKey : t.photoKey;
    if (!key) throw new NotFoundError("Sem foto");
    return sendPhoto(res, key);
  })
);

toolsSelfRouter.post(
  "/tools/term",
  asyncHandler(async (req, res) => {
    const c = await me(req);
    const tools = await prisma.contractorTool.findMany({ where: { contractorId: c.id, status: "COM_ELE" }, orderBy: { receivedAt: "asc" } });
    if (!tools.length) throw new BadRequestError("Marque as ferramentas que estão com você antes de assinar");
    // termo anterior ainda sem assinatura fica superado pelo novo
    const stale = await prisma.contractorDocument.findMany({
      where: { contractorId: c.id, kind: ContractorDocumentType.TERMO_RESPONSABILIDADE, fileName: { startsWith: TERM_PREFIX }, status: { in: [ContractorDocumentStatus.ENVIADO, ContractorDocumentStatus.VISUALIZADO, ContractorDocumentStatus.AGUARDANDO_ASSINATURA, ContractorDocumentStatus.AGUARDANDO_ENVIO] } },
      select: { id: true, storageKey: true },
    });
    const pdf = await toolTermPdf(c, tools);
    const stamp = new Date().toISOString().slice(0, 10);
    const doc = await createContractorDoc({ contractorId: c.id, kind: ContractorDocumentType.TERMO_RESPONSABILIDADE, title: `Termo de ferramentas (${brDate(new Date())})`, fileName: `${TERM_PREFIX}${stamp}-${crypto.randomBytes(3).toString("hex")}.pdf`, pdf, userId: req.user!.id, send: true });
    if (stale.length) {
      await prisma.contractorDocument.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      await Promise.all(stale.map((s) => storage.remove(s.storageKey).catch(() => undefined)));
    }
    return ok(res, doc, "Termo gerado: abra e assine em Documentos");
  })
);
