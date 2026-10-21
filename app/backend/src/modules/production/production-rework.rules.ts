/**
 * Peça a refazer: quando uma peça sai com erro e precisa ser feita de novo.
 * Regras puras: motivos e o título da tarefa que vai para o planejamento da semana.
 */

export const REWORK_REASONS = [
  { code: "CORTE", label: "Erro de corte" },
  { code: "MEDIDA", label: "Erro de medida" },
  { code: "PROJETO", label: "Erro de projeto" },
  { code: "ACABAMENTO", label: "Acabamento / fita de borda" },
  { code: "FURACAO", label: "Furação / usinagem" },
  { code: "AVARIA", label: "Avaria ou quebra" },
  { code: "FALTANDO", label: "Peça faltando" },
  { code: "OUTRO", label: "Outro" },
] as const;
export type ReworkReason = (typeof REWORK_REASONS)[number]["code"];
export const REWORK_CODES = REWORK_REASONS.map((r) => r.code) as [ReworkReason, ...ReworkReason[]];

export const reasonLabel = (code: string) => REWORK_REASONS.find((r) => r.code === code)?.label ?? code;

/** Título da tarefa no planejamento: "REFAZER: porta do armário (erro de corte)". */
export function reworkTaskTitle(piece: string, reason: string): string {
  return `REFAZER: ${piece.trim()} (${reasonLabel(reason).toLowerCase()})`.slice(0, 200);
}

/** Quem não tem nome vai para a equipe, como no planejamento da semana. */
export const reworkPerson = (person: string | null | undefined) => (person?.trim() ? person.trim().toUpperCase().slice(0, 60) : "EQUIPE");

/** Resumo dos motivos: quantas peças por motivo, do mais comum ao menos. */
export function reasonsSummary(rows: { reason: string }[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
  return [...m.entries()].map(([code, count]) => ({ code, label: reasonLabel(code), count })).sort((a, b) => b.count - a.count);
}
