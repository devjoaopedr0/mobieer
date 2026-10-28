/**
 * Leitura da etiqueta da peça (foto tirada pelo montador). A IA de imagem
 * devolve o texto de cada campo da etiqueta como está; aqui ele vira sugestão
 * para os campos do item. Nada é gravado no item sem o montador confirmar.
 *
 * Etiqueta -> campo:
 *   Cliente                         -> clientName (da requisição)
 *   Projeto (COZINHA)               -> room (ambiente do item)
 *   Peça (código e nome)            -> description e pieceCode
 *   Dimensões (111,08 x 397 x 15,5) -> width 111,08 · length 397 · thickness 15,5
 *   Material (Branco 15mm)          -> material
 *   Fita (Fitar 1: 1-Branco)        -> edgeFinish
 *   Código do item (PRA8604A)       -> pieceCode
 *   ID do módulo (8421)             -> moduleRef
 *   Chapa/posição (Chapa 2, 20.C)   -> cutPlanRef ("Chapa 2 / posição 20.C")
 */

export type LabelSuggestion = {
  clientName: string | null;
  room: string | null;
  description: string | null;
  pieceCode: string | null;
  width: number | null;
  length: number | null;
  thickness: number | null;
  material: string | null;
  edgeFinish: string | null;
  moduleRef: string | null;
  cutPlanRef: string | null;
};

export function labelPrompt(): string {
  return [
    "Você lê a etiqueta de uma peça de móvel planejado (corte de chapa MDF).",
    "Copie o texto de cada campo exatamente como está na etiqueta. Campo que não aparece: null.",
    "Responda só com este JSON:",
    '{"cliente": string|null, "projeto": string|null, "peca_codigo": string|null, "peca_nome": string|null,',
    ' "dimensoes": string|null, "material": string|null, "fita": string|null, "codigo_item": string|null,',
    ' "modulo": string|null, "chapa": string|null, "posicao": string|null}',
    'Exemplo: {"cliente":"MARIA SOUZA","projeto":"COZINHA","peca_codigo":"PRA8604A","peca_nome":"PRATELEIRA",',
    '"dimensoes":"111,08 x 397 x 15,5","material":"Branco 15mm","fita":"Fitar 1: 1-Branco","codigo_item":"PRA8604A",',
    '"modulo":"8421","chapa":"Chapa 2","posicao":"20.C"}',
  ].join("\n");
}

const clean = (v: unknown, max = 200): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
};

/** "111,08" -> 111.08; "1.234,5" -> 1234.5 */
export function parseMm(raw: string): number | null {
  let s = raw.trim().replace(/\s*mm$/i, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null;
}

/**
 * Dimensões da etiqueta na ordem largura x comprimento x altura (espessura da chapa):
 * "111,08 x 397 x 15,5" -> largura 111,08, comprimento 397, altura 15,5.
 */
export function parseLabelDimensions(raw: string | null | undefined): { width: number | null; length: number | null; thickness: number | null } {
  const empty = { width: null, length: null, thickness: null };
  if (!raw) return empty;
  const parts = raw.split(/\s*[x×X*]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return empty;
  const [w, l, t] = parts.map(parseMm);
  return { width: w ?? null, length: l ?? null, thickness: t ?? null };
}

/** "Chapa 2" + "20.C" -> "Chapa 2 / posição 20.C" */
export function cutPlanText(sheet: string | null, position: string | null): string | null {
  const s = clean(sheet, 60);
  const p = clean(position, 60);
  if (s && p) return `${s} / posição ${p}`.slice(0, 120);
  return s ?? (p ? `posição ${p}` : null);
}

/** JSON da IA -> sugestão para o formulário. Aceita texto com lixo em volta do JSON. */
export function parseLabelReading(text: string): LabelSuggestion {
  let o: Record<string, unknown> = {};
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    o = start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>) : {};
  } catch {
    o = {};
  }
  const code = clean(o.codigo_item, 60) ?? clean(o.peca_codigo, 60);
  const name = clean(o.peca_nome, 200);
  const pieceCodeOnName = clean(o.peca_codigo, 60);
  // descrição: o nome da peça; se a etiqueta só traz o código, vale o código
  const description = name ?? pieceCodeOnName;
  const dims = parseLabelDimensions(clean(o.dimensoes, 80));
  return {
    clientName: clean(o.cliente, 150),
    room: clean(o.projeto, 120),
    description,
    pieceCode: code,
    ...dims,
    material: clean(o.material, 150),
    edgeFinish: clean(o.fita, 200),
    moduleRef: clean(o.modulo, 60),
    cutPlanRef: cutPlanText(clean(o.chapa, 60), clean(o.posicao, 60)),
  };
}

/** Leitura que não trouxe nada aproveitável (foto ruim, não é etiqueta). */
export const isEmptySuggestion = (s: LabelSuggestion) => Object.values(s).every((v) => v == null);
