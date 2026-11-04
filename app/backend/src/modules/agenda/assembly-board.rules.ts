/**
 * Montagens — andamento, indicadores e conflitos de agenda. Regras puras.
 *
 * A duração do agendamento é o intervalo entre o início e o fim previsto
 * (endAt − startAt): todo agendamento, inclusive os antigos, já tem as duas
 * pontas, então não há registro "sem duração". As opções da tela seguem o dia
 * de montagem: N dias = (N − 1) dias corridos + um expediente (8 h), assim
 * "2 dias" começando segunda às 8h termina terça às 16h.
 */

export const WORKDAY_MINUTES = 8 * 60;
export const MAX_DURATION_MINUTES = 60 * 24 * 60; // 60 dias
const DAY_MINUTES = 24 * 60;

/** Minutos de um agendamento de N dias de montagem. */
export const daysToMinutes = (days: number) => (days - 1) * DAY_MINUTES + WORKDAY_MINUTES;

export class DurationError extends Error {}

/** Duração informada em "Outro": horas ou dias, inteiros ou com fração; valida e devolve minutos. */
export function customDurationMinutes(amount: number, unit: "HORAS" | "DIAS"): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new DurationError("Informe uma duração maior que zero");
  const minutes = unit === "DIAS" ? (Number.isInteger(amount) ? daysToMinutes(amount) : Math.round(amount * WORKDAY_MINUTES)) : Math.round(amount * 60);
  if (minutes < 15) throw new DurationError("A duração mínima é de 15 minutos");
  if (minutes > MAX_DURATION_MINUTES) throw new DurationError("A duração máxima é de 60 dias");
  return minutes;
}

export const durationMinutes = (startAt: Date, endAt: Date) => Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000));

/** "45 min", "2h30", "1 dia (8h)", "3 dias", "1d 6h". */
export function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < DAY_MINUTES) {
    if (minutes === WORKDAY_MINUTES) return "1 dia (8h)";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  // N dias de montagem (padrão das opções)
  if ((minutes - WORKDAY_MINUTES) % DAY_MINUTES === 0) return `${(minutes - WORKDAY_MINUTES) / DAY_MINUTES + 1} dias`;
  if (minutes % DAY_MINUTES === 0) return `${minutes / DAY_MINUTES} ${minutes === DAY_MINUTES ? "dia" : "dias"} corridos`;
  const d = Math.floor(minutes / DAY_MINUTES);
  const h = Math.round((minutes % DAY_MINUTES) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export type AssemblyState = "IN_PROGRESS" | "LATE" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
export const ASSEMBLY_STATE_LABEL: Record<AssemblyState, string> = {
  IN_PROGRESS: "Em andamento",
  LATE: "Atrasada",
  SCHEDULED: "Agendada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

type EventLike = { status: string; startAt: Date; endAt: Date };

/**
 * Situação para a operação: concluída/cancelada como gravado; passou do fim
 * previsto sem concluir = atrasada; marcada como em andamento ou já dentro do
 * horário = em andamento; o resto, agendada.
 */
export function assemblyState(e: EventLike, now: Date): AssemblyState {
  if (e.status === "COMPLETED") return "COMPLETED";
  if (e.status === "CANCELLED") return "CANCELLED";
  if (e.endAt.getTime() <= now.getTime()) return "LATE";
  if (e.status === "IN_PROGRESS" || e.startAt.getTime() <= now.getTime()) return "IN_PROGRESS";
  return "SCHEDULED";
}

type Person = { responsibleId: string; participantIds: string[] };

/**
 * Conflitos: duas montagens ativas que se sobrepõem no horário e têm alguém
 * em comum (responsável ou equipe). Devolve, para cada id, os ids em conflito.
 */
export function scheduleConflicts<T extends EventLike & Person & { id: string }>(events: T[]): Map<string, string[]> {
  const active = events.filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED").sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const out = new Map<string, string[]>();
  const add = (a: string, b: string) => out.set(a, [...(out.get(a) ?? []), b]);
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const people = new Set([a.responsibleId, ...a.participantIds]);
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (b.startAt.getTime() >= a.endAt.getTime()) break;
      if ([b.responsibleId, ...b.participantIds].some((p) => people.has(p))) {
        add(a.id, b.id);
        add(b.id, a.id);
      }
    }
  }
  return out;
}

export type AssemblyKpis = { inProgress: number; scheduled: number; completedInPeriod: number; late: number; conflicts: number };

/**
 * Indicadores: em andamento e atrasadas valem agora; agendadas são as que
 * ainda vão começar dentro do período; concluídas, as concluídas no período
 * (pela data de conclusão; sem ela, pelo fim previsto).
 */
export function assemblyKpis<T extends EventLike & { id: string; completedAt?: Date | null }>(events: T[], now: Date, from: Date, to: Date, conflicts: Map<string, string[]>): AssemblyKpis {
  const k: AssemblyKpis = { inProgress: 0, scheduled: 0, completedInPeriod: 0, late: 0, conflicts: 0 };
  for (const e of events) {
    const s = assemblyState(e, now);
    if (s === "IN_PROGRESS") k.inProgress++;
    else if (s === "LATE") k.late++;
    else if (s === "SCHEDULED" && e.startAt < to) k.scheduled++;
    else if (s === "COMPLETED") {
      const at = e.completedAt ?? e.endAt;
      if (at >= from && at < to) k.completedInPeriod++;
    }
    if (conflicts.has(e.id)) k.conflicts++;
  }
  return k;
}

/** Tipos de agenda que são montagem (o mesmo filtro da tela Montagens). */
export const isAssemblyType = (name: string) => /montag|instala/i.test(name);
