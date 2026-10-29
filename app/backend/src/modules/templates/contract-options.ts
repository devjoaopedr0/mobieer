/**
 * Cláusulas variáveis do contrato como opções, em vez de texto livre:
 *
 *   - tipo de pedido → prazo de fabricação ({{pedido.prazoFabricacao}} e {{pedido.tipo}})
 *   - pré-montagem na fábrica, sim ou não ({{contrato.preMontagem}})
 *
 * No modelo, um trecho que só vale para uma opção fica entre marcadores de
 * seção, cada um sozinho na linha:
 *
 *   {{#opcao.preMontagem}}      … só com pré-montagem …      {{/opcao.preMontagem}}
 *   {{^opcao.preMontagem}}      … só sem pré-montagem …      {{/opcao.preMontagem}}
 *   {{#opcao.pedidoEspecial}}   … só no pedido especial …    {{/opcao.pedidoEspecial}}
 *
 * Regras puras, sem banco.
 */
import { z } from "zod";

/** Tipo de pedido: o prazo começa no do orçamento e o especial soma dias (dá para mudar ao gerar). */
export const ORDER_TYPES = [
  { code: "PADRAO", label: "Pedido padrão", extraDays: 0 },
  { code: "ESPECIAL", label: "Pedido com itens especiais (vidro, metalon, laca ou iluminação)", extraDays: 15 },
] as const;
export type OrderType = (typeof ORDER_TYPES)[number]["code"];

export const contractOptionsSchema = z.object({
  tipoPedido: z.enum(ORDER_TYPES.map((t) => t.code) as [OrderType, ...OrderType[]]).default("PADRAO"),
  /** prazo de fabricação em dias úteis; vazio = o do tipo de pedido */
  prazoDias: z.coerce.number().int().min(1).max(365).nullable().optional(),
  preMontagem: z.boolean().default(true),
});
export type ContractOptions = z.infer<typeof contractOptionsSchema>;
export const DEFAULT_OPTIONS: ContractOptions = { tipoPedido: "PADRAO", prazoDias: null, preMontagem: true };

/** Prazo sugerido para o tipo de pedido, a partir do prazo do orçamento. */
export const suggestedDays = (tipo: OrderType, baseDays: number | null | undefined) =>
  baseDays != null && baseDays > 0 ? baseDays + (ORDER_TYPES.find((t) => t.code === tipo)?.extraDays ?? 0) : null;

/** Valores e chaves de seção que as opções escolhidas dão ao modelo. */
export function optionValues(opts: ContractOptions, baseDays: number | null | undefined) {
  const type = ORDER_TYPES.find((t) => t.code === opts.tipoPedido) ?? ORDER_TYPES[0];
  const days = opts.prazoDias ?? suggestedDays(type.code, baseDays);
  return {
    days,
    values: { "pedido.tipo": type.label, "contrato.preMontagem": opts.preMontagem ? "Sim" : "Não" } as Record<string, string>,
    flags: { "opcao.preMontagem": opts.preMontagem, "opcao.pedidoEspecial": type.code === "ESPECIAL", "opcao.pedidoPadrao": type.code === "PADRAO" } as Record<string, boolean>,
  };
}

/**
 * Tira do texto os trechos das opções que não valem. `{{#chave}}` mostra quando
 * a opção está ligada, `{{^chave}}` quando está desligada; os marcadores somem.
 * Chave desconhecida conta como desligada. Seção sem fim vai até o fim do texto.
 */
export function applySections(body: string, flags: Record<string, boolean>): string {
  const out: string[] = [];
  const stack: { key: string; show: boolean }[] = [];
  const visible = () => stack.every((s) => s.show);
  // onde havia marcador, a linha em branco seguinte não dobra o espaço
  let afterMarker = false;
  for (const line of body.split(/\r?\n/)) {
    const open = /^\s*\{\{\s*([#^])\s*([\w.]+)\s*\}\}\s*$/.exec(line);
    if (open) {
      const on = Boolean(flags[open[2]]);
      stack.push({ key: open[2], show: open[1] === "#" ? on : !on });
      afterMarker = true;
      continue;
    }
    const close = /^\s*\{\{\s*\/\s*([\w.]+)\s*\}\}\s*$/.exec(line);
    if (close) {
      const at = stack.map((s) => s.key).lastIndexOf(close[1]);
      if (at >= 0) stack.splice(at);
      afterMarker = true;
      continue;
    }
    if (!visible()) continue;
    if (afterMarker && !line.trim() && (!out.length || !out[out.length - 1].trim())) continue;
    afterMarker = afterMarker && !line.trim();
    out.push(line);
  }
  return out.join("\n");
}
