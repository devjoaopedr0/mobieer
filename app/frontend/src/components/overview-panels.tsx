import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/services/api";
import { formatCurrency } from "@/lib/utils";

const day = (d: string) => d.split("-").reverse().join("/");
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

type Commercial = {
  period: { from: string; to: string; today: string };
  newProjects: { count: number; amount: number };
  hot: { count: number; amount: number; until: string };
  future: { count: number; amount: number };
  late: { count: number; amount: number };
  salesByMonth: { month: string; total: number }[];
  goal: { amount: number; sold: number; pct: number | null } | null;
  scope: "own" | "store";
};

function BigCard({ title, line, amount, foot, to, tone }: { title: string; line: string; amount: number; foot: string; to: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{title}</p>
          <Link to={to} className="shrink-0 text-xs font-medium text-primary hover:underline">Ver carteira</Link>
        </div>
        <p className="text-sm text-muted-foreground">{line}</p>
        <p className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{formatCurrency(amount)}</p>
        <p className="text-xs text-muted-foreground">{foot}</p>
      </CardContent>
    </Card>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Dashboard comercial: novos projetos, quentes, futuros e em atraso, vendas por mês e a meta. */
export function CommercialOverview() {
  const q = useQuery({ queryKey: ["overview", "commercial"], queryFn: () => apiGet<{ data: Commercial }>("/overview/commercial").then((r) => r.data) });
  const d = q.data;
  if (q.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!d) return <p className="text-sm text-muted-foreground">Não foi possível carregar o painel comercial.</p>;
  return (
    <div className="space-y-4">
      {d.scope === "own" && <p className="text-xs text-muted-foreground">Mostrando a sua carteira.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BigCard title="Novos projetos" line={plural(d.newProjects.count, "contrato fechado no mês", "contratos fechados no mês")} amount={d.newProjects.amount} foot={`${day(d.period.from)} a ${day(d.period.to)}`} to="/comercial" />
        <BigCard title="Projetos quentes" line={plural(d.hot.count, "negociação para fechar", "negociações para fechar")} amount={d.hot.amount} foot={`Previstas até ${day(d.hot.until)}`} to="/comercial" />
        <BigCard title="Projetos futuros" line={plural(d.future.count, "venda futura", "vendas futuras")} amount={d.future.amount} foot="Aceitas, aguardando liberação" to="/comercial" />
        <BigCard title="Projetos em atraso" line={plural(d.late.count, "negociação atrasada", "negociações atrasadas")} amount={d.late.amount} foot={`Previsão de fechamento antes de ${day(d.period.today)}`} to="/comercial" tone={d.late.count ? "danger" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Progresso de vendas</CardTitle>
            <Button asChild size="sm" variant="outline"><Link to="/comercial">Ver carteira</Link></Button>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.salesByMonth.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Vendas de ${l}`} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Meta de vendas</CardTitle>
            <Button asChild size="sm" variant="outline"><Link to="/comercial">Ver metas</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.goal ? (
              <>
                <p className="text-3xl font-semibold tabular-nums">{d.goal.pct ?? 0}%</p>
                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, d.goal.pct ?? 0)}%` }} /></div>
                <p className="text-sm text-muted-foreground">{formatCurrency(d.goal.sold)} de {formatCurrency(d.goal.amount)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem meta cadastrada para este mês. Cadastre em Comercial → Metas.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type Finance = {
  today: string;
  cashflow: { days: { day: string; in: number; out: number; balance: number }[]; total: { in: number; out: number; balance: number } };
  payables: { today: { amount: number; count: number }; overdue: { amount: number; count: number } };
  receivables: { today: { amount: number; count: number }; overdue: { amount: number; count: number } };
  approvals: { id: string; number: string; client: string; total: number; since: string | null }[];
};

function DueCard({ title, d }: { title: string; d: Finance["payables"] }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <div>
          <p className="text-sm font-medium">Vencem hoje</p>
          <p className="text-2xl font-semibold tabular-nums">{formatCurrency(d.today.amount)}</p>
          <Link to="/financeiro" className="text-xs text-primary hover:underline">{plural(d.today.count, "título", "títulos")}</Link>
        </div>
        <div className="border-t pt-3">
          <p className="text-sm font-medium">Vencidos</p>
          <p className={`text-2xl font-semibold tabular-nums ${d.overdue.amount > 0 ? "text-destructive" : ""}`}>{formatCurrency(d.overdue.amount)}</p>
          <Link to="/financeiro" className="text-xs text-primary hover:underline">{plural(d.overdue.count, "título", "títulos")}</Link>
          <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard financeiro: fluxo previsto de 7 dias, contas a pagar e a receber, liberações. */
export function FinanceOverview() {
  const q = useQuery({ queryKey: ["overview", "finance"], queryFn: () => apiGet<{ data: Finance }>("/overview/finance").then((r) => r.data) });
  const d = q.data;
  if (q.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!d) return <p className="text-sm text-muted-foreground">Não foi possível carregar o painel financeiro.</p>;
  const money = (v: number, sign = false) => <span className={`tabular-nums ${sign && v < 0 ? "text-destructive" : ""}`}>{formatCurrency(v)}</span>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Fluxo de caixa previsto · próximos 7 dias</CardTitle>
            <Button asChild size="sm" variant="outline"><Link to="/financeiro">Ver fluxo</Link></Button>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead className="text-right">Entradas (+)</TableHead><TableHead className="text-right">Saídas (−)</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {d.cashflow.days.map((r) => (
                  <TableRow key={r.day}><TableCell>{day(r.day).slice(0, 5)}</TableCell><TableCell className="text-right">{money(r.in)}</TableCell><TableCell className="text-right">{money(r.out)}</TableCell><TableCell className="text-right">{money(r.balance, true)}</TableCell></TableRow>
                ))}
                <TableRow className="font-semibold"><TableCell>Total</TableCell><TableCell className="text-right">{money(d.cashflow.total.in)}</TableCell><TableCell className="text-right">{money(d.cashflow.total.out)}</TableCell><TableCell className="text-right">{money(d.cashflow.total.balance, true)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <DueCard title="Contas a pagar" d={d.payables} />
        <DueCard title="Contas a receber" d={d.receivables} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Liberação de orçamentos</CardTitle>
          <Button asChild size="sm" variant="outline"><Link to="/comercial">Liberar</Link></Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {!d.approvals.length ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum orçamento aguardando liberação.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Aguardando desde</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.approvals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Link to={`/comercial/orcamentos/${a.id}`} className="text-primary hover:underline">{a.number}</Link></TableCell>
                    <TableCell>{a.client}</TableCell>
                    <TableCell>{a.since ? new Date(a.since).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-right">{money(a.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
