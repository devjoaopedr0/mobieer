import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlarmClock, BellRing, CalendarClock, CalendarDays, ChevronRight, FileText, Percent, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/kpi-card";
import { TierProgress, fmtPct, tiersQuery, type Tier, type TierResult } from "@/components/crm-commissions";
import { apiGet } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { formatCurrency } from "@/lib/utils";

type Todo = { kind: "OPORTUNIDADE" | "LEAD" | "AGENDA" | "TAREFA"; id: string; title: string; client: string | null; at: string; link: string; sellerName: string | null };
type Reminder = { kind: string; label: string; client: string; title: string; detail: string; link: string };
type MyDay = {
  seller: { id: string; name: string } | null;
  today: string;
  agenda: { overdue: Todo[]; today: Todo[]; upcoming: Todo[] };
  attention: Reminder[];
  doneToday: number;
  month: { month: string; sold: number; contracts: number; goal: number | null; goalPercent: number | null; missing: number | null };
  pipeline: { open: number; value: number; weighted: number; quotesWaiting: number; quotesWaitingValue: number };
  commission: null | { base: number; estimated: number; tier: TierResult | null; policy: { tiers: Tier[] } | null };
};

const KIND: Record<Todo["kind"], { label: string; variant: "default" | "secondary" | "warning" | "muted" }> = {
  OPORTUNIDADE: { label: "Funil", variant: "default" },
  LEAD: { label: "Lead", variant: "warning" },
  AGENDA: { label: "Agenda", variant: "secondary" },
  TAREFA: { label: "Tarefa", variant: "muted" },
};
const ATTENTION: Record<string, "danger" | "warning" | "secondary"> = {
  ACAO_VENCIDA: "danger",
  ORCAMENTO_VENCENDO: "danger",
  ORCAMENTO_SEM_RETORNO: "warning",
  LEAD_SEM_CONTATO: "warning",
};

const when = (iso: string, today: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });
  if (day === today) return time === "00:00" ? "hoje" : time;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Fortaleza" }) + (time === "00:00" ? "" : ` ${time}`);
};

function TodoList({ items, today, empty }: { items: Todo[]; today: string; empty: string }) {
  if (!items.length) return <p className="px-4 py-5 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border">
      {items.map((t) => (
        <Link key={`${t.kind}-${t.id}`} to={t.link} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
          <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">{when(t.at, today)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t.title}</p>
            <p className="truncate text-xs text-muted-foreground">{t.client ?? "—"}</p>
          </div>
          <Badge variant={KIND[t.kind].variant} className="shrink-0">{KIND[t.kind].label}</Badge>
        </Link>
      ))}
    </div>
  );
}

/** O dia do consultor: o que fazer, o que atrasou, quem precisa de atenção e como está o mês. */
export function CommercialMyDay({ canSeeAll }: { canSeeAll: boolean }) {
  const [sellerId, setSellerId] = useState("");
  const q = useQuery({ queryKey: ["commercial", "my-day", sellerId], queryFn: () => apiGet<{ data: MyDay }>("/commercial/my-day", sellerId ? { sellerId } : undefined) });
  // quem vê a equipe escolhe o consultor (a lista é a mesma do painel de comissão)
  const team = useQuery({ ...tiersQuery(new Date().toLocaleDateString("en-CA").slice(0, 7)), enabled: canSeeAll });
  const d = q.data?.data;

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!d) return <p className="text-sm text-destructive">{errorMessage(q.error, "Não foi possível carregar o seu dia")}</p>;
  const c = d.commission;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {d.agenda.today.length ? `${d.agenda.today.length} compromisso(s) para hoje` : "Nada marcado para hoje"}
          {d.agenda.overdue.length ? ` · ${d.agenda.overdue.length} atrasado(s)` : ""}
          {` · ${d.doneToday} atividade(s) registrada(s) hoje`}
        </p>
        {canSeeAll && (team.data?.data.sellers.length ?? 0) > 0 && (
          <Select value={sellerId || "me"} onValueChange={(v) => setSellerId(v === "me" ? "" : v)}>
            <SelectTrigger className="h-8 w-[220px]" aria-label="Consultor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Meu dia</SelectItem>
              {team.data!.data.sellers.map((s) => <SelectItem key={s.userId} value={s.userId}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Vendido no mês" value={formatCurrency(d.month.sold)} unit={d.month.goalPercent != null ? `${d.month.goalPercent.toLocaleString("pt-BR")}% da meta` : undefined} icon={Target} iconBg="bg-success/10" />
        <KpiCard title={d.month.goal ? `Falta para a meta de ${formatCurrency(d.month.goal)}` : "Meta do mês"} value={d.month.goal ? formatCurrency(d.month.missing) : "Sem meta"} icon={TrendingUp} />
        <KpiCard title={`Pipeline (${d.pipeline.open} oportunidades)`} value={formatCurrency(d.pipeline.value)} unit={`ponderado ${formatCurrency(d.pipeline.weighted)}`} icon={TrendingUp} />
        <KpiCard title={`Orçamentos aguardando retorno (${d.pipeline.quotesWaiting})`} value={formatCurrency(d.pipeline.quotesWaitingValue)} icon={FileText} />
      </div>

      {c && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4" /> Comissão do mês</CardTitle>
              <span className="text-sm">
                Estimada <strong className="tabular-nums">{formatCurrency(c.estimated)}</strong>
                <span className="text-xs text-muted-foreground"> · {d.month.contracts} contrato(s)</span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {c.tier && c.policy ? (
              <>
                <TierProgress tier={c.tier} tiers={c.policy.tiers} compact />
                {c.tier.next && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Vendendo mais {formatCurrency(c.tier.next.missing)}, a parte acima de {formatCurrency(c.tier.next.min)} passa a render {fmtPct(c.tier.next.percent)}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Sem faixa de comissão vigente: vale a comissão registrada em cada orçamento.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={d.agenda.overdue.length ? "border-destructive/40" : undefined}>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlarmClock className="h-4 w-4 text-destructive" /> Atrasadas ({d.agenda.overdue.length})</CardTitle></CardHeader>
          <CardContent className="p-0"><TodoList items={d.agenda.overdue} today={d.today} empty="Nada atrasado." /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Hoje ({d.agenda.today.length})</CardTitle></CardHeader>
          <CardContent className="p-0"><TodoList items={d.agenda.today} today={d.today} empty="Nenhuma ação, retorno ou compromisso para hoje." /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Próximos 7 dias ({d.agenda.upcoming.length})</CardTitle></CardHeader>
          <CardContent className="p-0"><TodoList items={d.agenda.upcoming} today={d.today} empty="Nada marcado para a semana." /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4" /> Clientes que precisam de atenção ({d.attention.length})</CardTitle>
            <Link to="/comercial?aba=lembretes" className="text-xs text-primary hover:underline">Ver todos os lembretes</Link>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {d.attention.slice(0, 8).map((r, i) => (
            <Link key={`${r.kind}-${r.link}-${i}`} to={r.link} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.client}</span>
                  <Badge variant={ATTENTION[r.kind] ?? "secondary"}>{r.label}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.title} · {r.detail}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {!d.attention.length && <p className="px-4 py-5 text-center text-sm text-muted-foreground">Ninguém esperando contato. Ações em dia, orçamentos respondidos e leads atendidos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
