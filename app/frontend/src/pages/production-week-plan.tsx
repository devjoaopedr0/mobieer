import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardPaste, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/ui/states";
import { useAuth } from "@/hooks/use-auth";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type Item = { text: string; done: boolean };
type Task = { id: string; date: string; person: string; title: string; reference: string | null; items: Item[]; done: boolean; missedReason: string | null; missedNote: string | null; movedTo: string | null; moved: boolean };
type Reason = { code: string; label: string };
type WeekSummary = { total: number; done: number; missed: number; late: number; open: number; reasons: (Reason & { count: number })[] };
type Plan = { weekStart: string; days: string[]; today: string; people: string[]; tasks: Task[]; summary: { person: string; total: number; done: number }[]; week: WeekSummary; reasons: Reason[]; suggestions: string[] };
type Missing = { task: Task; reason: string; note: string; moveTo: string };
type Parsed = { weekStart: string; tasks: { date: string; person: string; title: string; items: Item[] }[]; warnings: string[] };
type Editing = { id: string | null; date: string; person: string; title: string; reference: string; items: string };

const WEEKDAY = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const br = (iso: string) => iso.slice(5).split("-").reverse().join("/");
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Planejamento da semana da produção: quem faz o quê em cada dia. */
export function ProductionWeekPlanPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const canManage = can("organization.manage") || can("production.steps");
  const [week, setWeek] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Parsed | null>(null);
  // "semana" é a grade; "dia" mostra só as metas de um dia, para o celular ou a TV da fábrica
  // "planner": colunas por dia, como o planner pessoal (o jeito que a loja acha mais fácil de marcar)
  const [view, setView] = useState<"planner" | "semana" | "dia">("planner");
  const [quick, setQuick] = useState<Record<string, string>>({});
  const [dragDay, setDragDay] = useState<string | null>(null);
  const [dayPick, setDayPick] = useState<string | null>(null);
  const [missing, setMissing] = useState<Missing | null>(null);

  const key = ["week-plan", week ?? "atual"];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Plan }>("/production/week-plan", week ? { week } : undefined) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["week-plan"] });
  const fail = (fallback: string) => (e: unknown) => toast.error(errorMessage(e, fallback));

  const check = useMutation({
    mutationFn: (v: { id: string; done: boolean; item?: number }) => apiPatch(`/production/week-plan/tasks/${v.id}/check`, { done: v.done, item: v.item }),
    onSuccess: refresh,
    onError: fail("Não foi possível marcar a tarefa"),
  });
  const missed = useMutation({
    mutationFn: (v: { id: string; reason: string | null; note?: string; moveTo?: string }) =>
      apiPatch<{ message?: string }>(`/production/week-plan/tasks/${v.id}/missed`, { reason: v.reason, note: v.note?.trim() || null, moveTo: v.moveTo || null }),
    onSuccess: (r) => { toast.success(r.message ?? "Motivo registrado"); setMissing(null); refresh(); },
    onError: fail("Não foi possível registrar o motivo"),
  });
  // "+ item" da coluna: "VIVIANE: finalizar a cozinha"; sem nome, fica para a equipe
  const quickAdd = useMutation({
    mutationFn: (v: { date: string; text: string }) => {
      const m = /^\s*([^:]{2,30}):\s*(.+)$/.exec(v.text);
      return apiPost("/production/week-plan/tasks", { date: v.date, person: (m ? m[1] : "EQUIPE").trim(), title: (m ? m[2] : v.text).trim(), reference: null, items: [] });
    },
    onSuccess: refresh,
    onError: fail("Não foi possível adicionar a tarefa"),
  });
  const moveDay = useMutation({
    mutationFn: (v: { id: string; date: string }) => apiPatch(`/production/week-plan/tasks/${v.id}`, { date: v.date }),
    onSuccess: refresh,
    onError: fail("Não foi possível mover a tarefa"),
  });
  const save = useMutation({
    mutationFn: (e: Editing) => {
      const body = { date: e.date, person: e.person.trim(), title: e.title.trim(), reference: e.reference.trim() || null, items: e.items.split("\n").map((l) => l.replace(/^[-–•\s]+/, "").trim()).filter(Boolean).map((text) => ({ text, done: false })) };
      if (!e.id) return apiPost("/production/week-plan/tasks", body);
      // ao editar, a subtarefa que continua com o mesmo texto mantém a marca de feita
      const old = q.data?.data.tasks.find((t) => t.id === e.id)?.items ?? [];
      return apiPatch(`/production/week-plan/tasks/${e.id}`, { ...body, items: body.items.map((i) => ({ ...i, done: old.find((o) => o.text === i.text)?.done ?? false })) });
    },
    onSuccess: () => { toast.success("Tarefa salva"); setEditing(null); refresh(); },
    onError: fail("Não foi possível salvar a tarefa"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/production/week-plan/tasks/${id}`),
    onSuccess: () => { toast.success("Tarefa removida"); setEditing(null); refresh(); },
    onError: fail("Não foi possível remover a tarefa"),
  });
  const parse = useMutation({
    mutationFn: () => apiPost<{ data: Parsed }>("/production/week-plan/parse", { text: pasteText }),
    onSuccess: (r) => setPreview(r.data),
    onError: fail("Não foi possível ler o texto"),
  });
  const importTasks = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/production/week-plan/import", { tasks: preview!.tasks }),
    onSuccess: (r) => { toast.success(r.message ?? "Planejamento importado"); const w = preview!.weekStart; setPasteOpen(false); setPreview(null); setPasteText(""); setWeek(w); refresh(); },
    onError: fail("Não foi possível importar o planejamento"),
  });

  const d = q.data?.data;
  // "minhas tarefas": o primeiro nome do usuário, como a loja escreve no planejamento
  const mine = plain((user?.name ?? "").split(" ")[0] ?? "");
  const people = useMemo(() => (d ? d.people.filter((p) => !onlyMine || plain(p) === mine) : []), [d, onlyMine, mine]);
  // sábado só aparece quando tem tarefa
  const days = useMemo(() => (d ? d.days.filter((day, i) => i < 5 || d.tasks.some((t) => t.date === day)) : []), [d]);
  // quem executa (e não monta o planejamento) abre vendo só as próprias tarefas; dá para desmarcar
  const [autoMine, setAutoMine] = useState(false);
  useEffect(() => {
    if (!autoMine && d && !canManage && mine && d.people.some((p) => plain(p) === mine)) {
      setOnlyMine(true);
      setAutoMine(true);
    }
  }, [d, canManage, mine, autoMine]);

  if (q.isLoading) return <PageSkeleton />;
  if (!d) return <p className="p-6 text-sm text-muted-foreground">Não foi possível carregar o planejamento.</p>;

  const total = d.tasks.length;
  const done = d.tasks.filter((t) => t.done).length;
  const blank = (date: string, person = ""): Editing => ({ id: null, date, person, title: "", reference: "", items: "" });
  const reasonLabel = (code: string | null) => d.reasons.find((r) => r.code === code)?.label ?? "Outro";
  const day = dayPick && days.includes(dayPick) ? dayPick : days.includes(d.today) ? d.today : days[0];
  // para onde passar a tarefa não cumprida: os próximos dias úteis, desta semana e da seguinte
  const moveOptions = (from: string) => [...d.days.slice(0, 5), ...d.days.slice(0, 5).map((x) => shift(x, 7))].filter((x) => x > from && x >= d.today);
  const weekdayOf = (iso: string) => WEEKDAY[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7] ?? "";

  const taskCard = (t: Task, big = false, showPerson = false) => {
    const late = !t.done && !t.missedReason && t.date < d.today;
    const tone = t.done ? "border-success/40 bg-success/5" : t.missedReason ? "border-destructive/40 bg-destructive/5" : late ? "border-warning bg-warning/10" : "bg-background";
    return (
      <div key={t.id} className={`group rounded-md border p-2 ${tone}`} draggable={showPerson && canManage} onDragStart={(e) => { e.dataTransfer.setData("text/plan-id", t.id); e.dataTransfer.effectAllowed = "move"; }}>
        {showPerson && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{t.person}</p>}
        <div className="flex items-start gap-2">
          <input type="checkbox" className={`mt-0.5 shrink-0 ${big ? "h-5 w-5" : "h-5 w-5 sm:h-4 sm:w-4"}`} checked={t.done} disabled={check.isPending} title={t.done ? "Desmarcar" : "Marcar como feito"} onChange={(e) => check.mutate({ id: t.id, done: e.target.checked })} />
          <div className="min-w-0 flex-1">
            <p className={`break-words leading-snug ${big ? "text-base" : ""} ${t.done ? "text-muted-foreground line-through" : "font-medium"}`}>{t.title}</p>
            {t.reference && <p className="text-xs text-muted-foreground">{t.reference}</p>}
            {t.moved && <p className="text-xs text-muted-foreground">veio de outro dia</p>}
          </div>
          {canManage && (
            <button type="button" className="shrink-0 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100" title="Editar tarefa" onClick={() => setEditing({ id: t.id, date: t.date, person: t.person, title: t.title, reference: t.reference ?? "", items: t.items.map((i) => i.text).join("\n") })}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {t.items.length > 0 && (
          <ul className="mt-1.5 space-y-1 pl-6">
            {t.items.map((it, k) => (
              <li key={k}>
                <label className={`flex items-start gap-1.5 ${big ? "text-sm" : "text-xs"}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" checked={it.done} disabled={check.isPending} onChange={(e) => check.mutate({ id: t.id, done: e.target.checked, item: k })} />
                  <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {!t.done && t.missedReason && (
          <div className="mt-1.5 rounded bg-destructive/10 px-2 py-1 text-xs">
            <p><span className="font-semibold text-destructive">Não cumprida:</span> {reasonLabel(t.missedReason)}{t.missedNote ? ` — ${t.missedNote}` : ""}</p>
            {t.movedTo && <p className="text-muted-foreground">Passada para {weekdayOf(t.movedTo).toLowerCase()} {br(t.movedTo)}</p>}
            <button type="button" className="text-muted-foreground underline hover:text-foreground" onClick={() => setMissing({ task: t, reason: t.missedReason!, note: t.missedNote ?? "", moveTo: "" })}>alterar</button>
            {" · "}
            <button type="button" className="text-muted-foreground underline hover:text-foreground" disabled={missed.isPending} onClick={() => missed.mutate({ id: t.id, reason: null })}>desfazer</button>
          </div>
        )}
        {!t.done && !t.missedReason && t.date <= d.today && (
          <button type="button" className={`mt-1.5 flex items-center gap-1 text-xs underline ${late ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setMissing({ task: t, reason: "", note: "", moveTo: "" })}>
            {late && <AlertTriangle className="h-3 w-3" />} {late ? "Não foi feita — informar o motivo" : "Não cumprida"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Planejamento da semana" description="Quem faz o quê em cada dia da produção. Quem executa marca o que já foi feito.">
        {canManage && (
          <>
            <Button variant="outline" onClick={() => { setPasteOpen(true); setPreview(null); }}><ClipboardPaste className="mr-1 h-4 w-4" /> Colar do WhatsApp</Button>
            <Button onClick={() => setEditing(blank(days.includes(d.today) ? d.today : days[0]))}><Plus className="mr-1 h-4 w-4" /> Nova tarefa</Button>
          </>
        )}
      </PageHeader>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" title="Semana anterior" onClick={() => setWeek(shift(d.weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => setWeek(null)}>Esta semana</Button>
            <Button variant="outline" size="icon" title="Próxima semana" onClick={() => setWeek(shift(d.weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <p className="text-sm font-medium">Semana de {br(d.weekStart)} a {br(days[days.length - 1])}</p>
          <Badge variant={total && done === total ? "success" : "secondary"}>{done} de {total} feitas</Badge>
          <div className="flex overflow-hidden rounded-md border text-sm">
            {(["planner", "semana", "dia"] as const).map((v) => (
              <button key={v} type="button" className={`px-3 py-1.5 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setView(v)}>{v === "planner" ? "Planner" : v === "semana" ? "Por pessoa" : "Dia"}</button>
            ))}
          </div>
          {mine && d.people.some((p) => plain(p) === mine) && (
            <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Só as minhas</label>
          )}
        </CardContent>
      </Card>

      {total > 0 && (d.week.missed > 0 || d.week.late > 0) && (
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p className="font-medium">Fechamento da semana</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{d.week.done} cumpridas</Badge>
              {d.week.missed > 0 && <Badge variant="danger">{d.week.missed} não cumpridas</Badge>}
              {d.week.late > 0 && <Badge variant="warning">{d.week.late} sem justificativa</Badge>}
              {d.week.open > 0 && <Badge variant="secondary">{d.week.open} em aberto</Badge>}
            </div>
            {d.week.reasons.length > 0 && <p className="text-muted-foreground">Motivos: {d.week.reasons.map((r) => `${r.label} (${r.count})`).join(" · ")}</p>}
          </CardContent>
        </Card>
      )}

      {view === "planner" ? (
        <div className="space-y-2">
          {canManage && <p className="text-xs text-muted-foreground">Escreva em "+ item" e aperte Enter. Para dizer de quem é, comece com o nome e dois-pontos: <span className="font-medium">VIVIANE: finalizar a cozinha</span>. Arraste a tarefa para outro dia para reagendar.</p>}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {days.map((x) => {
              const list = d.tasks.filter((t) => t.date === x && people.includes(t.person));
              return (
                <div key={x} className={`rounded-lg border bg-card p-2.5 ${x === d.today ? "border-primary/60 bg-primary/[0.04]" : ""} ${dragDay === x ? "ring-2 ring-primary" : ""}`}
                  onDragOver={(e) => { if (canManage) { e.preventDefault(); setDragDay(x); } }}
                  onDragLeave={() => setDragDay((s) => (s === x ? null : s))}
                  onDrop={(e) => { e.preventDefault(); setDragDay(null); const id = e.dataTransfer.getData("text/plan-id"); const t = d.tasks.find((k) => k.id === id); if (canManage && t && t.date !== x) moveDay.mutate({ id, date: x }); }}>
                  <p className="mb-2 flex items-baseline justify-between text-sm font-semibold">
                    <span>{WEEKDAY[d.days.indexOf(x)]} <span className="font-normal text-muted-foreground">{br(x)}</span>{x === d.today && <span className="ml-1 text-primary">· hoje</span>}</span>
                    <span className="text-xs font-normal text-muted-foreground">{list.filter((t) => t.done).length}/{list.length}</span>
                  </p>
                  <div className="space-y-1.5">{list.map((t) => taskCard(t, false, true))}</div>
                  {canManage && (
                    <Input className="mt-2 h-8 text-xs" placeholder="+ item" aria-label={`Nova tarefa em ${WEEKDAY[d.days.indexOf(x)]}`} value={quick[x] ?? ""} disabled={quickAdd.isPending}
                      onChange={(e) => setQuick((s) => ({ ...s, [x]: e.target.value }))}
                      onKeyDown={(e) => { const v = (quick[x] ?? "").trim(); if (e.key === "Enter" && v) { quickAdd.mutate({ date: x, text: v }); setQuick((s) => ({ ...s, [x]: "" })); } }} />
                  )}
                  {!list.length && !canManage && <p className="py-3 text-center text-xs text-muted-foreground">—</p>}
                </div>
              );
            })}
          </div>
        </div>
      ) : !d.people.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma tarefa nesta semana.{canManage ? " Clique em Colar do WhatsApp para trazer o planejamento que você já escreve, ou em Nova tarefa." : ""}
        </CardContent></Card>
      ) : view === "dia" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {days.map((x) => (
              <Button key={x} size="sm" variant={x === day ? "default" : "outline"} onClick={() => setDayPick(x)}>
                {WEEKDAY[d.days.indexOf(x)]} {br(x)}{x === d.today ? " · hoje" : ""}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => {
              const cell = d.tasks.filter((t) => t.person === person && t.date === day);
              if (!cell.length && !canManage) return null;
              return (
                <Card key={person}>
                  <CardContent className="space-y-2 pt-5">
                    <div className="flex items-baseline justify-between"><p className="text-base font-semibold">{person}</p><p className="text-xs text-muted-foreground">{cell.filter((t) => t.done).length} de {cell.length}</p></div>
                    {cell.length ? cell.map((t) => taskCard(t, true)) : <p className="text-sm text-muted-foreground">Sem metas neste dia.</p>}
                    {canManage && <button type="button" className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setEditing(blank(day, person))}><Plus className="h-3 w-3" /> tarefa</button>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {!d.tasks.some((t) => t.date === day) && !canManage && <p className="text-sm text-muted-foreground">Nenhuma meta neste dia.</p>}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="w-32 border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">Pessoa</th>
                  {days.map((day, i) => (
                    <th key={day} className={`border-b border-r p-2 text-left text-xs font-medium last:border-r-0 ${day === d.today ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}>
                      {WEEKDAY[d.days.indexOf(day)] ?? ""} <span className="font-normal">{br(day)}</span>{day === d.today && <span className="ml-1 text-primary">· hoje</span>}
                      {i === 0 && null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const sum = d.summary.find((s) => s.person === person);
                  return (
                    <tr key={person} className={plain(person) === mine ? "bg-primary/[0.03]" : ""}>
                      <td className="border-b border-r p-2 align-top">
                        <p className="font-semibold">{person}</p>
                        {sum && <p className="text-xs text-muted-foreground">{sum.done} de {sum.total}</p>}
                      </td>
                      {days.map((day) => {
                        const cell = d.tasks.filter((t) => t.person === person && t.date === day);
                        return (
                          <td key={day} className={`border-b border-r p-1.5 align-top last:border-r-0 ${day === d.today ? "bg-primary/[0.04]" : ""}`}>
                            <div className="space-y-1.5">
                              {cell.map((t) => taskCard(t))}
                              {canManage && (
                                <button type="button" className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setEditing(blank(day, person))}>
                                  <Plus className="h-3 w-3" /> tarefa
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* nova tarefa / editar */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Pessoa</Label>
                  <Input list="wp-people" value={editing.person} placeholder="Ex.: VIVIANE" onChange={(e) => setEditing({ ...editing, person: e.target.value })} />
                  <datalist id="wp-people">{d.suggestions.map((s) => <option key={s} value={s} />)}</datalist>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dia</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })}>
                    {d.days.map((day, i) => <option key={day} value={day}>{WEEKDAY[i]} {br(day)}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Tarefa</Label><Input value={editing.title} placeholder="Ex.: Finalizar a cozinha" onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Cliente ou projeto (opcional)</Label><Input value={editing.reference} placeholder="Ex.: David Bruno" onChange={(e) => setEditing({ ...editing, reference: e.target.value })} /></div>
              <div className="space-y-1">
                <Label className="text-xs">Passos (opcional, um por linha)</Label>
                <Textarea rows={4} value={editing.items} placeholder={"corte da viga" + String.fromCharCode(10) + "rasgo de fundo" + String.fromCharCode(10) + "pré montar"} onChange={(e) => setEditing({ ...editing, items: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            {editing?.id && <Button variant="ghost" className="mr-auto text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(editing.id!)}><Trash2 className="mr-1 h-4 w-4" /> Remover</Button>}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={!editing || !editing.person.trim() || !editing.title.trim() || save.isPending} onClick={() => editing && save.mutate(editing)}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* não cumprida: motivo e, para quem monta, passar para outro dia */}
      <Dialog open={missing !== null} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tarefa não cumprida</DialogTitle>
            <DialogDescription>{missing ? `${missing.task.person} — ${missing.task.title} (${br(missing.task.date)})` : ""}</DialogDescription>
          </DialogHeader>
          {missing && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs">Qual foi o motivo?</Label>
                <div className="flex flex-wrap gap-1.5">
                  {d.reasons.map((r) => (
                    <button key={r.code} type="button" aria-pressed={missing.reason === r.code} className={`rounded-full border px-3 py-1 text-xs ${missing.reason === r.code ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setMissing({ ...missing, reason: r.code })}>{r.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{missing.reason === "OUTRO" ? "Escreva o motivo" : "Detalhe (opcional)"}</Label>
                <Textarea rows={2} maxLength={300} value={missing.note} placeholder="Ex.: a chapa de MDF não chegou" onChange={(e) => setMissing({ ...missing, note: e.target.value })} />
              </div>
              {canManage && !missing.task.movedTo && (
                <div className="space-y-1">
                  <Label className="text-xs">Passar para outro dia</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={missing.moveTo} onChange={(e) => setMissing({ ...missing, moveTo: e.target.value })}>
                    <option value="">Não passar</option>
                    {moveOptions(missing.task.date).map((x) => <option key={x} value={x}>{weekdayOf(x)} {br(x)}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">A tarefa é criada no novo dia só com os passos que faltaram; esta fica registrada como não cumprida.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissing(null)}>Cancelar</Button>
            <Button disabled={!missing || !missing.reason || (missing.reason === "OUTRO" && !missing.note.trim()) || missed.isPending} onClick={() => missing && missed.mutate({ id: missing.task.id, reason: missing.reason, note: missing.note, moveTo: missing.moveTo })}>
              {missed.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* colar o planejamento do WhatsApp */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Colar o planejamento do WhatsApp</DialogTitle>
            <DialogDescription>Cole o texto como você já escreve: a semana, os dias, o nome de cada pessoa entre asteriscos e as tarefas embaixo. Linha começando com "-" vira um passo da tarefa de cima.</DialogDescription>
          </DialogHeader>
          {!preview ? (
            <Textarea rows={14} value={pasteText} placeholder={["PLANEJAMENTO SEMANA 13/10 - 16/10", "", "TERÇA FEIRA:", "", "*VIVIANE*", "finalizar a cozinha", "-corte da viga", "-rasgo de fundo"].join(String.fromCharCode(10))} onChange={(e) => setPasteText(e.target.value)} />
          ) : (
            <div className="space-y-3 text-sm">
              <p>Semana de <span className="font-medium">{br(preview.weekStart)}</span> · <span className="font-medium">{preview.tasks.length}</span> {preview.tasks.length === 1 ? "tarefa" : "tarefas"}. Confira antes de adicionar:</p>
              {preview.warnings.length > 0 && <ul className="list-disc space-y-0.5 rounded-md bg-warning/15 p-2.5 pl-6 text-xs">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {preview.tasks.map((t, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-muted-foreground">{br(t.date)} · </span><span className="font-semibold">{t.person}</span> — {t.title}
                    {t.items.length > 0 && <span className="text-muted-foreground"> ({t.items.map((x) => x.text).join("; ")})</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">As tarefas são acrescentadas à semana; o que já estiver lá continua.</p>
            </div>
          )}
          <DialogFooter>
            {preview && <Button variant="ghost" className="mr-auto" onClick={() => setPreview(null)}>Voltar ao texto</Button>}
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancelar</Button>
            {!preview ? (
              <Button disabled={!pasteText.trim() || parse.isPending} onClick={() => parse.mutate()}>{parse.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Conferir</Button>
            ) : (
              <Button disabled={!preview.tasks.length || importTasks.isPending} onClick={() => importTasks.mutate()}>{importTasks.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Adicionar ao planejamento</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
