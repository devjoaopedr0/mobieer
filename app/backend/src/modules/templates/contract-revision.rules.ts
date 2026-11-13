/**
 * Contrato refeito (pagamento corrigido, cláusula mudada, PDF editado): sai
 * como revisão do anterior, com o mesmo número e um sufixo — o primeiro é o
 * 377, a primeira revisão o 377-1, a segunda o 377-2 — e com um aviso no
 * início dizendo que o anterior fica desconsiderado. O texto do aviso é
 * configurável na tela de Modelos. Regras puras.
 */

/** Marcadores do aviso: número e data do contrato que este substitui. */
export const NOTICE_FIELDS = [
  { key: "contrato.anterior", label: "Número do contrato substituído", example: "377" },
  { key: "contrato.anteriorData", label: "Data do contrato substituído", example: "05/11/2026" },
  { key: "contrato.numero", label: "Número deste contrato", example: "377-1" },
] as const;

export const DEFAULT_REPLACEMENT_NOTICE =
  "Este contrato substitui integralmente o Contrato Nº {{contrato.anterior}}, emitido em {{contrato.anteriorData}}, que fica desconsiderado para todos os fins a partir da assinatura deste.";

export const MAX_NOTICE_LENGTH = 2000;

/** Número que sai no contrato: a versão 1 é o número puro; as seguintes ganham -1, -2… */
export function revisionNumber(base: string, version: number): string {
  return version > 1 ? `${base}-${version - 1}` : base;
}

/** Aviso já preenchido. Marcador desconhecido fica como está, para quem configurou ver o erro. */
export function replacementNotice(template: string, values: { previous: string; previousDate: Date; current: string }): string {
  const date = values.previousDate.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  const map: Record<string, string> = { "contrato.anterior": values.previous, "contrato.anteriorData": date, "contrato.numero": values.current };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, key: string) => map[key] ?? all).trim();
}

/** Texto configurado: vazio volta ao padrão; longo demais é cortado no limite. */
export function normalizeNotice(raw: unknown): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  return (t || DEFAULT_REPLACEMENT_NOTICE).slice(0, MAX_NOTICE_LENGTH);
}

/** O texto editado já começa com este aviso? (evita sair duas vezes quando alguém colou o aviso à mão) */
export function docStartsWith(blocks: { t: string; runs?: { text: string }[] }[], text: string): boolean {
  const first = blocks.find((b) => b.runs?.some((r) => r.text.trim()));
  if (!first?.runs) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(first.runs.map((r) => r.text).join("")) === norm(text);
}
