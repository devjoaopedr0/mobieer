/**
 * Tela de Assistências (lista, kanban e agenda): tipos, colunas do quadro e a
 * organização das visitas por dia — regras puras, sem banco.
 */

/** Como a equipe classifica o chamado. */
export const ASSISTANCE_KINDS = [
  { code: "ASSISTENCIA", label: "Assistência" },
  { code: "AJUSTE_POS_MONTAGEM", label: "Ajuste pós-montagem" },
  { code: "MANUTENCAO", label: "Manutenção" },
  { code: "ERRO_INTERNO", label: "Erro interno" },
  { code: "RETRABALHO", label: "Retrabalho" },
] as const;
export type AssistanceKind = (typeof ASSISTANCE_KINDS)[number]["code"];
export const ASSISTANCE_KIND_CODES = ASSISTANCE_KINDS.map((k) => k.code) as [AssistanceKind, ...AssistanceKind[]];
export const kindLabel = (code: string | null | undefined) => ASSISTANCE_KINDS.find((k) => k.code === code)?.label ?? "Assistência";

/** Colunas do quadro, na ordem do atendimento. Cancelado fica fora do quadro. */
export const BOARD_COLUMNS = [
  { status: "OPEN", label: "Aberto" },
  { status: "TRIAGE", label: "Em análise" },
  { status: "SCHEDULED", label: "Agendado" },
  { status: "IN_PROGRESS", label: "Em execução" },
  { status: "WAITING_CLIENT", label: "Aguardando cliente" },
  { status: "RESOLVED", label: "Resolvido" },
] as const;

/** Bairro e cidade do cliente, para juntar visitas da mesma região. */
export function placeOf(c: { district?: string | null; city?: string | null } | null | undefined): string | null {
  const parts = [c?.district, c?.city].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const TZ = "America/Fortaleza";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** Visitas marcadas agrupadas por dia (fuso da loja), da mais próxima para a mais distante. */
export function groupVisits<T extends { scheduledAt: Date | string | null }>(tickets: T[]): { day: string; tickets: T[] }[] {
  const map = new Map<string, T[]>();
  const withDate = tickets.filter((t): t is T & { scheduledAt: Date | string } => Boolean(t.scheduledAt));
  withDate.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  for (const t of withDate) {
    const day = dayOf(new Date(t.scheduledAt));
    map.set(day, [...(map.get(day) ?? []), t]);
  }
  return [...map.entries()].map(([day, list]) => ({ day, tickets: list }));
}
