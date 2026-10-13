/**
 * Planejamento da semana da produção: quem faz o quê em cada dia, com as
 * subtarefas de cada serviço. Aqui ficam as contas de data e a leitura do
 * texto que a loja já escreve no WhatsApp — regras puras, sem banco.
 *
 * Formato lido:
 *   PLANEJAMENTO SEMANA 13/10 - 16/10
 *   TERÇA FEIRA:
 *   *VIVIANE*
 *   finalizar a cozinha
 *   -corte da viga
 *   -rasgo de fundo
 */

export type PlanItem = { text: string; done: boolean };
export type ParsedTask = { date: string; person: string; title: string; items: PlanItem[] };

const DAY = 86_400_000;
const TZ = "America/Fortaleza";
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (day: string) => new Date(`${day}T12:00:00Z`);

/** Hoje, no fuso da loja (aaaa-mm-dd). */
export const todayIso = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: TZ });

export const addDays = (day: string, n: number) => iso(new Date(at(day).getTime() + n * DAY));

/** Segunda-feira da semana de um dia. */
export function mondayOf(day: string): string {
  const d = at(day);
  const wd = d.getUTCDay(); // 0 = domingo
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** Segunda a sábado da semana. */
export const weekDays = (monday: string) => Array.from({ length: 6 }, (_, i) => addDays(monday, i));

/** O dia, guardado ao meio-dia UTC: não muda de data em nenhum fuso. */
export const dayToDate = (day: string) => at(day);
export const dateToDay = (d: Date) => iso(d);

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/^seg/, 0],
  [/^ter/, 1],
  [/^qua/, 2],
  [/^qui/, 3],
  [/^sex/, 4],
  [/^sab/, 5],
];
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
/** tira os asteriscos do negrito do WhatsApp e a pontuação de enfeite das pontas */
const unwrap = (s: string) => clean(s.replace(/^[*_~\s]+|[*_~\s:]+$/g, ""));

/** "TERÇA FEIRA:", "*quinta-feira*", "Sábado" → 1, 3, 5; outra coisa → null */
export function weekdayIndex(line: string): number | null {
  const t = plain(unwrap(line)).replace(/[-\s]*feira$/, "").trim();
  if (!/^[a-z]+$/.test(t)) return null;
  return WEEKDAY_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

/** A semana citada no cabeçalho ("SEMANA 13/10 - 16/10"): devolve a segunda-feira dela. */
export function weekFromHeader(text: string, today: string): string | null {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null;
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
  let candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (Number.isNaN(at(candidate).getTime()) || iso(at(candidate)) !== candidate) return null;
  if (!m[3]) {
    // sem ano escrito: o mais perto de hoje (planejamento de janeiro escrito em dezembro)
    const diff = (at(candidate).getTime() - at(today).getTime()) / DAY;
    if (diff < -200) year += 1;
    else if (diff > 200) year -= 1;
    candidate = `${year}-${pad(month)}-${pad(day)}`;
  }
  return mondayOf(candidate);
}

/**
 * Lê o planejamento escrito à mão. O que não der para encaixar (tarefa antes de
 * um dia ou de um nome) vira aviso, em vez de ser adivinhado.
 */
export function parseWeekPlan(text: string, today = todayIso()): { weekStart: string; tasks: ParsedTask[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " "));
  const warnings: string[] = [];
  const headerLine = lines.find((l) => /semana|planejamento/i.test(plain(l)) && /\d{1,2}\s*\/\s*\d{1,2}/.test(l));
  const fromHeader = headerLine ? weekFromHeader(headerLine, today) : null;
  const weekStart = fromHeader ?? mondayOf(today);
  if (!fromHeader) warnings.push(`Não achei a data da semana no texto; usei a semana atual (${weekStart.split("-").reverse().join("/")}).`);

  const tasks: ParsedTask[] = [];
  let date: string | null = null;
  let person: string | null = null;
  let last: ParsedTask | null = null;

  for (const raw of lines) {
    const line = clean(raw);
    if (!line || line === headerLine?.trim() || (headerLine && clean(headerLine) === line)) continue;
    const wd = weekdayIndex(line);
    if (wd !== null) {
      date = addDays(weekStart, wd);
      person = null;
      last = null;
      continue;
    }
    // nome da pessoa: uma linha inteira entre asteriscos, ou terminada em dois-pontos
    const named = /^\*[^*]+\*\s*:?$/.test(line) || /^[^\d-][^:]{1,40}:$/.test(line);
    if (named) {
      person = unwrap(line).toUpperCase().slice(0, 60);
      last = null;
      continue;
    }
    const sub = /^[-–•·]\s*(.+)$/.exec(line);
    if (sub && last) {
      last.items.push({ text: clean(sub[1]).slice(0, 200), done: false });
      continue;
    }
    const title = clean(sub ? sub[1] : line).slice(0, 200);
    if (!title) continue;
    if (!date || !person) {
      warnings.push(`"${title}" ficou de fora: veio antes de ${!date ? "um dia da semana" : "um nome"}.`);
      continue;
    }
    last = { date, person, title, items: [] };
    tasks.push(last);
  }
  if (!tasks.length) warnings.push("Não encontrei nenhuma tarefa no texto. Confira se há os dias da semana e os nomes entre asteriscos.");
  return { weekStart, tasks, warnings };
}

/** Subtarefas vindas do banco ou da tela, limpas e com teto. */
export function normalizeItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => (i && typeof i === "object" ? { text: clean(String((i as { text?: unknown }).text ?? "")).slice(0, 200), done: Boolean((i as { done?: unknown }).done) } : null))
    .filter((i): i is PlanItem => Boolean(i && i.text))
    .slice(0, 30);
}

/** Uma tarefa com subtarefas está feita quando todas estão; sem subtarefas, vale a marca dela. */
export const isDone = (t: { done: boolean; items: PlanItem[] }) => (t.items.length ? t.items.every((i) => i.done) : t.done);

/** Resumo da semana por pessoa: quantas tarefas e quantas feitas. */
export function summarize(tasks: { person: string; done: boolean; items: PlanItem[] }[]): { person: string; total: number; done: number }[] {
  const map = new Map<string, { person: string; total: number; done: number }>();
  for (const t of tasks) {
    const cur = map.get(t.person) ?? { person: t.person, total: 0, done: 0 };
    cur.total += 1;
    if (isDone(t)) cur.done += 1;
    map.set(t.person, cur);
  }
  return [...map.values()];
}
