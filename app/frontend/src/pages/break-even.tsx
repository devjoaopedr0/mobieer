import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { CheckCircle2, Lightbulb, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/services/api";
import { useAuth } from "@/hooks/use-auth";
import { errorMessage, formatCurrency } from "@/lib/utils";

type Data = {
  year: number;
  month: number;
  config: { fixedCost: number; profitGoal: number; taxPct: number; suggestedFixedCost: number; saved: boolean };
  input: { fixedCost: number; profitGoal: number; taxPct: number };
  totals: { count: number; totalSold: number; financing: number; net: number; cost: number; commissions: number; freightOther: number; taxes: number; margin: number; marginPct: number | null; score: number | null };
  analysis: {
    breakEvenSales: number | null; breakEvenProgress: number | null; breakEvenMissing: number | null;
    goalSales: number | null; goalProgress: number | null; goalMissing: number | null;
    result: number; coveragePct: number | null; marginPct: number | null; marginSource: "MES" | "ULTIMOS_3_MESES" | null;
  };
  daily: { day: number; net: number; accumulated: number }[];
  contracts: { id: string; number: string; client: string; day: string; total: number; net: number }[];
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const parse = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const show = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Progress({ value, ok }: { value: number | null; ok: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${ok ? "bg-success" : "bg-destructive"}`} style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </div>
  );
}

/**
 * Análise do ponto de equilíbrio pelos contratos assinados no mês, no formato
 * que a loja já usava: venda necessária para empatar e para a meta de lucro,
 * resultado do mês, evolução dia a dia e a composição da margem. O modo
 * simulação muda os números sem salvar.
 */
export function BreakEvenPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [simulate, setSimulate] = useState(false);
  const [form, setForm] = useState<{ fixed: string; profit: string; tax: string } | null>(null);
  const [applied, setApplied] = useState<{ fixed: number; profit: number; tax: number } | null>(null);

  const q = useQuery({
    queryKey: ["overview", "break-even", year, month, applied],
    queryFn: () => apiGet<{ data: Data }>("/overview/break-even", { year, month, ...(applied ?? {}) }).then((r) => r.data),
  });
  const d = q.data;
  useEffect(() => {
    if (d && !form) setForm({ fixed: show(d.input.fixedCost), profit: show(d.input.profitGoal), tax: String(d.input.taxPct).replace(".", ",") });
  }, [d, form]);

  const save = useMutation({
    mutationFn: () => apiPut<{ message?: string }>("/overview/break-even", { fixedCost: parse(form!.fixed), profitGoal: parse(form!.profit), taxPct: parse(form!.tax) }),
    onSuccess: (r) => { toast.success(r.message ?? "Salvo"); setApplied(null); qc.invalidateQueries({ queryKey: ["overview", "break-even"] }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar")),
  });
  // ao sair do campo: na simulação recalcula sem salvar; fora dela, salva
  const commit = () => {
    if (!form) return;
    const v = { fixed: parse(form.fixed), profit: parse(form.profit), tax: parse(form.tax) };
    if (simulate) setApplied(v);
    // fora da simulação, só salva o que mudou
    else if (can("finance.manage") && d && (v.fixed !== d.input.fixedCost || v.profit !== d.input.profitGoal || v.tax !== d.input.taxPct)) save.mutate();
  };
  const leaveSimulation = (on: boolean) => {
    setSimulate(on);
    if (!on) { setApplied(null); setForm(null); }
  };

  const t = d?.totals;
  const a = d?.analysis;
  const chart = d?.daily.map((x) => ({ dia: `${x.day}`, Receita: x.accumulated, Equilíbrio: a?.breakEvenSales ?? undefined, Meta: a?.goalSales ?? undefined })) ?? [];
  const donut = t && d ? [
    { name: "Custos variáveis", value: Math.max(0, t.net - t.margin), color: "#E39B2B" },
    { name: "Custos fixos", value: Math.min(Math.max(0, t.margin), d.input.fixedCost), color: "#D9364C" },
    { name: a && a.result > 0 ? "Lucro" : "Prejuízo", value: Math.abs(a?.result ?? 0), color: a && a.result > 0 ? "#3BB273" : "#9A9A9A" },
  ].filter((x) => x.value > 0) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Análise de ponto de equilíbrio" description="Quanto a loja precisa vender no mês para pagar os custos fixos e para chegar à meta de lucro, pelos contratos assinados." />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6 text-sm">
          <div className="space-y-1"><Label className="text-xs">Mês</Label>
            <select className="h-10 rounded-md border bg-background px-2" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Ano</Label>
            <select className="h-10 rounded-md border bg-background px-2" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          <div className="space-y-1"><Label className="text-xs" title="Aluguel, salários, contas fixas: o que a loja paga vendendo ou não">Custos fixos (R$)</Label>
            <Input className="w-36" inputMode="decimal" value={form?.fixed ?? ""} disabled={!simulate && !can("finance.manage")} onChange={(e) => form && setForm({ ...form, fixed: e.target.value })} onBlur={commit} />
          </div>
          <div className="space-y-1"><Label className="text-xs" title="Quanto a loja quer lucrar no mês depois de pagar tudo">Meta de lucro (R$)</Label>
            <Input className="w-36" inputMode="decimal" value={form?.profit ?? ""} disabled={!simulate && !can("finance.manage")} onChange={(e) => form && setForm({ ...form, profit: e.target.value })} onBlur={commit} />
          </div>
          <div className="space-y-1"><Label className="text-xs" title="Previsão de impostos sobre a venda líquida">Impostos (%)</Label>
            <Input className="w-24" inputMode="decimal" value={form?.tax ?? ""} disabled={!simulate && !can("finance.manage")} onChange={(e) => form && setForm({ ...form, tax: e.target.value })} onBlur={commit} />
          </div>
          <label className="ml-auto flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={simulate} onChange={(e) => leaveSimulation(e.target.checked)} />Modo simulação</label>
          {!simulate && can("finance.manage") && <Button size="sm" variant="outline" disabled={save.isPending || !form} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />Salvar</Button>}
        </CardContent>
        {d && (
          <p className="px-6 pb-4 text-xs text-muted-foreground">
            {simulate ? "Simulação: mude os valores e saia do campo para recalcular. Nada é salvo." : "Mude os valores e saia do campo para salvar."}
            {!d.config.saved && d.config.suggestedFixedCost > 0 ? ` Custos fixos sugeridos pelas despesas de Financeiro → Fixos (${formatCurrency(d.config.suggestedFixedCost)}).` : ""}
          </p>
        )}
      </Card>

      {q.isLoading || !d || !t || !a ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card><CardContent className="space-y-2 p-5">
              <p className="font-semibold">Contratos assinados</p>
              <p className="text-xs text-muted-foreground">Total líquido vendido</p>
              <p className="text-2xl font-semibold tabular-nums">{formatCurrency(t.net)}</p>
              {t.score !== null && <Badge variant="success">Pontuação {t.score.toLocaleString("pt-BR")}</Badge>}
              <p className="text-xs text-muted-foreground">{t.count} {t.count === 1 ? "contrato" : "contratos"} no mês</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-2 p-5">
              <p className="font-semibold">Margem de contribuição</p>
              <p className="text-xs text-muted-foreground">Total da margem</p>
              <p className="text-2xl font-semibold tabular-nums">{formatCurrency(t.margin)}</p>
              <Badge variant="success">{pct(a.marginPct)} da receita</Badge>
              {a.marginSource === "ULTIMOS_3_MESES" && <p className="text-xs text-muted-foreground">Sem contrato no mês: margem média dos 3 meses anteriores.</p>}
            </CardContent></Card>
            <Card><CardContent className="space-y-2 p-5">
              <p className="font-semibold">Ponto de equilíbrio</p>
              <p className="text-xs text-muted-foreground">Venda necessária</p>
              <p className="text-2xl font-semibold tabular-nums">{a.breakEvenSales === null ? "—" : formatCurrency(a.breakEvenSales)}</p>
              <div className="flex justify-between text-xs"><span>Progresso</span><span>{pct(a.breakEvenProgress)}</span></div>
              <Progress value={a.breakEvenProgress} ok={(a.breakEvenProgress ?? 0) >= 100} />
              {a.breakEvenSales !== null && ((a.breakEvenMissing ?? 0) > 0
                ? <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Faltam para equilibrar<br /><strong>{formatCurrency(a.breakEvenMissing ?? 0)}</strong></p>
                : <p className="flex items-center gap-1 rounded-md bg-success/10 p-2 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />Ponto de equilíbrio atingido!</p>)}
              <p className="text-[11px] text-muted-foreground">Custos fixos ÷ margem</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-2 p-5">
              <p className="font-semibold">Meta de lucro</p>
              <p className="text-xs text-muted-foreground">Venda necessária</p>
              <p className="text-2xl font-semibold tabular-nums">{a.goalSales === null ? "—" : formatCurrency(a.goalSales)}</p>
              <div className="flex justify-between text-xs"><span>Progresso</span><span>{pct(a.goalProgress)}</span></div>
              <Progress value={a.goalProgress} ok={(a.goalProgress ?? 0) >= 100} />
              {a.goalSales !== null && ((a.goalMissing ?? 0) > 0
                ? <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Faltam para a meta<br /><strong>{formatCurrency(a.goalMissing ?? 0)}</strong></p>
                : <p className="flex items-center gap-1 rounded-md bg-success/10 p-2 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />Meta de lucro atingida!</p>)}
              <p className="text-[11px] text-muted-foreground">(Custos fixos + lucro) ÷ margem</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-2 p-5 text-sm">
              <div className="flex items-center justify-between"><p className="font-semibold">Resultado atual</p><Badge variant={a.result >= 0 ? "success" : "danger"}>{a.result >= 0 ? "Lucro" : "Prejuízo"}</Badge></div>
              <p className={`text-2xl font-semibold tabular-nums ${a.result < 0 ? "text-destructive" : ""}`}>{formatCurrency(a.result)}</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Custos fixos</span><span className="tabular-nums">{formatCurrency(d.input.fixedCost)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Margem de contribuição</span><span className="tabular-nums text-success">{formatCurrency(t.margin)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cobertura dos fixos</span><span className="tabular-nums">{pct(a.coveragePct)}</span></div>
            </CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {a.breakEvenProgress !== null && <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1"><Lightbulb className="h-3.5 w-3.5" />{pct(a.breakEvenProgress)} do ponto de equilíbrio atingido</span>}
            {(a.breakEvenMissing ?? 0) > 0 && <span className="rounded-md bg-muted px-2 py-1">Para atingir o ponto de equilíbrio, faltam {formatCurrency(a.breakEvenMissing ?? 0)}</span>}
            {(a.goalMissing ?? 0) > 0 && <span className="rounded-md bg-muted px-2 py-1">Para atingir a meta de lucro, faltam {formatCurrency(a.goalMissing ?? 0)}</span>}
            {a.result > 0 && <span className="rounded-md bg-success/10 px-2 py-1 text-success">Parabéns! Lucro de {formatCurrency(a.result)} no mês</span>}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Evolução no mês — {MONTHS[month - 1]} {year}</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={11} interval={2} />
                  <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tickLine={false} axisLine={false} fontSize={11} width={48} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Dia ${l}`} />
                  <Legend />
                  <Bar dataKey="Receita" name="Receita acumulada" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  {a.breakEvenSales !== null && <Line dataKey="Equilíbrio" name="Ponto de equilíbrio" stroke="#D9364C" strokeDasharray="6 4" dot={false} />}
                  {a.goalSales !== null && <Line dataKey="Meta" name="Meta de lucro" stroke="#E39B2B" strokeDasharray="6 4" dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Composição da margem de contribuição</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {[["Total vendido", t.totalSold], ["− Financeira", t.financing]].map(([k, v]) => <div key={k as string} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{formatCurrency(v as number)}</span></div>)}
                <div className="flex justify-between rounded-md bg-muted px-2 py-1 font-semibold"><span>Total líquido</span><span className="tabular-nums">{formatCurrency(t.net)}</span></div>
                {([["Compra (custo dos ambientes)", t.cost], ["Comissões", t.commissions], ["Frete e outros custos", t.freightOther], ["Previsão de impostos", t.taxes]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{formatCurrency(v)} <span className="text-xs text-muted-foreground">{t.net > 0 ? pct(Math.round((v / t.net) * 10000) / 100) : ""}</span></span></div>
                ))}
                <div className="flex justify-between rounded-md bg-success/10 px-2 py-1 font-semibold text-success"><span>= Margem de contribuição</span><span className="tabular-nums">{formatCurrency(t.margin)} · {pct(t.marginPct)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Composição financeira</CardTitle></CardHeader>
              <CardContent className="h-64">
                {donut.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%">{donut.map((x) => <Cell key={x.name} fill={x.color} />)}</Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground">Sem contratos no mês.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Contratos do mês</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {!d.contracts.length && <p className="text-muted-foreground">Nenhum contrato assinado neste mês. Os contratos entram aqui quando o orçamento é aceito (Cliente aceitou).</p>}
              {d.contracts.map((c) => (
                <div key={c.id} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-b-0">
                  <span><Link to={`/comercial/orcamentos/${c.id}`} className="text-primary hover:underline">{c.number}</Link> · {c.client} · {c.day.split("-").reverse().join("/")}</span>
                  <span className="tabular-nums">{formatCurrency(c.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
