/**
 * Contrato editável: o texto do modelo abre no editor como documento, e o
 * documento corrigido vira o PDF no padrão da loja.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { contractDocPdf, contractHtml, docBlocksSchema, docHasBlanks } from "../src/modules/templates/contract-doc";
import { BLOCK, type ContractOrder } from "../src/modules/templates/contract-order";

const order: ContractOrder = {
  quoteId: "q1",
  number: "ORC-00380",
  clientId: "c1",
  projectId: null,
  seller: "Ana",
  soldAt: new Date("2026-10-20T12:00:00Z"),
  items: [{ code: "AA", room: "Cozinha", line: "Essencial", deadline: "45 dias", total: 10000, corpo: "Branco", porta: "Freijó", puxador: "Perfil", obs: "" }],
  subtotal: 10000,
  discount: 0,
  total: 10000,
  condition: "Entrada + 2x",
  method: "PIX",
  installments: [
    { label: "ENTRADA", due: new Date("2026-10-20T12:00:00Z"), amount: 4000 },
    { label: "PARC 1", due: new Date("2026-11-20T12:00:00Z"), amount: 3000 },
  ],
  deliveryText: "",
  deliveryDays: 45,
};

test("o texto vira documento: título, campo em negrito, lista e os quadros em tabela", () => {
  const html = contractHtml(`1. QUALIFICAÇÃO\nCONTRATANTE: Maria <Silva>\n• item\n\n${BLOCK.pedido}\n${BLOCK.pagamento}`, order);
  assert.match(html, /<h3>1\. QUALIFICAÇÃO<\/h3>/);
  assert.match(html, /<strong>CONTRATANTE:<\/strong> Maria &lt;Silva&gt;/);
  assert.match(html, /<ul><li>item<\/li><\/ul>/);
  assert.match(html, /<td>Cozinha<\/td>/);
  assert.match(html, /<th>PARCELA<\/th>/);
  assert.match(html, /<td>PARC 1<\/td><td>R\$ 3\.000,00<\/td><td>20\/11\/2026<\/td>/);
  assert.match(html, /Forma Pagto:<\/strong> PIX/);
});

test("o documento editado gera PDF e acusa o que falta preencher", async () => {
  const blocks = docBlocksSchema.parse([
    { t: "h", runs: [{ text: "Cláusula primeira" }] },
    { t: "p", runs: [{ text: "Pagamento: ", b: true }, { text: "à vista no PIX, " }, { text: "sem desconto", i: true, u: true }], align: "justify" },
    { t: "p", runs: [] },
    { t: "li", ordered: true, n: 1, runs: [{ text: "Primeiro" }] },
    { t: "table", rows: [["PARCELA", "VALOR"], ["ENTRADA", "R$ 10.000,00"], ["PARC 1", "____"]] },
  ]);
  assert.equal(docHasBlanks(blocks), true);
  const pdf = await contractDocPdf({ title: "Contrato Nº 378", subtitle: "Maria", blocks, footer: "teste" });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.throws(() => docBlocksSchema.parse([{ t: "script", runs: [] }]));
});
