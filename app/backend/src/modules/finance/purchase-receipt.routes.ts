/**
 * Entrada de NF, recibo e cupom: /api/finance
 *
 *   POST /receipts/read   multipart: file (foto ou PDF) — a IA lê fornecedor, data, total e itens (não grava)
 *   GET  /purchases       "o que compramos": itens das notas, recibos e cupons e as compras dos cartões,
 *                         por categoria, por fornecedor e os itens que mais pesam (?from=&to=)
 *
 * Gravar é o cadastro normal de documento (POST /finance/documents com os itens),
 * o pagamento e o anexo do arquivo.
 */
import { Router } from "express";
import { z } from "zod";
import { aiComplete, aiEnabled } from "../../lib/ai";
import { authenticate } from "../../middlewares/auth";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac";
import { uploadDocument } from "../../middlewares/upload";
import { prisma } from "../../prisma";
import { ApiError, BadRequestError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/response";
import { visionProvider } from "../ai/provider/vision";
import { extractPdfLines } from "../promob/promob.pdf";
import { parseReceipt, purchaseSummary, receiptPrompt, type PurchaseLine, type Receipt } from "./purchase-receipt.rules";

const router = Router();
router.use(authenticate);

router.post(
  "/receipts/read",
  requireAnyPermission(["finance.manage", "finance.documents.manage"]),
  uploadDocument.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError("Envie a foto ou o PDF da nota, do recibo ou do cupom");
    const isPdf = req.file.mimetype === "application/pdf";
    if (!isPdf && !req.file.mimetype.startsWith("image/")) throw new BadRequestError("Envie uma foto ou um PDF");
    let receipt: Receipt | null = null;
    const vision = visionProvider();
    if (vision.enabled) {
      // o Gemini às vezes responde "ocupado": tenta de novo uma vez
      for (let attempt = 0; attempt < 2 && !receipt; attempt++) {
        try {
          receipt = parseReceipt(await vision.readJson({ bytes: req.file.buffer, mime: req.file.mimetype, prompt: receiptPrompt() }));
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }
    // sem leitura de imagem: o texto do PDF vai para a IA de texto
    if (!receipt && isPdf && aiEnabled()) {
      const text = await extractPdfLines(req.file.buffer)
        .then((lines) => lines.map((l) => l.cells.map((c) => c.s).join(" ")).join("\n"))
        .catch(() => "");
      if (text.trim()) {
        try {
          receipt = parseReceipt(await aiComplete({ prompt: `${receiptPrompt()}\n\nTexto do documento:\n${text.slice(0, 20000)}`, json: true, temperature: 0, maxTokens: 4000 }));
        } catch {
          receipt = null;
        }
      }
    }
    if (!receipt) {
      throw new ApiError(422, vision.enabled || aiEnabled() ? "Não foi possível ler este documento. Tente uma foto mais nítida ou cadastre à mão." : "A leitura com IA não está configurada no servidor. Cadastre o documento à mão.");
    }
    return ok(res, receipt, `${receipt.supplier}: ${receipt.items.length} ${receipt.items.length === 1 ? "item" : "itens"} lidos. Confira antes de salvar.`);
  })
);

router.get(
  "/purchases",
  requirePermission("finance.read"),
  asyncHandler(async (req, res) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
    const q = z
      .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(`${today.slice(0, 7)}-01`), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(today) })
      .parse(req.query);
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000);
    const orgId = req.user!.organizationId;
    const [docs, cards] = await Promise.all([
      // notas, recibos e cupons (a fatura do cartão entra pelas compras do cartão, para não contar duas vezes)
      prisma.financeTransaction.findMany({
        where: { organizationId: orgId, type: "DESPESA", status: { not: "CANCELADO" }, docType: { in: ["NOTA_FISCAL", "RECIBO", "OUTROS"] }, items: { some: {} }, OR: [{ issueDate: { gte: from, lt: to } }, { issueDate: null, date: { gte: from, lt: to } }] },
        select: { category: true, items: { select: { store: true, description: true, amount: true } } },
      }),
      prisma.cardExpense.findMany({ where: { statement: { organizationId: orgId }, date: { gte: from, lt: to } }, select: { category: true, description: true, amount: true } }),
    ]);
    const lines: PurchaseLine[] = [
      ...docs.flatMap((d) => d.items.map((i) => ({ category: d.category, store: i.store, description: i.description ?? i.store, amount: Number(i.amount) }))),
      ...cards.map((c) => ({ category: c.category, store: c.description, description: c.description, amount: Number(c.amount) })),
    ];
    return ok(res, { from: q.from, to: q.to, ...purchaseSummary(lines), documents: docs.length, cardExpenses: cards.length });
  })
);

export default router;
