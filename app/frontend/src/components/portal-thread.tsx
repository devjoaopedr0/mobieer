import { useEffect, useMemo, useRef } from "react";
import { Bot, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensagem da conversa do cliente no portal (mesmo formato nas duas pontas). */
export type PortalMessage = {
  id: string;
  authorKind: "CLIENT" | "STAFF" | "AI";
  toTeam: boolean;
  body: string;
  createdAt: string;
  authorName: string;
  readByStaff: boolean;
  readByClient: boolean;
};

const time = (v: string) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (v: string) => {
  const d = new Date(v);
  if (d.toDateString() === new Date().toDateString()) return "Hoje";
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
};

/** Junta mensagens novas sem repetir as que já estão na tela. */
export function mergeMessages(cur: PortalMessage[], fresh: PortalMessage[]) {
  const ids = new Set(cur.map((m) => m.id));
  return [...cur, ...fresh.filter((m) => !ids.has(m.id))];
}

/**
 * Lista de mensagens. `viewer` decide de que lado ficam as bolhas: o cliente vê
 * as dele à direita; a equipe vê as da equipe à direita.
 */
export function PortalThread({ messages, viewer, empty }: { messages: PortalMessage[]; viewer: "client" | "staff"; empty: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => {
    const out: { day: string; items: PortalMessage[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!messages.length) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="space-y-4">
      {grouped.map((g) => (
        <div key={g.day} className="space-y-2">
          <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.day}</p>
          {g.items.map((m) => {
            const mine = viewer === "client" ? m.authorKind === "CLIENT" : m.authorKind === "STAFF";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] space-y-1 rounded-lg px-3 py-2",
                    mine ? "bg-primary/10" : m.authorKind === "AI" ? "border border-dashed border-border bg-card" : "bg-muted/60"
                  )}
                >
                  <p className={cn("flex items-center gap-1 text-xs font-medium", mine && "justify-end text-primary")}>
                    {m.authorKind === "AI" && <Bot className="h-3.5 w-3.5" />}
                    {m.authorName}
                    {viewer === "client" && mine && <span className="font-normal text-muted-foreground">(você)</span>}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
                    {m.authorKind === "CLIENT" && (
                      <span className="inline-flex items-center gap-0.5">
                        {m.toTeam ? (
                          <>
                            <Users className="h-3 w-3" /> para a equipe{m.readByStaff ? " · lida" : ""}
                          </>
                        ) : (
                          <>
                            <Bot className="h-3 w-3" /> para o assistente
                          </>
                        )}
                      </span>
                    )}
                    <span>{time(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
