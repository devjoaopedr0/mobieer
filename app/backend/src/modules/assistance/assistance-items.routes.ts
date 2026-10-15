/**
 * Itens da assistência, cobrança no financeiro e ordem de serviço (montado em /api/business).
 *
 *   GET    /assistances/:id/items              itens, totais e a cobrança já lançada
 *   POST   /assistances/:id/items              acrescenta um item
 *   PATCH  /assistance-items/:itemId           altera
 *   DELETE /assistance-items/:itemId           remove
 *   POST   /assistances/:id/charge             lança (ou atualiza) a conta a receber do que é cobrado
 *   GET    /assistances/:id/service-order.pdf  ordem de serviço
 *   POST   /assistances/:id/stock-exit         dá baixa no estoque dos itens ligados a produto
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { createExitWithClient } from "../stock/stock.service";
import { BRAND, PAGE, brandDocument, brandField, brandSection, brandTitle, ensureSpace } from "../../lib/brand-pdf";
import { ITEM_KINDS, ITEM_KIND_CODES, chargePlan, itemKindLabel, itemTotals, lineTotal } from "./assistance-items.rules";
import { kindLabel } from "./assistance.rules";

const router = Router();
router.use(authenticate);
const canEdit = requirePermission("organization.tasks.edit.all");
export const CATEGORY_ASSISTANCE = "Assistência técnica";

const num = (v: unknown) => Number(v ?? 0);
type ItemRow = { id: string; kind: string; description: string; quantity: unknown; unitPrice: unknown; charged: boolean; position: number; productId?: string | null; stockMovedAt?: Date | null; product?: { id: string; code: string; name: string; stock: number } | null };
const serializeItem = (i: ItemRow) => {
  const quantity = num(i.quantity);
  const unitPrice = num(i.unitPrice);
  return {
    id: i.id, kind: i.kind, kindLabel: itemKindLabel(i.kind), description: i.description, quantity, unitPrice, charged: i.charged, total: lineTotal({ quantity, unitPrice }), position: i.position,
    product: i.product ? { id: i.product.id, code: i.product.code, name: i.product.name, stock: i.product.stock } : null,
    stockMovedAt: i.stockMovedAt ?? null,
  };
};

async function ticketFor(id: string, organizationId: string) {
  const t = await prisma.assistanceTicket.findFirst({
    where: { id, organizationId },
    include: {
      client: { select: { id: true, name: true, phone: true, document: true, street: true, addressNumber: true, complement: true, district: true, city: true, state: true, address: true, condominium: true } },
      project: { select: { id: true, code: true, name: true } },
      assignee: { select: { name: true } },
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { product: { select: { id: true, code: true, name: true, stock: true } } } },
    },
  });
  if (!t) throw new NotFoundError("Assistência não encontrada");
  return t;
}

async function view(ticketId: string, organizationId: string) {
  const t = await ticketFor(ticketId, organizationId);
  const items = t.items.map(serializeItem);
  const fin = await prisma.financeTransaction.findFirst({ where: { organizationId, originAssistanceId: t.id, type: "RECEITA" }, select: { id: true, amount: true, status: true, dueDate: true } });
  return {
    internal: t.internal,
    items,
    totals: itemTotals(items),
    finance: fin ? { id: fin.id, amount: num(fin.amount), status: fin.status, dueDate: fin.dueDate } : null,
    kinds: ITEM_KINDS,
  };
}

const itemInput = z.object({
  kind: z.enum(ITEM_KIND_CODES),
  description: z.string().trim().min(1, "Descreva o item").max(300),
  quantity: z.coerce.number().positive("Quantidade inválida").max(100_000).default(1),
  unitPrice: z.coerce.number().min(0, "Valor inválido").max(10_000_000).default(0),
  charged: z.boolean().default(false),
  productId: z.string().min(1).nullable().optional(),
});

/** Item ligado a produto sai do estoque em unidades inteiras. */
async function checkProduct(productId: string | null | undefined, quantity: number | undefined) {
  if (!productId) return;
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!p) throw new BadRequestError("Produto não encontrado no almoxarifado");
  if (quantity !== undefined && !Number.isInteger(quantity)) throw new BadRequestError("Para dar baixa no estoque, a quantidade precisa ser um número inteiro");
}

router.get("/assistances/:id/items", requirePermission("organization.read"), asyncHandler(async (req, res) => ok(res, await view(req.params.id, req.user!.organizationId))));

router.post(
  "/assistances/:id/items",
  canEdit,
  asyncHandler(async (req, res) => {
    const t = await ticketFor(req.params.id, req.user!.organizationId);
    const input = itemInput.parse(req.body);
    await checkProduct(input.productId, input.quantity);
    // registro interno é custo da loja: nunca é cobrado
    await prisma.assistanceItem.create({ data: { ticketId: t.id, ...input, charged: t.internal ? false : input.charged, position: t.items.length } });
    return ok(res, await view(t.id, req.user!.organizationId), "Item acrescentado");
  })
);

