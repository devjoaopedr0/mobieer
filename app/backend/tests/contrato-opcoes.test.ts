/**
 * Contrato com menos digitação: opções de cláusula, seções do modelo, campos
 * marcados para o editor, lista do que falta cadastrar e cláusula de adendo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applySections, optionValues, suggestedDays } from "../src/modules/templates/contract-options";
import { contractChecklist, renderContractBody } from "../src/modules/templates/contract.service";
import { contractHtml } from "../src/modules/templates/contract-doc";
import { addendaClauseText } from "../src/modules/commercial/addenda";

test("tipo de pedido define o prazo; o prazo digitado vale mais", () => {
  assert.equal(suggestedDays("PADRAO", 45), 45);
  assert.equal(suggestedDays("ESPECIAL", 45), 60);
  assert.equal(suggestedDays("ESPECIAL", null), null);
  const o = optionValues({ tipoPedido: "ESPECIAL", prazoDias: null, preMontagem: false }, 45);
  assert.equal(o.days, 60);
  assert.equal(o.values["contrato.preMontagem"], "Não");
  assert.deepEqual(o.flags, { "opcao.preMontagem": false, "opcao.pedidoEspecial": true, "opcao.pedidoPadrao": false });
  assert.equal(optionValues({ tipoPedido: "ESPECIAL", prazoDias: 50, preMontagem: true }, 45).days, 50);
});

test("seções do modelo: só fica o trecho da opção escolhida, sem dobrar linha em branco", () => {
  const body = ["A", "", "{{#opcao.preMontagem}}", "Com pré-montagem", "{{/opcao.preMontagem}}", "", "{{^opcao.preMontagem}}", "Sem pré-montagem", "{{/opcao.preMontagem}}", "", "B"].join("\n");
  assert.equal(applySections(body, { "opcao.preMontagem": true }), "A\n\nCom pré-montagem\n\nB");
  assert.equal(applySections(body, { "opcao.preMontagem": false }), "A\n\nSem pré-montagem\n\nB");
  // chave desconhecida: desligada
  assert.equal(applySections("{{#opcao.x}}\nY\n{{/opcao.x}}\nZ", {}), "Z");
});

test("valores marcados viram trechos que o editor acompanha; quadros e linhas múltiplas não", () => {
  const ctx = { values: { "cliente.nome": "Maria & Cia", "promob.total": "R$ 1.000,00", "quadro.pedido": "", "promob.tabelaAmbientes": "A\nB" }, flags: {} };
  const r = renderContractBody("CONTRATANTE: {{cliente.nome}}\nTotal de {{promob.total}} pago.", ctx, { mark: true });
  const html = contractHtml(r.text, null, r.keys);
  assert.match(html, /<span data-f="cliente.nome" data-v="Maria &amp; Cia">Maria &amp; Cia<\/span>/);
  assert.match(html, /<span data-f="promob.total" data-v="R\$ 1.000,00">R\$ 1.000,00<\/span>/);
  // sem marcar, o texto é o de sempre
  assert.equal(renderContractBody("{{cliente.nome}}", ctx).text, "Maria & Cia");
});

test("cláusula de adendo entra sozinha depois do pagamento quando o modelo não tem o marcador", () => {
  const ctx = { values: { "clausula.adendos": "Adendo X.", "quadro.pagamento": "[[QUADRO:pagamento]]" }, flags: {} };
  assert.equal(renderContractBody("PAGAMENTO\n{{quadro.pagamento}}\nASSINATURAS", ctx).text, "PAGAMENTO\n[[QUADRO:pagamento]]\n\nADENDOS\nAdendo X.\nASSINATURAS");
  assert.equal(renderContractBody("Fim", { values: { "clausula.adendos": "" }, flags: {} }).text, "Fim");
  const txt = addendaClauseText([{ number: "ORC-00012-A1", version: 1, approvedAt: new Date("2026-10-20T15:00:00Z"), total: 8000, deliveryDays: 30, rooms: [{ room: "Varanda", total: 8000 }] }]);
  assert.match(txt, /Adendo ORC-00012-A1, aceito em 20\/10\/2026: acrescenta ao pedido Varanda \(R\$\s8\.000,00\), no valor total de R\$\s8\.000,00\. O prazo de fabricação dos itens acrescentados é de 30 dias úteis/);
  assert.equal(addendaClauseText([]), "");
});

test("lista do que falta cadastrar, com onde corrigir", () => {
  assert.deepEqual(contractChecklist(["cliente.documento", "venda.vendedor", "clausula.adendos", "empresa.cnpj"]), [
    { key: "cliente.documento", label: "CPF/CNPJ do cliente", where: "CPF/CNPJ no cadastro do cliente" },
    { key: "venda.vendedor", label: "Quem vendeu", where: "vendedor do orçamento ou do cadastro do cliente" },
    { key: "empresa.cnpj", label: "CNPJ da empresa", where: "dados da empresa (Configurações)" },
  ]);
});
