import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardPaste, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
type Task = { id: string; date: string; person: string; title: string; reference: string | null; items: Item[]; done: boolean };
type Plan = { weekStart: string; days: string[]; today: string; people: string[]; tasks: Task[]; summary: { person: string; total: number; done: number }[]; suggestions: string[] };
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

  const key = ["week-plan", week ?? "atual"];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Plan }>("/production/week-plan", week ? { week } : undefined) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["week-plan"] });
  const fail = (fallback: string) => (e: unknown) => toast.error(errorMessage(e, fallback));

  const check = useMutation({
    mutationFn: (v: { id: string; done: boolean; item?: number }) => apiPatch(`/production/week-plan/tasks/${v.id}/check`, { done: v.done, item: v.item }),
    onSuccess: refresh,
    onError: fail("Não foi possível marcar a tarefa"),
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

  if (q.isLoading) return <PageSkeleton />;
  if (!d) return <p className="p-6 text-sm text-muted-foreground">Não foi possível carregar o planejamento.</p>;

  const total = d.tasks.length;
  const done = d.tasks.filter((t) => t.done).length;
  const blank = (date: string, person = ""): Editing => ({ id: null, date, person, title: "", reference: "", items: "" });

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
          {mine && d.people.some((p) => plain(p) === mine) && (
            <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Só as minhas</label>
          )}
        </CardContent>
      </Card>

      {!d.people.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma tarefa nesta semana.{canManage ? " Clique em Colar do WhatsApp para trazer o planejamento que você já escreve, ou em Nova tarefa." : ""}
        </CardContent></Card>
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
                              {cell.map((t) => (
                                <div key={t.id} className={`group rounded-md border p-2 ${t.done ? "border-success/40 bg-success/5" : "bg-background"}`}>
                                  <div className="flex items-start gap-2">
                                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={t.done} disabled={check.isPending} title={t.done ? "Desmarcar" : "Marcar como feito"} onChange={(e) => check.mutate({ id: t.id, done: e.target.checked })} />
                                    <div className="min-w-0 flex-1">
                                      <p className={`break-words leading-snug ${t.done ? "text-muted-foreground line-through" : "font-medium"}`}>{t.title}</p>
                                      {t.reference && <p className="text-xs text-muted-foreground">{t.reference}</p>}
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
                                          <label className="flex items-start gap-1.5 text-xs">
                                            <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 shrink-0" checked={it.done} disabled={check.isPending} onChange={(e) => check.mutate({ id: t.id, done: e.target.checked, item: k })} />
                                            <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.text}</span>
                                          </label>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
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
