/**
 * CRM — Etapa 4: carteira da central de clientes e filtro de origem.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crmClientScope, originFilter } from "../src/modules/commercial/clients-central.rules";

test("com commercial.read.all: todos os clientes da organização", () => {
  assert.deepEqual(crmClientScope({ id: "u1", organizationId: "o1", permissions: ["commercial.read", "commercial.read.all"] }), { organizationId: "o1" });
});

test("sem commercial.read.all: só onde é vendedor ou atendente", () => {
  assert.deepEqual(crmClientScope({ id: "u1", organizationId: "o1", permissions: ["commercial.read", "clients.read.all"] }), {
    organizationId: "o1",
    OR: [{ sellerId: "u1" }, { attendantId: "u1" }],
  });
});

test("origem: item da lista ou sem origem na lista", () => {
  assert.deepEqual(originFilter("INSTAGRAM"), { origin: "INSTAGRAM" });
  assert.deepEqual(originFilter("SEM_ORIGEM"), { origin: null });
  assert.deepEqual(originFilter(undefined), {});
});
