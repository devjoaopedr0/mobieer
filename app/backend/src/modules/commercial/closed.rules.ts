/**
 * Definição única de "fechado" no sistema: oportunidade ganha (status WON) com
 * wonAt no período. Perdida: status LOST atualizada no período (a oportunidade
 * não guarda a data da perda). O painel da operação e o painel comercial usam
 * estes filtros — não crie outra definição.
 */
type Range = { gte?: Date; gt?: Date; lt?: Date; lte?: Date };

export const closedWhere = (range: Range) => ({ status: "WON" as const, wonAt: range });
export const lostWhere = (range: Range) => ({ status: "LOST" as const, updatedAt: range });

/** Taxa de conversão do período: fechados ÷ (fechados + perdidos), em %. */
export const closeRate = (won: number, lost: number) => (won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0);

/** Início do mês e agora: o período padrão do painel. */
export function defaultMonth(now = new Date()) {
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}
