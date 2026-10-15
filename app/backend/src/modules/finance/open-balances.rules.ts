/**
 * Comissões em aberto e dívidas anteriores: regras puras da aba "Comissões e
 * dívidas" do financeiro. Os valores são os lançamentos de despesa que ainda
 * têm saldo (pendente ou pago em parte).
 */
import { CATEGORY_COMMISSION, CATEGORY_TECHNICAL_RESERVE, addMonthsDay, splitAmount } from "../commercial/quote.finance";

export const COMMISSION_CATEGORIES = [CATEGORY_COMMISSION, CATEGORY_TECHNICAL_RESERVE];
/** Dívida de antes do sistema (empréstimo, fornecedor antigo, acordo): categoria própria. */
export const OLD_DEBT_CATEGORY = "Dívida anterior";

export type OpenRow = {
  id: string;
  amount: number;
  paidAmount: number;
  /** vencimento aaaa-mm-dd */
  dueDay: string | null;
};

export const openOf = (r: { amount: number; paidAmount: number }) => Math.max(0, Math.round((r.amount - r.paidAmount) * 100) / 100);

/**
 * A quem pagar a comissão: o nome está na descrição que o aceite do orçamento
 * gera ("Orçamento ORC-00001 — comissão Ana (5%)"). Reserva técnica usa o indicador.
 */
export function commissionPayee(description: string | null, referrerName?: string | null): string {
  // "… — comissão Ana (5%)" (aceite) ou "… — comissão Ana — parcela 1/2" (lançada à mão)
  const m = /— (?:comissão|reserva técnica) (.+?)(?: \(\d| — |$)/.exec(description ?? "");
  return (m?.[1] ?? referrerName ?? "").trim() || "Sem nome";
}

/** Credor da dívida: o começo da descrição, antes do " — ". */
export const creditorOf = (description: string | null) => (description ?? "").split(" — ")[0].trim() || "Sem credor";

export type OpenGroup<T extends OpenRow> = { key: string; open: number; overdue: number; count: number; nextDue: string | null; items: (T & { open: number; late: boolean })[] };

/** Agrupa os saldos (por pessoa, credor…): primeiro quem tem atraso, depois o maior saldo. */
export function groupOpen<T extends OpenRow>(rows: T[], keyOf: (r: T) => string, today: string): OpenGroup<T>[] {
  const map = new Map<string, OpenGroup<T>>();
  for (const r of rows) {
    const open = openOf(r);
    if (open <= 0) continue;
    const key = keyOf(r);
    const g = map.get(key) ?? { key, open: 0, overdue: 0, count: 0, nextDue: null, items: [] };
    const late = r.dueDay != null && r.dueDay < today;
    g.open += open;
    if (late) g.overdue += open;
    g.count++;
    if (r.dueDay && !late && (!g.nextDue || r.dueDay < g.nextDue)) g.nextDue = r.dueDay;
    g.items.push({ ...r, open, late });
    map.set(key, g);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...map.values()]
    .map((g) => ({ ...g, open: r2(g.open), overdue: r2(g.overdue), items: g.items.sort((a, b) => (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999")) }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.key.localeCompare(b.key));
}

/** Parcelas de uma dívida: valor dividido sem perder centavo, uma por mês a partir da primeira. */
export function planDebt(total: number, installments: number, firstDue: string): { number: number; amount: number; dueDay: string }[] {
  const n = Math.max(1, Math.floor(installments));
  return splitAmount(total, n).map((amount, i) => ({ number: i + 1, amount, dueDay: addMonthsDay(firstDue, i) }));
}