async function itemFor(itemId: string, organizationId: string) {
  const item = await prisma.assistanceItem.findFirst({ where: { id: itemId, ticket: { organizationId } }, include: { ticket: { select: { id: true, internal: true } } } });
  if (!item) throw new NotFoundError("Item não encontrado");
  return item;
}

router.patch(
  "/assistance-items/:itemId",
  canEdit,
  asyncHandler(async (req, res) => {
    const item = await itemFor(req.params.itemId, req.user!.organizationId);
    const input = itemInput.partial().parse(req.body);
    if (item.stockMovedAt && (input.quantity !== undefined || input.productId !== undefined)) throw new BadRequestError("Este item já saiu do estoque: para mudar produto ou quantidade, faça a devolução no almoxarifado e lance de novo");
    await checkProduct(input.productId ?? item.productId, input.quantity ?? (input.productId ? Number(item.quantity) : undefined));
    await prisma.assistanceItem.update({ where: { id: item.id }, data: { ...input, charged: item.ticket.internal ? false : input.charged } });
    return ok(res, await view(item.ticket.id, req.user!.organizationId), "Item atualizado");
  })
);

router.delete(
  "/assistance-items/:itemId",
  canEdit,
  asyncHandler(async (req, res) => {
    const item = await itemFor(req.params.itemId, req.user!.organizationId);
    if (item.stockMovedAt) throw new BadRequestError("Este item já saiu do estoque: faça a devolução no almoxarifado antes de remover");
    await prisma.assistanceItem.delete({ where: { id: item.id } });
    return ok(res, await view(item.ticket.id, req.user!.organizationId), "Item removido");
  })
);

// Lança no financeiro só o que foi marcado como cobrado; o resto segue na garantia.
router.post(
  "/assistances/:id/charge",
  requireAnyPermission(["finance.manage", "organization.manage"]),
  asyncHandler(async (req, res) => {
    const input = z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), method: z.string().trim().max(40).nullable().optional() }).parse(req.body);
    const orgId = req.user!.organizationId;
    const t = await ticketFor(req.params.id, orgId);
    if (t.internal) throw new BadRequestError("Registro interno (erro ou retrabalho) não é cobrado do cliente");
    const { cobrado } = itemTotals(t.items.map(serializeItem));
    const existing = await prisma.financeTransaction.findFirst({ where: { organizationId: orgId, originAssistanceId: t.id, type: "RECEITA" } });
    const plan = chargePlan(cobrado, existing ? { status: existing.status, amount: num(existing.amount) } : null);
    if (plan.action === "NADA") throw new BadRequestError(plan.motivo!);
    const dueDate = new Date(`${input.dueDate}T00:00:00Z`);
    const description = `Assistência ${t.number} — ${t.title}`.slice(0, 250);
    let message = "";
    if (plan.action === "REMOVER") {
      await prisma.financeTransaction.delete({ where: { id: existing!.id } });
      message = "Nada mais é cobrado: a conta a receber da assistência foi retirada";
    } else if (plan.action === "ATUALIZAR") {
      await prisma.financeTransaction.update({ where: { id: existing!.id }, data: { amount: cobrado, dueDate, description, method: input.method ?? existing!.method } });
      message = "Cobrança da assistência atualizada no financeiro";
    } else {
      await prisma.financeTransaction.create({
        data: { organizationId: orgId, type: "RECEITA", category: CATEGORY_ASSISTANCE, amount: cobrado, date: new Date(), dueDate, description, status: "PENDENTE", method: input.method ?? null, clientId: t.clientId, projectId: t.projectId, originAssistanceId: t.id, createdById: req.user!.id },
      });
      message = "Cobrança lançada no financeiro";
    }
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: `ASSISTANCE_CHARGE_${plan.action}`, entity: "AssistanceTicket", entityId: t.id, details: { cobrado, dueDate: input.dueDate } } });
    return ok(res, await view(t.id, orgId), message);
  })
);

// Baixa no estoque: os itens ligados a produto que ainda não saíram, numa saída só.
router.post(
  "/assistances/:id/stock-exit",
  requirePermission("stock.exit"),
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    const t = await ticketFor(req.params.id, orgId);
    const pending = t.items.filter((i) => i.productId && !i.stockMovedAt);
    if (!pending.length) throw new BadRequestError("Nenhum item ligado a produto do almoxarifado esperando baixa");
    const bad = pending.find((i) => !Number.isInteger(Number(i.quantity)));
    if (bad) throw new BadRequestError(`"${bad.description}": para dar baixa, a quantidade precisa ser inteira`);
    const allowNegative = req.user!.permissions.includes("stock.negative");
    await prisma.$transaction(async (tx) => {
      await createExitWithClient(
        tx,
        {
          requesterName: req.user!.name,
          sector: "Assistência técnica",
          destination: `${t.number} — ${t.client.name}`.slice(0, 190),
          reason: t.internal ? "Retrabalho / erro interno" : "Assistência técnica",
          note: t.title.slice(0, 250),
          items: pending.map((i) => ({ productId: i.productId!, quantity: Number(i.quantity) })),
        },
        req.user!.id,
        req.user!.name,
        allowNegative
      );
      await tx.assistanceItem.updateMany({ where: { id: { in: pending.map((i) => i.id) } }, data: { stockMovedAt: new Date() } });
    });
    return ok(res, await view(t.id, orgId), `${pending.length} ${pending.length > 1 ? "itens baixados" : "item baixado"} do estoque`);
  })
);

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDay = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");

