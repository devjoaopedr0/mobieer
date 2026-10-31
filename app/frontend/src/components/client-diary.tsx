import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, NotebookPen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { apiDelete, apiPost } from "@/services/api";

type Person = { id: string; name: string } | null;
export type DiaryEntry = {
  id: string;
  type: string;
  summary: string;
  result: string | null;
  occurredAt: string;
  nextAction: string | null;
  nextActionAt: string | null;
  responsible: Person;
  opportunity: { id: string; title: string } | null;
  lead: { id: string; name: string } | null;
  project: { id: string; code: string; name: string } | null;
  agendaEvent: { id: string; startAt: string; status: string } | null;
};
export type DiaryProject = { id: string; code: string; name: string };
export type DiaryMeeting = { id: string; title: string; startAt: string; location: string | null; responsible: Person; type: { name: string } };

export const DIARY_LABEL: Record<string, string> = {
  NOTE: "Anotação", MEETING: "Reunião", PROJECT_CHANGE: "Alteração de projeto", CALL: "Ligação", WHATSAPP: "WhatsApp", VISIT: "Visita", EMAIL: "E-mail",
  FOLLOW_UP: "Follow-up", PROPOSAL: "Proposta", NEGOTIATION: "Negociação", INTERNAL_MESSAGE: "Mensagem interna", OTHER: "Outro",
};
const NEW_TYPES = ["NOTE", "MEETING", "PROJECT_CHANGE", "CALL", "WHATSAPP", "VISIT", "EMAIL", "OTHER"];
const REMINDERS: [string, string][] = [["0", "Na hora"], ["15", "15 min antes"], ["30", "30 min antes"], ["60", "1 hora antes"], ["120", "2 horas antes"], ["1440", "1 dia antes"]];
const NO_PROJECT = "none";

const blank = () => ({ type: "NOTE", summary: "", projectId: NO_PROJECT, nextAction: "", nextActionAt: "", meet: false, meetAt: "", duration: "60", reminder: "60", location: "" });

/**
 * Diário do cliente: o que está acontecendo — reunião, alteração de projeto,
 * informação sobre o cliente — com projeto, próximo passo e reunião na agenda.
 */
export function ClientDiary({ clientId, entries, projects, meetings }: { clientId: string; entries: DiaryEntry[]; projects: DiaryProject[]; meetings: DiaryMeeting[] }) {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const canWrite = can("commercial.manage") || can("commercial.leads.manage");
  const [f, setF] = useState(blank);
  const [filter, setFilter] = useState("all");
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-client", clientId] });

  const save = useMutation({
    mutationFn: () =>
      apiPost<{ message?: string }>(`/commercial/clients/${clientId}/diary`, {
        type: f.type,
        summary: f.summary,
        projectId: f.projectId === NO_PROJECT ? null : f.projectId,
        nextAction: f.nextAction || null,
        nextActionAt: f.nextActionAt ? new Date(`${f.nextActionAt}T09:00`).toISOString() : null,
        meeting: f.meet && f.meetAt ? { startAt: new Date(f.meetAt).toISOString(), durationMinutes: Number(f.duration), reminderMinutes: Number(f.reminder), location: f.location || null } : null,
      }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Anotado no diário");
      setF(blank());
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/commercial/clients/${clientId}/diary/${id}`),
    onSuccess: () => { toast.success("Anotação apagada"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível apagar")),
  });

  const shown = filter === "all" ? entries : filter === NO_PROJECT ? entries.filter((e) => !e.project) : entries.filter((e) => e.project?.id === filter);
  const ready = f.summary.trim().length >= 2 && (!f.meet || !!f.meetAt);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="h-4 w-4" /> Diário do cliente <span className="text-sm font-normal text-muted-foreground">({entries.length})</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {meetings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium"><CalendarClock className="h-3.5 w-3.5" /> Próximos compromissos</p>
            {meetings.map((m) => (
              <p key={m.id} className="text-xs">
                <span className="font-medium">{formatDate(m.startAt, true)}</span> · {m.title}
                <span className="text-muted-foreground">{m.location ? ` · ${m.location}` : ""}{m.responsible ? ` · ${m.responsible.name}` : ""}</span>
              </p>
            ))}
            <Link to="/agenda" className="text-xs text-primary hover:underline">Abrir agenda</Link>
          </div>
        )}

        {canWrite && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v, meet: v === "MEETING" ? f.meet : false })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NEW_TYPES.map((t) => <SelectItem key={t} value={t}>{DIARY_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Projeto</Label>
                <Select value={f.projectId} onValueChange={(v) => setF({ ...f, projectId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>Sobre o cliente (sem projeto)</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{f.type === "MEETING" ? "Pauta / o que foi conversado" : f.type === "PROJECT_CHANGE" ? "O que mudou no projeto" : "O que está acontecendo"}</Label>
              <Textarea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="Ex.: cliente pediu para trocar o puxador da cozinha; arquiteta manda a planta nova na sexta." />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1">
                <Label>Próximo passo (opcional)</Label>
                <Input value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} placeholder="Ex.: enviar orçamento revisado" />
              </div>
              <div className="space-y-1">
                <Label>Para quando</Label>
                <Input type="date" value={f.nextActionAt} onChange={(e) => setF({ ...f, nextActionAt: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.meet} onCheckedChange={(v) => setF({ ...f, meet: v, type: v ? "MEETING" : f.type })} />
              Marcar reunião na agenda, com lembrete
            </label>
            {f.meet && (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Data e hora</Label>
                  <Input type="datetime-local" value={f.meetAt} onChange={(e) => setF({ ...f, meetAt: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Duração</Label>
                  <Select value={f.duration} onValueChange={(v) => setF({ ...f, duration: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[["30", "30 min"], ["60", "1 hora"], ["90", "1h30"], ["120", "2 horas"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Lembrete</Label>
                  <Select value={f.reminder} onValueChange={(v) => setF({ ...f, reminder: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{REMINDERS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-4">
                  <Label>Local (opcional)</Label>
                  <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Loja, obra, videochamada…" />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{f.meet ? "Anotar e marcar reunião" : "Anotar"}</Button>
            </div>
          </div>
        )}

        {projects.length > 0 && entries.length > 0 && (
          <div className="flex flex-wrap gap-1 text-xs">
            {[["all", "Tudo"], ...projects.map((p) => [p.id, p.code]), [NO_PROJECT, "Sem projeto"]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={filter === v} className={`rounded-md border px-2 py-1 ${filter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada anotado ainda.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((e) => (
              <div key={e.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.type === "PROJECT_CHANGE" ? "warning" : e.type === "MEETING" ? "default" : "secondary"}>{DIARY_LABEL[e.type] ?? e.type}</Badge>
                  {e.project && <Badge variant="outline">{e.project.code}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(e.occurredAt, true)}{e.responsible ? ` · ${e.responsible.name}` : ""}{e.opportunity ? ` · ${e.opportunity.title}` : e.lead ? ` · lead ${e.lead.name}` : ""}
                  </span>
                  {canWrite && (e.responsible?.id === user?.id || can("commercial.manage")) && (
                    <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label="Apagar anotação" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line">{e.summary}{e.result ? ` — ${e.result}` : ""}</p>
                {(e.nextAction || e.nextActionAt || e.agendaEvent) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.nextAction || e.nextActionAt ? `Próximo passo: ${e.nextAction ?? ""}${e.nextActionAt ? ` (${formatDate(e.nextActionAt)})` : ""}` : ""}
                    {e.agendaEvent ? `${e.nextAction || e.nextActionAt ? " · " : ""}Reunião na agenda: ${formatDate(e.agendaEvent.startAt, true)}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
