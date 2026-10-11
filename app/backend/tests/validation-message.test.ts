/**
 * Erro de cadastro precisa dizer onde está o erro.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { describeValidation, fieldLabel } from "../src/lib/validation-message";

const fail = (schema: z.ZodTypeAny, value: unknown) => {
  const r = schema.safeParse(value);
  assert.equal(r.success, false);
  return describeValidation((r as z.SafeParseError<unknown>).error.issues);
};

test("erro de cadastro: diz o campo e o motivo, em português", () => {
  const cliente = z.object({ name: z.string().trim().min(2), email: z.string().email().optional().or(z.literal("")), zipCode: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido").optional(), state: z.string().length(2).optional() });
  const v = fail(cliente, { name: "K", email: "kelvia@", zipCode: "123" });
  assert.equal(v.message, "Confira os campos — Nome: precisa ter pelo menos 2 caracteres; E-mail: e-mail inválido; CEP: CEP inválido.");
  assert.deepEqual(v.fields.map((f) => f.field), ["name", "email", "zipCode"]);
  assert.equal(fail(cliente, {}).message, "Confira o campo — Nome: é obrigatório.");
});

test("erro de cadastro: linha da lista, campo sem tradução e limite de campos na frase", () => {
  assert.equal(fieldLabel(["items", 2, "amount"]), "Itens, linha 3 › Valor");
  assert.equal(fieldLabel(["sideLeft"]), "Side left");
  const lista = z.object({ items: z.array(z.object({ amount: z.number().positive() })) });
  assert.equal(fail(lista, { items: [{ amount: 1 }, { amount: -5 }] }).message, "Confira o campo — Itens, linha 2 › Valor: precisa ser no mínimo 0.");
  const muitos = z.object({ a: z.string(), b: z.string(), c: z.string(), d: z.string(), e: z.string(), f: z.string() });
  assert.match(fail(muitos, {}).message, /\(e mais 2\)\.$/);
});

test("erro de cadastro: opção inválida e mensagem escrita no sistema passam como estão", () => {
  assert.equal(fail(z.object({ status: z.enum(["A", "B"]) }), { status: "C" }).message, "Confira o campo — Situação: opção inválida.");
  assert.equal(fail(z.object({ title: z.string().min(1, "Informe o título da prancha") }), { title: "" }).message, "Confira o campo — Título: Informe o título da prancha.");
});
