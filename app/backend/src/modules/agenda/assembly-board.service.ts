import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../../types/express";
import { prisma } from "../../prisma";
import { ASSEMBLY_STATE_LABEL, assemblyKpis, assemblyState, durationLabel, durationMinutes, scheduleConflicts } from "./assembly-board.rules";

/**
 * Andamento das montagens no período: cada montagem com cliente, projeto,
 * responsável e equipe, início, fim previsto, duração e situação; mais os
 * indicadores e os conflitos de agenda. A atrasada aparece mesmo que tenha
 * terminado antes do período — continua pendente até alguém concluir.
 * Quem não tem agenda.read.all vê só as próprias (como na agenda).
 */
export async function assemblyBoard(q: { from: Date; to: Date; my?: string }, actor: AuthUser) {
  const now = new Date();
  const own = !actor.permissions.includes("agenda.read.all") || q.my === "true";
  const where: Prisma.AgendaEventWhereInput = {
    organizationId: actor.organizationId,
    OR: [{ type: { name: { contains: "montag", mode: "insensitive" } } }, { type: { name: { contains: "instala", mode: "insensitive" } } }],
    AND: [
      { OR: [{ startAt: { lt: q.to }, endAt: { gt: q.from } }, { endAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
      ...(own ? [{ OR: [{ responsibleId: actor.id }, { createdById: actor.id }, { participants: { some: { userId: actor.id } } }] }] : []),
    ],
  };
  const rows = await prisma.agendaEvent.findMany({
    where,
    include: {
      type: { select: { id: true, name: true, color: true } },
      responsible: { select: { id: true, name: true } },
      participants: { select: { userId: true, user: { select: { id: true, name: true } } } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { startAt: "asc" },
  });
  const people = rows.map((e) => ({ ...e, participantIds: e.participants.map((p) => p.userId) }));
  const conflicts = scheduleConflicts(people);
  const byId = new Map(rows.map((e) => [e.id, e]));
  const events = rows.map((e) => {
    const state = assemblyState(e, now);
    const minutes = durationMinutes(e.startAt, e.endAt);
    return {
      id: e.id,
      title: e.title,
      status: e.status,
      state,
      stateLabel: ASSEMBLY_STATE_LABEL[state],
      startAt: e.startAt,
      endAt: e.endAt,
      completedAt: e.completedAt,
      durationMinutes: minutes,
      durationLabel: durationLabel(minutes),
      type: e.type,
      clientName: e.clientName,
      project: e.project ?? (e.projectReference ? { id: null, code: e.projectReference, name: null } : null),
      responsible: e.responsible,
      team: e.team,
      crew: e.participants.map((p) => p.user),
      location: e.location,
      conflicts: (conflicts.get(e.id) ?? []).map((id) => ({ id, title: byId.get(id)?.title ?? "", startAt: byId.get(id)?.startAt })),
    };
  });
  return { events, kpis: assemblyKpis(rows, now, q.from, q.to, conflicts), now };
}
