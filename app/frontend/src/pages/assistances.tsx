import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, CircleUserRound, Headphones, MapPin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { AssistanceScheduleDialog } from "@/components/assistance-schedule";
import { AssistanceItemsPanel } from "@/components/assistance-items";
import { DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiObjectUrl, apiPatch, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn, formatCurrency } from "@/lib/utils";

type Attachment = { id: string; fileName: string; downloadUrl: string };
type Ticket = {
  id: string; number: string; title: string; description: string; status: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; kind: string;
  problemType: string | null; roomLabel: string | null; createdAt: string; scheduledAt: string | null; clientConfirmedAt: string | null; place: string | null;
  client: { id: string; name: string; phone: string | null }; project: { id: string; code: string; name: string } | null; assignee: { id: string; name: string } | null; attachments: Attachment[];
  /** registro da equipe (erro, retrabalho): não aparece para o cliente */
  internal: boolean; origin: "INTERNAL" | "CLIENT_PORTAL";
  costs: { garantia: number; cobrado: number; total: number };
};
type NewTicket = { clientId: string; projectId: string; kind: string; title: string; description: string; priority: Ticket["priority"]; assigneeId: string };
const INTERNAL = ["ERRO_INTERNO", "RETRABALHO"];
type Options = { kinds: { code: string; label: string }[]; columns: { status: string; label: string }[] };
type Person = { id: string; name: string };
type Patch = { status?: string; kind?: string; priority?: string; assigneeId?: string | null };

const PRIORITY: Record<Ticket["priority"], { label: string; cls: string }> = {
  LOW: { label: "Baixa", cls: "bg-slate-500/10 text-slate-600" },
  NORMAL: { label: "Normal", cls: "bg-blue-500/10 text-blue-700" },
  HIGH: { label: "Alta", cls: "bg-amber-500/10 text-amber-700" },
  URGENT: { label: "Urgente", cls: "bg-red-500/10 text-red-700" },
};
const STATUS_CLS: Record<string, string> = {
  OPEN: "bg-indigo-500/15 text-indigo-700", TRIAGE: "bg-amber-500/15 text-amber-700", SCHEDULED: "bg-sky-500/15 text-sky-700", IN_PROGRESS: "bg-blue-500/15 text-blue-700",
  WAITING_CLIENT: "bg-orange-500/15 text-orange-700", RESOLVED: "bg-emerald-500/15 text-emerald-700", CANCELLED: "bg-slate-500/15 text-slate-600",
};
const KIND_CLS: Record<string, string> = { ERRO_INTERNO: "border-red-400 text-red-700", RETRABALHO: "border-amber-400 text-amber-700", MANUTENCAO: "border-rose-300 text-rose-700" };
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
const dayTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

function Thumb({ path }: { path: string }) {
  const { data } = useQuery({ queryKey: ["assist-img", path], queryFn: () => apiObjectUrl(path), staleTime: 300_000 });
  if (!data) return <div className="h-16 w-16 animate-pulse rounded bg-muted" />;
  return <a href={data} target="_blank" rel="noreferrer"><img src={data} alt="" className="h-16 w-16 rounded border object-cover" /></a>;
}

