/**
 * Adendos aceitos de um contrato, para os documentos do projeto (descritiva,
 * termo de entrega, renders, pasta técnica, cronograma, garantia) mostrarem
 * também os ambientes acrescentados depois.
 *
 * O adendo tem o número do contrato com -A1, -A2…; de cada um vale só a versão
 * aceita mais nova.
 */
import { prisma } from "../../prisma";

export type AddendumRow = { id: string; number: string; version: number };

/** Número do adendo: ORC-00012-A2 -> 2 (para ordenar A1, A2, A10). */
const seq = (number: string) => Number(/-A(\d+)$/.exec(number)?.[1] ?? 0);

/** De cada adendo, a versão mais nova; na ordem A1, A2… */
export function latestAddenda<T extends AddendumRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.number);
    if (!cur || r.version > cur.version) best.set(r.number, r);
  }
  return [...best.values()].sort((a, b) => seq(a.number) - seq(b.number));
}

export const ITEM_SELECT = { room: true, description: true, corpo: true, porta: true, puxador: true, complemento: true, modelo: true, position: true } as const;
export type AddendumItem = { room: string | null; description: string; corpo: string | null; porta: string | null; puxador: string | null; complemento: string | null; modelo: string | null; position: number };

/** Itens dos adendos aceitos do contrato `contractNumber`, depois dos itens do contrato. */
export async function addendumItems(organizationId: string, contractNumber: string | null | undefined): Promise<AddendumItem[]> {
  if (!contractNumber) return [];
  const rows = await prisma.commercialQuote.findMany({
    where: { organizationId, kind: "ADENDO", status: "APPROVED", number: { startsWith: `${contractNumber}-A` } },
    select: { id: true, number: true, version: true, items: { orderBy: { position: "asc" }, select: ITEM_SELECT } },
  });
  return latestAddenda(rows).flatMap((r) => r.items);
}

/** Junta os itens dos adendos ao orçamento do projeto já carregado (muda o objeto). */
export async function withAddenda<Q extends { number: string; items: unknown[] }>(organizationId: string, quote: Q | undefined): Promise<void> {
  if (!quote) return;
  const extra = await addendumItems(organizationId, quote.number);
  if (extra.length) quote.items = [...quote.items, ...extra] as Q["items"];
}
