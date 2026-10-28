/**
 * Roteiro de produção por peça — regras puras.
 *
 * O roteiro base tem 9 etapas, cada uma com a sua instrução. O tipo da peça
 * (lateral, porta…) pode pular uma etapa, acrescentar à instrução ou trocá-la.
 * A peça anda em sequência: só marca uma etapa depois das anteriores que se
 * aplicam a ela. Quando todas as peças do pedido fecham as etapas ligadas a uma
 * etapa do pedido (ProductionStep), essa etapa do pedido pode ser concluída.
 */
import type { PieceStepStatus, ProductionStepKey, RouteOverrideAction } from "@prisma/client";

export type BaseStep = { position: number; name: string; instruction: string | null; requirePhoto: boolean; productionStep: ProductionStepKey | null };

/**
 * As 9 etapas base, como a fábrica passou (Separação e Limpeza saíram por não
 * terem instrução). A Etiqueta pede foto da conferência de medidas por padrão.
 * A ligação com a etapa do pedido (productionStep) é o ponto de partida; o
 * administrador ajusta na tela do roteiro.
 */
export const BASE_ROUTE: BaseStep[] = [
  { position: 1, name: "Corte", instruction: "Atenção, cuidado, limpeza da máquina", requirePhoto: false, productionStep: "CORTE" },
  { position: 2, name: "Etiqueta", instruction: "Conferência de medidas; colar na posição correta", requirePhoto: true, productionStep: null },
  { position: 3, name: "Fitamento", instruction: "Atenção, cuidado, limpeza da máquina", requirePhoto: false, productionStep: "FITA_BORDA" },
  { position: 4, name: "Refilamento", instruction: "Atenção, cuidado", requirePhoto: false, productionStep: null },
  { position: 5, name: "Rasgos", instruction: "Lateral, divisória, base", requirePhoto: false, productionStep: null },
  { position: 6, name: "Furos", instruction: "Prateleiras, portas", requirePhoto: false, productionStep: null },
  { position: 7, name: "Pré-montagem", instruction: "Caixarias", requirePhoto: false, productionStep: "PRE_MONTAGEM" },
  { position: 8, name: "Embalar", instruction: "Sarrafo não embala todo, só as pontas", requirePhoto: false, productionStep: "EMBALAGEM" },
  { position: 9, name: "Coleta", instruction: "Levar tudo embalado para a frente", requirePhoto: false, productionStep: null },
];

/** Tipos de peça de partida; a lista cresce pela tela do roteiro. */
export const DEFAULT_PIECE_TYPES = ["Lateral", "Divisória", "Base", "Prateleira", "Porta", "Caixaria"];

export const PIECE_STEP_STATUS_LABEL: Record<PieceStepStatus, string> = { PENDING: "Pendente", DONE: "Feita", NOT_APPLICABLE: "Não se aplica" };

export type StepDef = { id: string; position: number; name: string; instruction: string | null; requirePhoto: boolean; active: boolean };
export type OverrideDef = { routeStepId: string; action: RouteOverrideAction; instruction: string | null };

/** Etapa do roteiro base aplicada ao tipo da peça: se vale e qual instrução. */
export function resolveStep(step: StepDef, override: OverrideDef | null | undefined): { applies: boolean; instruction: string | null } {
  if (!step.active) return { applies: false, instruction: step.instruction };
  if (!override) return { applies: true, instruction: step.instruction };
  if (override.action === "SKIP") return { applies: false, instruction: step.instruction };
  const extra = override.instruction?.trim() || null;
  if (override.action === "REPLACE") return { applies: true, instruction: extra };
  return { applies: true, instruction: [step.instruction, extra].filter(Boolean).join(". ") || null };
}

/** Situação inicial de cada etapa para o tipo da peça (o que não se aplica já nasce assim). */
export function initialStatus(step: StepDef, override: OverrideDef | null | undefined): PieceStepStatus {
  return resolveStep(step, override).applies ? "PENDING" : "NOT_APPLICABLE";
}

