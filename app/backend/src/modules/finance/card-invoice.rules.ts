/**
 * Leitura da fatura do cartão: as compras da fatura viram despesas com
 * categoria (Uber, alimentação, combustível…), para a análise somar e contar
 * o gasto de cada tipo. Regras puras: categoria pela loja, leitura das linhas
 * do PDF sem IA e a resposta da IA.
 */

/** Categorias dos gastos do cartão (as mesmas da tela). */
export const CARD_CATEGORIES = [
  "Transporte (Uber/99)",
  "Alimentação",
  "Combustível",
  "Mercado",
  "Matéria-prima",
  "Ferragens",
  "Acabamento",
  "Ferramentas",
  "Software / assinaturas",
  "Marketing",
  "Viagem",
  "Manutenção",
  "Outros",
] as const;

const RULES: [RegExp, (typeof CARD_CATEGORIES)[number]][] = [
  [/\buber\b|\b99\s*(app|pop|taxi|tecnologia)?\b|99app|cabify|indriver|taxi|t[aá]xi/i, "Transporte (Uber/99)"],
  [/ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger|mc\s?donald|bk\b|subway|churrasc|cafeteria|caf[eé]\b|bar\b|food|lanche|sorveteria|a[cç]a[ií]/i, "Alimentação"],
  [/posto|shell|ipiranga|petrobras|\bbr\s*mania|combust[ií]vel|auto\s*posto|gasolina/i, "Combustível"],
  [/mercado|supermerc|atacad|assa[ií]|carrefour|p[aã]o de a[cç][uú]car|extra\b|frangol[aâ]ndia|mateus|hiper/i, "Mercado"],
  [/leroy|telhanorte|madeir|mdf|duratex|guararapes|arauco|placas|chapas/i, "Matéria-prima"],
  [/ferrag|blum|hettich|fgv|corredi[cç]|dobradi[cç]/i, "Ferragens"],
  [/tintas|verniz|cola\b|fita de borda|acabament/i, "Acabamento"],
  [/ferrament|makita|bosch|dewalt|tramontina/i, "Ferramentas"],
  [/google|microsoft|adobe|apple\.com|icloud|canva|openai|chatgpt|anthropic|spotify|netflix|amazon\s*prime|aws|vercel|github|promob|autodesk|sketchup|notion|zoom/i, "Software / assinaturas"],
  [/facebook|meta\s*ads|facebk|instagram|google\s*ads|tiktok\s*ads|gr[aá]fica|panfleto/i, "Marketing"],
  [/hotel|airbnb|booking|latam|gol\b|azul\s*linhas|passagem|decolar|pousada/i, "Viagem"],
  [/manuten[cç]|oficina|mec[aâ]nic|pneu|auto\s*pe[cç]as|el[eé]tric/i, "Manutenção"],
];

/** Categoria pela descrição da compra; sem regra, "Outros". */
export function categorize(description: string): (typeof CARD_CATEGORIES)[number] {
  for (const [re, cat] of RULES) if (re.test(description)) return cat;
  return "Outros";
}

export type InvoiceItem = { date: string; description: string; amount: number; installment: string | null; category: string };

/** dd/mm da fatura no ano certo: compra de mês depois do mês da fatura é do ano anterior. */
export function resolveDate(dd: number, mm: number, referenceMonth: string): string | null {
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12)) return null;
  const [ry, rm] = referenceMonth.split("-").map(Number);
  const year = mm > rm ? ry - 1 : ry;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
/** Pagamentos, estornos e encargos não são gastos. */
const NOT_SPENDING = /pagamento|pagto|estorno|cr[eé]dito|saldo anterior|total da fatura|limite|juros|iof|encargo|anuidade estornada|desconto/i;

/**
 * Leitura sem IA: linhas que começam com a data (12/09 ou 12 SET), têm a
 * descrição e terminam com o valor (1.234,56). Parcela "02/10" vira installment.
 */
