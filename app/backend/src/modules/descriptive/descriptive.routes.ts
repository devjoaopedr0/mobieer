/**
 * Descritiva do projeto: /api/production/projects/:projectId/descriptive
 *
 *   GET            dados salvos (ou a sugestão do orçamento) e as imagens 3D do projeto
 *   PUT            salva o preenchimento
 *   POST /ai       a IA escreve o texto de cada ambiente e sugere as cores (não salva)
 *   GET  .pdf      confere o PDF
 *   POST /publish  guarda nos documentos do projeto (tipo Descritiva), visível ao cliente
 */
import { Router } from "express";
import { z } from "zod";
import { aiComplete, aiEnabled, AiError } from "../../lib/ai";
import { storage } from "../../lib/storage";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { ApiError, NotFoundError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { hitLimit, type RateStore } from "../../utils/rate-limit";
import { ok } from "../../utils/response";
import { storeGeneratedPdf } from "../docgen/docgen.service";
import type { RenderItem } from "../render/render.rules";
import { descriptivePdf } from "./descriptive.pdf";
import { FINISH_KINDS, aiPrompt, mergeAiAnswer, suggestFromQuote, type DescriptiveData } from "./descriptive.rules";

const router = Router();
router.use(authenticate);

const key = (projectId: string) => `descriptive.${projectId}`;
const AI_LIMIT = { windowMs: 60 * 60_000, max: 15 };
const aiStore: RateStore = new Map();

const input = z.object({
  designer: z.string().trim().max(120).default(""),
  note: z.string().trim().max(200).default(""),
  rooms: z
    .array(
      z.object({
        room: z.string().trim().min(1).max(80),
        include: z.boolean().default(true),
        finishes: z.array(z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(FINISH_KINDS), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable() })).max(16),
        text: z.string().max(3000).default(""),
        renderIds: z.array(z.string().max(60)).max(8),
      })
    )
    .max(40),
  processes: z.array(z.object({ title: z.string().trim().min(1).max(60), detail: z.string().trim().max(120).default("") })).max(10),
});

async function projectFor(id: string, organizationId: string) {
  const p = await prisma.project.findFirst({
    where: { id, organizationId },
    select: {
      id: true, code: true, name: true, organizationId: true,
      client: { select: { id: true, name: true, seller: { select: { name: true } } } },
      quotes: {
        where: { kind: "PADRAO" },
        orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 1,
        select: {
          deliveryDays: true,
          commissions: { select: { role: true, name: true } },
          items: { orderBy: { position: "asc" }, select: { room: true, description: true, corpo: true, porta: true, puxador: true, complemento: true, modelo: true } },
        },
      },
    },
  });
  if (!p) throw new NotFoundError("Projeto não encontrado");
  return p;
}
type P = Awaited<ReturnType<typeof projectFor>>;

/** Renders do projeto (imagens 3D feitas com a IA na aba de renders). */
async function renders(projectId: string): Promise<RenderItem[]> {
  const row = await prisma.setting.findUnique({ where: { key: `renders.${projectId}` } });
  try {
    const v = JSON.parse(row?.value ?? "[]") as RenderItem[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function suggestion(p: P, list: RenderItem[]): DescriptiveData {
  const q = p.quotes[0];
  const designer = q?.commissions.find((c) => c.role === "PROJETISTA")?.name ?? p.client.seller?.name ?? "";
  return suggestFromQuote(q?.items ?? [], list.map((r) => ({ id: r.id, room: r.room })), designer, q?.deliveryDays ?? 45);
}

async function load(p: P, list: RenderItem[]): Promise<{ saved: boolean; data: DescriptiveData }> {
  const row = await prisma.setting.findUnique({ where: { key: key(p.id) } });
  try {
    return { saved: true, data: input.parse(JSON.parse(row?.value ?? "")) as DescriptiveData };
  } catch {
    return { saved: false, data: suggestion(p, list) };
  }
}

async function pdfOf(p: P, data: DescriptiveData, list: RenderItem[]) {
  // só as imagens escolhidas, já lidas do armazenamento
  const wanted = new Set(data.rooms.filter((r) => r.include).flatMap((r) => r.renderIds));
  const images = new Map<string, Buffer>();
  for (const r of list.filter((x) => wanted.has(x.id))) {
    try {
      images.set(r.id, await storage.getBytes(r.resultKey));
    } catch {
      // arquivo sumiu: a página sai sem essa imagem
    }
  }
  return descriptivePdf(data, { client: p.client.name, imagesFor: (id) => images.get(id) });
}

router.get(
  "/projects/:projectId/descriptive",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const p = await projectFor(req.params.projectId, req.user!.organizationId);
    const list = await renders(p.id);
    const document = await prisma.projectDocument.findFirst({
      where: { projectId: p.id, generatedFrom: `Descriptive:${p.id}` },
      orderBy: { version: "desc" },
      select: { id: true, version: true, createdAt: true },
    });
    return ok(res, {
      ...(await load(p, list)),
      renders: list.map((r) => ({ id: r.id, room: r.room, createdAt: r.createdAt })),
      ai: aiEnabled(),
      document,
    });
  })
);

router.put(
  "/projects/:projectId/descriptive",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const p = await projectFor(req.params.projectId, req.user!.organizationId);
    const data = input.parse(req.body) as DescriptiveData;
    const value = JSON.stringify(data);
    await prisma.setting.upsert({ where: { key: key(p.id) }, create: { key: key(p.id), value }, update: { value } });
    return ok(res, { saved: true, data }, "Descritiva salva");
  })
);