/** Assistências: tudo o que o pós-venda atende, em lista, quadro ou agenda de visitas. */
export function AssistancesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("organization.tasks.edit.all");
  const [view, setView] = useState<"lista" | "quadro" | "agenda" | "regiao">("lista");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<{ id: string; number: string; title: string; clientName: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [creating, setCreating] = useState<NewTicket | null>(null);

  const list = useQuery({ queryKey: ["business-assistances"], queryFn: () => apiGet<{ data: Ticket[] }>("/business/assistances") });
  const options = useQuery({ queryKey: ["assistance-options"], queryFn: () => apiGet<{ data: Options }>("/business/assistances/options"), staleTime: Infinity });
  const people = useQuery({ queryKey: ["kanban-people"], queryFn: () => apiGet<{ data: Person[] }>("/organization/people"), enabled: canManage });
  const clients = useQuery({ queryKey: ["business-clients"], queryFn: () => apiGet<{ data: { id: string; name: string }[] }>("/business/clients"), enabled: creating !== null });
  const projects = useQuery({ queryKey: ["business-projects"], queryFn: () => apiGet<{ data: { id: string; code: string; name: string; clientId?: string; client?: { id: string } }[] }>("/business/projects"), enabled: creating !== null });
  const create = useMutation({
    mutationFn: (v: NewTicket) => apiPost<{ data: { id: string }; message?: string }>("/business/assistances", { ...v, projectId: v.projectId || null, assigneeId: v.assigneeId || null }),
    onSuccess: (r) => { toast.success(r.message ?? "Assistência aberta"); setCreating(null); qc.invalidateQueries({ queryKey: ["business-assistances"] }); setDetailId(r.data.id); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível abrir a assistência")),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Patch }) => apiPatch(`/business/assistances/${v.id}`, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-assistances"] }),
    onError: (e) => toast.error(errorMessage(e, "Não foi possível atualizar a assistência")),
  });

  const all = list.data?.data ?? [];
  const kinds = options.data?.data.kinds ?? [];
  const columns = options.data?.data.columns ?? [];
  const statusLabel = (s: string) => columns.find((c) => c.status === s)?.label ?? (s === "CANCELLED" ? "Cancelado" : s);
  const kindLabel = (k: string) => kinds.find((x) => x.code === k)?.label ?? "Assistência";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((t) =>
      (!term || `${t.number} ${t.title} ${t.client.name} ${t.project?.name ?? ""} ${t.place ?? ""}`.toLowerCase().includes(term)) &&
      (!kind || t.kind === kind) && (!status || t.status === status) && (!assignee || t.assignee?.id === assignee) &&
      // sem filtro de situação, o que já foi encerrado só aparece se pedir
      (status || showClosed || view === "quadro" || !["RESOLVED", "CANCELLED"].includes(t.status))
    );
  }, [all, search, kind, status, assignee, showClosed, view]);
  const visits = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    [...rows].filter((t) => t.scheduledAt).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!)).forEach((t) => map.set(dayKey(t.scheduledAt!), [...(map.get(dayKey(t.scheduledAt!)) ?? []), t]));
    return [...map.entries()];
  }, [rows]);

  // por região: os chamados em aberto agrupados por bairro, para marcar visitas próximas no mesmo dia
  const regions = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of rows.filter((x) => !x.internal && !["RESOLVED", "CANCELLED"].includes(x.status))) {
      const k = t.place ?? "Sem bairro no cadastro do cliente";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [rows]);

  if (list.isLoading || options.isLoading) return <PageSkeleton />;
  const detail = all.find((t) => t.id === detailId) ?? null;
  const openCount = all.filter((t) => !["RESOLVED", "CANCELLED"].includes(t.status)).length;
  const assignees = [...new Map(all.filter((t) => t.assignee).map((t) => [t.assignee!.id, t.assignee!])).values()];

  const kindBadge = (t: Ticket) => <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", KIND_CLS[t.kind] ?? "border-sky-300 text-sky-700")}>{kindLabel(t.kind)}{t.internal ? " · interno" : ""}</span>;
  // erro e retrabalho do mês: quantos e quanto custaram
  const monthKey = new Date().toISOString().slice(0, 7);
  const rework = all.filter((t) => t.internal && t.createdAt.slice(0, 7) === monthKey);
  const reworkCost = rework.reduce((s, t) => s + (t.costs?.total ?? 0), 0);
  const statusPill = (t: Ticket) =>
    canManage ? (
      <select aria-label={`Situação de ${t.number}`} className={cn("h-7 rounded-md border-0 px-2 text-xs font-medium", STATUS_CLS[t.status])} value={t.status} disabled={update.isPending} onClick={(e) => e.stopPropagation()} onChange={(e) => update.mutate({ id: t.id, patch: { status: e.target.value } })}>
        {columns.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
        <option value="CANCELLED">Cancelado</option>
      </select>
    ) : (
      <span className={cn("rounded-md px-2 py-1 text-xs font-medium", STATUS_CLS[t.status])}>{statusLabel(t.status)}</span>
    );

  return (
    <div className="space-y-5">
      <PageHeader title="Assistências" description="O cliente abre o pedido no portal, com fotos, ou a equipe abre aqui. Classifique, agende a visita, lance os itens (na garantia) e acompanhe até resolver.">
        <Badge variant="secondary">{openCount} em atendimento</Badge>
        {rework.length > 0 && <Badge variant="warning">Erro e retrabalho no mês: {rework.length} · {formatCurrency(reworkCost)}</Badge>}
        {canManage && <Button onClick={() => setCreating({ clientId: "", projectId: "", kind: "ASSISTENCIA", title: "", description: "", priority: "NORMAL", assigneeId: "" })}><Plus className="mr-1 h-4 w-4" />Nova assistência</Button>}
      </PageHeader>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <div className="flex overflow-hidden rounded-md border text-sm">
            {(["lista", "quadro", "agenda", "regiao"] as const).map((v) => (
              <button key={v} type="button" className={cn("px-3 py-1.5 capitalize", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => setView(v)}>{v === "quadro" ? "Kanban" : v === "regiao" ? "Por região" : v}</button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por cliente, número, projeto ou bairro" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select aria-label="Tipo" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos os tipos</option>
            {kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
          </select>
          {view !== "quadro" && (
            <select aria-label="Situação" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Em atendimento</option>
              {columns.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              <option value="CANCELLED">Cancelado</option>
            </select>
          )}
          <select aria-label="Responsável" className={selectCls} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {view !== "quadro" && !status && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Mostrar encerradas</label>}
        </CardContent>
      </Card>

      {!all.length ? (
        <EmptyState icon={Headphones} title="Nenhuma assistência" description="Quando um cliente abrir um pedido de assistência no portal, ele aparece aqui." />
      ) : view === "lista" ? (
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                  {["Nº", "Situação", "Abertura", "Cliente", "Tipo", "Projeto", "Local", "Visita", "Prioridade", "Responsável"].map((h) => <th key={h} className="border-b p-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40" onClick={() => setDetailId(t.id)}>
                    <td className="p-2 font-medium">{t.number}</td>
                    <td className="p-2">{statusPill(t)}</td>
                    <td className="p-2 whitespace-nowrap">{day(t.createdAt)}</td>
                    <td className="p-2"><p className="font-medium">{t.client.name}</p><p className="max-w-56 truncate text-xs text-muted-foreground">{t.title}</p></td>
                    <td className="p-2">{kindBadge(t)}</td>
                    <td className="p-2 text-xs">{t.project ? t.project.code : "—"}</td>
                    <td className="p-2 text-xs">{t.place ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap text-xs">{t.scheduledAt ? dayTime(t.scheduledAt) : <span className="italic text-muted-foreground">a combinar</span>}</td>
                    <td className="p-2"><span className={cn("rounded px-1.5 py-0.5 text-xs", PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span></td>
                    <td className="p-2 text-xs">{t.assignee?.name ?? "—"}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">Nenhuma assistência com esses filtros.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : view === "regiao" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Chamados em aberto agrupados pelo bairro do cliente: dá para marcar as visitas do mesmo bairro no mesmo dia. O bairro vem do cadastro do cliente (Clientes e projetos → Editar).</p>
          {!regions.length && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum chamado em aberto.</CardContent></Card>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {regions.map(([place, list]) => (
              <Card key={place}>
                <CardContent className="space-y-2 pt-5">
                  <p className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-primary" />{place}</span><Badge variant="secondary">{list.length}</Badge></p>
                  <ul className="divide-y text-sm">
                    {list.map((t) => (
                      <li key={t.id} className="flex cursor-pointer items-center justify-between gap-2 py-1.5 hover:bg-muted/40" onClick={() => setDetailId(t.id)}>
                        <span className="min-w-0"><span className="font-medium">{t.client.name}</span><span className="block truncate text-xs text-muted-foreground">{t.number} · {t.title}</span></span>
                        <span className="shrink-0 text-right text-xs">{t.scheduledAt ? dayTime(t.scheduledAt) : <span className="italic text-muted-foreground">a combinar</span>}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : view === "quadro" ? (
        <div className="flex min-h-[55vh] gap-3 overflow-x-auto pb-3">
          {columns.map((c) => {
            const items = rows.filter((t) => t.status === c.status);
            return (
              <section key={c.status} className={cn("w-[270px] shrink-0 rounded-xl bg-muted/45 p-2.5", dragOver === c.status && "ring-2 ring-primary")}
                onDragOver={(e) => { if (canManage) { e.preventDefault(); setDragOver(c.status); } }}
                onDragLeave={() => setDragOver((s) => (s === c.status ? null : s))}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/assist-id"); const t = all.find((x) => x.id === id); if (t && t.status !== c.status) update.mutate({ id, patch: { status: c.status } }); }}>
                <header className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{c.label}</h2><Badge variant="secondary">{items.length}</Badge></header>
                <div className="space-y-2">
                  {items.map((t) => (
                    <button key={t.id} type="button" draggable={canManage} onDragStart={(e) => { e.dataTransfer.setData("text/assist-id", t.id); e.dataTransfer.effectAllowed = "move"; }} onClick={() => setDetailId(t.id)}
                      className={cn("w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/40", canManage && "cursor-grab active:cursor-grabbing")}>
                      <p className="text-xs text-muted-foreground">{t.number}</p>
                      <p className="text-sm font-semibold leading-snug">{t.client.name}</p>
                      <p className="mb-1.5 line-clamp-2 text-xs text-muted-foreground">{t.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {kindBadge(t)}
                        {t.priority !== "NORMAL" && <span className={cn("rounded px-1.5 py-0.5", PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span>}
                        {t.scheduledAt && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{dayTime(t.scheduledAt)}</span>}
                        {t.place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.place}</span>}
                        {t.assignee && <span className="ml-auto flex items-center gap-1"><CircleUserRound className="h-3 w-3" />{t.assignee.name.split(" ")[0]}</span>}
                      </div>
                    </button>
                  ))}
                  {!items.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{canManage ? "Solte um chamado aqui" : "Vazio"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {!visits.length && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma visita marcada. Abra um chamado e use Agendar visita para enviar as datas ao cliente.</CardContent></Card>}
          {visits.map(([d, list]) => (
            <Card key={d}>
              <CardContent className="space-y-2 pt-5">
                <p className="text-sm font-semibold capitalize">{new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" })} <span className="font-normal text-muted-foreground">· {list.length} {list.length === 1 ? "visita" : "visitas"}</span></p>
                <ul className="divide-y">
                  {list.map((t) => (
                    <li key={t.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-muted/40" onClick={() => setDetailId(t.id)}>
                      <span className="w-12 font-medium">{new Date(t.scheduledAt!).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="min-w-0 flex-1"><span className="font-medium">{t.client.name}</span> <span className="text-muted-foreground">— {t.title}</span></span>
                      {t.place && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{t.place}</span>}
                      {t.clientConfirmedAt ? <Badge variant="success">confirmada</Badge> : <Badge variant="warning">a confirmar</Badge>}
                      <span className="text-xs text-muted-foreground">{t.assignee?.name ?? "sem responsável"}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.number} — {detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.client.name}{detail.client.phone ? ` · ${detail.client.phone}` : ""}{detail.place ? ` · ${detail.place}` : ""} · aberta em {day(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {statusPill(detail)}
                  {detail.project && <Link className="text-primary hover:underline" to={`/clientes-projetos/${detail.project.id}`}>{detail.project.code} — {detail.project.name}</Link>}
                  {detail.roomLabel && <Badge variant="outline">{detail.roomLabel}</Badge>}
                  {detail.problemType && <Badge variant="outline">{detail.problemType}</Badge>}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{detail.description}</p>
                {detail.attachments.length > 0 && <div className="flex flex-wrap gap-2">{detail.attachments.map((a) => <Thumb key={a.id} path={a.downloadUrl.replace("/api", "")} />)}</div>}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                    <select className={cn(selectCls, "w-full")} value={detail.kind} disabled={!canManage || update.isPending} onChange={(e) => update.mutate({ id: detail.id, patch: { kind: e.target.value } })}>
                      {kinds.filter((k) => detail.origin === "INTERNAL" || !INTERNAL.includes(k.code)).map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Prioridade</Label>
                    <select className={cn(selectCls, "w-full")} value={detail.priority} disabled={!canManage || update.isPending} onChange={(e) => update.mutate({ id: detail.id, patch: { priority: e.target.value } })}>
                      {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Responsável</Label>
                    <select className={cn(selectCls, "w-full")} value={detail.assignee?.id ?? ""} disabled={!canManage || update.isPending} onChange={(e) => update.mutate({ id: detail.id, patch: { assigneeId: e.target.value || null } })}>
                      <option value="">Sem responsável</option>
                      {(people.data?.data ?? (detail.assignee ? [detail.assignee] : [])).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                {detail.internal ? (
                  <p className="rounded-md bg-warning/10 p-2 text-xs">Registro interno de {kindLabel(detail.kind).toLowerCase()}: não aparece no portal do cliente e não tem visita agendada com ele.</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <span>{detail.scheduledAt ? <>Visita marcada para <strong>{dayTime(detail.scheduledAt)}</strong>{detail.clientConfirmedAt ? " · confirmada pelo cliente" : ""}</> : "Visita ainda não marcada."}</span>
                    <Button size="sm" variant="outline" onClick={() => setScheduling({ id: detail.id, number: detail.number, title: detail.title, clientName: detail.client.name })}><CalendarClock className="mr-2 h-4 w-4" />Agendar visita</Button>
                  </div>
                )}
                <AssistanceItemsPanel ticketId={detail.id} canEdit={canManage} canCharge={can("finance.manage") || can("organization.manage")} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova assistência</DialogTitle>
            <DialogDescription>Para o pedido que chegou por telefone ou na visita, ou para registrar um erro interno ou retrabalho.</DialogDescription>
          </DialogHeader>
          {creating && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">Cliente *</Label>
                  <select className={cn(selectCls, "w-full")} value={creating.clientId} onChange={(e) => setCreating({ ...creating, clientId: e.target.value, projectId: "" })}>
                    <option value="">Escolha o cliente</option>
                    {(clients.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Projeto (opcional)</Label>
                  <select className={cn(selectCls, "w-full")} value={creating.projectId} disabled={!creating.clientId} onChange={(e) => setCreating({ ...creating, projectId: e.target.value })}>
                    <option value="">Sem projeto</option>
                    {(projects.data?.data ?? []).filter((pr) => (pr.clientId ?? pr.client?.id) === creating.clientId).map((pr) => <option key={pr.id} value={pr.id}>{pr.code} — {pr.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                  <select className={cn(selectCls, "w-full")} value={creating.kind} onChange={(e) => setCreating({ ...creating, kind: e.target.value })}>
                    {kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Prioridade</Label>
                  <select className={cn(selectCls, "w-full")} value={creating.priority} onChange={(e) => setCreating({ ...creating, priority: e.target.value as Ticket["priority"] })}>
                    {Object.entries(PRIORITY).map(([v, pr]) => <option key={v} value={v}>{pr.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Assunto *</Label><Input value={creating.title} placeholder="Ex.: Gaveta da cozinha travando" onChange={(e) => setCreating({ ...creating, title: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">O que aconteceu *</Label><Textarea rows={3} value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} /></div>
              {INTERNAL.includes(creating.kind) && <p className="rounded-md bg-warning/10 p-2 text-xs">Erro interno e retrabalho ficam só para a equipe: não aparecem no portal do cliente. Lance depois o material e as horas gastos para saber o custo.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)}>Cancelar</Button>
            <Button disabled={!creating || !creating.clientId || creating.title.trim().length < 2 || creating.description.trim().length < 2 || create.isPending} onClick={() => creating && create.mutate(creating)}>Abrir assistência</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssistanceScheduleDialog ticket={scheduling} canManage={canManage} onClose={() => { setScheduling(null); qc.invalidateQueries({ queryKey: ["business-assistances"] }); }} />
    </div>
  );
}
