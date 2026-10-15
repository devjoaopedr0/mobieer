/**
 * Descritiva: sugestão a partir do orçamento, resposta da IA e o PDF.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { descriptivePdf } from "../src/modules/descriptive/descriptive.pdf";
import { guessKind, knownColor, mergeAiAnswer, splitFinishes, suggestFromQuote } from "../src/modules/descriptive/descriptive.rules";

const items = [
  { room: "Área de serviço", description: "Armário alto com 3 portas de giro", corpo: "Branco TX", porta: "Cinza Cristal", puxador: "Puxador Ponto", complemento: null, modelo: null },
  { room: "Área de serviço", description: "Armário inferior com 1 gaveta", corpo: "Branco TX", porta: "Cinza Cristal", puxador: null, complemento: null, modelo: null },
  { room: "Suíte", description: "Painel ripado", corpo: "Freijó / Branco TX", porta: null, puxador: null, complemento: "Metalon dourado", modelo: "Ripado" },
];

test("acabamentos: separa, não repete e acerta o tipo", () => {
  assert.deepEqual(splitFinishes("Branco TX / Freijó, Verde Jade e Azul Astral"), ["Branco TX", "Freijó", "Verde Jade", "Azul Astral"]);
  assert.equal(guessKind("Puxador Ponto", "puxador"), "METALURGIA");
  assert.equal(guessKind("Metalon dourado"), "METALURGIA");
  assert.equal(guessKind("Ripado", "modelo"), "USINAGEM");
  assert.equal(guessKind("Cinza Cristal", "porta"), "MDF");
  assert.equal(knownColor("CINZA CRISTAL"), "#BDBBB6");
  assert.equal(knownColor("Cor inventada"), null);
});

test("sugestão do orçamento: um bloco por ambiente, texto das peças e imagens do ambiente", () => {
  const d = suggestFromQuote(items, [{ id: "r1", room: "área de serviço" }, { id: "r2", room: "Sala" }], "Camila", 45);
  assert.deepEqual(d.rooms.map((r) => r.room), ["Área de serviço", "Suíte"]);
  const area = d.rooms[0];
  assert.deepEqual(area.finishes.map((f) => f.name), ["BRANCO TX", "CINZA CRISTAL", "PUXADOR PONTO"]);
  assert.equal(area.text, "ARMÁRIO ALTO COM 3 PORTAS DE GIRO\nARMÁRIO INFERIOR COM 1 GAVETA");
  assert.deepEqual(area.renderIds, ["r1"]);
  assert.equal(d.designer, "Camila");
  assert.match(d.processes.find((p) => p.title === "Fabricação")!.detail, /45 dias úteis/);
});

test("resposta da IA: só ambientes existentes, cor da loja vale mais, JSON com texto em volta", () => {
  const d = suggestFromQuote(items, [], "", 45);
  const raw = 'Claro! {"rooms":[{"room":"área de serviço","text":"ARMÁRIO ALTO COM 3 PORTAS DE GIRO EM MDF 15MM CINZA CRISTAL.","finishes":[{"name":"Cinza Cristal","kind":"MDF","color":"#00FF00"},{"name":"Laca nova","kind":"XYZ","color":"#123456"}]},{"room":"Ambiente inventado","text":"X"}]}';
  const m = mergeAiAnswer(d.rooms, raw);
  assert.equal(m.updated, 1);
  const area = m.rooms[0];
  assert.match(area.text, /^ARMÁRIO ALTO/);
  assert.deepEqual(area.finishes, [{ name: "CINZA CRISTAL", kind: "MDF", color: "#BDBBB6" }, { name: "LACA NOVA", kind: "OUTRO", color: "#123456" }]);
  assert.equal(m.rooms[1].text, d.rooms[1].text);
  assert.equal(mergeAiAnswer(d.rooms, "não é json").updated, 0);
});

test("PDF: capa, moodboard e processos, mesmo sem imagem", async () => {
  const d = suggestFromQuote(items, [], "Camila", 45);
  const pdf = await descriptivePdf(d, { client: "Cliente", imagesFor: () => undefined });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  // capa + (moodboard + texto) por ambiente + processos
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1 + 2 * 2 + 1);
});
