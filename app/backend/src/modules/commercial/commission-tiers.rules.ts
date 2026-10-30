/**
 * Comissão do consultor por faixa do total vendido no mês — regras puras.
 *
 * Venda = orçamento aceito (status APPROVED) no mês da competência; é a mesma
 * fonte do painel comercial e da DRE (overview.signedContracts). Cada contrato
 * entra uma vez: a parte de cada consultor é a linha de comissão dele no
 * orçamento (o papel da política, "VENDEDOR" = Consultor).
 *
 * Faixa: total do mês acima de `min` e até `max` (vazio = sem teto). Com faixas
 * 0–50.000 a 1% e 50.000–100.000 a 2%, R$ 50.000,00 fica na primeira e
 * R$ 50.000,01 já está na segunda.
 *
 *  - PROGRESSIVE (padrão): cada faixa paga o seu % só sobre a parte do total
 *    dentro dela — 60.000 = 50.000 × 1% + 10.000 × 2% = 700.
 *  - FLAT_ON_TOTAL: o % da faixa atingida vale para o total — 60.000 × 2% = 1.200.
 */
export type CommissionMode = "PROGRESSIVE" | "FLAT_ON_TOTAL";
export type Tier = { min: number; max: number | null; percent: number };

export class TierRuleError extends Error {}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const r2 = (n: number) => cents(n) / 100;

/** Confere as faixas: começam em zero, sem buraco nem sobreposição, só a última sem teto. */
export function validateTiers(input: Tier[]): Tier[] {
  if (!input.length) throw new TierRuleError("Cadastre pelo menos uma faixa");
  const tiers = [...input].map((t) => ({ min: r2(t.min), max: t.max == null ? null : r2(t.max), percent: Math.round(t.percent * 1000) / 1000 })).sort((a, b) => a.min - b.min);
  tiers.forEach((t, i) => {
    const n = i + 1;
    if (!Number.isFinite(t.min) || t.min < 0) throw new TierRuleError(`Faixa ${n}: valor inicial inválido`);
    if (!Number.isFinite(t.percent) || t.percent < 0 || t.percent > 50) throw new TierRuleError(`Faixa ${n}: percentual deve ficar entre 0% e 50%`);
    if (t.max != null && (!Number.isFinite(t.max) || t.max <= t.min)) throw new TierRuleError(`Faixa ${n}: o valor final precisa ser maior que o inicial`);
    if (t.max == null && i < tiers.length - 1) throw new TierRuleError(`Faixa ${n}: só a última faixa pode ficar sem valor final`);
    if (i === 0 && t.min !== 0) throw new TierRuleError("A primeira faixa começa em R$ 0,00");
    if (i > 0) {
      const prev = tiers[i - 1].max!;
      if (t.min > prev) throw new TierRuleError(`Faixa ${n}: há um intervalo sem faixa entre ${prev.toFixed(2)} e ${t.min.toFixed(2)}`);
      if (t.min < prev) throw new TierRuleError(`Faixa ${n}: sobrepõe a faixa anterior (que vai até ${prev.toFixed(2)})`);
    }
  });
  return tiers;
}

/** Índice da faixa em que o total cai (total zero fica na primeira). */
export function tierIndex(tiers: Tier[], base: number): number {
  const b = r2(base);
  const i = tiers.findIndex((t) => t.max == null || b <= t.max);
  return i === -1 ? tiers.length - 1 : i;
}

export type TierResult = {
  base: number;
  commission: number;
  /** % da faixa atingida */
  percent: number;
  /** comissão ÷ total, em % (no progressivo fica entre o % da 1ª e o da faixa atual) */
  effectivePercent: number;
  tier: { index: number; min: number; max: number | null; percent: number };
  /** próxima faixa e quanto falta vender para entrar nela */
  next: { index: number; min: number; percent: number; missing: number } | null;
};

