/**
 * Assistência: checklist pela descrição e andamento.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checklistProgress, tasksFromDescription } from "../src/modules/assistance/assistance-items.rules";

test("linhas numeradas da descrição viram os serviços (texto da AST-00001)", () => {
  const d = "1. INSTALAR MESA DE ATENDIMENTO \n2. MOVEL CENTRAL TIPO ILHA \n3. PAINEL CANALETADO CAIU, AJUSTAR";
  assert.deepEqual(tasksFromDescription(d), ["INSTALAR MESA DE ATENDIMENTO", "MOVEL CENTRAL TIPO ILHA", "PAINEL CANALETADO CAIU, AJUSTAR"]);
});

test("outros jeitos de numerar e marcadores; texto corrido não vira serviço", () => {
  assert.deepEqual(tasksFromDescription("Cliente pediu:\n1) regular porta\n2 - trocar puxador\n- limpar\n• vedar pia"), ["regular porta", "trocar puxador", "limpar", "vedar pia"]);
  assert.deepEqual(tasksFromDescription("Porta da cozinha caiu, ver dobradiça"), []);
  assert.deepEqual(tasksFromDescription(null), []);
});

test("andamento: feitos de quantos", () => {
  assert.deepEqual(checklistProgress([{ done: true }, { done: false }, { done: false }]), { done: 1, total: 3 });
});
