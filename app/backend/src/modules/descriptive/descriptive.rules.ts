/**
 * Descritiva do projeto (o PDF de apresentação por ambiente, no modelo da loja):
 * capa, moodboard de cada ambiente com os acabamentos, as imagens 3D com o texto
 * que descreve os móveis e a página de processos com os prazos.
 *
 * Regras puras: sugestão a partir do orçamento, leitura da resposta da IA e
 * validação do que a tela salva.
 */
import { quoteRooms } from "../commercial/quote.rules";

export const FINISH_KINDS = ["MDF", "METALURGIA", "USINAGEM", "OUTRO"] as const;
export type FinishKind = (typeof FINISH_KINDS)[number];
export const FINISH_KIND_LABEL: Record<FinishKind, string> = { MDF: "Chapas de MDF", METALURGIA: "Metalurgia", USINAGEM: "Usinagens", OUTRO: "Outros" };

export type Finish = { name: string; kind: FinishKind; color: string | null };
export type DescriptiveRoom = { room: string; include: boolean; finishes: Finish[]; text: string; renderIds: string[] };
export type DescriptiveData = { designer: string; note: string; rooms: DescriptiveRoom[]; processes: { title: string; detail: string }[] };

export const DEFAULT_NOTE = "ESTE CONTRATO NÃO CONTEMPLA LEDS, ACOLCHOADOS, DECORATIVOS";

/** Página de processos da descritiva da loja. A fabricação usa o prazo do orçamento. */
export function defaultProcesses(deliveryDays: number): { title: string; detail: string }[] {
  return [
    { title: "Assinatura do contrato", detail: "" },
    { title: "Medição", detail: "Até 2 dias úteis para o agendamento." },
    { title: "Elaboração do projeto técnico", detail: "Até 12 dias úteis para elaboração da pasta técnica." },
    { title: "Correção do projeto técnico", detail: "Até 5 dias úteis para correção." },
    { title: "Aprovação do projeto técnico", detail: "Aprovação feita pelo cliente ou responsável." },
    { title: "Fabricação", detail: `${deliveryDays} dias úteis.` },
    { title: "Entrega do material", detail: "Agendamento feito com 3 dias de antecedência." },
    { title: "Início da montagem", detail: "Até 5 dias úteis para iniciar." },
  ];
}

/** Cores conhecidas dos acabamentos da loja (o resto a IA sugere ou fica neutro). */
const KNOWN_COLORS: [RegExp, string][] = [
  [/branco\s*(tx|diamante|cristallo)?/i, "#F2F1EE"],
  [/preto/i, "#1E1E1E"],
  [/cinza\s*cristal/i, "#BDBBB6"],
  [/cinza\s*sagrado/i, "#8E8A84"],
  [/cinza/i, "#9C9C9A"],
  [/areia/i, "#D8C9B0"],
  [/freij[oó]/i, "#B08A5E"],
  [/carvalho/i, "#B59470"],
  [/pau\s*ferro/i, "#5E3B2A"],
  [/louro/i, "#A9825A"],
  [/gianduia/i, "#8A6E57"],
  [/quartzo/i, "#CFC9C1"],
  [/verde\s*jade/i, "#9DB39A"],
  [/azul\s*secreto/i, "#245E6B"],
  [/azul\s*astral/i, "#7B97A3"],
  [/lavanda/i, "#B9A9C9"],
  [/sal\s*rosa/i, "#E3C2BB"],
  [/viena/i, "#D9CFC2"],
  [/dourad|champagne/i, "#C8A15A"],
  [/prata|alum[ií]nio|espelho/i, "#C0C3C6"],
];

export function knownColor(name: string): string | null {
  for (const [re, hex] of KNOWN_COLORS) if (re.test(name)) return hex;
  return null;
}

const METAL = /puxador|metalon|perfil|alum[ií]nio|espelho|vidro|metal|dobradi|corredi/i;
const MACHINING = /curv|arredond|ripad|moldur|proven[cç]al|canelad|usinag|chanfr|org[aâ]nic|rasgo/i;

