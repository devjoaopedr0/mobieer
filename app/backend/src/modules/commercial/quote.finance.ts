/**
 * Orçamento aceito → lançamentos no financeiro.
 *
 * Entrada vence no dia do aceite. O restante depende da forma:
 *  - à vista / PIX: um recebível no dia;
 *  - boleto: N parcelas mensais, a primeira um mês depois;
 *  - cartão: N repasses mensais da maquininha, com a taxa como despesa em cada um;
 *  - financeira: a financeira repassa o valor de uma vez em 30 dias, com a taxa
 *    como despesa no mesmo dia (o cliente paga as parcelas a ela, não à loja).
 * O recebível é bruto e a taxa é despesa à parte, para a DRE mostrar a taxa
 * como despesa financeira em vez de sumir dentro da receita.
 * Comissões são pagas conforme a loja recebe: cada comissão é repartida na mesma
 * proporção dos recebíveis da venda e vence junto com cada um.
 * No aceite, quem confirma pode ajustar os vencimentos e o valor das comissões
 * (applyAdjustments); o valor dos recebíveis não muda — é o total do contrato.
 *
 * Vencimento é data de calendário: meia-noite UTC do dia (ver finance/documents).
 */
import type { PaymentMethod } from "./quote.rules";

export type QuoteForFinance = {
  number: string;
  version: number;
  total: number;
  payment: { method: PaymentMethod; planName: string | null; installments: number; downPayment: number; feePercent: number };
  commissions: { name: string; percent: number; amount: number; role?: string; referrerId?: string | null }[];
};

export type PlannedEntry = {
  type: "RECEITA" | "DESPESA";
  category: string;
  amount: number;
  /** aaaa-mm-dd */
  dueDay: string;
  description: string;
  method: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** reserva técnica: a quem pagar */
  referrerId?: string | null;
  /** comissão paga conforme recebe: posição, na lista, do recebível que ela acompanha */
  follows?: number;
};

export type FinanceAdjustment = { index: number; dueDay?: string; amount?: number };
export class FinanceAdjustError extends Error {}

export const CATEGORY_SALE = "Contrato — venda";
export const CATEGORY_FINANCING_FEE = "Taxa de financiamento";
export const CATEGORY_CARD_FEE = "Taxa de cartão";
export const CATEGORY_COMMISSION = "Comissão de venda";
export const CATEGORY_TECHNICAL_RESERVE = "Reserva técnica";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Soma meses a um dia aaaa-mm-dd; 31/01 + 1 mês = 28 ou 29/02. */
export function addMonthsDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function addDaysDay(day: string, days: number): string {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Divide em N partes de centavos inteiros; a diferença do arredondamento vai na última. */
export function splitAmount(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100);
}

