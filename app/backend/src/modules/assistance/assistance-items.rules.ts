/**
 * Itens da assistência e o que cobrar do cliente. A assistência é feita na
 * garantia: todo item entra como garantia, e só o que a equipe marcar como
 * cobrado vira conta a receber. No registro interno (erro, retrabalho) os
 * valores são o custo para a loja, nunca cobrança.
 */

export const ITEM_KINDS = [
  { code: "PECA", label: "Peça" },
  { code: "FERRAGEM", label: "Ferragem / acessório" },
  { code: "MATERIAL", label: "Material (chapa, fita…)" },
  { code: "MAO_DE_OBRA", label: "Mão de obra" },
  { code: "DESLOCAMENTO", label: "Deslocamento" },
  { code: "TERCEIRO", label: "Serviço de terceiro" },
  { code: "OUTRO", label: "Outro" },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]["code"];
export const ITEM_KIND_CODES = ITEM_KINDS.map((k) => k.code) as [ItemKind, ...ItemKind[]];
export const itemKindLabel = (code: string) => ITEM_KINDS.find((k) => k.code === code)?.label ?? "Outro";

/** Tipos que são registro da equipe (erro, retrabalho): não aparecem para o cliente. */
export const INTERNAL_KINDS = ["ERRO_INTERNO", "RETRABALHO"];
export const isInternalKind = (kind: string | null | undefined) => INTERNAL_KINDS.includes(kind ?? "");

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const lineTotal = (i: { quantity: number; unitPrice: number }) => r2(i.quantity * i.unitPrice);

/** Quanto ficou na garantia, quanto é cobrado e o total do atendimento. */
export function itemTotals(items: { quantity: number; unitPrice: number; charged: boolean }[]) {
  const garantia = r2(items.filter((i) => !i.charged).reduce((s, i) => s + lineTotal(i), 0));
  const cobrado = r2(items.filter((i) => i.charged).reduce((s, i) => s + lineTotal(i), 0));
  return { garantia, cobrado, total: r2(garantia + cobrado) };
}

/** Situação da cobrança: o que fazer com a conta a receber que já existe (ou não). */
export function chargePlan(cobrado: number, existing: { status: string; amount: number } | null): { action: "CRIAR" | "ATUALIZAR" | "REMOVER" | "NADA"; motivo?: string } {
  if (existing && existing.status === "PAGO") return { action: "NADA", motivo: "A cobrança desta assistência já foi recebida — ajuste no financeiro" };
  if (cobrado <= 0) return existing ? { action: "REMOVER" } : { action: "NADA", motivo: "Nenhum item marcado como cobrado: a assistência está toda na garantia" };
  if (!existing) return { action: "CRIAR" };
  return { action: "ATUALIZAR" };
}

/**
 * Custo da assistência para a loja: todos os itens, na garantia e cobrados (o
 * que é cobrado também foi gasto). O item que saiu do almoxarifado já virou
 * despesa quando foi comprado: entra no total, mas fica fora do lançamento,
 * para a DRE não contar o mesmo gasto duas vezes.
 */
export function assistanceCost(items: { quantity: number; unitPrice: number; productId?: string | null }[]) {
  const total = r2(items.reduce((s, i) => s + lineTotal(i), 0));
  const doEstoque = r2(items.filter((i) => i.productId).reduce((s, i) => s + lineTotal(i), 0));
  return { total, doEstoque, aLancar: r2(total - doEstoque) };
}

/** Situação do custo: o que fazer com a despesa da assistência que já existe (ou não). */
export function costPlan(aLancar: number, existing: { status: string; amount: number } | null): { action: "CRIAR" | "ATUALIZAR" | "REMOVER" | "NADA"; motivo?: string } {
  if (existing && existing.status === "PAGO" && Math.abs(existing.amount - aLancar) > 0.004) return { action: "NADA", motivo: "O custo desta assistência já foi pago com outro valor — ajuste no financeiro" };
  if (aLancar <= 0) return existing ? { action: "REMOVER" } : { action: "NADA", motivo: "Nenhum custo a lançar: os itens têm valor zero ou saíram do almoxarifado (já contados na compra)" };
  if (!existing) return { action: "CRIAR" };
  return { action: "ATUALIZAR" };
}

/** Resumo das assistências de um período: o que a loja gastou, o que cobrou e o que já está no financeiro. */
export function assistancesSummary(
  tickets: { internal: boolean; items: { quantity: number; unitPrice: number; charged: boolean; productId?: string | null }[] }[],
  launched: { type: string; amount: number }[]
) {
  let garantia = 0, cobrado = 0, retrabalho = 0, doEstoque = 0;
  for (const t of tickets) {
    const totals = itemTotals(t.items);
    const cost = assistanceCost(t.items);
    doEstoque += cost.doEstoque;
    if (t.internal) retrabalho += totals.total;
    else { garantia += totals.garantia; cobrado += totals.cobrado; }
  }
  const custo = r2(garantia + cobrado + retrabalho);
  const custoLancado = r2(launched.filter((l) => l.type === "DESPESA").reduce((s, l) => s + l.amount, 0));
  const receitaLancada = r2(launched.filter((l) => l.type === "RECEITA").reduce((s, l) => s + l.amount, 0));
  return {
    atendimentos: tickets.length,
    garantia: r2(garantia), cobrado: r2(cobrado), retrabalho: r2(retrabalho), custo, doEstoque: r2(doEstoque),
    custoLancado, receitaLancada,
    // o que ainda não foi para o financeiro (fora o que veio do estoque)
    custoFaltando: r2(Math.max(0, custo - r2(doEstoque) - custoLancado)),
    receitaFaltando: r2(Math.max(0, cobrado - receitaLancada)),
    resultado: r2(cobrado - custo),
  };
}
