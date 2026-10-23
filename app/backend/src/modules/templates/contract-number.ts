/**
 * Numeração da loja: continua a sequência dos contratos antigos (o ponto de
 * partida é configurável na tela de Modelos; a Metal Mecânica Maia foi a 376).
 *
 * Orçamento e contrato andam juntos numa sequência só:
 * - orçamento novo recebe o próximo número livre (ORC-00377, ORC-00378…);
 * - o contrato fica com o número do orçamento dele (ORC-00376 → contrato 376);
 * - orçamento de antes do ponto de partida, ou contrato sem orçamento, recebe o
 *   próximo número livre, que nenhum orçamento nem contrato usa.
 * Gerar de novo o contrato do mesmo cliente e projeto reaproveita o número.
 */
import { prisma } from "../../prisma";

const SETTING_KEY = "contracts.numbering";

/** `start`: número a partir do qual o orçamento vira o número do contrato; `next`: piso da sequência. */
async function readSetting(): Promise<{ next: number; start: number }> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  try {
    const v = row ? JSON.parse(row.value) : {};
    const next = Number.isInteger(Number(v.next)) && Number(v.next) > 0 ? Number(v.next) : 1;
    const start = Number.isInteger(Number(v.start)) && Number(v.start) > 0 ? Number(v.start) : next;
    return { next, start };
  } catch {
    return { next: 1, start: 1 };
  }
}

const digits = (s: string | null | undefined) => parseInt(String(s ?? "").replace(/-A\d+$/, "").replace(/\D/g, ""), 10) || 0;

async function highestContract(): Promise<number> {
  const rows = await prisma.projectDocument.findMany({ where: { type: "CONTRATO", number: { not: null } }, select: { number: true } });
  return rows.reduce((m, r) => Math.max(m, digits(r.number)), 0);
}

async function highestQuote(): Promise<number> {
  const last = await prisma.commercialQuote.findFirst({ where: { number: { startsWith: "ORC-" }, kind: "PADRAO" }, orderBy: { number: "desc" }, select: { number: true } });
  return digits(last?.number);
}

/** Próximo número livre da sequência (nem orçamento nem contrato usam). */
export async function nextSharedNumber(): Promise<number> {
  const { next } = await readSetting();
  return Math.max(next, (await highestQuote()) + 1, (await highestContract()) + 1);
}

/** O que a tela de Modelos mostra como "próximo número". */
export const nextContractNumber = nextSharedNumber;

/** Configura o ponto de partida (o número do primeiro contrato no sistema). */
export async function setNextContractNumber(next: number) {
  const value = JSON.stringify({ next, start: next });
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } });
}

export type Renumbering = { from: string; to: string; client: string; versions: number };

/**
 * Orçamentos de antes do ponto de partida (ORC-00002… quando a loja começou
 * no 376) entram na sequência da loja, na ordem em que foram feitos: o mais
 * antigo fica com o próximo número livre, e assim por diante. Todas as versões
 * e os adendos (ORC-00005-A1) acompanham; a descrição dos lançamentos do
 * financeiro também. Se o cliente já tem contrato com número da sequência que
 * nenhum orçamento usa, o orçamento fica com esse número. Com `dryRun`, só
 * mostra o que mudaria.
 */
export async function renumberOldQuotes(organizationId: string, dryRun: boolean): Promise<Renumbering[]> {
  const { start } = await readSetting();
  const quotes = await prisma.commercialQuote.findMany({
    where: { organizationId, number: { startsWith: "ORC-" }, kind: "PADRAO" },
    select: { id: true, number: true, createdAt: true, clientId: true, projectId: true, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, typeof quotes>();
  for (const q of quotes) if (digits(q.number) < start) groups.set(q.number, [...(groups.get(q.number) ?? []), q]);
  if (!groups.size) return [];

  return prisma.$transaction(async (tx) => {
    const used = new Set((await tx.commercialQuote.findMany({ where: { number: { startsWith: "ORC-" }, kind: "PADRAO" }, select: { number: true } })).map((q) => digits(q.number)));
    const contracts = await tx.projectDocument.findMany({ where: { organizationId, type: "CONTRATO", number: { not: null } }, select: { number: true, clientId: true, projectId: true } });
    const contractNumbers = new Set(contracts.map((c) => digits(c.number)));
    const { next } = await readSetting();
    let free = Math.max(next, start);
    const take = () => {
      while (used.has(free) || contractNumbers.has(free)) free += 1;
      return free;
    };
    const out: Renumbering[] = [];
    for (const [from, rows] of groups) {
      const first = rows[0];
      // contrato já feito para este cliente/projeto com número da sequência, sem orçamento com esse número
      const own = contracts.map((c) => ({ ...c, n: digits(c.number) })).find((c) => c.clientId === first.clientId && c.projectId === first.projectId && c.n >= start && !used.has(c.n));
      const n = own ? own.n : take();
      used.add(n);
      const to = `ORC-${String(n).padStart(5, "0")}`;
      out.push({ from, to, client: first.client.name, versions: rows.length });
      if (dryRun) continue;
      for (const q of rows) await tx.commercialQuote.update({ where: { id: q.id }, data: { number: to } });
      // adendos: ORC-00005-A1 → ORC-00377-A1
      const addenda = await tx.commercialQuote.findMany({ where: { organizationId, kind: "ADENDO", number: { startsWith: `${from}-A` } }, select: { id: true, number: true } });
      for (const a of addenda) await tx.commercialQuote.update({ where: { id: a.id }, data: { number: to + a.number.slice(from.length) } });
      const ids = [...rows.map((q) => q.id), ...addenda.map((a) => a.id)];
      await tx.$executeRaw`UPDATE "FinanceTransaction" SET "description" = REPLACE("description", ${from}, ${to}), "purchaseRef" = REPLACE("purchaseRef", ${from}, ${to}) WHERE "originQuoteId" = ANY(${ids})`;
    }
    return out;
  });
}

async function previousNumber(organizationId: string, clientId: string, projectId: string | null) {
  const prev = await prisma.projectDocument.findFirst({
    where: { organizationId, clientId, projectId, type: "CONTRATO", number: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  return prev?.number ?? null;
}

/** Número que o contrato recebe: o que já tem, o do orçamento, ou o próximo livre. */
async function resolve(organizationId: string, clientId: string, projectId: string | null, quoteNumber?: string | null): Promise<{ number: string; reused: boolean }> {
  const prev = await previousNumber(organizationId, clientId, projectId);
  if (prev) return { number: prev, reused: true };
  // contrato de vários orçamentos: vale o primeiro (ORC-00376)
  const q = digits(/ORC-\d+/.exec(quoteNumber ?? "")?.[0]);
  const { start } = await readSetting();
  if (q && q >= start) {
    // outro cliente já com esse número de contrato? então vai para o próximo livre
    const taken = await prisma.projectDocument.findFirst({ where: { type: "CONTRATO", number: String(q), NOT: { clientId } }, select: { id: true } });
    if (!taken) return { number: String(q), reused: false };
  }
  return { number: String(await nextSharedNumber()), reused: false };
}

export const contractNumberFor = resolve;

/** Mesmo número que o contrato teria, sem gravar nada (para a prévia). */
export async function peekContractNumber(organizationId: string, clientId: string, projectId: string | null, quoteNumber?: string | null): Promise<string> {
  return (await resolve(organizationId, clientId, projectId, quoteNumber)).number;
}