// Ordem de serviço: o que é para fazer, os itens (garantia ou cobrado) e as assinaturas.
router.get(
  "/assistances/:id/service-order.pdf",
  requirePermission("organization.read"),
  asyncHandler(async (req, res) => {
    const t = await ticketFor(req.params.id, req.user!.organizationId);
    const pdf = await serviceOrderPdf(t);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="ordem-de-servico-${t.number}.pdf"`);
    return res.send(pdf);
  })
);


type OrderTicket = Awaited<ReturnType<typeof ticketFor>>;
/** O PDF da ordem de serviço (separado da rota para poder ser testado sem banco). */
export async function serviceOrderPdf(t: Pick<OrderTicket, "number" | "kind" | "internal" | "createdAt" | "title" | "roomLabel" | "problemType" | "scheduledAt" | "description" | "client" | "project" | "assignee" | "items">): Promise<Buffer> {
    const items = t.items.map(serializeItem);
    const totals = itemTotals(items);
    const { doc, done, width } = brandDocument();
    const c = t.client;
    const address = [[c.street, c.addressNumber].filter(Boolean).join(", "), c.complement, c.condominium, c.district, [c.city, c.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ") || c.address || "—";

    brandTitle(doc, t.internal ? "Ordem interna de retrabalho" : "Ordem de serviço", `${t.number} · ${kindLabel(t.kind)} · aberta em ${fmtDay(t.createdAt)}`);
    brandSection(doc, "Cliente");
    brandField(doc, "Nome", c.name);
    if (c.phone) brandField(doc, "Telefone", c.phone);
    brandField(doc, "Endereço", address);
    if (t.project) brandField(doc, "Projeto", `${t.project.code} — ${t.project.name}`);
    doc.moveDown(0.6);

    brandSection(doc, "Atendimento");
    brandField(doc, "Assunto", t.title);
    if (t.roomLabel) brandField(doc, "Ambiente", t.roomLabel);
    if (t.problemType) brandField(doc, "Problema", t.problemType);
    brandField(doc, "Visita", t.scheduledAt ? t.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "a combinar");
    brandField(doc, "Responsável", t.assignee?.name ?? "—");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor(BRAND.ink).text(t.description, PAGE.left, doc.y, { width });
    doc.moveDown(0.8);

    brandSection(doc, t.internal ? "Material e horas (custo para a loja)" : "Itens");
    const cols = [{ w: 0.48, label: "Descrição" }, { w: 0.1, label: "Qtd." }, { w: 0.14, label: "Valor" }, { w: 0.14, label: "Total" }, { w: 0.14, label: t.internal ? "" : "Situação" }];
    const row = (cells: string[], bold = false) => {
      ensureSpace(doc, 18);
      const y = doc.y;
      let x = PAGE.left;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(BRAND.ink);
      let h = 0;
      cells.forEach((cell, i) => {
        const w = width * cols[i].w;
        doc.text(cell, x + 2, y, { width: w - 4, align: i === 0 ? "left" : "right" });
        h = Math.max(h, doc.y - y);
        x += w;
      });
      doc.y = y + h + 3;
      doc.moveTo(PAGE.left, doc.y - 1).lineTo(PAGE.left + width, doc.y - 1).lineWidth(0.4).strokeColor(BRAND.line).stroke();
    };
    row(cols.map((c2) => c2.label), true);
    if (!items.length) row(["Nenhum item lançado", "", "", "", ""]);
    for (const i of items) row([`${i.description} (${i.kindLabel})`, String(i.quantity).replace(".", ","), brl(i.unitPrice), brl(i.total), t.internal ? "" : i.charged ? "Cobrado" : "Garantia"]);
    doc.moveDown(0.5);
    if (t.internal) brandField(doc, "Custo do retrabalho", brl(totals.total));
    else {
      brandField(doc, "Em garantia", brl(totals.garantia));
      brandField(doc, "A cobrar do cliente", brl(totals.cobrado));
      doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.muted).text("Atendimento em garantia. Somente os itens marcados como cobrados são pagos pelo cliente.", PAGE.left, doc.y + 2, { width });
    }

    // assinaturas
    ensureSpace(doc, 110);
    doc.moveDown(2.5);
    const y = doc.y + 30;
    const half = (width - 30) / 2;
    for (const [i, label] of (t.internal ? ["Responsável pelo retrabalho", "Gestão"] : ["Técnico / montador", "Cliente"]).entries()) {
      const x = PAGE.left + i * (half + 30);
      doc.moveTo(x, y).lineTo(x + half, y).lineWidth(0.6).strokeColor(BRAND.ink).stroke();
      doc.font("Helvetica").fontSize(9).fillColor(BRAND.ink).text(label, x, y + 4, { width: half, align: "center" });
    }
    doc.text("Data: ____/____/______", PAGE.left, y + 30);
    doc.end();
    return done;
}

export default router;
