/**
 * Planner do financeiro, no jeito do planner da produção: as contas da semana
 * por dia, escritas como a loja já escreve ("KELSON: 1ª quinzena outubro 854,00"),
 * e as pendências de cada pessoa (o que a loja deve e o que a pessoa deve).
 * Regras puras.
 */

export type QuickPayable = { payee: string | null; description: string; amount: number; category: string };

/** "1.234,56", "854,00", "138,4", "720" -> número; nulo se não for valor. */
export function parseMoney(s: string): number | null {
  const t = s.replace(/r\$\s*/i, "").trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = /,/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Categoria pelo texto: diária, quinzena, salário… é folha; acordo é acordo. */
export function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (/sal[aá]rio|quinzena|di[aá]ria|ajuda de custo|horas trabalhadas|hora extra|vale|adiantamento|f[eé]rias|13[ºo°]?|rescis/.test(t)) return "Folha de pagamento";
  if (/acordo/.test(t)) return "Acordos";
  if (/aluguel/.test(t)) return "Aluguel";
  if (/energia|enel|[aá]gua|cagece|internet|telefone|luz/.test(t)) return "Contas de consumo";
  if (/frete|transporte/.test(t)) return "Frete";
  if (/imposto|das\b|simples|inss|fgts/.test(t)) return "Impostos";
  if (/comiss[aã]o/.test(t)) return "Comissão de venda";
  return "Outros";
}

/**
 * Linha do planner: "NOME: descrição valor" (o valor no fim, com ou sem R$ e
 * "-"). Sem "NOME:", fica sem pessoa. Sem valor, erro.
 */
export function parseQuickPayable(text: string): QuickPayable | { error: string } {
  const line = text.replace(/\s+/g, " ").trim();
  // o valor no fim, podendo ser uma soma: "720,00 + 40,00"
  const m = /^(.*?)\s*[-–]?\s*((?:R\$\s*)?\d[\d.,]*(?:\s*\+\s*(?:R\$\s*)?\d[\d.,]*)*)\s*$/i.exec(line);
  const parts = m ? m[2].split("+").map((p) => parseMoney(p.trim())) : [];
  const amount = parts.length && parts.every((p) => p !== null) ? Math.round(parts.reduce((s, p) => s + (p as number), 0) * 100) / 100 : null;
  if (!m || amount === null) return { error: 'Escreva o valor no fim. Ex.: "KELSON: 1ª quinzena outubro 854,00"' };
  let head = m[1].trim().replace(/[-–]\s*$/, "").trim();
  let payee: string | null = null;
  const named = /^([^:]{1,60}):\s*(.*)$/.exec(head);
  if (named) {
    payee = named[1].trim();
    head = named[2].trim();
  }
  const description = head || (payee ? "Pagamento" : "");
  if (!description) return { error: "Escreva do que é a conta antes do valor" };
  return { payee: payee ? payee.slice(0, 80) : null, description: description.slice(0, 300), amount, category: guessCategory(description) };
}

export type PlannerRow = { id: string; type: "RECEITA" | "DESPESA"; payee: string | null; amount: number; paidAmount: number; dueDay: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const openOf = (r: { amount: number; paidAmount: number }) => Math.max(0, r2(r.amount - r.paidAmount));

/** Segunda-feira da semana do dia (domingo conta na semana que termina nele). */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

export const addDays = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Totais do dia: o que falta pagar, o que falta receber e o que já foi pago. */
export function dayTotals(rows: PlannerRow[]) {
  const sum = (f: (r: PlannerRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
  return {
    toPay: sum((r) => (r.type === "DESPESA" ? openOf(r) : 0)),
    toReceive: sum((r) => (r.type === "RECEITA" ? openOf(r) : 0)),
    paid: sum((r) => (r.type === "DESPESA" ? Math.min(r.amount, r.paidAmount) : 0)),
  };
}

/**
 * Pendências por pessoa: o que a loja ainda deve a ela (despesas em aberto) e o
 * que ela deve à loja (receitas em aberto com o nome dela, como acordos e
 * descontos). Saldo = a pagar − a descontar.
 */
export function byPerson(rows: PlannerRow[]) {
  const map = new Map<string, { person: string; toPay: number; toDiscount: number; count: number }>();
  for (const r of rows) {
    const open = openOf(r);
    if (open <= 0 || !r.payee?.trim()) continue;
    const person = r.payee.trim();
    const key = person.toLowerCase();
    const g = map.get(key) ?? { person, toPay: 0, toDiscount: 0, count: 0 };
    if (r.type === "DESPESA") g.toPay += open;
    else g.toDiscount += open;
    g.count++;
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, toPay: r2(g.toPay), toDiscount: r2(g.toDiscount), balance: r2(g.toPay - g.toDiscount) }))
    .sort((a, b) => b.balance - a.balance || a.person.localeCompare(b.person));
}
