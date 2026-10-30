import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";

type Numbers = {
  goal: number | null;
  sold: number;
  missing: number | null;
  percent: number | null;
  dailyNeeded: number | null;
  projected: number;
  onTrack: boolean | null;
  salesCount: number;
  ticketMedio: number;
  proposals: number;
  conversion: number | null;
  openOpportunities: number;
  forecastLabel: string;
};
type Dashboard = Numbers & { month: string; scope: "seller" | "store"; bySeller: (Numbers & { sellerId: string; name: string })[] };

type Suggestion = {
  month: string;
  suggestion:
    | { ok: false; reason: string }
    | {
        ok: true;
        fixedCosts: number;
        marginPercent: number;
        profitPercent: number;
        breakEven: number;
        recommended: number;
        stretch: number;
        expectedProfit: number;
        avgTicket: number | null;
        contracts: { breakEven: number | null; recommended: number | null; stretch: number | null };
        bySeller: { id: string; name: string; sharePercent: number; suggested: number }[];
        sellersBasis: "HISTORY" | "EQUAL";
      };
  fixed: { source: "FIXOS" | "HISTORICO"; total: number; count: number; items: { description: string; category: string; amount: number }[] };
  margin: { percent: number; source: "CONTRATOS" | "PRECIFICACAO"; sample: number; markup: number; commissionPercent: number };
  ticket: { value: number | null; sample: number };
};

const brl = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const mesAtual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }).slice(0, 7);

