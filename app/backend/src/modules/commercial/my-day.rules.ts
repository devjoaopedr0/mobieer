/**
 * "Meu dia" do consultor e a visão das atividades da equipe — regras puras.
 *
 * Não há tabela nova de atividade: o que está por fazer já mora na próxima ação
 * da oportunidade, no retorno combinado do lead, na agenda e nas tarefas; o que
 * foi feito é a interação registrada (CommercialInteraction).
 */
const TZ = "America/Fortaleza";
export const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export type TodoKind = "OPORTUNIDADE" | "LEAD" | "AGENDA" | "TAREFA" | "DIARIO";
export type Todo = { kind: TodoKind; id: string; title: string; client: string | null; at: Date; link: string; sellerId: string | null; sellerName: string | null };

/** Atrasadas (antes de hoje), de hoje e próximas (até `days` dias), cada grupo em ordem de horário. */
export function splitAgenda(items: Todo[], now = new Date(), days = 7) {
  const today = dayKey(now);
  const limit = dayKey(new Date(now.getTime() + days * 86_400_000));
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    overdue: sorted.filter((i) => dayKey(i.at) < today),
    today: sorted.filter((i) => dayKey(i.at) === today),
    upcoming: sorted.filter((i) => dayKey(i.at) > today && dayKey(i.at) <= limit),
  };
}

export const INTERACTION_LABEL: Record<string, string> = {
  CALL: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  MEETING: "Reunião",
  VISIT: "Visita",
  FOLLOW_UP: "Follow-up",
  PROPOSAL: "Proposta",
  NEGOTIATION: "Negociação",
  INTERNAL_MESSAGE: "Mensagem interna",
  OTHER: "Outro",
  NOTE: "Anotação",
  PROJECT_CHANGE: "Alteração de projeto",
};

/** Contatos = falar com o cliente (ligação, WhatsApp, e-mail, visita, follow-up). */
const CONTACT = new Set(["CALL", "WHATSAPP", "EMAIL", "VISIT", "FOLLOW_UP"]);

export type DoneActivity = { type: string; responsibleId: string };
export type SellerActivity = {
  sellerId: string;
  total: number;
  contacts: number;
  followUps: number;
  meetings: number;
  proposals: number;
  byType: Record<string, number>;
};

/** Atividades feitas, por consultor. Propostas = interações de proposta + orçamentos enviados. */
export function activityBySeller(done: DoneActivity[], quotesSent: { sellerId: string }[]): SellerActivity[] {
  const map = new Map<string, SellerActivity>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { sellerId: id, total: 0, contacts: 0, followUps: 0, meetings: 0, proposals: 0, byType: {} }));
    return r;
  };
  for (const a of done) {
    const r = row(a.responsibleId);
    r.total += 1;
    r.byType[a.type] = (r.byType[a.type] ?? 0) + 1;
    if (CONTACT.has(a.type)) r.contacts += 1;
    if (a.type === "FOLLOW_UP") r.followUps += 1;
    if (a.type === "MEETING") r.meetings += 1;
    if (a.type === "PROPOSAL") r.proposals += 1;
  }
  for (const q of quotesSent) row(q.sellerId).proposals += 1;
  return [...map.values()].sort((a, b) => b.total - a.total);
}
