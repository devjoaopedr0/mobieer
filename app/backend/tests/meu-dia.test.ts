/**
 * "Meu dia" do consultor: atrasadas, de hoje e próximas no fuso da loja; e a
 * contagem das atividades feitas por consultor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { activityBySeller, splitAgenda, type Todo } from "../src/modules/commercial/my-day.rules";

const todo = (id: string, at: string): Todo => ({ kind: "OPORTUNIDADE", id, title: id, client: null, at: new Date(at), link: "/comercial", sellerId: "joao", sellerName: "João" });

test("atrasadas, hoje e próximas pelo dia de Fortaleza", () => {
  // 30/10 às 10h em Fortaleza = 13h UTC
  const now = new Date("2026-10-30T13:00:00Z");
  const r = splitAgenda(
    [
      todo("ontem", "2026-10-29T20:00:00Z"),
      // 23h30 de 29/10 em Fortaleza ainda é ontem, mesmo já sendo 30/10 em UTC
      todo("ontem-tarde", "2026-10-30T02:30:00Z"),
      todo("hoje-cedo", "2026-10-30T11:00:00Z"),
      todo("hoje-noite", "2026-10-31T02:00:00Z"),
      todo("semana", "2026-11-04T15:00:00Z"),
      todo("longe", "2026-11-20T15:00:00Z"),
    ],
    now
  );
  assert.deepEqual(r.overdue.map((t) => t.id), ["ontem", "ontem-tarde"]);
  assert.deepEqual(r.today.map((t) => t.id), ["hoje-cedo", "hoje-noite"]);
  assert.deepEqual(r.upcoming.map((t) => t.id), ["semana"]);
});

test("atividades por consultor: contatos, follow-ups, reuniões e propostas (interação + orçamento enviado)", () => {
  const rows = activityBySeller(
    [
      { type: "CALL", responsibleId: "joao" },
      { type: "WHATSAPP", responsibleId: "joao" },
      { type: "FOLLOW_UP", responsibleId: "joao" },
      { type: "MEETING", responsibleId: "maria" },
      { type: "PROPOSAL", responsibleId: "maria" },
      { type: "INTERNAL_MESSAGE", responsibleId: "maria" },
    ],
    [{ sellerId: "maria" }, { sellerId: "pedro" }]
  );
  const joao = rows.find((r) => r.sellerId === "joao")!;
  assert.deepEqual([joao.total, joao.contacts, joao.followUps, joao.meetings, joao.proposals], [3, 3, 1, 0, 0]);
  const maria = rows.find((r) => r.sellerId === "maria")!;
  assert.deepEqual([maria.total, maria.contacts, maria.meetings, maria.proposals], [3, 0, 1, 2]);
  // só mandou orçamento: aparece, com zero atividades registradas
  assert.equal(rows.find((r) => r.sellerId === "pedro")!.proposals, 1);
});
