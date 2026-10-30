/**
 * Comissões no CRM — regras puras. A comissão é a linha que o orçamento já
 * registra (CommercialQuoteCommission); aqui só se soma por vendedor. Não há
 * cálculo novo, nem mistura com horas de produção ou ponto.
 *
 *   prevista  = orçamentos em aberto (enviado, visto, em negociação)
 *   a receber = orçamentos aceitos (viraram venda) no período
 */
export const OPEN_QUOTE = ["SENT", "VIEWED", "NEGOTIATION"] as const;

export type CommissionLine = {
  userId: string | null;
  name: string;
  amount: number;
  quoteStatus: string;
  approvedAt: Date | null;
};

/** Vê as comissões de todos: financeiro ou gestão. O resto, só as próprias. */
export const seesAllCommissions = (permissions: string[]) =>
  ["finance.read", "organization.manage", "commercial.commissions.manage"].some((p) => permissions.includes(p));

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Soma por vendedor (pelo usuário; linha sem usuário, pelo nome escrito). */
export function commissionsBySeller(lines: CommissionLine[], from: Date, to: Date) {
  const map = new Map<string, { key: string; userId: string | null; name: string; prevista: number; aReceber: number; vendas: number }>();
  for (const l of lines) {
    const key = l.userId ?? `nome:${l.name.trim().toLowerCase()}`;
    const row = map.get(key) ?? { key, userId: l.userId, name: l.name, prevista: 0, aReceber: 0, vendas: 0 };
    if ((OPEN_QUOTE as readonly string[]).includes(l.quoteStatus)) row.prevista = r2(row.prevista + l.amount);
    else if (l.quoteStatus === "APPROVED" && l.approvedAt && l.approvedAt >= from && l.approvedAt <= to) {
      row.aReceber = r2(row.aReceber + l.amount);
      row.vendas += 1;
    }
    map.set(key, row);
  }
  return [...map.values()].filter((r) => r.prevista || r.aReceber).sort((a, b) => b.aReceber - a.aReceber || b.prevista - a.prevista || a.name.localeCompare(b.name));
}
