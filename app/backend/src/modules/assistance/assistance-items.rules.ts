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
