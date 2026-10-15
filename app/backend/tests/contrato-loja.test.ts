/**
 * Contrato da loja: modelo padrão com os campos do sistema e quadros do orçamento.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONTRACT_BODY, MERGE_FIELDS, renderTemplate } from "../src/modules/templates/contract.service";
import { installmentLabels } from "../src/modules/templates/contract-order";
import { templateKeys } from "../src/utils/template";

test("o modelo padrão só usa campos que o sistema preenche", () => {
  const known = new Set(MERGE_FIELDS.map((f) => f.key));
  assert.deepEqual(templateKeys(DEFAULT_CONTRACT_BODY).filter((k) => !known.has(k)), []);
});

test("os quadros ficam sozinhos na linha, para virar tabela no PDF", () => {
  const lines = DEFAULT_CONTRACT_BODY.split("\n").map((l) => l.trim());
  assert.ok(lines.includes("{{quadro.pedido}}"));
  assert.ok(lines.includes("{{quadro.pagamento}}"));
  const values = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.example]));
  assert.deepEqual(renderTemplate(DEFAULT_CONTRACT_BODY, values).missing, []);
});

test("parcelas saem como ENTRADA, PARC n e SALDO", () => {
  assert.deepEqual(
    installmentLabels([
      { isDown: true, installmentNumber: null },
      { isDown: false, installmentNumber: 1 },
      { isDown: false, installmentNumber: 2 },
    ]),
    ["ENTRADA", "PARC 1", "PARC 2"]
  );
  assert.deepEqual(installmentLabels([{ isDown: true, installmentNumber: null }, { isDown: false, installmentNumber: null }]), ["ENTRADA", "SALDO"]);
});
