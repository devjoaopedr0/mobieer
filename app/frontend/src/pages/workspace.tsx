import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, MessageSquareText, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/states";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";
import { cn, errorMessage, localIsoDate } from "@/lib/utils";

type Note = { id: string; title: string | null; body: string; pinned: boolean; color: string | null; updatedAt: string };
type PlannerItem = { id: string; weekOf: string; weekday: number; text: string; done: boolean; position: number; note: string | null; dueAt: string | null };

const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// As datas do planner são dias de calendário ("aaaa-mm-dd"), sem fuso: somar dias em
// UTC ao meio-dia evita o dia "andar" para trás no horário de Brasília.
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Segunda-feira da semana de um dia de calendário. */
export function mondayOfDay(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}
const thisMonday = () => mondayOfDay(localIsoDate(new Date()));
const fmtDay = (weekOf: string, weekday: number) => addDays(weekOf, weekday).slice(5).split("-").reverse().join("/");
const fmtShort = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

/* ============================ notas ============================ */

function Notes() {
  const qc = useQueryClient();
  const key = ["workspace", "notes"];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Note[] }>("/workspace/notes") });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const [draft, setDraft] = useState({ title: "", body: "" });
  const create = useMutation({
    mutationFn: () => apiPost("/workspace/notes", draft),
    onSuccess: () => { setDraft({ title: "", body: "" }); invalidate(); },
    onError: (e) => toast.error(errorMessage(e, "Falha ao criar nota")),
  });
  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) => apiPatch(`/workspace/notes/${id}`, data),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Falha ao salvar")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/workspace/notes/${id}`),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Falha ao remover")),
  });

  if (q.isLoading) return <PageSkeleton />;
  const notes = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Nova nota</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Título (opcional)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Textarea rows={3} placeholder="Escreva aqui…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="flex justify-end">
            <Button size="sm" disabled={create.isPending || draft.body.trim().length === 0} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem notas ainda.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <div key={n.id} className={cn("rounded-lg border border-border bg-card p-3", n.pinned && "ring-1 ring-primary/40")}>
              <div className="flex items-start justify-between gap-2">
                {n.title ? <p className="text-sm font-semibold">{n.title}</p> : <span />}
                <div className="flex shrink-0 gap-1">
                  <button className="text-muted-foreground hover:text-foreground" title={n.pinned ? "Desafixar" : "Fixar"} onClick={() => patch.mutate({ id: n.id, data: { pinned: !n.pinned } })}>
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button className="text-muted-foreground hover:text-destructive" title="Remover" onClick={() => remove.mutate(n.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Textarea
                rows={Math.min(10, Math.max(2, n.body.split("\n").length))}
                defaultValue={n.body}
                className="mt-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                onBlur={(e) => e.target.value !== n.body && patch.mutate({ id: n.id, data: { body: e.target.value } })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ planner semanal ============================ */

type Editing = { item: PlannerItem; text: string; note: string; dueAt: string; target: string };

function Planner() {
  const qc = useQueryClient();
  const [weekOf, setWeekOf] = useState(thisMonday);
  const key = ["workspace", "planner", weekOf];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: { weekOf: string; items: PlannerItem[] } }>("/workspace/planner", { weekOf }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace", "planner"] });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const add = useMutation({
    mutationFn: ({ weekday, text }: { weekday: number; text: string }) => apiPost("/workspace/planner", { weekOf, weekday, text }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Falha ao adicionar")),
  });
  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiPatch(`/workspace/planner/${id}`, data),
    onSuccess: () => { setEditing(null); invalidate(); },
    onError: (e) => toast.error(errorMessage(e, "Falha ao salvar o item")),
  });
  const remove = useMutation({ mutationFn: (id: string) => apiDelete(`/workspace/planner/${id}`), onSuccess: () => { setEditing(null); invalidate(); } });

  const byDay = useMemo(() => {
    const m: Record<number, PlannerItem[]> = {};
    for (let i = 0; i < 7; i++) m[i] = [];
    for (const it of q.data?.data.items ?? []) (m[it.weekday] ??= []).push(it);
    return m;
  }, [q.data]);

  const today = localIsoDate(new Date());
  const weekLabel = `${fmtShort(weekOf)} – ${fmtShort(addDays(weekOf, 6))}`;
  // para onde um item pode ir: os dias desta semana e da próxima
  const targets = [...Array.from({ length: 7 }, (_, i) => addDays(weekOf, i)), ...Array.from({ length: 7 }, (_, i) => addDays(weekOf, 7 + i))];
  const dayOf = (it: PlannerItem) => addDays(weekOf, it.weekday);
  const moveTo = (id: string, day: string) => patch.mutate({ id, data: { weekOf: mondayOfDay(day), weekday: (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 } });
  const save = () => {
    if (!editing) return;
    const { item, text, note, dueAt, target } = editing;
    patch.mutate({ id: item.id, data: { text: text.trim() || item.text, note: note.trim() || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null, ...(target !== dayOf(item) ? { weekOf: mondayOfDay(target), weekday: (new Date(`${target}T12:00:00Z`).getUTCDay() + 6) % 7 } : {}) } });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" aria-label="Semana anterior" onClick={() => setWeekOf(addDays(weekOf, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium">{weekLabel}</span>
          <Button size="sm" variant="outline" aria-label="Próxima semana" onClick={() => setWeekOf(addDays(weekOf, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">Clique no item para pôr observação, data ou passar para outro dia. Também dá para arrastar para outra coluna.</p>
        <Button size="sm" variant="ghost" onClick={() => setWeekOf(thisMonday())}>Esta semana</Button>
      </div>

      {q.isLoading ? (
        <PageSkeleton />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {WEEKDAYS.map((label, wd) => {
            const day = addDays(weekOf, wd);
            return (
              <div key={wd} className={cn("rounded-lg border border-border bg-card p-2.5", day === today && "border-primary/60 bg-primary/[0.04]", dragOver === wd && "ring-2 ring-primary")}
                onDragOver={(e) => { e.preventDefault(); setDragOver(wd); }}
                onDragLeave={() => setDragOver((s) => (s === wd ? null : s))}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/planner-id"); const it = (q.data?.data.items ?? []).find((x) => x.id === id); if (it && it.weekday !== wd) moveTo(id, day); }}>
                <p className="mb-1.5 text-xs font-semibold">
                  {label} <span className="font-normal text-muted-foreground">{fmtDay(weekOf, wd)}</span>{day === today && <span className="ml-1 text-primary">· hoje</span>}
                </p>
                <div className="space-y-1">
                  {byDay[wd].map((it) => (
                    <div key={it.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/planner-id", it.id); e.dataTransfer.effectAllowed = "move"; }} className="group flex cursor-grab items-start gap-1.5 text-xs active:cursor-grabbing">
                      <input type="checkbox" checked={it.done} className="mt-0.5 h-3.5 w-3.5" aria-label={`Feito: ${it.text}`} onChange={() => patch.mutate({ id: it.id, data: { done: !it.done } })} />
                      <button type="button" className="min-w-0 flex-1 text-left" title="Abrir o item" onClick={() => setEditing({ item: it, text: it.text, note: it.note ?? "", dueAt: toLocalInput(it.dueAt), target: dayOf(it) })}>
                        <span className={cn("break-words", it.done && "text-muted-foreground line-through")}>{it.text}</span>
                        {it.dueAt && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-primary"><CalendarClock className="h-3 w-3" />{new Date(it.dueAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>}
                        {it.note && <span className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground"><MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />{it.note}</span>}
                      </button>
                    </div>
                  ))}
                </div>
                <Input
                  className="mt-1.5 h-7 text-xs"
                  placeholder="+ item"
                  value={drafts[wd] ?? ""}
                  onChange={(e) => setDrafts((s) => ({ ...s, [wd]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (drafts[wd] ?? "").trim()) {
                      add.mutate({ weekday: wd, text: drafts[wd].trim() });
                      setDrafts((s) => ({ ...s, [wd]: "" }));
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Item do planner</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1"><Label className="text-xs">O que é</Label><Input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Dia (passar para outro dia)</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value })}>
                    {targets.map((d, i) => <option key={d} value={d}>{WEEKDAYS[i % 7]} {d.slice(5).split("-").reverse().join("/")}{i >= 7 ? " (próxima semana)" : ""}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Data e hora combinadas (opcional)</Label><Input type="datetime-local" value={editing.dueAt} onChange={(e) => setEditing({ ...editing, dueAt: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Observação (opcional)</Label><Textarea rows={3} maxLength={1000} value={editing.note} placeholder="Ex.: marquei com o Sr. Maia, ele confirma na quinta" onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            {editing && <Button variant="ghost" className="mr-auto text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(editing.item.id)}><Trash2 className="mr-1 h-4 w-4" /> Remover</Button>}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={!editing || !editing.text.trim() || patch.isPending} onClick={save}>{patch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ page ============================ */

export function WorkspacePage() {
  // o planner é o que se usa todo dia: abre nele
  const [tab, setTab] = useState<"notas" | "planner">("planner");
  return (
    <div className="space-y-6">
      <PageHeader title="Meu espaço" description="Bloco de notas e planner semanal — só você vê." />
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "planner" ? "default" : "outline"} onClick={() => setTab("planner")}>Planner semanal</Button>
        <Button size="sm" variant={tab === "notas" ? "default" : "outline"} onClick={() => setTab("notas")}>Notas</Button>
      </div>
      {tab === "notas" ? <Notes /> : <Planner />}
    </div>
  );
}
