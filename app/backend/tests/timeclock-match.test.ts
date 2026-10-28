/**
 * Ponto: ligar a pessoa do relógio ao colaborador do cadastro.
 * Caso real: no aparelho o "1" é a Joana e o "2" a Camila; no sistema EMP-0001 é a
 * Camila e EMP-0002 a Joana. Casar pelo número gravou o ponto de uma na outra.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chosenWithOtherNumber, clockDisplayName, clockLinkConflicts, duplicatedClockChoices, matchClockPeople, normalizeClockNumber, type ClockEmployee } from "../src/modules/hr/timeclock.service";

const emp = (id: string, registration: string, fullName: string, clockRegistration: string | null = null): ClockEmployee => ({ id, registration, fullName, clockRegistration });
const cadastro = [emp("camila", "EMP-0001", "CAMILA JULLICE NEGREIROS"), emp("joana", "EMP-0002", "JOANA NEGREIROS MONTEIRO VIEIRA"), emp("alefe", "EMP-0003", "ALEFE FELIPE DE FREITAS BARRETO"), emp("kelson", "EMP-0004", "FRANCISCO KELSON SOARES FIGUEIREDO"), emp("leandro", "EMP-0005", "FRANCISCO LEANDRO DA SILVA SOUSA")];
const relogio = [["1", "Joana"], ["2", "Camila"], ["3", "marcio v"], ["4", "leandro"], ["5", "Kelson"], ["6", "ryan"], ["14", "alefe"]].map(([registration, name]) => ({ registration, name }));
const linked = (ms: ReturnType<typeof matchClockPeople>) => Object.fromEntries(ms.map((m) => [m.registration, m.employeeId]));

test("o número do relógio não é a matrícula: liga pelo nome, e quem não existe fica sem colaborador", () => {
  const ms = matchClockPeople(relogio, cadastro);
  assert.deepEqual(linked(ms), { "1": "joana", "2": "camila", "3": null, "4": "leandro", "5": "kelson", "6": null, "14": "alefe" });
  assert.ok(ms.filter((m) => m.employeeId).every((m) => m.how === "NOME"));
  assert.equal(ms.find((m) => m.registration === "3")!.ambiguous, false);
});

test("quem já tem o número do relógio no cadastro é ligado por ele quando o nome bate ou o vínculo foi feito à mão", () => {
  const ms = matchClockPeople([{ registration: "1", name: "Joana" }, { registration: "2", name: "Camila" }], [emp("joana", "EMP-0002", "JOANA NEGREIROS", "1"), emp("camila", "EMP-0001", "CAMILA JULLICE")]);
  assert.deepEqual(ms.map((m) => [m.employeeId, m.how]), [["joana", "RELOGIO"], ["camila", "NOME"]]);
  // apelido no aparelho ("JO"): só vale porque alguém ligou à mão
  const manual = matchClockPeople([{ registration: "1", name: "JO" }], [{ ...emp("joana", "EMP-0002", "JOANA NEGREIROS", "1"), clockLinkSource: "MANUAL" }]);
  assert.deepEqual([manual[0].employeeId, manual[0].how, manual[0].heldBy], ["joana", "RELOGIO", null]);
  // o número já usado por um colaborador não vai para outro pelo nome
  const usado = matchClockPeople([{ registration: "9", name: "Joana" }], [emp("joana", "EMP-0002", "JOANA NEGREIROS", "1")]);
  assert.equal(usado[0].employeeId, null);
});

test("nome que serve para mais de um não é adivinhado", () => {
  // "francisco" parece com Kelson e com Leandro
  const ambiguo = matchClockPeople([{ registration: "7", name: "francisco" }], cadastro);
  assert.deepEqual([ambiguo[0].employeeId, ambiguo[0].ambiguous], [null, true]);
  // duas pessoas do relógio apontando para o mesmo cadastro: nenhuma leva
  const disputa = matchClockPeople([{ registration: "1", name: "joana" }, { registration: "8", name: "Joana M" }], cadastro);
  assert.deepEqual(disputa.map((m) => [m.employeeId, m.ambiguous]), [[null, true], [null, true]]);
});

test("arquivo sem nomes: vale a matrícula, como antes", () => {
  const ms = matchClockPeople([{ registration: "2", name: null }, { registration: "0005", name: "" }, { registration: "77", name: null }], cadastro);
  assert.deepEqual(ms.map((m) => [m.employeeId, m.how]), [["joana", "MATRICULA"], ["leandro", "MATRICULA"], [null, null]]);
});

test("nome para o cadastro novo vem do relógio", () => {
  assert.equal(clockDisplayName({ registration: "3", name: " marcio  v " }), "MARCIO V");
  assert.equal(clockDisplayName({ registration: "12", name: "ana clara" }), "ANA CLARA");
  assert.equal(clockDisplayName({ registration: "7", name: null }), "COLABORADOR 7");
});

test("número reaproveitado pelo aparelho: Markos no nº 3 do MARCIO V não vai para o cadastro dele", () => {
  const cadastroMarcio = [emp("marcio", "EMP-0007", "MARCIO V", "3"), emp("markos", "EMP-0009", "MARKOS ANTONIO")];
  const [m] = matchClockPeople([{ registration: "3", name: "Markos" }], cadastroMarcio);
  assert.equal(m.employeeId, null);
  assert.deepEqual(m.heldBy, { id: "marcio", fullName: "MARCIO V" });
  // nem pelo nome: o número é de outra pessoa, a escolha tem de ser explícita
  assert.equal(m.how, null);
  assert.equal(m.ambiguous, false);
  // o MARCIO V continua ligado ao nº 3 quando o nome bate
  assert.equal(matchClockPeople([{ registration: "3", name: "marcio v" }], cadastroMarcio)[0].employeeId, "marcio");
});

test("vínculo manual na conferência: um colaborador por número e um número por colaborador", () => {
  const holders = [{ id: "marcio", fullName: "MARCIO V", clockRegistration: "3" }];
  // escolher o Markos para o nº 3 sem liberar o número trava
  assert.deepEqual(clockLinkConflicts({ "3": "markos" }, holders).map((c) => c.holder.fullName), ["MARCIO V"]);
  // liberado explicitamente ("tirar o nº 3 do cadastro do MARCIO V"): passa
  assert.deepEqual(clockLinkConflicts({ "3": "markos" }, holders, ["3"]), []);
  // confirmar o próprio MARCIO V não é conflito
  assert.deepEqual(clockLinkConflicts({ "3": "marcio" }, holders), []);
  // quem já tem outro número troca na ficha
  assert.deepEqual(chosenWithOtherNumber({ "9": "joana" }, [{ id: "joana", fullName: "JOANA", clockRegistration: "1" }]).map((o) => o.registration), ["9"]);
  assert.deepEqual(chosenWithOtherNumber({ "1": "joana" }, [{ id: "joana", fullName: "JOANA", clockRegistration: "1" }]), []);
  assert.deepEqual(duplicatedClockChoices({ "1": "joana", "9": "joana", "2": "camila" }), ["joana"]);
});

test("número do relógio digitado na ficha", () => {
  assert.equal(normalizeClockNumber(" 3 "), "3");
  assert.equal(normalizeClockNumber("0003"), "0003");
  assert.equal(normalizeClockNumber(""), "");
  assert.equal(normalizeClockNumber(null), "");
  assert.equal(normalizeClockNumber("3; drop"), null);
});
