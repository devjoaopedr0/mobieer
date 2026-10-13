/**
 * Tela de Assistências: tipos, colunas do quadro, região e agenda de visitas.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANCE_KIND_CODES, BOARD_COLUMNS, groupVisits, kindLabel, placeOf } from "../src/modules/assistance/assistance.rules";

test("tipos de assistência e colunas do quadro", () => {
  assert.deepEqual(ASSISTANCE_KIND_CODES, ["ASSISTENCIA", "AJUSTE_POS_MONTAGEM", "MANUTENCAO", "ERRO_INTERNO", "RETRABALHO"]);
  assert.equal(kindLabel("RETRABALHO"), "Retrabalho");
  assert.equal(kindLabel("codigo-antigo"), "Assistência");
  // cancelado não é coluna: o quadro mostra o que está em atendimento ou resolvido
  assert.deepEqual(BOARD_COLUMNS.map((c) => c.status), ["OPEN", "TRIAGE", "SCHEDULED", "IN_PROGRESS", "WAITING_CLIENT", "RESOLVED"]);
});

test("região do cliente: bairro e cidade, o que houver", () => {
  assert.equal(placeOf({ district: "Aldeota", city: "Fortaleza" }), "Aldeota, Fortaleza");
  assert.equal(placeOf({ district: " ", city: "Eusébio" }), "Eusébio");
  assert.equal(placeOf({ district: null, city: null }), null);
  assert.equal(placeOf(null), null);
});

test("agenda: visitas por dia no fuso da loja, na ordem; sem data fica de fora", () => {
  const g = groupVisits([
    { id: "c", scheduledAt: "2026-10-16T12:00:00Z" },
    { id: "a", scheduledAt: "2026-10-15T17:00:00Z" },
    { id: "x", scheduledAt: null },
    // 01h UTC do dia 16 ainda é dia 15 em Fortaleza
    { id: "b", scheduledAt: new Date("2026-10-16T01:00:00Z") },
  ]);
  assert.deepEqual(g.map((d) => [d.day, d.tickets.map((t) => t.id)]), [["2026-10-15", ["a", "b"]], ["2026-10-16", ["c"]]]);
});
