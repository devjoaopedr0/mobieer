/**
 * Texto do contrato corrigido no editor. Fica guardado por cliente e projeto
 * (o mesmo par que reaproveita o número do contrato): fechar o editor, sair da
 * tela ou gerar o PDF não perde nada, e reabrir volta exatamente ao que a
 * pessoa deixou. Guarda os blocos já validados, nunca HTML.
 */
import { prisma } from "../../prisma";
import { docBlocksSchema, type DocBlocks } from "./contract-doc";

export type ContractText = {
  templateId: string;
  doc: DocBlocks;
  savedAt: string;
  savedBy: string | null;
  /** último PDF gerado deste texto */
  documentId: string | null;
};

const keyOf = (clientId: string, projectId: string | null | undefined) => `contract.text:${clientId}:${projectId || "-"}`;

export async function loadContractText(clientId: string, projectId: string | null | undefined): Promise<ContractText | null> {
  const row = await prisma.setting.findUnique({ where: { key: keyOf(clientId, projectId) } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    const doc = docBlocksSchema.safeParse(v.doc);
    if (!doc.success || typeof v.templateId !== "string") return null;
    return { templateId: v.templateId, doc: doc.data, savedAt: String(v.savedAt ?? ""), savedBy: v.savedBy ?? null, documentId: v.documentId ?? null };
  } catch {
    return null;
  }
}

export async function saveContractText(clientId: string, projectId: string | null | undefined, t: Omit<ContractText, "savedAt">): Promise<ContractText> {
  const saved: ContractText = { ...t, savedAt: new Date().toISOString() };
  const value = JSON.stringify(saved);
  const key = keyOf(clientId, projectId);
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return saved;
}

export async function discardContractText(clientId: string, projectId: string | null | undefined) {
  await prisma.setting.deleteMany({ where: { key: keyOf(clientId, projectId) } });
}
