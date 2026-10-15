/**
 * Busca de endereço pelo CEP: leitura das respostas do ViaCEP e da BrasilAPI.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { formatCep, fromBrasilApi, fromViaCep, normalizeCep } from "../src/modules/cep/cep.rules";

test("CEP: só 8 números valem", () => {
  assert.equal(normalizeCep("60.115-170"), "60115170");
  assert.equal(normalizeCep("6011517"), null);
  assert.equal(normalizeCep("00000000"), null);
  assert.equal(formatCep("60115170"), "60115-170");
});

test("ViaCEP: endereço, ou nada quando não existe", () => {
  assert.deepEqual(fromViaCep("60115170", { logradouro: "Rua Carlos Vasconcelos", bairro: "Meireles", localidade: "Fortaleza", uf: "ce" }), {
    cep: "60115-170", street: "Rua Carlos Vasconcelos", district: "Meireles", city: "Fortaleza", state: "CE",
  });
  assert.equal(fromViaCep("99999999", { erro: true }), null);
  assert.equal(fromViaCep("99999999", { erro: "true" }), null);
  assert.equal(fromViaCep("60115170", null), null);
});

test("BrasilAPI: mesmo formato; CEP de cidade inteira vem sem rua", () => {
  assert.deepEqual(fromBrasilApi("62900000", { street: "", neighborhood: "", city: "Russas", state: "CE" }), {
    cep: "62900-000", street: "", district: "", city: "Russas", state: "CE",
  });
  assert.equal(fromBrasilApi("62900000", { message: "CEP não encontrado" }), null);
});
