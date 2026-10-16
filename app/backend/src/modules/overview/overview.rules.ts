/**
 * Painéis no formato que a loja já usava: dashboard comercial e financeiro e a
 * análise de ponto de equilíbrio pelos contratos assinados no mês.
 * Regras puras; quem busca no banco é overview.routes.ts.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Contrato assinado (orçamento aceito) com o que entra na margem de contribuição. */
export type SignedContract = {
  id: string;
  number: string;
  client: string;
  day: string; // aaaa-mm-dd da venda
  total: number;
  financingFee: number;
  netRevenue: number;
  cost: number;
  commissions: number;
  freight: number;
  otherCosts: number;
};

export type BreakEvenInput = { fixedCost: number; profitGoal: number; taxPct: number };

/**
 * Composição da margem: total vendido − financeira = líquido; tira compra
 * (custo), comissões, frete e outros, e a previsão de impostos (% do líquido).
 * O que sobra é a margem de contribuição.
 */
export function contractTotals(contracts: SignedContract[], taxPct: number) {
  const sum = (f: (c: SignedContract) => number) => r2(contracts.reduce((s, c) => s + f(c), 0));
  const totalSold = sum((c) => c.total);
  const financing = sum((c) => c.financingFee);
  const net = sum((c) => c.netRevenue);
  const cost = sum((c) => c.cost);
  const commissions = sum((c) => c.commissions);
  const freightOther = sum((c) => c.freight + c.otherCosts);
  const taxes = r2((net * Math.max(0, taxPct)) / 100);
  const margin = r2(net - cost - commissions - freightOther - taxes);
  // pontuação média: o mark-up efetivo de todos juntos, como no orçamento
  const score = cost > 0 ? Math.round(((net - commissions - freightOther) / cost) * 100) / 100 : null;
  return { count: contracts.length, totalSold, financing, net, cost, commissions, freightOther, taxes, margin, marginPct: net > 0 ? r2((margin / net) * 100) : null, score };
}

/**
 * Ponto de equilíbrio e meta de lucro: venda necessária = (custos fixos [+ lucro])
 * ÷ margem de contribuição em %. Resultado = margem − custos fixos.
 */
export function breakEven(totals: ReturnType<typeof contractTotals>, input: BreakEvenInput, marginPct: number | null = totals.marginPct) {
  // mês sem contrato ainda: a margem vem de fora (a dos últimos meses)
  const mcr = marginPct && marginPct > 0 ? marginPct / 100 : null;
  const need = (amount: number) => (mcr ? r2(amount / mcr) : null);
  const breakEvenSales = need(input.fixedCost);
  const goalSales = need(input.fixedCost + input.profitGoal);
  const pct = (target: number | null) => (target && target > 0 ? r2((totals.net / target) * 100) : null);
  const result = r2(totals.margin - input.fixedCost);
  return {
    breakEvenSales,
    breakEvenProgress: pct(breakEvenSales),
    breakEvenMissing: breakEvenSales === null ? null : r2(Math.max(0, breakEvenSales - totals.net)),
    goalSales,
    goalProgress: pct(goalSales),
    goalMissing: goalSales === null ? null : r2(Math.max(0, goalSales - totals.net)),
    result,
    coveragePct: input.fixedCost > 0 ? r2((totals.margin / input.fixedCost) * 100) : null,
  };
}

/** Venda líquida acumulada dia a dia no mês (para o gráfico de evolução). */
export function dailyAccumulated(contracts: SignedContract[], year: number, month: number): { day: number; net: number; accumulated: number }[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDay = new Map<number, number>();
  for (const c of contracts) {
    const d = Number(c.day.slice(8, 10));
    byDay.set(d, (byDay.get(d) ?? 0) + c.netRevenue);
  }
  let acc = 0;
  return Array.from({ length: days }, (_, i) => {
    const net = r2(byDay.get(i + 1) ?? 0);
    acc = r2(acc + net);
    return { day: i + 1, net, accumulated: acc };
  });
}

export type DueRow = { type: "RECEITA" | "DESPESA"; amount: number; paid: number; dueDay: string };

/** Fluxo previsto dos próximos `days` dias, a partir de hoje: entradas, saídas e saldo de cada dia. */
export function cashflowAhead(rows: DueRow[], today: string, days = 7) {
  const out: { day: string; in: number; out: number; balance: number }[] = [];
  const base = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const list = rows.filter((r) => r.dueDay === d);
    const open = (r: DueRow) => Math.max(0, r.amount - r.paid);
    const inn = r2(list.filter((r) => r.type === "RECEITA").reduce((s, r) => s + open(r), 0));
    const outt = r2(list.filter((r) => r.type === "DESPESA").reduce((s, r) => s + open(r), 0));
    out.push({ day: d, in: inn, out: outt, balance: r2(inn - outt) });
  }
  const total = { in: r2(out.reduce((s, x) => s + x.in, 0)), out: r2(out.reduce((s, x) => s + x.out, 0)) };
  return { days: out, total: { ...total, balance: r2(total.in - total.out) } };
}

/** Contas a pagar ou a receber: as que vencem hoje e as vencidas nos últimos 30 dias (valor em aberto e quantidade). */
export function dueSummary(rows: DueRow[], type: "RECEITA" | "DESPESA", today: string) {
  const since = new Date(new Date(`${today}T12:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const open = rows.filter((r) => r.type === type && r.amount - r.paid > 0.005);
  const pick = (f: (r: DueRow) => boolean) => {
    const l = open.filter(f);
    return { amount: r2(l.reduce((s, r) => s + r.amount - r.paid, 0)), count: l.length };
  };
  return { today: pick((r) => r.dueDay === today), overdue: pick((r) => r.dueDay < today && r.dueDay >= since) };
}
