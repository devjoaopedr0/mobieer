import { useEffect, useMemo, useRef, useState } from "react";
import { type UseMutationResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch } from "@/services/api";
import { cn } from "@/lib/utils";

type TimelineEvent = {
  id: string; title: string; startAt: string; endAt: string; status: string; clientName?: string | null; projectId?: string | null;
  type: { id: string; name: string; color: string }; typeId: string;
};
type Order = { id: string; stage: string; estimatedDeliveryAt: string | null; project?: { id: string; code: string; name: string; clientName: string | null } };

const DAY = 86_400_000;
const PX = 30; // largura de um dia
const FORECAST_DAYS = 3; // duração estimada da montagem que ainda não tem data
const TEAMS_KEY = "mobieer.montagens.equipes";

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (from: Date, d: Date) => Math.round((startOfDay(d).getTime() - from.getTime()) / DAY);
const isAssembly = (name: string) => /montag|instala/i.test(name);
const short = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function readTeams(): number | null {
  try { const v = Number(localStorage.getItem(TEAMS_KEY)); return v > 0 ? v : null; } catch { return null; }
}

/**
 * Montagens em barras ao longo dos meses: cada compromisso ocupa os dias que
 * dura. Arrastar a barra muda a data (mantendo a duração); arrastar a ponta
 * direita muda quanto tempo dura. Em cima, quantas montagens acontecem em cada
 * dia contra as equipes disponíveis — o dia em vermelho mostra quando falta gente.
 * As previstas (pedido na produção com previsão de entrega e sem montagem
 * marcada) aparecem tracejadas.
 */
