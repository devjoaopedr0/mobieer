/**
 * CRM: lista fixa de origem, temperatura de oportunidade e de lead, painel por canal.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DISCOVERY_CHANNELS } from "../src/modules/briefing/briefing.service";
import { channelPanel, LEAD_TEMPERATURE, leadTemperature, normalizeOrigin, OPPORTUNITY_TEMPERATURE, opportunityScore, opportunityTemperature, ORIGIN_LABEL, ORIGINS } from "../src/modules/commercial/crm.rules";

const DAY = 86_400_000;
const now = new Date("2026-10-28T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

test("origem: lista fixa única e texto livre reconhecido quando dá", () => {
  assert.deepEqual(ORIGINS.map((o) => ORIGIN_LABEL[o]), ["Instagram", "Indicação", "Google", "Site", "Arquiteto", "Parceiros", "Outro"]);
  // o briefing usa a mesma lista
  assert.deepEqual(DISCOVERY_CHANNELS, ORIGINS.map((o) => ORIGIN_LABEL[o]));
  assert.equal(normalizeOrigin("Instagram"), "INSTAGRAM");
  assert.equal(normalizeOrigin("insta"), "INSTAGRAM");
  assert.equal(normalizeOrigin("Indicação da Maria"), "INDICACAO");
  assert.equal(normalizeOrigin("indicacao"), "INDICACAO");
  assert.equal(normalizeOrigin("Google Ads"), "GOOGLE");
  assert.equal(normalizeOrigin("Site"), "SITE");
  assert.equal(normalizeOrigin("Arquiteta Paula"), "ARQUITETO");
  assert.equal(normalizeOrigin("Parceiros"), "PARCEIROS");
  assert.equal(normalizeOrigin("Outro"), "OUTRO");
  // sem como saber: fica sem item da lista (o texto continua no campo de texto)
  assert.equal(normalizeOrigin("Feira de móveis"), null);
  assert.equal(normalizeOrigin("situação"), null);
  assert.equal(normalizeOrigin(""), null);
});

test("temperatura da oportunidade pelas faixas do score; fechada não tem", () => {
  assert.deepEqual(OPPORTUNITY_TEMPERATURE, { hotFrom: 70, warmFrom: 40 });
  assert.equal(opportunityTemperature(70, "OPEN"), "QUENTE");
  assert.equal(opportunityTemperature(69, "NEGOTIATION"), "MORNO");
  assert.equal(opportunityTemperature(40, "OPEN"), "MORNO");
  assert.equal(opportunityTemperature(39, "OPEN"), "FRIO");
  assert.equal(opportunityTemperature(90, "WON"), null);
  assert.equal(opportunityTemperature(10, "LOST"), null);
  // score: etapa de 90% + valor alto + contato de ontem = quente
  const score = opportunityScore({ probability: 90, estimatedValue: 50000, interactions: [{ occurredAt: ago(1) }], expectedCloseAt: null }, now.getTime());
  assert.equal(opportunityTemperature(score, "OPEN"), "QUENTE");
});

test("temperatura do lead: quente até 3 dias, morno de 4 a 15, frio acima ou sem contato; vencido = atrasado", () => {
  assert.deepEqual(LEAD_TEMPERATURE, { hotDays: 3, warmDays: 15 });
  const lead = (o: Partial<{ status: string; enteredAt: Date; lastContactAt: Date | null; nextContactAt: Date | null }>) => ({ status: "CONTACTED", enteredAt: ago(30), lastContactAt: null, nextContactAt: null, ...o });
  assert.equal(leadTemperature(lead({ lastContactAt: ago(3) }), now)?.temperature, "QUENTE");
  assert.equal(leadTemperature(lead({ lastContactAt: ago(4) }), now)?.temperature, "MORNO");
  assert.equal(leadTemperature(lead({ lastContactAt: ago(15) }), now)?.temperature, "MORNO");
  assert.equal(leadTemperature(lead({ lastContactAt: ago(16) }), now)?.temperature, "FRIO");
  // sem contato nenhum: frio, mesmo tendo entrado hoje
  assert.equal(leadTemperature(lead({ status: "NEW", enteredAt: ago(0) }), now)?.temperature, "FRIO");
  // próximo contato vencido: marca de atrasado, a temperatura não muda
  const vencido = leadTemperature(lead({ lastContactAt: ago(1), nextContactAt: ago(1) }), now);
  assert.equal(vencido?.temperature, "QUENTE");
  assert.equal(vencido?.overdue, true);
  assert.match(vencido!.reason, /vencido/);
  assert.equal(leadTemperature(lead({ lastContactAt: ago(1), nextContactAt: new Date(now.getTime() + DAY) }), now)?.overdue, false);
  assert.equal(leadTemperature(lead({ status: "CONVERTED" }), now), null);
  assert.equal(leadTemperature(lead({ status: "LOST" }), now), null);
});

test("painel por canal: entrou, qualificou, converteu, perdeu, taxa e valor vendido", () => {
  const rows = channelPanel(
    [
      { origin: "INSTAGRAM", status: "NEW" },
      { origin: "INSTAGRAM", status: "QUALIFIED" },
      { origin: "INSTAGRAM", status: "CONVERTED" },
      { origin: "INSTAGRAM", status: "LOST" },
      { origin: "INDICACAO", status: "CONVERTED" },
      { origin: null, status: "NEW" },
    ],
    [
      { origin: "INDICACAO", createdInPeriod: true, wonInPeriod: true, estimatedValue: 30000 },
      { origin: "INSTAGRAM", createdInPeriod: true, wonInPeriod: false, estimatedValue: 10000 },
      // entrou antes do período e foi ganha nele: conta no vendido
      { origin: "INSTAGRAM", createdInPeriod: false, wonInPeriod: true, estimatedValue: 12000 },
    ]
  );
  const insta = rows.find((r) => r.origin === "INSTAGRAM")!;
  assert.deepEqual(
    { entrou: insta.entrou, qualificou: insta.qualificou, converteu: insta.converteu, perdeu: insta.perdeu, taxa: insta.taxaConversao, opps: insta.oportunidades, ganhos: insta.ganhos, vendido: insta.valorVendido },
    { entrou: 4, qualificou: 2, converteu: 1, perdeu: 1, taxa: 25, opps: 1, ganhos: 1, vendido: 12000 }
  );
  assert.equal(rows[0].origin, "INDICACAO"); // mais vendido primeiro
  assert.equal(rows.find((r) => r.origin === "SEM_ORIGEM")?.entrou, 1);
  assert.equal(rows.some((r) => r.origin === "GOOGLE"), false); // canal sem nada não aparece
});
