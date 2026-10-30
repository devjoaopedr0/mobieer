/**
 * Simples Nacional: alíquota efetiva pelo RBT12 e anexo pelo CNAE.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { aliquotaEfetiva, anexoDoCnae } from "../src/modules/finance/simples.rules";

test("anexo pelo CNAE: indústria II, comércio I, serviço sem anexo", () => {
  assert.equal(anexoDoCnae("3101-2/00"), "II"); // fabricação de móveis
  assert.equal(anexoDoCnae("4754-7/01"), "I"); // comércio de móveis
  assert.equal(anexoDoCnae("4330-4/02"), null); // instalação (serviço)
  assert.equal(anexoDoCnae(null), null);
});

test("Anexo II: efetiva = (RBT12 × nominal − dedução) ÷ RBT12", () => {
  const ate180 = aliquotaEfetiva(150_000, "II");
  assert.equal(ate180.faixa, 1);
  assert.equal(ate180.efetiva, 4.5);
  // limite da ME
  const me = aliquotaEfetiva(360_000, "II");
  assert.equal(me.faixa, 2);
  assert.equal(me.efetiva, 6.15); // (28.080 − 5.940) ÷ 360.000
  assert.equal(aliquotaEfetiva(500_000, "II").efetiva, 7.23);
  assert.equal(aliquotaEfetiva(180_000, "II").efetiva, 4.5); // o limite é da faixa de baixo
});

test("Anexo I e casos de borda", () => {
  assert.equal(aliquotaEfetiva(500_000, "I").efetiva, 6.73);
  // sem receita nos 12 meses: nominal da 1ª faixa
  assert.equal(aliquotaEfetiva(0, "II").efetiva, 4.5);
  // acima de 4,8 mi: fora do Simples
  const fora = aliquotaEfetiva(5_000_000, "II");
  assert.equal(fora.foraDoSimples, true);
  assert.equal(fora.efetiva, null);
});