export function AssemblyTimeline({ typeIds, onOpen }: { typeIds: string[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => { const d = startOfDay(new Date()); d.setDate(1); return d; });
  const [months, setMonths] = useState(3);
  const [teams, setTeams] = useState<number | null>(() => readTeams());
  const from = useMemo(() => addDays(cursor, -cursor.getDay()), [cursor]);
  const to = useMemo(() => { const d = new Date(cursor); d.setMonth(d.getMonth() + months); return d; }, [cursor, months]);
  const days = Math.round((to.getTime() - from.getTime()) / DAY);

  const events = useQuery({
    queryKey: ["agenda", "timeline", from.toISOString(), to.toISOString()],
    queryFn: () => apiGet<{ data: TimelineEvent[] }>("/agenda", { from: from.toISOString(), to: to.toISOString() }),
  });
  const orders = useQuery({ queryKey: ["production", "timeline"], queryFn: () => apiGet<{ data: Order[] }>("/production"), retry: false });
  const contractors = useQuery({ queryKey: ["contractors", "timeline"], queryFn: () => apiGet<{ data: { active: boolean; engagement?: string }[] }>("/contractors"), retry: false });
  const defaultTeams = Math.max(1, (contractors.data?.data ?? []).filter((c) => c.active).length);
  const capacity = teams ?? defaultTeams;
  useEffect(() => { try { if (teams) localStorage.setItem(TEAMS_KEY, String(teams)); } catch { /* sem armazenamento: vale só nesta tela */ } }, [teams]);

  const rows = useMemo(
    () => (events.data?.data ?? []).filter((e) => typeIds.includes(e.typeId) && e.status !== "CANCELLED").sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events.data, typeIds]
  );
  // pedido na fábrica, com previsão de entrega, e sem montagem marcada para o projeto
  const forecasts = useMemo(() => {
    const scheduled = new Set(rows.filter((r) => isAssembly(r.type.name) && r.projectId).map((r) => r.projectId));
    return (orders.data?.data ?? [])
      .filter((o) => o.estimatedDeliveryAt && o.stage !== "DELIVERED" && o.project && !scheduled.has(o.project.id))
      .map((o) => ({ id: o.id, label: `${o.project!.code} — ${o.project!.clientName ?? o.project!.name}`, start: startOfDay(new Date(o.estimatedDeliveryAt!)) }))
      .filter((f) => f.start < to && addDays(f.start, FORECAST_DAYS) > from);
  }, [orders.data, rows, from, to]);

  // montagens acontecendo em cada dia (marcadas e previstas)
  const load = useMemo(() => {
    const booked = Array.from({ length: days }, () => 0);
    const planned = Array.from({ length: days }, () => 0);
    for (const r of rows.filter((x) => isAssembly(x.type.name))) {
      const a = Math.max(0, dayIndex(from, new Date(r.startAt)));
      const b = Math.min(days - 1, dayIndex(from, new Date(new Date(r.endAt).getTime() - 1)));
      for (let i = a; i <= b; i++) booked[i]++;
    }
    for (const f of forecasts) {
      const a = Math.max(0, dayIndex(from, f.start));
      for (let i = a; i < Math.min(days, a + FORECAST_DAYS); i++) planned[i]++;
    }
    return { booked, planned };
  }, [rows, forecasts, from, days]);
  const excess = load.booked.map((b, i) => b + load.planned[i] - capacity);
  const firstShort = excess.findIndex((v, i) => v > 0 && addDays(from, i).getDay() !== 0);

  type MoveVars = { id: string; startAt: Date; endAt: Date; force?: boolean };
  const move: UseMutationResult<unknown, unknown, MoveVars> = useMutation({
    mutationFn: (v: MoveVars) => apiPatch(`/agenda/${v.id}/move`, { startAt: v.startAt.toISOString(), endAt: v.endAt.toISOString(), forceConflict: v.force ?? false }),
    onSuccess: () => { toast.success("Data alterada"); qc.invalidateQueries({ queryKey: ["agenda"] }); },
    onError: (e: unknown, v: MoveVars): void => {
      const err = e as { status?: number; message?: string };
      if (err.status === 409 && !v.force && confirm("Já tem compromisso nesse horário para alguém da equipe. Mover mesmo assim?")) {
        move.mutate({ ...v, force: true });
        return;
      }
      toast.error(err.message ?? "Não foi possível mudar a data");
      qc.invalidateQueries({ queryKey: ["agenda"] });
    },
  });

  // arrastar: barra inteira muda a data; ponta direita muda a duração
  const drag = useRef<{ id: string; mode: "move" | "end"; x: number; start: Date; end: Date } | null>(null);
  const [delta, setDelta] = useState<{ id: string; mode: "move" | "end"; days: number } | null>(null);
  const onDown = (ev: React.PointerEvent, e: TimelineEvent, mode: "move" | "end") => {
    ev.stopPropagation();
    try {
      (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      // sem captura, o arrasto continua pelos eventos do quadro
    }
    drag.current = { id: e.id, mode, x: ev.clientX, start: new Date(e.startAt), end: new Date(e.endAt) };
    setDelta({ id: e.id, mode, days: 0 });
  };
  const onMove = (ev: React.PointerEvent) => {
    if (!drag.current) return;
    setDelta({ id: drag.current.id, mode: drag.current.mode, days: Math.round((ev.clientX - drag.current.x) / PX) });
  };
  const onUp = () => {
    const d = drag.current;
    const n = delta?.days ?? 0;
    drag.current = null;
    setDelta(null);
    if (!d) return;
    if (n === 0) return d.mode === "move" ? onOpen(d.id) : undefined;
    const startAt = d.mode === "move" ? new Date(d.start.getTime() + n * DAY) : d.start;
    const endAt = new Date(d.end.getTime() + n * DAY);
    if (endAt <= startAt) return toast.error("A montagem precisa durar pelo menos um dia");
    move.mutate({ id: d.id, startAt, endAt });
  };

  const width = days * PX;
  const monthMarks = Array.from({ length: days }, (_, i) => addDays(from, i)).map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || d.getDate() === 1);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}><ChevronLeft /></Button>
          <Button variant="outline" onClick={() => setCursor(() => { const d = startOfDay(new Date()); d.setDate(1); return d; })}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}><ChevronRight /></Button>
          <span className="font-semibold capitalize">{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
          <select className="h-9 rounded-md border bg-background px-2" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m === 1 ? "1 mês" : `${m} meses`}</option>)}
          </select>
          <label className="ml-auto flex items-center gap-2">Equipes de montagem
            <Input type="number" min={1} max={50} className="h-9 w-20" value={capacity} onChange={(e) => setTeams(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </div>
        {firstShort >= 0 ? (
          <p className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" />A partir de {short(addDays(from, firstShort))} há mais montagens ao mesmo tempo do que equipes ({capacity}). Esse é o momento de contratar ou de mudar datas.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum dia com mais montagens que equipes neste período. Arraste uma barra para mudar a data; arraste a ponta direita para mudar quanto tempo dura.</p>
        )}
        <div className="overflow-x-auto rounded-md border" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div style={{ width: width + 220 }} className="relative select-none text-xs">
            {/* meses e dias */}
            <div className="sticky top-0 z-10 flex border-b bg-background">
              <div className="sticky left-0 z-20 w-[220px] shrink-0 border-r bg-background p-2 font-medium">Montagem</div>
              <div className="relative" style={{ width, height: 40 }}>
                {monthMarks.map(({ d, i }) => <span key={i} className="absolute top-1 font-semibold capitalize" style={{ left: i * PX + 4 }}>{d.toLocaleDateString("pt-BR", { month: "short" })}</span>)}
                {Array.from({ length: days }, (_, i) => { const d = addDays(from, i); return <span key={i} className={cn("absolute bottom-1 w-[30px] text-center", d.getDay() === 0 && "text-muted-foreground/60")} style={{ left: i * PX }}>{d.getDate()}</span>; })}
              </div>
            </div>
            {/* carga por dia */}
            <div className="flex border-b">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r bg-background p-2 text-muted-foreground">Montagens no dia / equipes</div>
              <div className="relative" style={{ width, height: 30 }}>
                {load.booked.map((b, i) => {
                  const total = b + load.planned[i];
                  if (!total) return null;
                  return <span key={i} title={`${b} marcada(s), ${load.planned[i]} prevista(s)`} className={cn("absolute top-1 flex h-6 w-[28px] items-center justify-center rounded", total > capacity ? "bg-destructive text-destructive-foreground" : "bg-muted")} style={{ left: i * PX + 1 }}>{total}</span>;
                })}
              </div>
            </div>
            {/* compromissos */}
            {rows.map((e) => {
              const d = delta?.id === e.id ? delta : null;
              const a = dayIndex(from, new Date(e.startAt)) + (d?.mode === "move" ? d.days : 0);
              const len = Math.max(1, dayIndex(new Date(e.startAt), new Date(new Date(e.endAt).getTime() - 1)) + 1 + (d ? d.days * (d.mode === "end" ? 1 : 0) : 0));
              return (
                <div key={e.id} className="flex border-b last:border-b-0">
                  <button type="button" className="sticky left-0 z-10 w-[220px] shrink-0 truncate border-r bg-background p-2 text-left hover:underline" title={e.title} onClick={() => onOpen(e.id)}>
                    <span className="font-medium">{e.title}</span>
                    <span className="block truncate text-muted-foreground">{e.type.name}{e.clientName ? ` · ${e.clientName}` : ""}</span>
                  </button>
                  <div className="relative" style={{ width, height: 44 }}>
                    <div
                      className={cn("absolute top-2 flex h-7 cursor-grab items-center overflow-hidden rounded px-2 text-white shadow-sm active:cursor-grabbing", e.status === "COMPLETED" && "opacity-60")}
                      style={{ left: a * PX + 1, width: len * PX - 2, background: e.type.color || "#C8551F", touchAction: "none" }}
                      title={`${e.title}: ${short(new Date(e.startAt))} a ${short(new Date(new Date(e.endAt).getTime() - 1))}`}
                      onPointerDown={(ev) => onDown(ev, e, "move")}
                    >
                      <span className="truncate">{len} {len > 1 ? "dias" : "dia"}</span>
                      <span className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/20" onPointerDown={(ev) => onDown(ev, e, "end")} />
                    </div>
                  </div>
                </div>
              );
            })}
            {/* previstas */}
            {forecasts.map((f) => (
              <div key={f.id} className="flex border-b last:border-b-0">
                <div className="sticky left-0 z-10 w-[220px] shrink-0 truncate border-r bg-background p-2 text-muted-foreground" title={f.label}>
                  <span className="font-medium">{f.label}</span>
                  <span className="block">prevista · sem data marcada</span>
                </div>
                <div className="relative" style={{ width, height: 44 }}>
                  <div className="absolute top-2 flex h-7 items-center rounded border-2 border-dashed border-primary/60 px-2 text-primary" style={{ left: Math.max(0, dayIndex(from, f.start)) * PX + 1, width: FORECAST_DAYS * PX - 2 }} title={`Entrega prevista em ${short(f.start)}. Marque a montagem na agenda.`}>
                    prevista
                  </div>
                </div>
              </div>
            ))}
            {!rows.length && !forecasts.length && <p className="p-6 text-center text-muted-foreground">{events.isLoading ? "Carregando…" : "Nenhuma montagem neste período."}</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Prevista: pedido na produção com previsão de entrega e sem montagem marcada; conta {FORECAST_DAYS} dias a partir da entrega prevista. O número de equipes começa pelos montadores ativos e pode ser ajustado.</p>
      </CardContent>
    </Card>
  );
}
