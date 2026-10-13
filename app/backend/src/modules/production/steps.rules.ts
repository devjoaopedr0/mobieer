/**
 * §23/§24 — Regras puras das etapas do pedido na fábrica: ordem, prazo padrão,
 * planejamento das datas, transições de status e qual aviso cabe a cada etapa.
 */
import type { ProductionStepKey, ProductionStepStatus } from "@prisma/client";

export const STEP_ORDER: ProductionStepKey[] = [
  "PLANO_CORTE",
  "CORTE",
  "FITA_BORDA",
  "PECAS_ESPECIAIS",
  "LIMPEZA",
  "EMBALAGEM",
  "PRE_MONTAGEM",
  "LIBERACAO",
  "SAIDA",
];

export const STEP_LABEL: Record<ProductionStepKey, string> = {
  PLANO_CORTE: "Plano de corte",
  CORTE: "Corte",
  FITA_BORDA: "Fita de borda",
  PECAS_ESPECIAIS: "Peças especiais",
  LIMPEZA: "Limpeza",
  EMBALAGEM: "Embalagem",
  PRE_MONTAGEM: "Pré-montagem",
  LIBERACAO: "Liberação",
  SAIDA: "Saída",
};

export const STEP_STATUS_LABEL: Record<ProductionStepStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
  SKIPPED: "Não se aplica",
};

/** Dias úteis padrão de cada etapa; a organização pode sobrescrever (Setting `production.stepDays`). */
export const DEFAULT_STEP_DAYS: Record<ProductionStepKey, number> = {
  PLANO_CORTE: 1,
  CORTE: 2,
  FITA_BORDA: 2,
  PECAS_ESPECIAIS: 3,
  LIMPEZA: 1,
  EMBALAGEM: 1,
  PRE_MONTAGEM: 2,
  LIBERACAO: 1,
  SAIDA: 1,
};

/** Lê a configuração salva, aceitando só chaves conhecidas e inteiros de 0 a 60. */
export function parseStepDays(raw: string | null | undefined): Record<ProductionStepKey, number> {
  const out = { ...DEFAULT_STEP_DAYS };
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of STEP_ORDER) {
      const v = Number(obj[k]);
      if (Number.isInteger(v) && v >= 0 && v <= 60) out[k] = v;
    }
  } catch {
    // configuração corrompida não derruba a produção: volta ao padrão
  }
  return out;
}

/** Soma dias úteis (seg–sex). Feriado fica por conta de quem ajusta o prazo. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/**
 * Prazos em cascata a partir da liberação: cada etapa vence `dias` úteis
 * depois do prazo da anterior. Etapa com 0 dia vence junto com a anterior.
 */
export function planDueDates(start: Date, days: Record<ProductionStepKey, number>): Record<ProductionStepKey, Date> {
  const out = {} as Record<ProductionStepKey, Date>;
  let cursor = start;
  for (const k of STEP_ORDER) {
    cursor = addBusinessDays(cursor, days[k]);
    out[k] = cursor;
  }
  return out;
}

export type StepAction = "START" | "COMPLETE" | "BLOCK" | "UNBLOCK" | "SKIP" | "REOPEN";

export function nextStepStatus(
  atual: ProductionStepStatus,
  acao: StepAction
): { ok: true; status: ProductionStepStatus } | { ok: false; motivo: string } {
  const recusa = (m: string) => ({ ok: false as const, motivo: m });
  switch (acao) {
    case "START":
      return atual === "PENDING" ? { ok: true, status: "IN_PROGRESS" } : recusa(`Etapa "${STEP_STATUS_LABEL[atual]}" não pode ser iniciada`);
    case "COMPLETE":
      // concluir direto de pendente vale para etapa rápida que ninguém "iniciou"
      return atual === "PENDING" || atual === "IN_PROGRESS"
        ? { ok: true, status: "DONE" }
        : recusa(atual === "BLOCKED" ? "Desbloqueie a etapa antes de concluir" : `Etapa "${STEP_STATUS_LABEL[atual]}" não pode ser concluída`);
    case "BLOCK":
      return atual === "PENDING" || atual === "IN_PROGRESS" ? { ok: true, status: "BLOCKED" } : recusa(`Etapa "${STEP_STATUS_LABEL[atual]}" não pode ser bloqueada`);
    case "UNBLOCK":
      return atual === "BLOCKED" ? { ok: true, status: "IN_PROGRESS" } : recusa("A etapa não está bloqueada");
    case "SKIP":
      return atual === "PENDING" ? { ok: true, status: "SKIPPED" } : recusa("Só etapa pendente pode ser marcada como não se aplica");
    case "REOPEN":
      return atual === "DONE" || atual === "SKIPPED" ? { ok: true, status: "IN_PROGRESS" } : recusa("Só etapa concluída ou dispensada pode ser reaberta");
  }
}

