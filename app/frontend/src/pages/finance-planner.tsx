import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PayDialog } from "@/components/pay-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch, apiPost, apiPostForm } from "@/services/api";
import { useAuth } from "@/hooks/use-auth";
import { cn, errorMessage, formatCurrency } from "@/lib/utils";

type Item = {
  id: string; type: "RECEITA" | "DESPESA"; category: string; description: string | null; payee: string | null;
  amount: number; paidAmount: number; open: number; status: string; method: string | null; dueDay: string | null; late: boolean;
};
type Totals = { toPay: number; toReceive: number; paid: number };
type Week = { week: string; today: string; days: { day: string; items: Item[]; totals: Totals }[]; totals: Totals; late: { items: Item[]; totals: Totals } };
type Person = { person: string; toPay: number; toDiscount: number; balance: number; count: number; items: Item[] };

const DOW = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const addDays = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });

/** Uma conta no planner: quem, do que é, o valor e a caixinha de pago. */
function Row({ i, canPay, onPay, onOpen, draggable }: { i: Item; canPay: boolean; onPay: (i: Item) => void; onOpen: (i: Item) => void; draggable?: boolean }) {
  const paid = i.open <= 0;
  return (
    <div
      draggable={draggable && !paid}
      onDragStart={(e) => e.dataTransfer.setData("id", i.id)}
      className={cn("rounded-md border bg-background p-2 text-sm", paid && "opacity-60", i.late && !paid && "border-destructive/50")}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={paid}
          disabled={paid || !canPay}
          title={paid ? "Pago" : "Marcar como pago (valor todo)"}
          onChange={() => onPay(i)}
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(i)}>
          {i.payee && <p className="text-[11px] font-semibold uppercase text-primary">{i.payee}</p>}
          <p className={cn("leading-snug", paid && "line-through")}>{i.description || i.category}</p>
          <p className="text-xs text-muted-foreground">{i.type === "RECEITA" ? "a receber · " : ""}{i.category}{i.paidAmount > 0 && !paid ? ` · pago ${formatCurrency(i.paidAmount)}` : ""}</p>
        </button>
        <span className={cn("shrink-0 font-semibold tabular-nums", i.type === "RECEITA" && "text-success")}>{formatCurrency(paid ? i.amount : i.open)}</span>
      </div>
    </div>
  );
}

/**
 * Planner do financeiro, no jeito do planner da produção: as contas da semana
 * por dia, com soma do dia, a caixinha de pago e o "+ item" que entende
 * "NOME: descrição valor". Também por pessoa e em lista com soma do marcado.
 */
