import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CircleUserRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type BoardCard = {
  orderId: string;
  project: { id: string; code: string; name: string; clientName: string | null };
  column: string;
  status: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  statusLabel: string;
  blockedReason: string | null;
  responsible: { id: string; name: string } | null;
  dueAt: string | null;
  daysLate: number;
  done: number;
  total: number;
  estimatedDeliveryAt: string | null;
  fronts: { front: string; label: string; status: "PENDING" | "IN_PROGRESS" | "DONE"; statusLabel: string }[];
};
type Board = { columns: { key: string; label: string }[]; cards: BoardCard[]; fronts: { code: string; label: string }[] };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const EDGE: Record<BoardCard["status"], string> = { PENDING: "border-l-slate-300", IN_PROGRESS: "border-l-blue-500", BLOCKED: "border-l-red-500", DONE: "border-l-emerald-500" };

/** Kanban da produção: um cartão por pedido, na coluna da etapa em que ele está. */
export function ProductionBoard() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canMove = can("organization.manage") || can("production.steps");
  const [search, setSearch] = useState("");
  const [responsible, setResponsible] = useState("");
  const [front, setFront] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["production", "board"], queryFn: () => apiGet<{ data: Board }>("/production/steps/board") });
  const move = useMutation({
    mutationFn: (v: { orderId: string; toStep: string }) => apiPost<{ message?: string }>("/production/steps/board/move", v),
    onSuccess: (r) => { toast.success(r.message ?? "Pedido movido"); qc.invalidateQueries({ queryKey: ["production"] }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível mover o pedido")),
  });

  const all = q.data?.data.cards ?? [];
  const columns = q.data?.data.columns ?? [];
  const cards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((c) => (!term || `${c.project.code} ${c.project.name} ${c.project.clientName ?? ""}`.toLowerCase().includes(term)) && (!responsible || c.responsible?.id === responsible) && (!front || c.fronts.some((f) => f.front === front)));
  }, [all, search, responsible, front]);
  const people = useMemo(() => [...new Map(all.filter((c) => c.responsible).map((c) => [c.responsible!.id, c.responsible!])).values()], [all]);

  if (q.isLoading) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando o quadro…</CardContent></Card>;
  if (!all.length) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido em produção.</CardContent></Card>;

  const late = all.filter((c) => c.daysLate > 0).length;
  const blocked = all.filter((c) => c.status === "BLOCKED").length;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Input className="min-w-48 flex-1" placeholder="Buscar por cliente, projeto ou código" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Responsável" className="h-9 rounded-md border bg-background px-2 text-sm" value={responsible} onChange={(e) => setResponsible(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Frente" className="h-9 rounded-md border bg-background px-2 text-sm" value={front} onChange={(e) => setFront(e.target.value)}>
            <option value="">Todas as frentes</option>
            {(q.data?.data.fronts ?? []).map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
          </select>
          <Badge variant="secondary">{all.length} pedidos</Badge>
          {late > 0 && <Badge variant="danger">{late} com etapa atrasada</Badge>}
          {blocked > 0 && <Badge variant="warning">{blocked} bloqueados</Badge>}
        </CardContent>
      </Card>
      {canMove && <p className="text-xs text-muted-foreground">Arraste o cartão para uma etapa à frente: as etapas do caminho são concluídas e a de destino é iniciada. Para voltar uma etapa, reabra dentro do pedido.</p>}
      <div className="flex min-h-[55vh] gap-3 overflow-x-auto pb-3">
        {columns.map((col) => {
          const items = cards.filter((c) => c.column === col.key);
          const droppable = canMove && col.key !== "CONCLUIDO";
          return (
            <section key={col.key} className={cn("w-[250px] shrink-0 rounded-xl bg-muted/45 p-2.5", dragOver === col.key && "ring-2 ring-primary")}
              onDragOver={(e) => { if (droppable) { e.preventDefault(); setDragOver(col.key); } }}
              onDragLeave={() => setDragOver((s) => (s === col.key ? null : s))}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const orderId = e.dataTransfer.getData("text/order-id"); const card = all.find((c) => c.orderId === orderId); if (droppable && card && (card.column !== col.key || card.status === "PENDING")) move.mutate({ orderId, toStep: col.key }); }}>
              <header className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{col.label}</h2><Badge variant="secondary">{items.length}</Badge></header>
              <div className="space-y-2">
                {items.map((c) => (
                  <Link key={c.orderId} to={`/clientes-projetos/${c.project.id}`} draggable={canMove && c.column !== "CONCLUIDO"} onDragStart={(e) => { e.dataTransfer.setData("text/order-id", c.orderId); e.dataTransfer.effectAllowed = "move"; }}
                    className={cn("block rounded-lg border border-l-4 bg-card p-2.5 shadow-sm transition hover:border-primary/40", EDGE[c.status], canMove && "cursor-grab active:cursor-grabbing")}>
                    <p className="text-xs text-muted-foreground">{c.project.code}</p>
                    <p className="text-sm font-semibold leading-snug">{c.project.name}</p>
                    {c.project.clientName && <p className="text-xs uppercase text-muted-foreground">{c.project.clientName}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className={cn("rounded px-1.5 py-0.5", c.status === "IN_PROGRESS" ? "bg-blue-500/10 text-blue-700" : c.status === "BLOCKED" ? "bg-red-500/10 text-red-700" : c.status === "DONE" ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-slate-600")}>{c.statusLabel}</span>
                      <span>{c.done}/{c.total} etapas</span>
                      {c.dueAt && <span className={cn("flex items-center gap-1", c.daysLate > 0 && "font-semibold text-destructive")}>{c.daysLate > 0 ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}{fmt(c.dueAt)}{c.daysLate > 0 ? ` · ${c.daysLate}d` : ""}</span>}
                      {c.responsible && <span className="ml-auto flex items-center gap-1"><CircleUserRound className="h-3 w-3" />{c.responsible.name.split(" ")[0]}</span>}
                    </div>
                    {c.status === "BLOCKED" && c.blockedReason && <p className="mt-1 flex items-start gap-1 text-[11px] text-red-700"><Lock className="mt-0.5 h-3 w-3 shrink-0" />{c.blockedReason}</p>}
                    {c.fronts.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.fronts.map((f) => (
                          <span key={f.front} title={f.statusLabel} className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", f.status === "DONE" ? "border-emerald-400 text-emerald-700" : f.status === "IN_PROGRESS" ? "border-blue-400 text-blue-700" : "border-slate-300 text-slate-600")}>{f.label}: {f.statusLabel.toLowerCase()}</span>
                        ))}
                      </div>
                    )}
                    {c.estimatedDeliveryAt && <p className="mt-1 text-[11px] text-muted-foreground">Entrega prevista: {fmt(c.estimatedDeliveryAt)}</p>}
                  </Link>
                ))}
                {!items.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">—</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