export const isOpenStep = (s: ProductionStepStatus) => s === "PENDING" || s === "IN_PROGRESS" || s === "BLOCKED";

// ---------------- kanban da produção: um cartão por pedido ----------------

type BoardStep = { id: string; step: ProductionStepKey; position: number; status: ProductionStepStatus };

/** A etapa em que o pedido está: a primeira ainda aberta. Tudo concluído → null. */
export function currentStep<T extends BoardStep>(steps: T[]): T | null {
  return [...steps].sort((a, b) => a.position - b.position).find((s) => isOpenStep(s.status)) ?? null;
}

/**
 * Arrastar o cartão para uma etapa à frente: conclui as etapas abertas do caminho
 * e inicia a de destino. Não volta etapa (isso é reabrir, no pedido) e não passa
 * por cima de etapa bloqueada.
 */
export function planBoardMove(
  steps: BoardStep[],
  to: ProductionStepKey
): { ok: true; actions: { id: string; step: ProductionStepKey; action: "COMPLETE" | "START" }[] } | { ok: false; motivo: string } {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const target = ordered.find((s) => s.step === to);
  const cur = currentStep(ordered);
  if (!target) return { ok: false, motivo: "Etapa de destino não existe neste pedido" };
  if (!cur) return { ok: false, motivo: "Este pedido já concluiu todas as etapas" };
  if (target.position < cur.position) return { ok: false, motivo: `Para voltar à etapa "${STEP_LABEL[to]}", reabra a etapa dentro do pedido` };
  if (target.status === "SKIPPED" || target.status === "DONE") return { ok: false, motivo: `A etapa "${STEP_LABEL[to]}" já está ${STEP_STATUS_LABEL[target.status].toLowerCase()} neste pedido` };
  const path = ordered.filter((s) => s.position >= cur.position && s.position <= target.position);
  const blocked = path.find((s) => s.status === "BLOCKED");
  if (blocked) return { ok: false, motivo: `A etapa "${STEP_LABEL[blocked.step]}" está bloqueada. Desbloqueie antes de avançar` };
  const actions: { id: string; step: ProductionStepKey; action: "COMPLETE" | "START" }[] = path
    .filter((s) => s.id !== target.id && isOpenStep(s.status))
    .map((s) => ({ id: s.id, step: s.step, action: "COMPLETE" as const }));
  if (target.status === "PENDING") actions.push({ id: target.id, step: target.step, action: "START" });
  if (!actions.length) return { ok: false, motivo: "O pedido já está nesta etapa" };
  return { ok: true, actions };
}

/**
 * Aviso que a etapa merece hoje. DUE_SOON: vence em até 1 dia. OVERDUE: já
 * venceu. Dedup: o mesmo tipo não repete em menos de 24h, mas a passagem de
 * "próximo" para "vencido" avisa na hora.
 */
export function stepAlert(
  s: { status: ProductionStepStatus; dueAt: Date | null; lastAlertKind: string | null; lastAlertAt: Date | null },
  now: Date
): "DUE_SOON" | "OVERDUE" | null {
  if (!isOpenStep(s.status) || !s.dueAt) return null;
  const DAY = 86_400_000;
  const kind = s.dueAt.getTime() < now.getTime() ? "OVERDUE" : s.dueAt.getTime() - now.getTime() <= DAY ? "DUE_SOON" : null;
  if (!kind) return null;
  if (s.lastAlertKind === kind && s.lastAlertAt && now.getTime() - s.lastAlertAt.getTime() < DAY) return null;
  return kind;
}

/** Dias de atraso (inteiro, >= 0) de uma etapa aberta. */
export function daysLate(dueAt: Date | null, status: ProductionStepStatus, now: Date) {
  if (!dueAt || !isOpenStep(status)) return 0;
  return Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000));
}
