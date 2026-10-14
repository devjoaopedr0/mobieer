/**
 * Contrato a partir do orçamento aceito: os quadros do contrato da loja
 * (resumo do pedido, acabamentos e parcelamento) saem do orçamento, e o resto
 * do texto vem do modelo de contrato. No modelo, a linha com o marcador
 * {{quadro.pedido}} ou {{quadro.pagamento}} vira a tabela correspondente.
 */
import type PDFDocument from "pdfkit";
import { BRAND, PAGE, brandOneLine, brandTable, ensureSpace } from "../../lib/brand-pdf";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../utils/ApiError";
import { CATEGORY_SALE, planFinance } from "../commercial/quote.finance";
import { PAYMENT_LABEL, ambCode, paymentText, type PaymentMethod } from "../commercial/quote.rules";
import { loadPricing } from "../commercial/quote.service";

type Doc = InstanceType<typeof PDFDocument>;

export type ContractOrder = {
  quoteId: string;
  number: string;
  clientId: string;
  projectId: string | null;
  seller: string;
  /** data da venda: o aceite, ou a emissão se ainda não foi aceito */
  soldAt: Date;
  items: { code: string; room: string; line: string; deadline: string; total: number; corpo: string; porta: string; puxador: string; obs: string }[];
  subtotal: number;
  discount: number;
  total: number;
  condition: string;
  method: string;
  /** entrada e parcelas, com vencimento */
  installments: { label: string; due: Date | null; amount: number }[];
  deliveryText: string;
  /** prazo de fabricação combinado no orçamento, em dias úteis */
  deliveryDays: number;
};

/** Sinal que o PDF troca pelo quadro: a linha precisa ficar sozinha no texto. */
export const BLOCK = { pedido: "[[QUADRO:pedido]]", pagamento: "[[QUADRO:pagamento]]" } as const;

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");
const num = (v: unknown) => Number(v ?? 0);
const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);

/** Rótulos das parcelas como no contrato: ENTRADA, PARC 1, PARC 2… e SALDO quando é um pagamento só (à vista, repasse da financeira). */
export function installmentLabels(rows: { installmentNumber: number | null; isDown: boolean }[]): string[] {
  return rows.map((r) => (r.isDown ? "ENTRADA" : r.installmentNumber ? `PARC ${r.installmentNumber}` : "SALDO"));
}

export async function loadContractOrder(organizationId: string, quoteId: string): Promise<ContractOrder> {
  const q = await prisma.commercialQuote.findFirst({
    where: { id: quoteId, organizationId },
    include: { items: { orderBy: { position: "asc" } }, seller: { select: { name: true } } },
  });
  if (!q) throw new NotFoundError("Orçamento não encontrado");
  const pricing = await loadPricing();
  const doc = pricing.document;
  const deliveryDays = q.deliveryDays ?? doc.deliveryDays;
  const total = num(q.total);
  const method = q.paymentMethod as PaymentMethod;
  const downPayment = num(q.downPayment);

  // parcelas: as que o aceite lançou no financeiro; antes disso, o plano do orçamento
  const posted = await prisma.financeTransaction.findMany({
    where: { originQuoteId: q.id, type: "RECEITA", category: CATEGORY_SALE },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    select: { amount: true, dueDate: true, installmentNumber: true, description: true },
  });
  const plan = posted.length
    ? posted.map((p) => ({ amount: num(p.amount), due: p.dueDate, installmentNumber: p.installmentNumber, isDown: /— entrada/.test(p.description ?? "") }))
    : planFinance(
        { number: q.number, version: q.version, total, payment: { method, planName: q.financingPlanName, installments: q.installments, downPayment, feePercent: num(q.financingFeePercent) }, commissions: [] },
        (q.approvedAt ?? new Date()).toISOString().slice(0, 10)
      )
        .filter((e) => e.type === "RECEITA")
        .map((e) => ({ amount: e.amount, due: dayDate(e.dueDay), installmentNumber: e.installmentNumber, isDown: /— entrada/.test(e.description) }));
  const labels = installmentLabels(plan);

  const financed = Math.max(0, total - downPayment);
  return {
    quoteId: q.id,
    number: q.number,
    clientId: q.clientId,
    projectId: q.projectId,
    seller: q.seller.name,
    soldAt: q.approvedAt ?? q.issuedAt,
    items: q.items.map((it, i) => ({
      code: ambCode(i),
      room: it.room || it.description,
      line: doc.line,
      deadline: `${deliveryDays} dias úteis`,
      total: num(it.total),
      corpo: it.corpo ?? "",
      porta: it.porta ?? "",
      puxador: it.puxador ?? "",
      obs: [it.complemento, it.modelo].filter(Boolean).join(" · "),
    })),
    subtotal: num(q.subtotal),
    discount: num(q.discount),
    total,
    condition:
      q.paymentTerms?.trim() ||
      paymentText(
        { method, planId: q.financingPlanId, planName: q.financingPlanName, downPayment, financed, installments: q.installments, installmentValue: q.installments > 0 ? Math.round((financed / q.installments) * 100) / 100 : 0, feePercent: num(q.financingFeePercent), financingFee: num(q.financingFee) },
        brl
      ),
    method: PAYMENT_LABEL[method] ?? q.paymentMethod,
    installments: plan.map((p, i) => ({ label: labels[i], due: p.due, amount: p.amount })),
    deliveryText: q.deliveryText?.trim() || doc.deliveryText,
    deliveryDays,
  };
}

