/**
 * Numeração da loja: orçamento e contrato são coisas diferentes, cada um com a
 * sua sequência.
 * - contrato: continua a sequência dos contratos antigos (o ponto de partida é
 *   configurável na tela de Modelos). Gerar de novo o contrato do mesmo cliente
 *   e projeto reaproveita o número;
 * - orçamento: ORC-00001, ORC-00002…, também com ponto de partida configurável.
 *   As versões repetem o número; adendo usa o número do orçamento com -A1.
 */
import { prisma } from "../../prisma";

const CONTRACT_KEY = "contracts.numbering";
const QUOTE_KEY = "quotes.numbering";

/**
 * `next`: piso da sequência. `reserved` (só contratos): número guardado para o
 * contrato de um cliente que ainda não foi gerado no sistema, por id do cliente
 * (a Metal Mecânica Maia é o 376); a sequência pula esses números.
 */
async function readSetting(key: string): Promise<{ next: number; reserved: Record<string, string> }> {
  const row = await prisma.setting.findUnique({ where: { key } });
  try {
    const v = row ? JSON.parse(row.value) : {};
    const next = Number(v.next);
    const reserved = v.reserved && typeof v.reserved === "object" ? (v.reserved as Record<string, string>) : {};
    return { next: Number.isInteger(next) && next > 0 ? next : 1, reserved };
  } catch {
    return { next: 1, reserved: {} };
  }
}

const readNext = async (key: string) => (await readSetting(key)).next;

async function writeNext(key: string, next: number) {
  const value = JSON.stringify({ ...(await readSetting(key)), next });
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
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

/** Número que o próximo contrato novo vai receber (sem reservar). */
export async function nextContractNumber(): Promise<number> {
  const { next, reserved } = await readSetting(CONTRACT_KEY);
  const held = new Set(Object.values(reserved).map((n) => digits(n)));
  let n = Math.max(next, (await highestContract()) + 1);
  while (held.has(n)) n += 1;
  return n;
}

/** Configura o número que o próximo contrato recebe. */
export async function setNextContractNumber(next: number) {
  await writeNext(CONTRACT_KEY, next);
}

/** Número que o próximo orçamento novo vai receber. */
export async function nextQuoteSequence(): Promise<number> {
  return Math.max(await readNext(QUOTE_KEY), (await highestQuote()) + 1);
}

/** Configura o número que o próximo orçamento recebe. */
export async function setNextQuoteNumber(next: number) {
  await writeNext(QUOTE_KEY, next);
}

export type Renumbering = { from: string; to: string; client: string; versions: number };

/**
 * Orçamentos de antes do ponto de partida dos orçamentos (ORC-00002… quando a
 * loja começou no 376) entram na sequência, na ordem em que foram feitos: o
 * mais antigo fica com o próximo número livre, e assim por diante. Todas as
 * versões e os adendos (ORC-00005-A1) acompanham; a descrição dos lançamentos
 * do financeiro também. Com `dryRun`, só mostra o que mudaria.
 */
export async function renumberOldQuotes(organizationId: string, dryRun: boolean): Promise<Renumbering[]> {
  const start = await readNext(QUOTE_KEY);
  const quotes = await prisma.commercialQuote.findMany({
    where: { organizationId, number: { startsWith: "ORC-" }, kind: "PADRAO" },
    select: { id: true, number: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, typeof quotes>();
  for (const q of quotes) if (digits(q.number) < start) groups.set(q.number, [...(groups.get(q.number) ?? []), q]);
  if (!groups.size) return [];

  return prisma.$transaction(async (tx) => {
    const used = new Set((await tx.commercialQuote.findMany({ where: { number: { startsWith: "ORC-" }, kind: "PADRAO" }, select: { number: true } })).map((q) => digits(q.number)));
    let free = start;
    const take = () => {
      while (used.has(free)) free += 1;
      return free;
    };
    const out: Renumbering[] = [];
    for (const [from, rows] of groups) {
      const n = take();
      used.add(n);
      const to = `ORC-${String(n).padStart(5, "0")}`;
      out.push({ from, to, client: rows[0].client.name, versions: rows.length });
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

/**
 * O caminho contrário: orçamentos que pegaram número da sequência dos contratos
 * (no tempo em que orçamento e contrato dividiam a numeração, ORC-00376,
 * ORC-00378…) voltam para a sequência dos orçamentos, logo depois do maior
 * número abaixo de `threshold`, na ordem em que foram feitos. Versões, adendos
 * e a descrição dos lançamentos do financeiro acompanham. Com `dryRun`, só mostra.
 */
export async function compactQuoteNumbers(organizationId: string, threshold: number, dryRun: boolean): Promise<Renumbering[]> {
  const quotes = await prisma.commercialQuote.findMany({
    where: { organizationId, number: { startsWith: "ORC-" }, kind: "PADRAO" },
    select: { id: true, number: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, typeof quotes>();
  for (const q of quotes) if (digits(q.number) >= threshold) groups.set(q.number, [...(groups.get(q.number) ?? []), q]);
  if (!groups.size) return [];
  const below = quotes.map((q) => digits(q.number)).filter((n) => n < threshold);
  let next = Math.max(0, ...below) + 1;

  return prisma.$transaction(async (tx) => {
    const out: Renumbering[] = [];
    for (const [from, rows] of groups) {
      if (next >= threshold) break;
      const to = `ORC-${String(next++).padStart(5, "0")}`;
      out.push({ from, to, client: rows[0].client.name, versions: rows.length });
      if (dryRun) continue;
      for (const q of rows) await tx.commercialQuote.update({ where: { id: q.id }, data: { number: to } });
      const addenda = await tx.commercialQuote.findMany({ where: { organizationId, kind: "ADENDO", number: { startsWith: `${from}-A` } }, select: { id: true, number: true } });
      for (const a of addenda) await tx.commercialQuote.update({ where: { id: a.id }, data: { number: to + a.number.slice(from.length) } });
      const ids = [...rows.map((q) => q.id), ...addenda.map((a) => a.id)];
      await tx.$executeRaw`UPDATE "FinanceTransaction" SET "description" = REPLACE("description", ${from}, ${to}), "purchaseRef" = REPLACE("purchaseRef", ${from}, ${to}) WHERE "originQuoteId" = ANY(${ids})`;
    }
    if (!dryRun) await writeNext(QUOTE_KEY, next);
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

/** Número do contrato deste cliente/projeto: o que ele já tem, ou o próximo da sequência dos contratos. */
export async function contractNumberFor(organizationId: string, clientId: string, projectId: string | null): Promise<{ number: string; reused: boolean }> {
  const prev = await previousNumber(organizationId, clientId, projectId);
  if (prev) return { number: prev, reused: true };
  const held = (await readSetting(CONTRACT_KEY)).reserved[clientId];
  if (held) return { number: held, reused: false };
  const n = await nextContractNumber();
  await setNextContractNumber(n + 1);
  return { number: String(n), reused: false };
}

/** Número que este cliente/projeto teria, sem reservar (para a prévia). */
export async function peekContractNumber(organizationId: string, clientId: string, projectId: string | null): Promise<string> {
  return (await previousNumber(organizationId, clientId, projectId)) ?? (await readSetting(CONTRACT_KEY)).reserved[clientId] ?? String(await nextContractNumber());
}
