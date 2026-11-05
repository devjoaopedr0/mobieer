/** Texto do aviso do lembrete, no fuso da loja: "Em 30 min (14:30)", "Amanhã às 09:00"… */
const TZ = "America/Fortaleza";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export function reminderText(startAt: Date, now: Date, allDay: boolean) {
  const hour = startAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = startAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
  const min = Math.round((startAt.getTime() - now.getTime()) / 60000);
  const tomorrow = dayOf(new Date(now.getTime() + 86400000));
  if (allDay) return dayOf(startAt) === dayOf(now) ? "Hoje" : `Dia ${day}`;
  if (min <= 0) return `Agora (${hour})`;
  if (min < 60) return `Em ${min} min (${hour})`;
  if (dayOf(startAt) === dayOf(now)) return `Hoje às ${hour}`;
  if (dayOf(startAt) === tomorrow) return `Amanhã às ${hour}`;
  return `${day} às ${hour}`;
}
