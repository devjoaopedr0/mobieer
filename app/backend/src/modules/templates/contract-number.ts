/**
 * Numeração dos contratos: continua a sequência dos contratos que a loja já
 * fazia antes do sistema (o próximo número é configurável na tela de Modelos).
 * Gerar de novo o contrato do mesmo cliente e projeto reaproveita o número.
 */
import { prisma } from "../../prisma";

const SETTING_KEY = "contracts.numbering";

/** Número que o próximo contrato novo vai receber (sem reservar). */
export async function nextContractNumber(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  let next = 1;
  try {
    const v = row ? Number(JSON.parse(row.value).next) : NaN;
    if (Number.isInteger(v) && v > 0) next = v;
  } catch {
    // valor inválido: começa do maior número já usado
  }
  return Math.max(next, (await highestUsed()) + 1);
}

export async function setNextContractNumber(next: number) {
  const value = JSON.stringify({ next });
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } });
}

async function highestUsed(): Promise<number> {
  const rows = await prisma.projectDocument.findMany({ where: { type: "CONTRATO", number: { not: null } }, select: { number: true } });
  return rows.reduce((m, r) => Math.max(m, parseInt(r.number!.replace(/\D/g, ""), 10) || 0), 0);
}

/** Número do contrato deste cliente/projeto: o que ele já tem, ou o próximo da sequência. */
export async function contractNumberFor(organizationId: string, clientId: string, projectId: string | null): Promise<{ number: string; reused: boolean }> {
  const prev = await prisma.projectDocument.findFirst({
    where: { organizationId, clientId, projectId, type: "CONTRATO", number: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  if (prev?.number) return { number: prev.number, reused: true };
  const n = await nextContractNumber();
  await setNextContractNumber(n + 1);
  return { number: String(n), reused: false };
}

/** Número que este cliente/projeto teria, sem reservar (para a prévia). */
export async function peekContractNumber(organizationId: string, clientId: string, projectId: string | null): Promise<string> {
  const prev = await prisma.projectDocument.findFirst({
    where: { organizationId, clientId, projectId, type: "CONTRATO", number: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  return prev?.number ?? String(await nextContractNumber());
}
