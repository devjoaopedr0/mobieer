/**
 * Vistoria por ambiente: uma linha por ambiente da obra, com situação, fotos e
 * pendências. Regras puras, sem banco.
 *
 * Peça faltante aberta bloqueia a conclusão (APROVADO) do ambiente — a montagem
 * pode começar e seguir, só não dá para dar o ambiente como entregue.
 */

export const ROOM_STATUS_LABEL: Record<string, string> = {
  NAO_VISTORIADO: "Não vistoriado",
  APROVADO: "Concluído",
  COM_PENDENCIA: "Com pendência",
  REPROVADO: "Reprovado",
};

export const PENDENCY_KIND_LABEL: Record<string, string> = {
  PECA_FALTANTE: "Peça faltante",
  MUDANCA_AMBIENTE: "Mudança de ambiente",
  OUTRA: "Outra",
};

type Pendency = { kind: string; status: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Ambientes com que a vistoria nasce: os cadastrados no projeto; sem eles, o
 * texto livre ("Cozinha, Closet e Suíte"). Nomes repetidos entram uma vez.
 */
export function initialRooms(projectRooms: { id: string; name: string }[], ambientes: string | null | undefined): { projectRoomId: string | null; name: string }[] {
  const seen = new Set<string>();
  const once = (name: string) => {
    const k = name.toLowerCase();
    if (!name || seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  if (projectRooms.length) return projectRooms.map((r) => ({ projectRoomId: r.id, name: clean(r.name).slice(0, 120) })).filter((r) => once(r.name));
  return (ambientes ?? "")
    .split(/[,;/\n]|\s+e\s+/i)
    .map((n) => clean(n).slice(0, 120))
    .filter(once)
    .map((name) => ({ projectRoomId: null, name }));
}

/** Por que o ambiente não pode ir para essa situação (null = pode). */
export function roomStatusProblem(status: string, pendencies: Pendency[]): string | null {
  if (status !== "APROVADO") return null;
  const missing = pendencies.filter((p) => p.status === "ABERTA" && p.kind === "PECA_FALTANTE").length;
  if (missing) return `Há ${missing} peça(s) faltante(s) em aberto neste ambiente: resolva antes de concluir`;
  return null;
}

/** Situação depois de abrir uma pendência: ambiente concluído ou sem vistoria passa a "com pendência". */
export const statusAfterNewPendency = (current: string) => (current === "REPROVADO" ? current : "COM_PENDENCIA");

/** Confere a passagem de uma pendência para outro ambiente da mesma vistoria. */
export function transferProblem(p: { status: string; roomId: string; inspectionId: string }, to: { id: string; inspectionId: string } | null): string | null {
  if (!to || to.inspectionId !== p.inspectionId) return "Escolha um ambiente desta vistoria";
  if (p.status !== "ABERTA") return "Só pendência em aberto pode mudar de ambiente";
  if (to.id === p.roomId) return "A pendência já está neste ambiente";
  return null;
}

/**
 * Conferência extra para concluir a vistoria: todo ambiente vistoriado e, para
 * sair "sem ressalvas", nenhuma pendência em aberto.
 */
export function roomsCompleteProblem(rooms: { name: string; status: string }[], pendencies: Pendency[], result: string): string | null {
  const blank = rooms.filter((r) => r.status === "NAO_VISTORIADO");
  if (blank.length) return `${blank.length} ambiente(s) sem vistoria (${blank.slice(0, 3).map((r) => r.name).join(", ")}${blank.length > 3 ? "…" : ""})`;
  const open = pendencies.filter((p) => p.status === "ABERTA").length;
  if (result === "APPROVED" && open) return `Há ${open} pendência(s) em aberto nos ambientes: registre como "aprovada com ressalvas" ou resolva antes`;
  return null;
}

/** Texto das pendências em aberto, por ambiente — vai para o relatório quando ninguém escreveu à mão. */
export function pendencyText(rooms: { name: string; pendencies: (Pendency & { description: string; targetRoomName?: string | null })[] }[]): string {
  const lines: string[] = [];
  for (const r of rooms) {
    const open = r.pendencies.filter((p) => p.status === "ABERTA");
    if (!open.length) continue;
    lines.push(`${r.name}:`);
    for (const p of open) lines.push(`- ${PENDENCY_KIND_LABEL[p.kind] ?? "Pendência"}: ${p.description}${p.kind === "MUDANCA_AMBIENTE" && p.targetRoomName ? ` (vai para ${p.targetRoomName})` : ""}`);
  }
  return lines.join("\n");
}
