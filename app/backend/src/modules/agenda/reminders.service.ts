/**
 * Lembretes da agenda (AgendaReminder): viram notificação no sino quando a hora chega.
 *
 * Não depende de cron — em produção (Vercel) só existe o cron diário. Quem
 * dispara é o próprio sino, que consulta /api/notifications a cada minuto:
 * antes de listar, entrega os lembretes vencidos daquele usuário.
 */
import { prisma } from "../../prisma";
import { reminderText } from "./reminders.rules";

// lembrete atrasado mais que isso (ninguém abriu o sistema) não vale mais a pena
const STALE_MS = 12 * 60 * 60 * 1000;
const CLOSED = ["CANCELLED", "COMPLETED"] as const;

/** Entrega os lembretes vencidos do usuário. Devolve quantos viraram notificação. */
export async function deliverDueReminders(userId: string, now = new Date()) {
  const due = await prisma.agendaReminder.findMany({
    where: { userId, sentAt: null, remindAt: { lte: now } },
    select: {
      id: true,
      remindAt: true,
      event: { select: { id: true, title: true, startAt: true, allDay: true, status: true, location: true, client: { select: { name: true } }, clientName: true } },
    },
    take: 50,
  });
  let sent = 0;
  for (const r of due) {
    // marca antes de notificar: duas abas abertas não duplicam o aviso
    const claimed = await prisma.agendaReminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: now } });
    if (!claimed.count) continue;
    const e = r.event;
    if ((CLOSED as readonly string[]).includes(e.status) || now.getTime() - r.remindAt.getTime() > STALE_MS || e.startAt < new Date(now.getTime() - STALE_MS)) continue;
    const who = e.client?.name ?? e.clientName;
    await prisma.notification.create({
      data: {
        type: "AGENDA",
        title: `${reminderText(e.startAt, now, e.allDay)}: ${e.title}`,
        message: [who, e.location].filter(Boolean).join(" · ") || "Compromisso da agenda",
        userId,
        link: "/agenda",
        entity: "AgendaEvent",
        entityId: e.id,
      },
    });
    sent += 1;
  }
  return sent;
}
