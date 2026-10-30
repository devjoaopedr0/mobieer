/**
 * Meta adaptativa por vendedor — regras puras.
 *
 * Só liga quando o vendedor tem histórico: pelo menos 3 meses com venda
 * fechada e lead registrado. Antes disso a meta segue manual.
 *
 * Proposta do mês = leads esperados × taxa de conversão × ticket médio ×
 * sazonalidade × fator de ajuste da equipe:
 *   - leads esperados: média dos últimos 3 meses fechados
 *   - conversão e ticket: fechados ÷ leads e valor ÷ fechados nos últimos 6 meses
 *   - sazonalidade: vendido no mesmo mês do ano passado ÷ média mensal daquele
 *     ano (sem o mês no histórico, 1); limitada entre 0,7 e 1,3
 *   - ajuste: quanto a equipe mexeu nas últimas propostas (meta final ÷
 *     proposta), média das 3 últimas, limitada entre 0,8 e 1,2
 * A proposta nunca é aplicada sozinha: alguém da gestão aprova.
 */

export type MonthStat = { month: string; leads: number; won: number; wonValue: number };
export type PastProposal = { month: string; proposed: number; final: number | null };

export const ADAPTIVE = { minMonths: 3, leadMonths: 3, rateMonths: 6, season: { min: 0.7, max: 1.3 }, adjust: { min: 0.8, max: 1.2, take: 3 } };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const hundreds = (n: number) => Math.round(n / 100) * 100;

/** "2026-10" e n meses → "2026-07" (n = -3). */
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meses antes de `month` com venda fechada e lead registrado. */
export function historyMonths(stats: MonthStat[], month: string) {
  return stats.filter((s) => s.month < month && s.won > 0 && s.leads > 0).length;
}

export function adaptiveProposal(stats: MonthStat[], month: string, past: PastProposal[] = []) {
  const months = historyMonths(stats, month);
  if (months < ADAPTIVE.minMonths) {
    return { active: false as const, months, reason: `Precisa de ${ADAPTIVE.minMonths} meses com venda fechada e lead registrado; há ${months}. A meta segue manual.` };
  }
  const by = new Map(stats.map((s) => [s.month, s]));
  const get = (m: string) => by.get(m) ?? { month: m, leads: 0, won: 0, wonValue: 0 };
  const last = (n: number) => Array.from({ length: n }, (_, i) => get(shiftMonth(month, -(i + 1))));

  const leadWindow = last(ADAPTIVE.leadMonths);
  const leadsExpected = leadWindow.reduce((a, s) => a + s.leads, 0) / ADAPTIVE.leadMonths;
  const rateWindow = last(ADAPTIVE.rateMonths);
  const leads6 = rateWindow.reduce((a, s) => a + s.leads, 0);
  const won6 = rateWindow.reduce((a, s) => a + s.won, 0);
  const value6 = rateWindow.reduce((a, s) => a + s.wonValue, 0);
  const conversion = leads6 ? won6 / leads6 : 0;
  const ticket = won6 ? value6 / won6 : 0;

  // sazonalidade: o mesmo mês do ano passado contra a média daquele ano
  const sameLastYear = by.get(shiftMonth(month, -12));
  const yearBefore = Array.from({ length: 12 }, (_, i) => get(shiftMonth(month, -(i + 1))));
  const yearAvg = yearBefore.reduce((a, s) => a + s.wonValue, 0) / 12;
  const seasonality = sameLastYear && sameLastYear.wonValue > 0 && yearAvg > 0 ? clamp(sameLastYear.wonValue / yearAvg, ADAPTIVE.season.min, ADAPTIVE.season.max) : 1;

  // o que a equipe fez com as últimas propostas
  const decided = past.filter((p) => p.final != null && p.proposed > 0 && p.month < month).sort((a, b) => b.month.localeCompare(a.month)).slice(0, ADAPTIVE.adjust.take);
  const adjustment = decided.length ? clamp(decided.reduce((a, p) => a + p.final! / p.proposed, 0) / decided.length, ADAPTIVE.adjust.min, ADAPTIVE.adjust.max) : 1;

  const raw = leadsExpected * conversion * ticket * seasonality * adjustment;
  return {
    active: true as const,
    months,
    amount: hundreds(raw),
    basis: {
      leadsExpected: r2(leadsExpected),
      leadMonths: leadWindow.map((s) => ({ month: s.month, leads: s.leads })),
      conversionPercent: r2(conversion * 100),
      leads6,
      won6,
      ticket: r2(ticket),
      value6: r2(value6),
      seasonality: r4(seasonality),
      sameMonthLastYear: sameLastYear ? r2(sameLastYear.wonValue) : null,
      yearAverage: r2(yearAvg),
      adjustment: r4(adjustment),
      adjustedFrom: decided.map((p) => ({ month: p.month, proposed: p.proposed, final: p.final })),
    },
  };
}

/** Texto curto de como a meta foi calculada, com os números usados. */
export function explainProposal(p: Extract<ReturnType<typeof adaptiveProposal>, { active: true }>) {
  const b = p.basis;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const parts = [
    `${b.leadsExpected.toLocaleString("pt-BR")} leads esperados (média dos últimos 3 meses: ${b.leadMonths.map((m) => m.leads).join(", ")})`,
    `× ${b.conversionPercent.toLocaleString("pt-BR")}% de conversão (${b.won6} fechados de ${b.leads6} leads em 6 meses)`,
    `× ticket médio de ${brl(b.ticket)}`,
  ];
  if (b.seasonality !== 1) parts.push(`× sazonalidade ${b.seasonality.toLocaleString("pt-BR")} (mesmo mês no ano passado: ${brl(b.sameMonthLastYear ?? 0)}; média do ano: ${brl(b.yearAverage)})`);
  if (b.adjustment !== 1) parts.push(`× ajuste da equipe ${b.adjustment.toLocaleString("pt-BR")} (média de meta final ÷ proposta nas últimas ${b.adjustedFrom.length})`);
  return `${parts.join(" ")} = ${brl(p.amount)} (arredondado para centenas).`;
}