/** Tipo do acabamento pelo nome: puxador e metal são metalurgia; curvo, ripado… são usinagem. */
export function guessKind(name: string, field?: string): FinishKind {
  if (field === "puxador" || METAL.test(name)) return "METALURGIA";
  if (MACHINING.test(name)) return "USINAGEM";
  if (field === "corpo" || field === "porta" || /mdf|tx|branco|cinza|madeira|carvalho|freij|louro/i.test(name)) return "MDF";
  return field === "modelo" ? "USINAGEM" : "OUTRO";
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Acabamentos de um campo do orçamento: "Branco TX / Freijó" vira dois. */
export function splitFinishes(value: string | null | undefined): string[] {
  return clean(value)
    .split(/\s*(?:\/|;|\+|,|\s+e\s+)\s*/i)
    .map((s) => s.replace(/^(mdf|cor)\s*:\s*/i, "").trim())
    .filter((s) => s.length >= 2);
}

type QuoteItem = { room: string | null; description: string; corpo: string | null; porta: string | null; puxador: string | null; complemento: string | null; modelo: string | null };

/** Sugestão inicial: ambientes, acabamentos e texto saem do orçamento; imagens, dos renders do ambiente. */
export function suggestFromQuote(items: QuoteItem[], renders: { id: string; room: string }[], designer: string, deliveryDays: number): DescriptiveData {
  const rooms = quoteRooms(items).map((room) => {
    const key = room.toLowerCase();
    const mine = items.filter((it) => clean(it.room || it.description).toLowerCase() === key);
    const finishes: Finish[] = [];
    for (const it of mine) {
      for (const field of ["corpo", "porta", "puxador", "complemento", "modelo"] as const) {
        for (const name of splitFinishes(it[field])) {
          const upper = name.toUpperCase();
          if (finishes.some((f) => f.name === upper)) continue;
          finishes.push({ name: upper, kind: guessKind(name, field), color: knownColor(name) });
        }
      }
    }
    const text = mine
      .map((it) => clean(it.room ? it.description : ""))
      .filter((t) => t && t.toLowerCase() !== key)
      .map((t) => t.toUpperCase())
      .join("\n");
    return { room, include: true, finishes: finishes.slice(0, 16), text, renderIds: renders.filter((r) => r.room.trim().toLowerCase() === key).map((r) => r.id).slice(0, 6) };
  });
  return { designer, note: DEFAULT_NOTE, rooms, processes: defaultProcesses(deliveryDays) };
}

/** Pedido para a IA: descrever cada ambiente no estilo da loja, sem inventar móvel. */
export function aiPrompt(rooms: { room: string; text: string; finishes: string[] }[]): { system: string; prompt: string } {
  const system = [
    "Você escreve a DESCRITIVA de móveis planejados da loja Mobieer, para o cliente.",
    "Para cada ambiente, descreva os móveis em linhas curtas, em MAIÚSCULAS, uma peça por linha, terminando com ponto, no estilo:",
    "ARMÁRIO ALTO COM 3 PORTAS DE GIRO EM MDF 15MM CINZA CRISTAL.",
    "CAIXARIA E PRATELEIRAS INTERNAS EM MDF 15MM BRANCO TX.",
    "Use só o que está nos dados do orçamento: não invente móveis, medidas, quantidades nem acabamentos. Se a informação for pouca, escreva pouco.",
    "Para cada acabamento, diga o tipo (MDF, METALURGIA para puxadores e metais, USINAGEM para curvo/ripado/moldurado, OUTRO) e uma cor aproximada em hexadecimal (#RRGGBB) para o quadro de cores; para metal ou acabamento sem cor clara, use null.",
    'Responda só JSON: {"rooms":[{"room":"nome exato do ambiente","text":"linhas separadas por \\n","finishes":[{"name":"NOME","kind":"MDF","color":"#RRGGBB"}]}]}',
  ].join("\n");
  const prompt = JSON.stringify({ ambientes: rooms.map((r) => ({ ambiente: r.room, descricao_do_orcamento: r.text, acabamentos: r.finishes })) });
  return { system, prompt };
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Junta a resposta da IA ao que já está na tela: só ambientes que existem,
 * texto limitado e cor válida. O que a IA não mandou fica como estava.
 */
export function mergeAiAnswer(current: DescriptiveRoom[], raw: string): { rooms: DescriptiveRoom[]; updated: number } {
  let parsed: unknown;
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    parsed = JSON.parse(json);
  } catch {
    return { rooms: current, updated: 0 };
  }
  const list = (parsed as { rooms?: unknown }).rooms;
  if (!Array.isArray(list)) return { rooms: current, updated: 0 };
  let updated = 0;
  const rooms = current.map((r) => {
    const a = list.find((x) => typeof x === "object" && x && String((x as { room?: unknown }).room ?? "").trim().toLowerCase() === r.room.toLowerCase()) as
      | { text?: unknown; finishes?: unknown }
      | undefined;
    if (!a) return r;
    updated++;
    const text = typeof a.text === "string" && a.text.trim() ? a.text.trim().slice(0, 3000) : r.text;
    const finishes = Array.isArray(a.finishes)
      ? a.finishes
          .map((f) => f as { name?: unknown; kind?: unknown; color?: unknown })
          .filter((f) => typeof f.name === "string" && f.name.trim())
          .slice(0, 16)
          .map((f) => {
            const name = String(f.name).trim().toUpperCase().slice(0, 60);
            const kind = FINISH_KINDS.includes(f.kind as FinishKind) ? (f.kind as FinishKind) : guessKind(name);
            // cor conhecida da loja vale mais que o palpite da IA
            const color = knownColor(name) ?? (typeof f.color === "string" && HEX.test(f.color) ? f.color.toUpperCase() : null);
            return { name, kind, color };
          })
      : r.finishes;
    return { ...r, text, finishes: finishes.length ? finishes : r.finishes };
  });
  return { rooms, updated };
}