export type ProgressDef = { routeStepId: string; position: number; status: PieceStepStatus };

/**
 * Pode marcar a etapa como feita? Em sequência: todas as anteriores precisam
 * estar feitas ou não se aplicar; e, se a etapa pede foto, a foto vem junto.
 */
export function canMarkDone(progress: ProgressDef[], routeStepId: string, o: { requirePhoto: boolean; hasPhoto: boolean }): { ok: true } | { ok: false; motivo: string } {
  const cur = progress.find((p) => p.routeStepId === routeStepId);
  if (!cur) return { ok: false, motivo: "Etapa não encontrada no roteiro da peça" };
  if (cur.status === "DONE") return { ok: false, motivo: "Etapa já marcada como feita" };
  if (cur.status === "NOT_APPLICABLE") return { ok: false, motivo: "Esta etapa não se aplica a este tipo de peça" };
  const pending = progress.filter((p) => p.position < cur.position && p.status === "PENDING").sort((a, b) => a.position - b.position);
  if (pending.length) return { ok: false, motivo: `Faça antes a etapa ${String(pending[0].position).padStart(2, "0")}` };
  if (o.requirePhoto && !o.hasPhoto) return { ok: false, motivo: "Esta etapa pede foto" };
  return { ok: true };
}

/** Desfazer: só a última etapa feita (para não deixar buraco na sequência). */
export function canUndo(progress: ProgressDef[], routeStepId: string): { ok: true } | { ok: false; motivo: string } {
  const cur = progress.find((p) => p.routeStepId === routeStepId);
  if (!cur || cur.status !== "DONE") return { ok: false, motivo: "Só etapa feita pode ser desfeita" };
  if (progress.some((p) => p.position > cur.position && p.status === "DONE")) return { ok: false, motivo: "Desfaça antes as etapas seguintes" };
  return { ok: true };
}

/** Etapa atual da peça: a primeira pendente; null = roteiro terminado. */
export function currentPieceStep(progress: ProgressDef[]): ProgressDef | null {
  return progress.filter((p) => p.status === "PENDING").sort((a, b) => a.position - b.position)[0] ?? null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

/**
 * Tipo sugerido pela descrição que veio da etiqueta ("PRATELEIRA MÓVEL" ->
 * Prateleira). Só sugere quando um tipo só aparece; quem confirma é a pessoa.
 */
export function suggestPieceType<T extends { id: string; name: string }>(description: string | null | undefined, types: T[]): T | null {
  if (!description?.trim()) return null;
  const words = new Set(norm(description).split(/[^A-Z0-9]+/).filter(Boolean));
  const stems = [...words].map((w) => w.replace(/(ES|S)$/, ""));
  const hits = types.filter((t) => {
    const n = norm(t.name).replace(/(ES|S)$/, "");
    return stems.includes(n) || words.has(norm(t.name));
  });
  return hits.length === 1 ? hits[0] : null;
}

export type OrderProgressRow = { itemId: string; routeStepId: string; status: PieceStepStatus };

/**
 * Ligação dos dois níveis: a etapa do pedido fecha quando, em todas as peças,
 * todas as etapas da peça ligadas a ela estão feitas ou não se aplicam — e pelo
 * menos uma foi feita (se nenhuma peça passa pela etapa, ninguém conclui sozinho).
 */
export function orderStepComplete(itemIds: string[], stepIds: string[], rows: OrderProgressRow[]): boolean {
  if (!itemIds.length || !stepIds.length) return false;
  let anyDone = false;
  for (const itemId of itemIds) {
    for (const stepId of stepIds) {
      const r = rows.find((x) => x.itemId === itemId && x.routeStepId === stepId);
      if (!r || r.status === "PENDING") return false;
      if (r.status === "DONE") anyDone = true;
    }
  }
  return anyDone;
}
