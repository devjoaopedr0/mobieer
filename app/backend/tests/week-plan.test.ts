/**
 * Planejamento da semana da produção: datas e leitura do texto do WhatsApp.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { addDays, isDone, mondayOf, normalizeItems, parseWeekPlan, pendingItems, reasonLabel, summarize, taskStatus, weekDays, weekFromHeader, weekSummary, weekdayIndex } from "../src/modules/production/week-plan.rules";

const TEXTO = `LANEJAMENTO SEMANA 13/10 - 16-/10

TERÇA FEIRA:

*LARA*
portas de vidro
porta de passagem

*VIVIANE*
finalizar a cozinha
-corte da viga
-rasgo de fundo
-fitar tamponamentos
-pré montar

*GUILHERME*
at david bruno


QUARTA FEIRA:

*WESLEY*
banheiro funcionários

*QUINTA FEIRA*

*VIVIANE*
porta de passagem
curvo da sala

*SEXTA FEIRA*

*GUILHERME*
banheiro noah
banheiro casal`;

test("semana: segunda-feira, dias da semana e nomes dos dias", () => {
  assert.equal(mondayOf("2026-10-13"), "2026-10-12"); // terça
  assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // domingo fecha a semana
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
  assert.deepEqual(weekDays("2026-10-12"), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(["TERÇA FEIRA:", "*QUINTA FEIRA*", "quarta-feira", "Sábado", "SEGUNDA"].map(weekdayIndex), [1, 3, 2, 5, 0]);
  assert.equal(weekdayIndex("*LARA*"), null);
  assert.equal(weekdayIndex("sexta tem entrega"), null); // frase não é cabeçalho de dia
});

test("semana: a data do cabeçalho, com e sem ano", () => {
  assert.equal(weekFromHeader("SEMANA 13/10 - 16-/10", "2026-10-13"), "2026-10-12");
  assert.equal(weekFromHeader("semana 05/01", "2026-12-28"), "2027-01-04"); // janeiro escrito em dezembro
  assert.equal(weekFromHeader("semana 13/10/25", "2026-10-13"), "2025-10-13");
  assert.equal(weekFromHeader("semana 31/02", "2026-10-13"), null);
  assert.equal(weekFromHeader("sem data", "2026-10-13"), null);
});

test("planejamento colado do WhatsApp: dia, pessoa, tarefa e subtarefas", () => {
  const r = parseWeekPlan(TEXTO, "2026-10-13");
  assert.equal(r.weekStart, "2026-10-12");
  assert.deepEqual(r.warnings, []);
  assert.equal(r.tasks.length, 9);
  assert.deepEqual(r.tasks[0], { date: "2026-10-13", person: "LARA", title: "portas de vidro", items: [] });
  const cozinha = r.tasks.find((t) => t.title === "finalizar a cozinha")!;
  assert.equal(cozinha.person, "VIVIANE");
  assert.deepEqual(cozinha.items.map((i) => i.text), ["corte da viga", "rasgo de fundo", "fitar tamponamentos", "pré montar"]);
  assert.deepEqual(r.tasks.filter((t) => t.person === "GUILHERME").map((t) => `${t.date} ${t.title}`), ["2026-10-13 at david bruno", "2026-10-16 banheiro noah", "2026-10-16 banheiro casal"]);
  assert.equal(r.tasks.find((t) => t.person === "WESLEY")!.date, "2026-10-14");
  assert.deepEqual(r.tasks.filter((t) => t.date === "2026-10-15").map((t) => t.title), ["porta de passagem", "curvo da sala"]);
});

test("planejamento colado: o que não encaixa vira aviso, não é adivinhado", () => {
  const solto = parseWeekPlan("serviço sem dia\nTERÇA\nserviço sem nome\n*ANA*\nporta", "2026-10-13");
  assert.equal(solto.tasks.length, 1);
  assert.equal(solto.tasks[0].title, "porta");
  assert.equal(solto.warnings.length, 3); // sem data no cabeçalho + duas tarefas de fora
  assert.match(solto.warnings[1], /antes de um dia da semana/);
  assert.match(solto.warnings[2], /antes de um nome/);
  assert.match(parseWeekPlan("", "2026-10-13").warnings.at(-1)!, /nenhuma tarefa/);
});

test("tarefa feita e resumo por pessoa", () => {
  assert.equal(isDone({ done: true, items: [] }), true);
  assert.equal(isDone({ done: true, items: [{ text: "a", done: false }] }), false); // com subtarefas, valem elas
  assert.equal(isDone({ done: false, items: [{ text: "a", done: true }] }), true);
  assert.deepEqual(normalizeItems([{ text: " corte  da viga ", done: 1 }, { text: "" }, "x", null]), [{ text: "corte da viga", done: true }]);
  assert.deepEqual(summarize([{ person: "LARA", done: true, items: [] }, { person: "LARA", done: false, items: [] }, { person: "WESLEY", done: false, items: [] }]), [
    { person: "LARA", total: 2, done: 1 },
    { person: "WESLEY", total: 1, done: 0 },
  ]);
});

test("situação da tarefa: feita, não cumprida, atrasada sem justificativa ou em aberto", () => {
  const t = (over: object) => ({ date: "2026-10-13", done: false, items: [], missedReason: null, ...over });
  assert.equal(taskStatus(t({ done: true, missedReason: "MATERIAL" }), "2026-10-14"), "FEITA"); // feita vale mais que o motivo
  assert.equal(taskStatus(t({ missedReason: "MATERIAL" }), "2026-10-13"), "NAO_CUMPRIDA");
  assert.equal(taskStatus(t({}), "2026-10-14"), "ATRASADA");
  assert.equal(taskStatus(t({}), "2026-10-13"), "ABERTA"); // o dia ainda não acabou
  assert.equal(taskStatus(t({ items: [{ text: "a", done: true }] }), "2026-10-20"), "FEITA");
});

test("fechamento da semana: contagem e motivos mais frequentes; reagendar leva só o que faltou", () => {
  const t = (date: string, over: object = {}) => ({ date, done: false, items: [], missedReason: null, ...over });
  const s = weekSummary(
    [t("2026-10-13", { done: true }), t("2026-10-13", { missedReason: "MATERIAL" }), t("2026-10-14", { missedReason: "MATERIAL" }), t("2026-10-14", { missedReason: "PESSOA" }), t("2026-10-14"), t("2026-10-16")],
    "2026-10-15"
  );
  assert.deepEqual({ total: s.total, done: s.done, missed: s.missed, late: s.late, open: s.open }, { total: 6, done: 1, missed: 3, late: 1, open: 1 });
  assert.deepEqual(s.reasons, [{ code: "MATERIAL", label: "Faltou material", count: 2 }, { code: "PESSOA", label: "Faltou pessoa", count: 1 }]);
  assert.equal(reasonLabel("codigo-antigo"), "Outro");
  assert.deepEqual(pendingItems([{ text: "corte da viga", done: true }, { text: "pré montar", done: false }]), [{ text: "pré montar", done: false }]);
});
