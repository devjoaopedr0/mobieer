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