export function computeCommission(input: Tier[], mode: CommissionMode, base: number): TierResult {
  const tiers = validateTiers(input);
  const b = Math.max(0, r2(base));
  const idx = tierIndex(tiers, b);
  const tier = tiers[idx];
  let c = 0;
  if (mode === "PROGRESSIVE") {
    for (const t of tiers) {
      const top = t.max == null ? b : Math.min(b, t.max);
      const slice = cents(top) - cents(t.min);
      if (slice > 0) c += (slice * t.percent) / 100;
    }
  } else {
    c = (cents(b) * tier.percent) / 100;
  }
  const commission = Math.round(c) / 100;
  const nt = tiers[idx + 1];
  return {
    base: b,
    commission,
    percent: tier.percent,
    effectivePercent: b > 0 ? Math.round((commission / b) * 1_000_000) / 10_000 : tier.percent,
    tier: { index: idx, ...tier },
    // para entrar na próxima é preciso passar do teto da atual
    next: nt && tier.max != null ? { index: idx + 1, min: nt.min, percent: nt.percent, missing: r2(tier.max - b + 0.01) } : null,
  };
}

/** Vigência que vale no mês: a ativa com o maior início até ele (empate: a criada por último). */
export function pickPolicy<P extends { validFrom: string; active: boolean; createdAt: Date }>(policies: P[], month: string): P | null {
  return (
    policies
      .filter((p) => p.active && p.validFrom <= month)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

/** Reparte um valor em centavos na proporção dos pesos; o arredondamento fica na última parte. */
export function allocate(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const t = cents(total);
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  let used = 0;
  return weights.map((w, i) => {
    const part = i === weights.length - 1 ? t - used : sum > 0 ? Math.floor((t * Math.max(0, w)) / sum) : Math.floor(t / weights.length);
    used += part;
    return part / 100;
  });
}

export type ContractLine = { id: string; userId: string | null; referrerId: string | null; name: string; role: string; percent: number };
export type Contract = { id: string; number: string; total: number; sellerId: string; lines: ContractLine[] };
/** A parte de um consultor num contrato: base = total × (% dele ÷ % dos consultores do contrato). */
export type Participation = { quoteId: string; lineId: string; userId: string; name: string; base: number };
export type ContractIssue = { quoteId: string; number: string; kind: "SEM_CONSULTOR" | "CONSULTOR_DIFERENTE"; detail: string };

/**
 * Quem vendeu o quê. Cada contrato aparece uma vez (o mesmo id repetido é
 * ignorado). Contrato sem linha de consultor com usuário não entra e vira
 * aviso; consultor diferente do vendedor do orçamento entra e vira aviso.
 */
export function participations(contracts: Contract[], role: string): { items: Participation[]; issues: ContractIssue[] } {
  const items: Participation[] = [];
  const issues: ContractIssue[] = [];
  const seen = new Set<string>();
  for (const q of contracts) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    const lines = q.lines.filter((l) => l.role === role && l.userId && !l.referrerId);
    if (!lines.length) {
      issues.push({ quoteId: q.id, number: q.number, kind: "SEM_CONSULTOR", detail: "Contrato sem consultor com usuário na comissão — não entra na faixa de ninguém" });
      continue;
    }
    if (!lines.some((l) => l.userId === q.sellerId)) {
      issues.push({ quoteId: q.id, number: q.number, kind: "CONSULTOR_DIFERENTE", detail: `A comissão do contrato é de ${lines.map((l) => l.name).join(", ")}, não do vendedor do orçamento` });
    }
    const bases = allocate(q.total, lines.map((l) => l.percent || 1));
    lines.forEach((l, i) => items.push({ quoteId: q.id, lineId: l.id, userId: l.userId!, name: l.name, base: bases[i] }));
  }
  return { items, issues };
}

/**
 * O que lançar para uma linha já apurada: `target` é a comissão pela faixa,
 * `locked` o que já foi pago (ou começou a ser). Paga o que falta; o que foi
 * pago a mais fica a descontar.
 */
export function settleLine(target: number, locked: number) {
  const diff = cents(target) - cents(locked);
  return { pending: Math.max(0, diff) / 100, over: Math.max(0, -diff) / 100 };
}

/** Desconta um crédito das parcelas a pagar, das últimas para as primeiras. */
export function applyCredit(amounts: number[], credit: number): { amounts: number[]; used: number } {
  let left = cents(Math.max(0, credit));
  const out = amounts.map(cents);
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(out[i], left);
    out[i] -= take;
    left -= take;
  }
  return { amounts: out.map((c) => c / 100), used: (cents(Math.max(0, credit)) - left) / 100 };
}

/** O mês só fecha depois de acabar (aaaa-mm, comparação de texto). */
export const canConsolidate = (month: string, currentMonth: string) => month < currentMonth;