router.post(
  "/projects/:projectId/descriptive/ai",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const p = await projectFor(req.params.projectId, req.user!.organizationId);
    if (!aiEnabled()) throw new ApiError(503, "A IA de texto não está configurada no servidor");
    const limit = hitLimit(aiStore, `descriptive:${req.user!.id}`, AI_LIMIT);
    if (!limit.allowed) throw new ApiError(429, `Muitos pedidos à IA nesta hora. Tente de novo em ${Math.ceil(limit.retryAfterSec / 60)} minutos.`, undefined, "RATE_LIMITED");
    const data = input.parse(req.body) as DescriptiveData;
    const items = p.quotes[0]?.items ?? [];
    // a IA recebe o que o orçamento diz de cada ambiente e o texto que já está na tela
    const rooms = data.rooms
      .filter((r) => r.include)
      .map((r) => {
        const k = r.room.toLowerCase();
        const fromQuote = items.filter((it) => (it.room || it.description).trim().toLowerCase() === k).map((it) => [it.room ? it.description : "", it.corpo, it.porta, it.puxador, it.complemento, it.modelo].filter(Boolean).join(" | "));
        return { room: r.room, text: [r.text, ...fromQuote].filter(Boolean).join("\n").slice(0, 2500), finishes: r.finishes.map((f) => f.name) };
      });
    if (!rooms.length) return ok(res, { data, updated: 0 }, "Nenhum ambiente marcado");
    const { system, prompt } = aiPrompt(rooms);
    let answer: string;
    try {
      answer = await aiComplete({ system, prompt, json: true, temperature: 0.2, maxTokens: 3500 });
    } catch (e) {
      throw new ApiError(502, e instanceof AiError ? `A IA não respondeu: ${e.message}` : "A IA não respondeu");
    }
    const merged = mergeAiAnswer(data.rooms, answer);
    return ok(res, { data: { ...data, rooms: merged.rooms }, updated: merged.updated }, merged.updated ? `A IA escreveu ${merged.updated} ${merged.updated > 1 ? "ambientes" : "ambiente"}. Confira e salve.` : "A IA não devolveu nada aproveitável. Tente de novo.");
  })
);

router.get(
  "/projects/:projectId/descriptive.pdf",
  requirePermission("documents.read"),
  asyncHandler(async (req, res) => {
    const p = await projectFor(req.params.projectId, req.user!.organizationId);
    const list = await renders(p.id);
    const pdf = await pdfOf(p, (await load(p, list)).data, list);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="descritiva-${p.code}.pdf"`);
    return res.send(pdf);
  })
);

router.post(
  "/projects/:projectId/descriptive/publish",
  requirePermission("documents.manage"),
  asyncHandler(async (req, res) => {
    const p = await projectFor(req.params.projectId, req.user!.organizationId);
    const list = await renders(p.id);
    const pdf = await pdfOf(p, (await load(p, list)).data, list);
    const generatedFrom = `Descriptive:${p.id}`;
    const previous = await prisma.projectDocument.findFirst({ where: { projectId: p.id, generatedFrom }, orderBy: { version: "desc" }, select: { id: true } });
    const doc = await storeGeneratedPdf({
      organizationId: p.organizationId,
      clientId: p.client.id,
      projectId: p.id,
      type: "DESCRITIVA",
      generatedFrom,
      title: `Descritiva — ${p.client.name}`,
      fileName: `descritiva-${p.code}.pdf`,
      buffer: pdf,
      visibleToClient: true,
      uploadedById: req.user!.id,
      replacesId: previous?.id ?? null,
    });
    return ok(res, { id: doc.id, version: doc.version }, previous ? "Nova versão da descritiva nos documentos" : "Descritiva publicada nos documentos do projeto");
  })
);

export default router;