/** Quadro "Resumo do pedido": ambientes com valor, total e acabamentos. */
export function drawOrderBlock(doc: Doc, o: ContractOrder) {
  const L = PAGE.left;
  const W = doc.page.width - PAGE.left - PAGE.right;
  doc.moveDown(0.2);
  brandTable(
    doc,
    [
      { label: "ITEM", w: 0.08, align: "center", bold: true },
      { label: "DESCRIÇÃO DO AMBIENTE / PRODUTO", w: 0.4, size: 8.5, bold: true },
      { label: "LINHA", w: 0.16, size: 7.5 },
      { label: "PRAZO FAB.", w: 0.16, align: "center", size: 7.5 },
      { label: "VALOR (R$)", w: 0.2, align: "right", size: 8.5 },
    ],
    o.items.map((it) => [it.code, it.room, it.line, it.deadline, brl(it.total)]),
    18,
    true
  );
  ensureSpace(doc, 50);
  doc.y += 6;
  if (o.discount > 0) {
    for (const [k, v] of [["Total dos ambientes", brl(o.subtotal)], ["Desconto", `- ${brl(o.discount)}`]]) {
      brandOneLine(doc, k, L + W - 250, doc.y, 150, { color: BRAND.muted, align: "right" });
      brandOneLine(doc, v, L + W - 96, doc.y, 90, { align: "right" });
      doc.y += 14;
    }
  }
  const ty = doc.y + 2;
  doc.roundedRect(L + W - 250, ty, 250, 26, 4).fill(BRAND.soft);
  brandOneLine(doc, "VALOR TOTAL DO PEDIDO", L + W - 240, ty + 10, 120, { size: 7.5, bold: true, color: BRAND.muted });
  brandOneLine(doc, brl(o.total), L + W - 140, ty + 7, 132, { size: 12.5, bold: true, color: BRAND.orange, align: "right" });
  doc.x = L;
  doc.y = ty + 38;
  brandTable(
    doc,
    [
      { label: "ITEM", w: 0.08, align: "center", bold: true },
      { label: "CAIXARIA (CORPO)", w: 0.24, size: 7.5 },
      { label: "PORTA", w: 0.24, size: 7.5 },
      { label: "PUXADOR", w: 0.18, size: 7.5 },
      { label: "OBSERVAÇÃO", w: 0.26, size: 7.5 },
    ],
    o.items.map((it) => [it.code, it.corpo || "-", it.porta || "-", it.puxador || "-", it.obs || "-"]),
    16,
    true
  );
  doc.y += 8;
}

/** Quadro de pagamento: condição, forma e as parcelas com vencimento (4 por linha). */
export function drawPaymentBlock(doc: Doc, o: ContractOrder) {
  const L = PAGE.left;
  const W = doc.page.width - PAGE.left - PAGE.right;
  const field = (label: string, value: string) => {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.ink).text(`${label}: `, L, doc.y, { continued: true, lineGap: 1.5 });
    doc.font("Helvetica").text(value || "—", { lineGap: 1.5 });
  };
  field("Condição Pagto", o.condition);
  field("Forma Pagto", o.method);
  if (!o.installments.length) return;
  field("Parcelamento", `${o.installments.length} ${o.installments.length > 1 ? "pagamentos" : "pagamento"}`);
  doc.y += 4;
  const per = 4;
  const cw = W / per;
  const ch = 38;
  for (let i = 0; i < o.installments.length; i += per) {
    ensureSpace(doc, ch + 4);
    const y = doc.y;
    o.installments.slice(i, i + per).forEach((p, j) => {
      const x = L + j * cw;
      doc.rect(x + 1, y, cw - 2, ch).lineWidth(0.6).strokeColor(BRAND.line).stroke();
      brandOneLine(doc, p.label, x + 7, y + 5, cw - 14, { size: 7, bold: true, color: BRAND.orange });
      brandOneLine(doc, brl(p.amount), x + 7, y + 15, cw - 14, { size: 9.5, bold: true });
      brandOneLine(doc, p.due ? `venc. ${brDate(p.due)}` : "", x + 7, y + 27, cw - 14, { size: 7, color: BRAND.muted });
    });
    doc.y = y + ch + 4;
  }
  doc.x = L;
  doc.y += 6;
}