export function parseInvoiceText(text: string, referenceMonth: string): InvoiceItem[] {
  const out: InvoiceItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const m = /^(\d{1,2})[\/ ](\d{1,2}|[a-zç]{3})\b\s+(.+?)\s+(-?\s?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*-)?$/i.exec(line);
    if (!m) continue;
    const mm = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES[m[2].toLowerCase()];
    const date = resolveDate(Number(m[1]), mm, referenceMonth);
    const value = Number(m[4].replace(/[R$\s.]/g, "").replace(",", "."));
    if (!date || !(value > 0) || /^-/.test(m[4].trim())) continue;
    let description = m[3].trim();
    const inst = /\b(\d{1,2}\/\d{1,2})\s*$/.exec(description) ?? /parc(?:ela)?\.?\s*(\d{1,2}\/\d{1,2})/i.exec(description);
    if (inst) description = description.replace(inst[0], "").trim();
    if (NOT_SPENDING.test(description) || description.length < 2) continue;
    out.push({ date, description: description.slice(0, 200), amount: Math.round(value * 100) / 100, installment: inst?.[1] ?? null, category: categorize(description) });
  }
  return out;
}

/** Pedido para a IA: as compras da fatura em JSON, sem pagamentos nem estornos. */
export function invoicePrompt(referenceMonth: string): string {
  return [
    `Leia esta fatura de cartão de crédito (mês de referência ${referenceMonth}) e liste cada COMPRA.`,
    "Não inclua pagamentos da fatura, estornos, créditos, saldo anterior, juros, IOF nem totais.",
    "Para cada compra: data (AAAA-MM-DD; se só houver dia e mês, use o ano do mês de referência, ou o anterior se o mês for depois do de referência), descrição como está na fatura, valor positivo em reais e a parcela (ex.: 02/10) se houver.",
    `Escolha a categoria entre: ${CARD_CATEGORIES.join(", ")}. Uber e 99 são "Transporte (Uber/99)"; restaurante, lanche e iFood são "Alimentação".`,
    'Responda só JSON: {"items":[{"date":"2026-09-12","description":"UBER *TRIP","amount":25.9,"installment":null,"category":"Transporte (Uber/99)"}]}',
  ].join("\n");
}

/** Resposta da IA validada: data e valor certos; categoria fora da lista vira a da regra. */
export function parseAiItems(raw: string, referenceMonth: string): InvoiceItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const list = (parsed as { items?: unknown }).items;
  if (!Array.isArray(list)) return [];
  const [ry] = referenceMonth.split("-").map(Number);
  const out: InvoiceItem[] = [];
  for (const it of list.slice(0, 500)) {
    const o = it as { date?: unknown; description?: unknown; amount?: unknown; installment?: unknown; category?: unknown };
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Math.abs(Number(o.date.slice(0, 4)) - ry) <= 1 ? o.date : null;
    const amount = typeof o.amount === "number" ? o.amount : Number(String(o.amount ?? "").replace(/\./g, "").replace(",", "."));
    const installment = typeof o.installment === "string" && /^\d{1,2}\/\d{1,2}$/.test(o.installment) ? o.installment : null;
    // a parcela às vezes vem colada no nome da loja ("LEROY MERLIN 02/05")
    let description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
    if (installment && description.endsWith(installment)) description = description.slice(0, -installment.length).trim();
    if (!date || !(amount > 0) || !description || NOT_SPENDING.test(description)) continue;
    const cat = typeof o.category === "string" && (CARD_CATEGORIES as readonly string[]).includes(o.category) ? o.category : categorize(description);
    // a regra da loja vale mais para Uber/99 e comida, que são o motivo da leitura
    const rule = categorize(description);
    out.push({
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      installment,
      category: rule !== "Outros" ? rule : cat,
    });
  }
  return out;
}

/** Já lançada? Mesma data, mesmo valor e mesma descrição. */
export const expenseKey = (e: { date: string; amount: number; description: string }) => `${e.date}|${e.amount.toFixed(2)}|${e.description.trim().toLowerCase()}`;
