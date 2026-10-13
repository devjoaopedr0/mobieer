/**
 * Frentes de produção: além da marcenaria (que tem as etapas da fábrica), o mesmo
 * pedido pode ter metalon, peças especiais e portas de vidro andando em paralelo,
 * cada uma no seu ritmo. Por enquanto cada frente tem só a situação; as etapas
 * de cada uma entram quando a loja definir. Regras puras, sem banco.
 */

export const EXTRA_FRONTS = [
  { code: "METALON", label: "Metalon" },
  { code: "PECAS_ESPECIAIS", label: "Peças especiais" },
  { code: "PORTAS_VIDRO", label: "Portas de vidro" },
] as const;
export type FrontCode = (typeof EXTRA_FRONTS)[number]["code"];
export const FRONT_CODES = EXTRA_FRONTS.map((f) => f.code) as [FrontCode, ...FrontCode[]];
export const MARCENARIA = { code: "MARCENARIA", label: "Marcenaria" } as const;
export const frontLabel = (code: string) => (code === MARCENARIA.code ? MARCENARIA.label : EXTRA_FRONTS.find((f) => f.code === code)?.label ?? code);

export const FRONT_STATUSES = ["PENDING", "IN_PROGRESS", "DONE"] as const;
export type FrontStatus = (typeof FRONT_STATUSES)[number];
export const FRONT_STATUS_LABEL: Record<FrontStatus, string> = { PENDING: "Pendente", IN_PROGRESS: "Em andamento", DONE: "Concluída" };

/** Datas que acompanham a mudança de situação: início na primeira vez que anda, conclusão ao concluir. */
export function frontDates(prev: { status: string; startedAt: Date | null; completedAt: Date | null }, next: FrontStatus, now: Date) {
  return {
    startedAt: next === "PENDING" ? null : prev.startedAt ?? now,
    completedAt: next === "DONE" ? (prev.status === "DONE" ? prev.completedAt ?? now : now) : null,
  };
}

/** Dias de atraso de uma frente ainda aberta. */
export function frontDaysLate(dueAt: Date | null, status: string, now: Date): number {
  if (!dueAt || status === "DONE") return 0;
  return Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000));
}

/** O pedido só está pronto quando a marcenaria e todas as frentes dele terminaram. */
export const frontsPending = (fronts: { front: string; status: string }[]) => fronts.filter((f) => f.status !== "DONE").map((f) => frontLabel(f.front));
