/**
 * CRM comercial — regras puras: lista fixa de origem, temperatura da
 * oportunidade (pelo score) e do lead (pelo contato) e o painel por canal.
 */
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------- origem

/** Lista fixa de origem, a mesma em leads, clientes e negócios. */
export const ORIGINS = ["INSTAGRAM", "INDICACAO", "GOOGLE", "SITE", "ARQUITETO", "PARCEIROS", "OUTRO"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<Origin, string> = {
  INSTAGRAM: "Instagram",
  INDICACAO: "Indicação",
  GOOGLE: "Google",
  SITE: "Site",
  ARQUITETO: "Arquiteto",
  PARCEIROS: "Parceiros",
  OUTRO: "Outro",
};

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Texto livre de origem ("insta", "Indicação da Maria", "google ads") -> item da
 * lista. Sem como saber, devolve null: o texto original continua no campo
 * source/leadSource. A migration usa as mesmas palavras.
 */
export function normalizeOrigin(raw: string | null | undefined): Origin | null {
  if (!raw?.trim()) return null;
  const s = plain(raw);
  if (/insta|^ig$/.test(s)) return "INSTAGRAM";
  if (/indica|indicad/.test(s)) return "INDICACAO";
  if (/google/.test(s)) return "GOOGLE";
  if (/^site\b|website|landing|pagina/.test(s)) return "SITE";
  if (/arquitet/.test(s)) return "ARQUITETO";
  if (/parceir/.test(s)) return "PARCEIROS";
  if (/^outro/.test(s)) return "OUTRO";
  return null;
}

// ---------------------------------------------------------------- temperatura

export type Temperature = "QUENTE" | "MORNO" | "FRIO";
export const TEMPERATURE_LABEL: Record<Temperature, string> = { QUENTE: "Quente", MORNO: "Morno", FRIO: "Frio" };

/** Faixas do score da oportunidade (0–100): quente ≥ 70, morno 40–69, frio < 40. */
export const OPPORTUNITY_TEMPERATURE = { hotFrom: 70, warmFrom: 40 };

/**
 * Lead não tem score: vale o tempo desde o último contato — quente até 3 dias,
 * morno de 4 a 15, frio acima de 15 ou sem contato nenhum. Próximo contato
 * vencido não muda a temperatura: vira a marca "atrasado".
 */
export const LEAD_TEMPERATURE = { hotDays: 3, warmDays: 15 };

const DAY = 86_400_000;

/** Score 0–100 = probabilidade da etapa (peso 60) + valor relativo (25) + recência do último contato (15). */
export function opportunityScore(
  opp: { probability: number; estimatedValue: Prisma.Decimal | number; interactions: { occurredAt: Date }[]; expectedCloseAt: Date | null },
  now = Date.now()
) {
  const prob = Math.max(0, Math.min(100, opp.probability));
  const value = opp.estimatedValue == null ? 0 : Number(opp.estimatedValue);
  const valueScore = value <= 0 ? 0 : Math.min(25, Math.log10(value + 1) * 6);
  const last = opp.interactions[0]?.occurredAt;
  const daysSince = last ? (now - last.getTime()) / DAY : 999;
  const recencyScore = daysSince <= 3 ? 15 : daysSince <= 7 ? 11 : daysSince <= 15 ? 6 : daysSince <= 30 ? 2 : 0;
  return Math.round(prob * 0.6 + valueScore + recencyScore);
}

/** Temperatura só para oportunidade em aberto. */
export function opportunityTemperature(score: number, status: string): Temperature | null {
  if (status === "WON" || status === "LOST") return null;
  return score >= OPPORTUNITY_TEMPERATURE.hotFrom ? "QUENTE" : score >= OPPORTUNITY_TEMPERATURE.warmFrom ? "MORNO" : "FRIO";
}

export function leadTemperature(
  lead: { status: string; enteredAt: Date; lastContactAt: Date | null; nextContactAt: Date | null },
  now = new Date()
): { temperature: Temperature; overdue: boolean; reason: string } | null {
  if (lead.status === "CONVERTED" || lead.status === "LOST") return null;
  const overdue = lead.nextContactAt != null && lead.nextContactAt.getTime() < now.getTime();
  const late = overdue ? "; próximo contato vencido" : "";
  if (!lead.lastContactAt) return { temperature: "FRIO", overdue, reason: `sem contato desde a entrada${late}` };
  const days = Math.max(0, Math.floor((now.getTime() - lead.lastContactAt.getTime()) / DAY));
  const t: Temperature = days <= LEAD_TEMPERATURE.hotDays ? "QUENTE" : days <= LEAD_TEMPERATURE.warmDays ? "MORNO" : "FRIO";
  return { temperature: t, overdue, reason: `${days} dia(s) sem contato${late}` };
}

// ---------------------------------------------------------------- painel por canal

export type ChannelLead = { origin: Origin | null; status: string };
/** createdInPeriod: entrou no período; wonInPeriod: ganha (wonAt) no período */
export type ChannelOpportunity = { origin: Origin | null; createdInPeriod: boolean; wonInPeriod: boolean; estimatedValue: number };
export type ChannelRow = {
  origin: Origin | "SEM_ORIGEM";
  label: string;
  entrou: number;
  qualificou: number;
  converteu: number;
  perdeu: number;
  /** % dos leads que entraram e viraram negócio */
  taxaConversao: number;
  oportunidades: number;
  ganhos: number;
  valorVendido: number;
};

/**
 * Leads e oportunidades do período por origem. Qualificou = qualificado ou
 * convertido (passou da qualificação). Valor vendido = oportunidades ganhas
 * no período, mesmo que tenham entrado antes.
 */
export function channelPanel(leads: ChannelLead[], opps: ChannelOpportunity[]): ChannelRow[] {
  const keys: (Origin | "SEM_ORIGEM")[] = [...ORIGINS, "SEM_ORIGEM"];
  const rows = keys.map((k) => {
    const ls = leads.filter((l) => (l.origin ?? "SEM_ORIGEM") === k);
    const os = opps.filter((o) => (o.origin ?? "SEM_ORIGEM") === k);
    const won = os.filter((o) => o.wonInPeriod);
    const converteu = ls.filter((l) => l.status === "CONVERTED").length;
    return {
      origin: k,
      label: k === "SEM_ORIGEM" ? "Sem origem na lista" : ORIGIN_LABEL[k],
      entrou: ls.length,
      qualificou: ls.filter((l) => l.status === "QUALIFIED" || l.status === "CONVERTED").length,
      converteu,
      perdeu: ls.filter((l) => l.status === "LOST").length,
      taxaConversao: ls.length ? Math.round((converteu / ls.length) * 1000) / 10 : 0,
      oportunidades: os.filter((o) => o.createdInPeriod).length,
      ganhos: won.length,
      valorVendido: Math.round(won.reduce((a, o) => a + o.estimatedValue, 0)),
    };
  });
  return rows.filter((r) => r.entrou || r.oportunidades || r.ganhos).sort((a, b) => b.valorVendido - a.valorVendido || b.entrou - a.entrou);
}

// ---------------------------------------------------------------- lead

/**
 * Situação que o lead pode receber. Ele entra como lead (novo, contatado ou
 * qualificado); convertido só pela conversão, que cria a oportunidade; perdido
 * exige o motivo. `current` vazio = cadastro novo.
 */
export function leadStatusProblem(next: string | undefined, lostReasonCode: string | null | undefined, current?: string | null): string | null {
  if (next === "CONVERTED" && current !== "CONVERTED") return current == null ? "O lead entra como lead: a conversão cria a oportunidade depois" : "Use Converter: a conversão cria a oportunidade e liga o cliente";
  if (next === "LOST" && current !== "LOST" && !lostReasonCode) return "Informe o motivo da perda";
  return null;
}
