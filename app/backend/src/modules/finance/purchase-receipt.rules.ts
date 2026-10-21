/**
 * Entrada de nota fiscal, recibo e cupom: a IA lê o documento (foto ou PDF) e
 * o sistema monta a despesa com os itens comprados, para ver o que a loja
 * compra. Regras puras: o pedido para a IA, a leitura da resposta e o resumo
 * "o que compramos".
 */
import { categorize as cardCategory } from "./card-invoice.rules";

export const RECEIPT_KINDS = ["NOTA_FISCAL", "RECIBO", "CUPOM"] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/** Categorias das compras (as do cartão servem: mesma loja, mesmo tipo de gasto). */
export const PURCHASE_CATEGORIES = [
  "Matéria-prima", "Ferragens", "Acabamento", "Ferramentas", "Material de escritório", "Limpeza",
  "Combustível", "Alimentação", "Mercado", "Transporte (Uber/99)", "Manutenção", "Software / assinaturas", "Marketing", "Outros",
] as const;

export type ReceiptItem = { description: string; quantity: number | null; amount: number };
export type Receipt = {
  kind: ReceiptKind;
  supplier: string;
  supplierDocument: string | null;
  number: string | null;
  date: string | null;
  total: number;
  paid: boolean;
  method: string | null;
  category: string;
  items: ReceiptItem[];
};

export function receiptPrompt(): string {
  return [
    "Leia este documento de compra (nota fiscal, cupom fiscal ou recibo) de uma loja de móveis planejados.",
    "Diga o tipo (NOTA_FISCAL, CUPOM ou RECIBO), o nome do fornecedor (emitente), o CNPJ/CPF do emitente se houver, o número do documento, a data da compra (AAAA-MM-DD), o valor total e a forma de pagamento.",
    "Diga se já está pago: cupom e recibo normalmente sim; nota fiscal com boleto ou prazo, não.",
    "Liste os itens comprados (descrição, quantidade e valor total do item). Sem itens legíveis, deixe a lista vazia.",
    `Escolha a categoria da compra entre: ${PURCHASE_CATEGORIES.join(", ")}. Chapas de MDF/MDP e fitas de borda são "Matéria-prima"; dobradiças, corrediças e puxadores são "Ferragens"; cola, tinta, verniz, lixa são "Acabamento".`,
    'Responda só JSON: {"kind":"CUPOM","supplier":"NOME","supplierDocument":"00.000.000/0001-00","number":"123","date":"2026-10-20","total":123.45,"paid":true,"method":"PIX","category":"Ferragens","items":[{"description":"Dobradiça 35mm","quantity":10,"amount":89.9}]}',
  ].join("\n");
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/r\$\s*/i, "").trim();
  const n = /,/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Categoria de uma compra pelo texto: ferragem, MDF, cola… ou a regra das lojas do cartão. */
export function purchaseCategory(text: string): string {
  const t = text.toLowerCase();
  if (/\bmdf\b|\bmdp\b|chapa|fita de borda|compensado|aglomerado/.test(t)) return "Matéria-prima";
  if (/dobradi[cç]|corredi[cç]|puxador|parafuso|cavilha|minifix|trilho|pist[aã]o|ferrag/.test(t)) return "Ferragens";
  if (/cola|tinta|verniz|lixa|selador|massa|primer|thinner/.test(t)) return "Acabamento";
  if (/broca|serra|disco|ferramenta|furadeira|parafusadeira|bit\b/.test(t)) return "Ferramentas";
  if (/papel|caneta|toner|impress|grampo|escrit[oó]rio/.test(t)) return "Material de escritório";
  if (/detergente|desinfetante|vassoura|limpeza|saco de lixo/.test(t)) return "Limpeza";
  return cardCategory(text);
}

/** Resposta da IA validada; valores e datas conferidos, total refeito pelos itens quando faltar. */
export function parseReceipt(raw: string): Receipt | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const items: ReceiptItem[] = (Array.isArray(o.items) ? o.items : [])
    .slice(0, 200)
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ description: String(x.description ?? "").trim().slice(0, 200), quantity: num(x.quantity), amount: num(x.amount) ?? 0 }))
    .filter((x) => x.description && x.amount > 0)
    .map((x) => ({ ...x, amount: r2(x.amount), quantity: x.quantity && x.quantity > 0 ? x.quantity : null }));
  const itemsSum = r2(items.reduce((s, x) => s + x.amount, 0));
  const total = r2(num(o.total) ?? itemsSum);
  const supplier = String(o.supplier ?? "").trim().slice(0, 120);
  if (!(total > 0) || !supplier) return null;
  const kind = RECEIPT_KINDS.includes(o.kind as ReceiptKind) ? (o.kind as ReceiptKind) : "CUPOM";
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
  const aiCategory = typeof o.category === "string" && (PURCHASE_CATEGORIES as readonly string[]).includes(o.category) ? o.category : null;
  const ruleCategory = purchaseCategory([supplier, ...items.map((i) => i.description)].join(" "));
  return {
    kind,
    supplier,
    supplierDocument: typeof o.supplierDocument === "string" && o.supplierDocument.trim() ? o.supplierDocument.trim().slice(0, 30) : null,
    number: typeof o.number === "string" || typeof o.number === "number" ? String(o.number).trim().slice(0, 40) || null : null,
    date,
    total,
    paid: typeof o.paid === "boolean" ? o.paid : kind !== "NOTA_FISCAL",
    method: typeof o.method === "string" && o.method.trim() ? o.method.trim().slice(0, 40) : null,
    category: aiCategory ?? (ruleCategory === "Outros" ? "Outros" : ruleCategory),
    items,
  };
}

export type PurchaseLine = { category: string; store: string; description: string; amount: number };

/** "O que compramos": por categoria, por fornecedor e os itens que mais pesam. */
export function purchaseSummary(lines: PurchaseLine[]) {
  const group = (key: (l: PurchaseLine) => string) => {
    const m = new Map<string, { key: string; total: number; count: number }>();
    for (const l of lines) {
      const k = key(l).trim() || "—";
      const id = k.toLowerCase();
      const g = m.get(id) ?? { key: k, total: 0, count: 0 };
      g.total += l.amount;
      g.count++;
      m.set(id, g);
    }
    return [...m.values()].map((g) => ({ ...g, total: r2(g.total) })).sort((a, b) => b.total - a.total);
  };
  return {
    total: r2(lines.reduce((s, l) => s + l.amount, 0)),
    byCategory: group((l) => l.category),
    bySupplier: group((l) => l.store).slice(0, 15),
    topItems: group((l) => l.description || l.store).slice(0, 20),
  };
}
