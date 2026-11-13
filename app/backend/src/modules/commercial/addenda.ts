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
    select: { id: true, number: true, version: true, items: { where: { included: true }, orderBy: { position: "asc" }, select: ITEM_SELECT } },
  });
  return latestAddenda(rows).flatMap((r) => r.items);
}

/** Junta os itens dos adendos ao orçamento do projeto já carregado (muda o objeto). */
export async function withAddenda<Q extends { number: string; items: unknown[] }>(organizationId: string, quote: Q | undefined): Promise<void> {
  if (!quote) return;
  const extra = await addendumItems(organizationId, quote.number);
  if (extra.length) quote.items = [...quote.items, ...extra] as Q["items"];
}

export type AddendumClauseRow = { number: string; version: number; approvedAt: Date | null; total: number; deliveryDays: number | null; rooms: { room: string; total: number }[] };

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");

/**
 * Cláusula dos adendos aceitos, para o contrato: cada ambiente acrescentado,
 * com valor, prazo e data do aceite. Vazio quando não há adendo.
 */
export function addendaClauseText(rows: AddendumClauseRow[]): string {
  if (!rows.length) return "";
  const parts = rows.map((r) => {
    const rooms = r.rooms.map((x) => `${x.room} (${money(x.total)})`).join(", ");
    const when = r.approvedAt ? `, aceito em ${day(r.approvedAt)}` : "";
    const prazo = r.deliveryDays ? ` O prazo de fabricação dos itens acrescentados é de ${r.deliveryDays} dias úteis, contados do aceite do adendo.` : "";
    return `Adendo ${r.number}${when}: acrescenta ao pedido ${rooms || "os itens do adendo"}, no valor total de ${money(r.total)}.${prazo}`;
  });
  return `Os adendos abaixo, aceitos pelo CONTRATANTE, integram este contrato nas mesmas condições, salvo o que neles estiver previsto. ${parts.join(" ")}`;
}

/** Adendos aceitos do contrato `contractNumber`, prontos para a cláusula. */
export async function addendaForClause(organizationId: string, contractNumber: string | null | undefined): Promise<AddendumClauseRow[]> {
  if (!contractNumber) return [];
  const rows = await prisma.commercialQuote.findMany({
    where: { organizationId, kind: "ADENDO", status: "APPROVED", number: { startsWith: `${contractNumber}-A` } },
    select: { id: true, number: true, version: true, approvedAt: true, total: true, deliveryDays: true, items: { where: { included: true }, orderBy: { position: "asc" }, select: { room: true, description: true, total: true } } },
  });
  return latestAddenda(rows).map((r) => ({
    number: r.number,
    version: r.version,
    approvedAt: r.approvedAt,
    total: Number(r.total ?? 0),
    deliveryDays: r.deliveryDays,
    rooms: r.items.map((i) => ({ room: i.room || i.description, total: Number(i.total ?? 0) })),
  }));
}
