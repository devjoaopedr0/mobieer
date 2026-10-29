/**
 * Vistoria por ambiente: ambientes iniciais, peça faltante que bloqueia a
 * conclusão do ambiente, passagem de pendência e o relatório.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { initialRooms, pendencyText, roomStatusProblem, roomsCompleteProblem, statusAfterNewPendency, transferProblem } from "../src/modules/aftersales/inspection-rooms.rules";
import { buildInspectionReport } from "../src/modules/aftersales/aftersales.docs";

test("ambientes iniciais: os do projeto; sem eles, o texto livre", () => {
  assert.deepEqual(initialRooms([{ id: "r1", name: "Cozinha" }, { id: "r2", name: " Suíte  Master " }, { id: "r3", name: "cozinha" }], "Sala"), [
    { projectRoomId: "r1", name: "Cozinha" },
    { projectRoomId: "r2", name: "Suíte Master" },
  ]);
  assert.deepEqual(initialRooms([], "Cozinha, Closet e Suíte; Lavanderia").map((r) => r.name), ["Cozinha", "Closet", "Suíte", "Lavanderia"]);
  assert.deepEqual(initialRooms([], null), []);
});

test("peça faltante aberta bloqueia a conclusão do ambiente; o resto não", () => {
  const faltante = { kind: "PECA_FALTANTE", status: "ABERTA" };
  assert.match(roomStatusProblem("APROVADO", [faltante])!, /1 peça\(s\) faltante\(s\)/);
  assert.equal(roomStatusProblem("APROVADO", [{ ...faltante, status: "RESOLVIDA" }]), null);
  assert.equal(roomStatusProblem("APROVADO", [{ kind: "OUTRA", status: "ABERTA" }]), null);
  // a montagem segue: dá para marcar com pendência ou reprovado
  assert.equal(roomStatusProblem("COM_PENDENCIA", [faltante]), null);
  assert.equal(statusAfterNewPendency("APROVADO"), "COM_PENDENCIA");
  assert.equal(statusAfterNewPendency("NAO_VISTORIADO"), "COM_PENDENCIA");
  assert.equal(statusAfterNewPendency("REPROVADO"), "REPROVADO");
});

test("passar a pendência para outro ambiente da mesma vistoria", () => {
  const p = { status: "ABERTA", roomId: "a", inspectionId: "v1" };
  assert.equal(transferProblem(p, { id: "b", inspectionId: "v1" }), null);
  assert.match(transferProblem(p, { id: "a", inspectionId: "v1" })!, /já está neste ambiente/);
  assert.match(transferProblem(p, { id: "b", inspectionId: "v2" })!, /desta vistoria/);
  assert.match(transferProblem(p, null)!, /desta vistoria/);
  assert.match(transferProblem({ ...p, status: "RESOLVIDA" }, { id: "b", inspectionId: "v1" })!, /em aberto/);
});

test("concluir a vistoria: todo ambiente vistoriado; sem ressalvas só sem pendência aberta", () => {
  const rooms = [{ name: "Cozinha", status: "APROVADO" }, { name: "Closet", status: "NAO_VISTORIADO" }];
  assert.match(roomsCompleteProblem(rooms, [], "APPROVED")!, /1 ambiente\(s\) sem vistoria \(Closet\)/);
  const ok = [{ name: "Cozinha", status: "APROVADO" }, { name: "Closet", status: "COM_PENDENCIA" }];
  const open = [{ kind: "OUTRA", status: "ABERTA" }];
  assert.match(roomsCompleteProblem(ok, open, "APPROVED")!, /aprovada com ressalvas/);
  assert.equal(roomsCompleteProblem(ok, open, "APPROVED_WITH_REMARKS"), null);
  assert.equal(roomsCompleteProblem([], [], "APPROVED"), null); // vistoria antiga, sem ambientes
});

test("texto das pendências e relatório com os ambientes", () => {
  const rooms = [
    { name: "Cozinha", status: "APROVADO", note: null, pendencies: [{ kind: "PECA_FALTANTE", description: "porta do aéreo", status: "RESOLVIDA", targetRoomName: null }] },
    { name: "Closet", status: "COM_PENDENCIA", note: "regular portas", pendencies: [{ kind: "MUDANCA_AMBIENTE", description: "prateleira 40cm", status: "ABERTA", targetRoomName: "Suíte" }] },
  ];
  assert.equal(pendencyText(rooms), "Closet:\n- Mudança de ambiente: prateleira 40cm (vai para Suíte)");
  const doc = buildInspectionReport({
    company: "Mobieer", client: { name: "Cliente", document: null, address: null }, project: { code: "364-1", name: "Apto" },
    inspectedAt: new Date("2026-10-29T12:00:00Z"), ambientes: null, technician: "Técnico", installers: null, items: [], rooms,
    result: "APPROVED_WITH_REMARKS", pendencias: pendencyText(rooms), notes: null, clientSignerName: null, signedByClient: false, signedByTechnician: false, photoCount: 0, issuedAt: new Date("2026-10-29T12:00:00Z"),
  });
  assert.match(doc.body, /AMBIENTES\nCozinha: Concluído\n {2}- Peça faltante: porta do aéreo — resolvida\nCloset: Com pendência — regular portas/);
});