export function FinancePlannerPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("finance.manage");
  const canPay = canManage || can("finance.documents.pay");
  const [view, setView] = useState<"planner" | "pessoa" | "lista">("planner");
  const [week, setWeek] = useState(todayIso());
  const [newType, setNewType] = useState<"DESPESA" | "RECEITA">("DESPESA");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showLate, setShowLate] = useState(false);
  const [paying, setPaying] = useState<Item | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  const planner = useQuery({ queryKey: ["finance", "planner", week], queryFn: () => apiGet<{ data: Week }>("/finance/planner", { week }).then((r) => r.data), enabled: view === "planner" });
  const people = useQuery({ queryKey: ["finance", "planner", "people"], queryFn: () => apiGet<{ data: { people: Person[] } }>("/finance/planner/people").then((r) => r.data.people), enabled: view === "pessoa" });

  const quick = useMutation({
    mutationFn: (v: { day: string; text: string }) => apiPost<{ message?: string }>("/finance/planner/quick", { ...v, type: newType }),
    onSuccess: (r, v) => { toast.success(r.message ?? "Lançado"); setDrafts((d) => ({ ...d, [v.day]: "" })); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível lançar"), { duration: 8000 }),
  });
  const move = useMutation({
    mutationFn: (v: { id: string; dueDay: string }) => apiPatch(`/finance/planner/${v.id}`, { dueDay: v.dueDay }),
    onSuccess: () => { toast.success("Vencimento mudado"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível mudar o dia")),
  });
  const payAll = useMutation({
    mutationFn: (i: Item) => {
      const fd = new FormData();
      fd.append("amount", String(i.open));
      fd.append("paidAt", todayIso());
      return apiPostForm<{ message?: string }>(`/finance/documents/${i.id}/payments`, fd);
    },
    onSuccess: (r) => { toast.success(r.message ?? "Pago"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível marcar como pago")),
  });
  const pay = (i: Item) => {
    if (i.open <= 0) return;
    if (confirm(`Marcar como pago ${formatCurrency(i.open)}${i.payee ? ` — ${i.payee}` : ""}? (Para pagamento parcial ou comprovante, clique no texto da conta.)`)) payAll.mutate(i);
  };

  const d = planner.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Planner do financeiro" description="As contas da semana por dia, como a lista do WhatsApp: escreva, marque o que foi pago e veja a soma." />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6 text-sm">
          {view === "planner" && (
            <>
              <Button variant="outline" size="icon" onClick={() => setWeek(addDays(d?.week ?? week, -7))}><ChevronLeft /></Button>
              <Button variant="outline" onClick={() => setWeek(todayIso())}>Esta semana</Button>
              <Button variant="outline" size="icon" onClick={() => setWeek(addDays(d?.week ?? week, 7))}><ChevronRight /></Button>
              {d && <span className="font-medium">Semana de {ddmm(d.week)} a {ddmm(addDays(d.week, 5))}</span>}
              {d && <Badge variant="secondary">A pagar {formatCurrency(d.totals.toPay)} · pago {formatCurrency(d.totals.paid)}</Badge>}
            </>
          )}
          <div className="ml-auto flex overflow-hidden rounded-md border">
            {(["planner", "pessoa", "lista"] as const).map((v) => (
              <button key={v} type="button" className={`px-3 py-1.5 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setView(v)}>{v === "planner" ? "Planner" : v === "pessoa" ? "Por pessoa" : "Lista"}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {view === "planner" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Escreva em "+ item" e aperte Enter: <strong>KELSON: 1ª quinzena outubro 854,00</strong>. Marque a caixinha quando pagar. Arraste para outro dia para mudar o vencimento.</span>
            {canManage && (
              <span className="ml-auto flex items-center gap-1">Novas linhas:
                <select className="h-7 rounded border bg-background px-1" value={newType} onChange={(e) => setNewType(e.target.value as "DESPESA" | "RECEITA")}>
                  <option value="DESPESA">a pagar</option>
                  <option value="RECEITA">a receber / descontar</option>
                </select>
              </span>
            )}
          </div>
          {d && d.late.items.length > 0 && (
            <Card className="border-destructive/40">
              <CardContent className="space-y-2 p-3">
                <button type="button" className="flex w-full items-center gap-2 text-sm font-medium text-destructive" onClick={() => setShowLate((s) => !s)}>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !showLate && "-rotate-90")} />
                  Atrasadas de antes desta semana: {d.late.items.length} · {formatCurrency(d.late.totals.toPay)} a pagar
                </button>
                {showLate && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{d.late.items.map((i) => <div key={i.id} className="space-y-0.5"><p className="text-[11px] text-muted-foreground">venceu {ddmm(i.dueDay)}</p><Row i={i} canPay={canPay} onPay={pay} onOpen={setPaying} /></div>)}</div>}
              </CardContent>
            </Card>
          )}
          {planner.isLoading || !d ? (
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {d.days.map((day, idx) => (
                <div
                  key={day.day}
                  className={cn("flex min-h-40 flex-col gap-2 rounded-lg border bg-muted/30 p-2", day.day === d.today && "border-primary bg-primary/5")}
                  onDragOver={(e) => canManage && e.preventDefault()}
                  onDrop={(e) => { const id = e.dataTransfer.getData("id"); if (id) move.mutate({ id, dueDay: day.day }); }}
                >
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold">{DOW[idx]} <span className="font-normal text-muted-foreground">{ddmm(day.day)}{idx === 5 ? " e dom." : ""}</span>{day.day === d.today && <span className="text-primary"> · hoje</span>}</p>
                  </div>
                  <p className="text-xs"><span className="font-semibold tabular-nums">{formatCurrency(day.totals.toPay)}</span> a pagar{day.totals.paid > 0 ? ` · ${formatCurrency(day.totals.paid)} pago` : ""}{day.totals.toReceive > 0 ? ` · ${formatCurrency(day.totals.toReceive)} a receber` : ""}</p>
                  {day.items.map((i) => <Row key={i.id} i={i} canPay={canPay} onPay={pay} onOpen={setPaying} draggable={canManage} />)}
                  {canManage && (
                    <Input
                      className="h-9 bg-background text-sm"
                      placeholder="+ item"
                      value={drafts[day.day] ?? ""}
                      disabled={quick.isPending}
                      onChange={(e) => setDrafts((s) => ({ ...s, [day.day]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && (drafts[day.day] ?? "").trim()) quick.mutate({ day: day.day, text: drafts[day.day] }); }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "pessoa" && <PeopleView people={people.data} loading={people.isLoading} canPay={canPay} onPay={pay} onOpen={setPaying} />}
      {view === "lista" && <ListView canPay={canPay} onPay={pay} onOpen={setPaying} />}

      <PayDialog tx={paying ? { id: paying.id, description: paying.description, category: paying.category, amount: paying.amount, paidAmount: paying.paidAmount, method: paying.method, type: paying.type } : null} onClose={() => setPaying(null)} onDone={refresh} />
      {payAll.isPending && <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md bg-background p-2 text-sm shadow"><Loader2 className="h-4 w-4 animate-spin" />Registrando…</div>}
    </div>
  );
}

/** Pendências por pessoa: o que a loja deve, o que a pessoa deve (descontos) e o saldo. */
function PeopleView({ people, loading, canPay, onPay, onOpen }: { people?: Person[]; loading: boolean; canPay: boolean; onPay: (i: Item) => void; onOpen: (i: Item) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!people?.length) return <p className="text-sm text-muted-foreground">Nenhuma pendência com pessoa. Escreva o nome antes de dois-pontos no planner (KELSON: …) ou preencha "Quem recebe" no lançamento.</p>;
  const total = people.reduce((s, p) => s + p.balance, 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Saldo total com as pessoas: <strong className="text-foreground">{formatCurrency(total)}</strong> (a pagar menos o que elas devem à loja).</p>
      {people.map((p) => (
        <Card key={p.person}>
          <CardContent className="p-0">
            <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left text-sm" onClick={() => setOpen(open === p.person ? null : p.person)}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", open !== p.person && "-rotate-90")} />
              <span className="font-semibold uppercase">{p.person}</span>
              <span className="text-muted-foreground">a pagar {formatCurrency(p.toPay)}</span>
              {p.toDiscount > 0 && <span className="text-muted-foreground">descontos {formatCurrency(p.toDiscount)}</span>}
              <span className="ml-auto font-semibold tabular-nums">{formatCurrency(p.balance)}</span>
            </button>
            {open === p.person && (
              <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
                {p.items.map((i) => <div key={i.id} className="space-y-0.5"><p className="text-[11px] text-muted-foreground">{i.type === "RECEITA" ? "desconto · " : ""}vence {ddmm(i.dueDay)}</p><Row i={i} canPay={canPay} onPay={onPay} onOpen={onOpen} /></div>)}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Lista com filtro: marque as contas e veja a soma na hora. */
function ListView({ canPay, onPay, onOpen }: { canPay: boolean; onPay: (i: Item) => void; onOpen: (i: Item) => void }) {
  const t = todayIso();
  const [f, setF] = useState({ from: t, to: addDays(t, 30), type: "DESPESA", status: "ABERTO", q: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const params = { from: f.from || undefined, to: f.to || undefined, type: f.type || undefined, status: f.status, q: f.q.trim() || undefined };
  const q = useQuery({ queryKey: ["finance", "planner", "list", params], queryFn: () => apiGet<{ data: { items: Item[] } }>("/finance/planner/list", params).then((r) => r.data.items) });
  const items = useMemo(() => q.data ?? [], [q.data]);
  const value = (i: Item) => (i.open > 0 ? i.open : i.amount);
  const total = items.reduce((s, i) => s + value(i), 0);
  const chosen = items.filter((i) => sel.has(i.id));
  const chosenSum = chosen.reduce((s, i) => s + value(i), 0);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && items.every((i) => sel.has(i.id));
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6 text-sm">
          <label className="space-y-1"><span className="block text-xs">De</span><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="space-y-1"><span className="block text-xs">Até</span><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="space-y-1"><span className="block text-xs">Tipo</span>
            <select className="h-10 rounded-md border bg-background px-2" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="DESPESA">A pagar</option><option value="RECEITA">A receber</option><option value="">Os dois</option></select>
          </label>
          <label className="space-y-1"><span className="block text-xs">Situação</span>
            <select className="h-10 rounded-md border bg-background px-2" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ABERTO">Em aberto</option><option value="PAGO">Pagas</option><option value="TODOS">Todas</option></select>
          </label>
          <label className="flex-1 space-y-1"><span className="block text-xs">Buscar (pessoa, descrição, categoria)</span><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Ex.: Kelson, diária, aluguel" /></label>
        </CardContent>
      </Card>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 text-sm shadow-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((i) => i.id)))} />Marcar todas</label>
        <span>Total da lista: <strong className="tabular-nums">{formatCurrency(total)}</strong> ({items.length})</span>
        <span className="ml-auto rounded-md bg-primary/10 px-2 py-1 text-primary">Marcadas: <strong className="tabular-nums">{formatCurrency(chosenSum)}</strong> ({chosen.length})</span>
      </div>
      {q.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : (
        <div className="space-y-1">
          {!items.length && <p className="text-sm text-muted-foreground">Nada neste filtro.</p>}
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label="Somar esta conta" />
              <span className={cn("w-12 shrink-0 text-xs tabular-nums", i.late && "font-semibold text-destructive")}>{ddmm(i.dueDay)}</span>
              <div className="min-w-0 flex-1"><Row i={i} canPay={canPay} onPay={onPay} onOpen={onOpen} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