/** Metas do mês: meta, vendido, faltante, ritmo e previsão. */
export function CommercialGoals() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [month, setMonth] = useState(mesAtual());
  const [meta, setMeta] = useState("");
  // a gestão define a da loja e a de cada consultor; o consultor, só a própria
  const manage = can("commercial.goals.manage");
  const self = !manage && can("commercial.goals.self");
  const [sellerMeta, setSellerMeta] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["goals", month],
    queryFn: () => apiGet<{ data: Dashboard }>("/commercial/goals/dashboard", { month }),
  });

  const valor = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));
  const salvar = useMutation({
    mutationFn: () => apiPut("/commercial/goals", { month, amount: valor(meta), userId: self ? user!.id : null }),
    onSuccess: () => {
      toast.success(self ? "Sua meta foi salva" : "Meta da loja salva");
      setMeta("");
      qc.invalidateQueries({ queryKey: ["goals", month] });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar a meta")),
  });
  const salvarConsultor = useMutation({
    mutationFn: (v: { userId: string; amount: number }) => apiPut("/commercial/goals", { month, ...v }),
    onSuccess: (_r, v) => {
      toast.success("Meta do consultor salva");
      setSellerMeta((m) => ({ ...m, [v.userId]: "" }));
      qc.invalidateQueries({ queryKey: ["goals", month] });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar a meta")),
  });

  const d = q.data?.data;
  const pct = d?.percent ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <Label htmlFor="g-mes" className="text-xs">Mês</Label>
            <Input id="g-mes" type="month" value={month} onChange={(e) => setMonth(e.target.value || mesAtual())} className="w-[170px]" />
          </div>
          {(manage || self) && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (meta) salvar.mutate();
              }}
            >
              <div>
                <Label htmlFor="g-valor" className="text-xs">{self ? "Sua meta no mês" : "Meta da loja no mês"}</Label>
                <Input id="g-valor" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder={d?.goal ? String(d.goal) : "0,00"} inputMode="decimal" className="w-[170px]" />
              </div>
              <Button type="submit" size="sm" disabled={salvar.isPending || !meta}>
                {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar meta
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {manage && <GoalSuggestion month={month} />}
      <AdaptiveGoals month={month} />

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !d ? (
        <p className="text-sm text-destructive">{errorMessage(q.error, "Não foi possível carregar as metas")}</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" /> {d.scope === "seller" ? "Sua meta" : "Meta da loja"}
                </span>
                {d.onTrack !== null && (
                  <Badge variant={d.onTrack ? "success" : "warning"}>{d.onTrack ? "Previsão acima da meta" : "Previsão abaixo da meta"}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.goal === null ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma meta definida para este mês{manage || self ? " — informe o valor acima." : "."} Vendido até agora: <strong>{brl(d.sold)}</strong>.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      <strong className="text-lg tabular-nums">{brl(d.sold)}</strong> <span className="text-muted-foreground">de {brl(d.goal)}</span>
                    </span>
                    <span className="tabular-nums font-medium">{pct.toLocaleString("pt-BR")}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metrica rotulo="Faltante" valor={brl(d.missing)} />
                <Metrica rotulo="Precisa vender por dia" valor={d.dailyNeeded === null ? "—" : brl(d.dailyNeeded)} />
                <Metrica rotulo="Ticket médio" valor={brl(d.ticketMedio)} dica={`${d.salesCount} venda(s)`} />
                <Metrica rotulo="Conversão" valor={d.conversion === null ? "—" : `${d.conversion.toLocaleString("pt-BR")}%`} dica={`${d.proposals} proposta(s)`} />
              </div>
              <p className="text-xs text-muted-foreground">
                Previsão de fechamento: <strong>{brl(d.projected)}</strong>. {d.forecastLabel}
              </p>
            </CardContent>
          </Card>

          {d.bySeller.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por projetista</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projetista</TableHead>
                      <TableHead className="text-right">Meta</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Previsão</TableHead>
                      <TableHead className="text-right">Oportunidades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.bySeller.map((s) => (
                      <TableRow key={s.sellerId}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {manage ? (
                            <form
                              className="flex items-center justify-end gap-1"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const v = sellerMeta[s.sellerId];
                                if (v) salvarConsultor.mutate({ userId: s.sellerId, amount: valor(v) });
                              }}
                            >
                              <Input aria-label={`Meta de ${s.name}`} value={sellerMeta[s.sellerId] ?? ""} onChange={(e) => setSellerMeta((m) => ({ ...m, [s.sellerId]: e.target.value }))} placeholder={s.goal === null ? "0,00" : brl(s.goal)} inputMode="decimal" className="h-8 w-[120px] text-right" />
                              {sellerMeta[s.sellerId] && <Button type="submit" size="sm" variant="outline" className="h-8" disabled={salvarConsultor.isPending}>Salvar</Button>}
                            </form>
                          ) : (
                            brl(s.goal)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(s.sold)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.percent === null ? "—" : `${s.percent.toLocaleString("pt-BR")}%`}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{brl(s.projected)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.openOpportunities}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Meta sugerida: quanto a loja precisa vender para pagar as despesas fixas e ainda sobrar o lucro desejado. */
function GoalSuggestion({ month }: { month: string }) {
  const qc = useQueryClient();
  const [profit, setProfit] = useState("20");
  const [open, setOpen] = useState(false);
  const pct = Math.min(300, Math.max(0, Number(profit) || 0));

  const q = useQuery({
    queryKey: ["goals", "suggestion", month, pct],
    queryFn: () => apiGet<{ data: Suggestion }>("/commercial/goals/suggestion", { month, profit: pct }),
    placeholderData: (prev) => prev,
  });
  const aplicar = useMutation({
    mutationFn: async (v: { amount: number; sellers?: { id: string; suggested: number }[] }) => {
      await apiPut("/commercial/goals", { month, amount: v.amount, userId: null });
      for (const s of v.sellers ?? []) await apiPut("/commercial/goals", { month, amount: s.suggested, userId: s.id });
    },
    onSuccess: (_r, v) => {
      toast.success(v.sellers?.length ? "Meta da loja e dos projetistas salvas" : "Meta da loja salva");
      qc.invalidateQueries({ queryKey: ["goals", month] });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar a meta")),
  });

  const d = q.data?.data;
  if (!d) return null;
  const s = d.suggestion;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Meta sugerida pelas despesas fixas
          </span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <Label htmlFor="g-lucro" className="text-xs">Lucro desejado sobre as fixas</Label>
            <Input id="g-lucro" value={profit} onChange={(e) => setProfit(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="h-8 w-16 text-right" />%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!s.ok ? (
          <p className="text-sm text-muted-foreground">{s.reason}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Nivel rotulo="Mínimo (ponto de equilíbrio)" valor={s.breakEven} contratos={s.contracts.breakEven} dica="Paga as despesas fixas, sem lucro" onUse={() => aplicar.mutate({ amount: s.breakEven })} busy={aplicar.isPending} />
              <Nivel destaque rotulo="Recomendada" valor={s.recommended} contratos={s.contracts.recommended} dica={`Paga as fixas e sobra ${brl(s.expectedProfit)}`} onUse={() => aplicar.mutate({ amount: s.recommended })} busy={aplicar.isPending} />
              <Nivel rotulo="Desafio" valor={s.stretch} contratos={s.contracts.stretch} dica="25% acima da recomendada" onUse={() => aplicar.mutate({ amount: s.stretch })} busy={aplicar.isPending} />
            </div>
            <p className="text-xs text-muted-foreground">
              Conta: despesas fixas de <strong>{brl(d.fixed.total)}</strong>
              {d.fixed.source === "FIXOS" ? ` (${d.fixed.count} em Financeiro → Fixos)` : " (média paga dos últimos 3 meses — cadastre as fixas em Financeiro → Fixos para ficar exato)"} ÷ margem de <strong>{s.marginPercent.toLocaleString("pt-BR")}%</strong>
              {d.margin.source === "CONTRATOS"
                ? ` (o que sobrou nos ${d.margin.sample} contratos aceitos dos últimos 6 meses)`
                : ` (mark-up ${d.margin.markup.toLocaleString("pt-BR")} e ${d.margin.commissionPercent.toLocaleString("pt-BR")}% de comissão da precificação; passa a usar os contratos reais quando houver 3 aceitos)`}
              {s.avgTicket ? `. Ticket médio de ${brl(s.avgTicket)}.` : ". Ainda sem vendas para calcular o ticket médio."}{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => setOpen((v) => !v)}>
                {open ? "Ocultar detalhes" : "Ver despesas e divisão por projetista"}
              </button>
            </p>
            {open && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto">
                  <p className="mb-1 text-sm font-medium">Despesas fixas consideradas</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {d.fixed.items.map((i, k) => (
                        <tr key={k} className="border-t border-border">
                          <td className="py-1">{i.description}</td>
                          <td className="py-1 text-muted-foreground">{i.category !== i.description ? i.category : ""}</td>
                          <td className="py-1 text-right tabular-nums">{brl(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.fixed.count > d.fixed.items.length && <p className="mt-1 text-[11px] text-muted-foreground">e mais {d.fixed.count - d.fixed.items.length}</p>}
                </div>
                {s.bySeller.length > 0 && (
                  <div className="overflow-x-auto">
                    <p className="mb-1 text-sm font-medium">Divisão da meta recomendada por projetista</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {s.bySeller.map((x) => (
                          <tr key={x.id} className="border-t border-border">
                            <td className="py-1">{x.name}</td>
                            <td className="py-1 text-right tabular-nums text-muted-foreground">{x.sharePercent.toLocaleString("pt-BR")}%</td>
                            <td className="py-1 text-right tabular-nums">{brl(x.suggested)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-muted-foreground">{s.sellersBasis === "HISTORY" ? "Proporcional ao que cada um vendeu nos últimos 6 meses." : "Sem vendas recentes: dividida em partes iguais."}</p>
                    <Button size="sm" variant="outline" className="mt-2" disabled={aplicar.isPending} onClick={() => aplicar.mutate({ amount: s.recommended, sellers: s.bySeller })}>
                      Aplicar recomendada à loja e aos projetistas
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Nivel({ rotulo, valor, contratos, dica, destaque, onUse, busy }: { rotulo: string; valor: number; contratos: number | null; dica: string; destaque?: boolean; onUse: () => void; busy: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-primary bg-primary/5" : "border-border"}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{brl(valor)}</p>
      <p className="text-[11px] text-muted-foreground">
        {dica}
        {contratos ? ` · cerca de ${contratos} contrato(s)` : ""}
      </p>
      <Button size="sm" variant={destaque ? "default" : "outline"} className="mt-2 h-7 text-xs" disabled={busy} onClick={onUse}>
        Usar como meta da loja
      </Button>
    </div>
  );
}

function Metrica({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

type Proposal = { id: string; month: string; status: "PENDENTE" | "APROVADA" | "AJUSTADA" | "RECUSADA"; proposedAmount: number; approvedAmount: number | null; decidedBy: string | null; decidedAt: string | null; adjustedAmount: number | null; adjustedBy: string | null; adjustedAt: string | null };
type Adaptive = {
  month: string;
  canDecide: boolean;
  sellers: { userId: string; name: string; proposal: { active: boolean; months: number; amount?: number }; explanation: string; stored: Proposal | null; history: Proposal[] }[];
};
const PROPOSAL_STATUS: Record<Proposal["status"], string> = { PENDENTE: "aguardando aprovação", APROVADA: "aprovada", AJUSTADA: "aprovada com ajuste", RECUSADA: "recusada" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

/**
 * Meta adaptativa: com 3 meses de histórico (venda fechada e lead), o sistema
 * propõe a meta do vendedor e mostra a conta. Só vale depois que a gestão aprova.
 */
export function AdaptiveGoals({ month }: { month: string }) {
  const qc = useQueryClient();
  const [custom, setCustom] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["goals", "adaptive", month], queryFn: () => apiGet<{ data: Adaptive }>("/commercial/goals/adaptive", { month }) });
  const done = (r: { message?: string }) => {
    if (r.message) toast.success(r.message);
    qc.invalidateQueries({ queryKey: ["goals"] });
  };
  const fail = (e: unknown) => toast.error(errorMessage(e, "Não foi possível concluir"));
  const propose = useMutation({ mutationFn: (userId: string) => apiPost<{ message?: string }>("/commercial/goals/adaptive", { month, userId }), onSuccess: done, onError: fail });
  const decide = useMutation({ mutationFn: (v: { id: string; action: "approve" | "reject"; amount?: number }) => apiPost<{ message?: string }>(`/commercial/goals/adaptive/${v.id}/decide`, v), onSuccess: done, onError: fail });
  const d = q.data?.data;
  if (!d || !d.sellers.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" /> Meta adaptativa</CardTitle>
        <p className="text-xs text-muted-foreground">Com pelo menos 3 meses de vendas fechadas e leads, o sistema propõe a meta do vendedor pelo fluxo dele: leads, conversão, ticket médio e sazonalidade. A proposta só vale depois de aprovada; sem histórico, a meta segue manual.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.sellers.map((s) => {
          const st = s.stored;
          return (
            <div key={s.userId} className="space-y-1.5 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {s.proposal.active ? <Badge variant="secondary">proposta: {brl(s.proposal.amount ?? 0)}</Badge> : <Badge variant="secondary">meta manual · {s.proposal.months}/3 meses de histórico</Badge>}
                {st && <Badge variant={st.status === "RECUSADA" ? "danger" : st.status === "PENDENTE" ? "warning" : "success"}>{PROPOSAL_STATUS[st.status]}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{s.explanation}</p>
              {st && st.status !== "PENDENTE" && (
                <p className="text-xs">
                  {st.status === "RECUSADA" ? "Recusada" : `Aprovada: ${brl(st.approvedAmount)} (proposta ${brl(st.proposedAmount)})`} por {st.decidedBy ?? "—"} em {when(st.decidedAt)}
                  {st.adjustedAmount != null && ` · ajustada depois para ${brl(st.adjustedAmount)} por ${st.adjustedBy ?? "—"} em ${when(st.adjustedAt)}`}
                </p>
              )}
              {d.canDecide && s.proposal.active && (!st || st.status === "PENDENTE" || st.status === "RECUSADA") && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(!st || st.status === "RECUSADA" || st.proposedAmount !== s.proposal.amount) && (
                    <Button size="sm" variant="outline" className="h-8" disabled={propose.isPending} onClick={() => propose.mutate(s.userId)}>{st?.status === "PENDENTE" ? "Atualizar a proposta" : "Enviar para aprovação"}</Button>
                  )}
                  {st?.status === "PENDENTE" && (
                    <>
                      <Button size="sm" className="h-8" disabled={decide.isPending} onClick={() => decide.mutate({ id: st.id, action: "approve" })}>Aprovar {brl(st.proposedAmount)}</Button>
                      <Input className="h-8 w-32" inputMode="decimal" placeholder="Outro valor" value={custom[s.userId] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [s.userId]: e.target.value }))} />
                      {custom[s.userId] && <Button size="sm" variant="outline" className="h-8" disabled={decide.isPending} onClick={() => decide.mutate({ id: st.id, action: "approve", amount: Number(custom[s.userId].replace(/\./g, "").replace(",", ".")) })}>Aprovar com ajuste</Button>}
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" disabled={decide.isPending} onClick={() => decide.mutate({ id: st.id, action: "reject" })}>Recusar</Button>
                    </>
                  )}
                </div>
              )}
              {s.history.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Histórico: {s.history.map((h) => `${h.month.split("-").reverse().join("/")} ${PROPOSAL_STATUS[h.status]} ${brl(h.adjustedAmount ?? h.approvedAmount ?? h.proposedAmount)}`).join(" · ")}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