export function planFinance(q: QuoteForFinance, today: string): PlannedEntry[] {
  const ref = `Orçamento ${q.number}${q.version > 1 ? ` v${q.version}` : ""}`;
  const out: PlannedEntry[] = [];
  const p = q.payment;
  const down = Math.min(r2(Math.max(0, p.downPayment)), q.total);
  const rest = r2(q.total - down);
  const receita = (amount: number, dueDay: string, description: string, method: string, n: number | null = null, of: number | null = null) =>
    out.push({ type: "RECEITA", category: CATEGORY_SALE, amount, dueDay, description, method, installmentNumber: n, installmentTotal: of });
  const taxa = (category: string, amount: number, dueDay: string, description: string, method: string) => {
    if (amount > 0) out.push({ type: "DESPESA", category, amount, dueDay, description, method, installmentNumber: null, installmentTotal: null });
  };

  const pixEntry = p.method.startsWith("PIX_");
  // forma combinada ("PIX_BOLETO"…): o saldo segue a regra da segunda parte
  const settle = pixEntry ? p.method.slice(4) : p.method;
  if (down > 0) receita(down, today, `${ref} — entrada${pixEntry ? " (PIX)" : ""}`, pixEntry ? "PIX" : "Entrada");

  if (rest > 0) {
    if (settle === "AVISTA" || settle === "PIX") {
      receita(rest, today, `${ref} — ${settle === "PIX" ? "PIX" : "à vista"}`, settle === "PIX" ? "PIX" : "À vista");
    } else if (settle === "BOLETO") {
      const n = Math.max(1, p.installments);
      splitAmount(rest, n).forEach((v, i) => receita(v, addMonthsDay(today, i + 1), `${ref} — parcela ${i + 1}/${n}`, "Boleto", i + 1, n));
    } else if (settle === "CARTAO") {
      const n = Math.max(1, p.installments);
      const onde = p.planName ?? "Cartão";
      const fees = splitAmount(r2((rest * p.feePercent) / 100), n);
      splitAmount(rest, n).forEach((v, i) => {
        const due = addMonthsDay(today, i + 1);
        receita(v, due, `${ref} — ${onde} ${i + 1}/${n}`, "Cartão", i + 1, n);
        taxa(CATEGORY_CARD_FEE, fees[i], due, `${ref} — taxa ${onde} ${i + 1}/${n}`, "Cartão");
      });
    } else {
      const onde = p.planName ?? "financeira";
      const due = addDaysDay(today, 30);
      receita(rest, due, `${ref} — repasse ${onde}`, "Financeira");
      taxa(CATEGORY_FINANCING_FEE, r2((rest * p.feePercent) / 100), due, `${ref} — taxa ${onde}`, "Financeira");
    }
  }

  // Comissão conforme recebe: uma fatia por recebível, na proporção do valor dele.
  const receivables = out.map((e, index) => ({ e, index })).filter((x) => x.e.type === "RECEITA");
  const received = receivables.reduce((s, x) => s + x.e.amount, 0);
  for (const c of q.commissions) {
    if (!(c.amount > 0)) continue;
    const rt = c.role === "INDICADOR";
    const label = `${ref} — ${rt ? "reserva técnica" : "comissão"} ${c.name} (${String(c.percent).replace(".", ",")}%)`;
    const cents = Math.round(c.amount * 100);
    let used = 0;
    const slices = (receivables.length ? receivables : [null]).map((x, i, all) => {
      // a última fatia leva o arredondamento, para a soma fechar no valor da comissão
      const part = i === all.length - 1 ? cents - used : Math.floor((cents * (x ? x.e.amount : 1)) / (received || 1));
      used += part;
      return { x, part };
    });
    const parts = slices.filter((s) => s.part > 0);
    parts.forEach((s, i) =>
      out.push({
        type: "DESPESA",
        category: rt ? CATEGORY_TECHNICAL_RESERVE : CATEGORY_COMMISSION,
        amount: s.part / 100,
        dueDay: s.x ? s.x.e.dueDay : today,
        description: parts.length > 1 ? `${label} — ${i + 1}/${parts.length}` : label,
        method: rt ? "Reserva técnica" : "Comissão",
        installmentNumber: null,
        installmentTotal: null,
        referrerId: rt ? c.referrerId ?? null : null,
        follows: s.x?.index,
      })
    );
  }
  return out;
}

const isCommission = (e: PlannedEntry) => e.category === CATEGORY_COMMISSION || e.category === CATEGORY_TECHNICAL_RESERVE;

/**
 * Ajustes feitos na janela de aceite. Vencimento: qualquer linha, de hoje em diante.
 * Valor: só comissão e reserva técnica (zerar tira a linha). `expected` é quantas
 * linhas a pessoa viu — se o plano mudou no meio do caminho, recusa em vez de
 * aplicar o ajuste na linha errada.
 */
export function applyAdjustments(plan: PlannedEntry[], adjustments: FinanceAdjustment[], today: string, expected?: number): PlannedEntry[] {
  if (expected !== undefined && expected !== plan.length) throw new FinanceAdjustError("O orçamento mudou desde que a janela foi aberta. Feche e abra o aceite de novo.");
  const out = plan.map((e) => ({ ...e }));
  const limit = addMonthsDay(today, 120);
  for (const a of adjustments) {
    const e = out[a.index];
    if (!e) throw new FinanceAdjustError("Ajuste de uma linha que não existe. Feche e abra o aceite de novo.");
    if (a.dueDay !== undefined && a.dueDay !== e.dueDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDay) || Number.isNaN(new Date(`${a.dueDay}T00:00:00Z`).getTime())) throw new FinanceAdjustError(`Data inválida em "${e.description}"`);
      if (a.dueDay < today) throw new FinanceAdjustError(`O vencimento de "${e.description}" não pode ser antes de hoje`);
      if (a.dueDay > limit) throw new FinanceAdjustError(`O vencimento de "${e.description}" está longe demais`);
      e.dueDay = a.dueDay;
    }
    if (a.amount !== undefined && r2(a.amount) !== e.amount) {
      if (!isCommission(e)) throw new FinanceAdjustError(`O valor de "${e.description}" vem do contrato e não pode ser alterado aqui`);
      const sale = plan.filter((x) => x.type === "RECEITA").reduce((s, x) => s + x.amount, 0);
      if (!(a.amount >= 0) || a.amount > sale) throw new FinanceAdjustError(`Valor inválido em "${e.description}"`);
      e.amount = r2(a.amount);
    }
  }
  return out.filter((e) => e.amount > 0);
}
