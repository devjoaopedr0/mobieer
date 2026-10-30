import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/utils";

// ------------------------------------------------------------------ tipos da API

export type Tier = { min: number; max: number | null; percent: number };
export type TierResult = {
  base: number;
  commission: number;
  percent: number;
  effectivePercent: number;
  tier: { index: number; min: number; max: number | null; percent: number };
  next: { index: number; min: number; percent: number; missing: number } | null;
};
type SellerMonth = {
  userId: string;
  name: string;
  month: string;
  goal: number | null;
  base: number;
  contracts: { quoteId: string; number: string; version: number; kind: string; client: string; day: string; total: number; base: number; lineAmount: number; tierAmount: number | null; cancelledAfter?: boolean }[];
  tier: TierResult | null;
  estimated: number;
  settlement: null | { id: string; status: "CONSOLIDADA" | "REABERTA"; commissionTotal: number; baseTotal: number; effectivePercent: number; creditIn: number; creditOut: number; consolidatedAt: string; consolidatedBy: string | null; adjustments: { id: string; amount: number; reason: string | null; createdAt: string }[] };
  paid: number;
  scheduled: number;
};
type Policy = { id: string; name: string; mode: "PROGRESSIVE" | "FLAT_ON_TOTAL"; role: string; validFrom: string; tiers: Tier[] };
type TiersData = {
  month: string;
  currentMonth: string;
  policy: Policy | null;
  sellers: SellerMonth[];
  issues: { quoteId: string; number: string; kind: string; detail: string }[];
  scope: "all" | "own";
  canManage: boolean;
};
type PolicyRow = Policy & { active: boolean; notes: string | null; locked: boolean; createdBy: { name: string } | null; createdAt: string };

export const MODE_LABEL = { PROGRESSIVE: "Progressivo — cada faixa paga o seu % sobre a parte dentro dela", FLAT_ON_TOTAL: "% da faixa atingida sobre o total do mês" } as const;
export const fmtPct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

export const tiersQuery = (month: string, userId?: string) => ({
  queryKey: ["commercial", "commission-tiers", month, userId ?? ""],
  queryFn: () => apiGet<{ data: TiersData }>("/commercial/commissions/tiers", { month, userId: userId || undefined }),
});

// ------------------------------------------------------------------ progresso da faixa

/** Vendido x faixas: faixa atual, comissão e quanto falta para a próxima. */
export function TierProgress({ tier, tiers, compact }: { tier: TierResult; tiers: Tier[]; compact?: boolean }) {
  const top = tier.next ? tier.tier.max ?? tier.base : tier.base;
  const pct = top > 0 ? Math.min(100, (tier.base / top) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span>
          Faixa atual <strong>{fmtPct(tier.percent)}</strong>
          {tier.effectivePercent !== tier.percent && <span className="text-xs text-muted-foreground"> (média {fmtPct(tier.effectivePercent)} sobre o vendido)</span>}
        </span>
        {tier.next ? (
          <span className="text-muted-foreground">
            Próxima faixa <strong className="text-foreground">{fmtPct(tier.next.percent)}</strong>
          </span>
        ) : (
          <span className="text-muted-foreground">Última faixa atingida</span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{formatCurrency(tier.base)}{tier.next && tier.tier.max != null ? ` / ${formatCurrency(tier.tier.max)}` : ""}</span>
        {tier.next && <span className="font-medium text-foreground">Faltam {formatCurrency(tier.next.missing)} para a próxima faixa</span>}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tiers.map((t, i) => (
            <Badge key={i} variant={i === tier.tier.index ? "default" : "muted"} className="font-normal tabular-nums">
              {t.max == null ? `acima de ${formatCurrency(t.min)}` : `${i === 0 ? "até" : `${formatCurrency(t.min)} a`} ${formatCurrency(t.max)}`} · {fmtPct(t.percent)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ painel

export function CommissionsPanel() {
  const [month, setMonth] = useState(thisMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<null | { kind: "reopen" | "adjust"; seller: SellerMonth }>(null);
  const qc = useQueryClient();
  const q = useQuery(tiersQuery(month));
  const d = q.data?.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["commercial"] });

  const consolidate = useMutation({
    mutationFn: (userId: string) => apiPost<{ message?: string }>("/commercial/commissions/settlements", { month, userId }),
    onSuccess: (r) => { toast.success(r.message ?? "Comissão consolidada"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível consolidar")),
  });

  const own = d?.scope === "own";
  const focus = d ? d.sellers.find((s) => s.userId === selected) ?? (own ? d.sellers[0] : null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{own ? "Sua comissão" : "Comissão por consultor"}</h3>
          <p className="text-xs text-muted-foreground">
            Base: contratos aceitos no mês da venda. {d?.policy ? `${d.policy.name} · ${MODE_LABEL[d.policy.mode]}.` : "Sem faixa de comissão vigente neste mês — vale a comissão de cada orçamento."}
          </p>
        </div>
        <Input type="month" aria-label="Mês" className="h-8 w-40" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      {q.isLoading || !d ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {!own && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Equipe — {monthLabel(month)}</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {!d.sellers.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum consultor com venda ou meta no mês.</p>
                ) : (
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-1.5 text-left">Consultor</th>
                        <th className="text-right">Contratos</th>
                        <th className="text-right">Vendido</th>
                        <th className="text-right">Meta</th>
                        <th className="text-right">Faixa</th>
                        <th className="text-right">Estimada</th>
                        <th className="text-right">Consolidada</th>
                        <th className="text-right">Paga</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {d.sellers.map((s) => {
                        const closed = s.settlement?.status === "CONSOLIDADA";
                        return (
                          <tr key={s.userId} className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${focus?.userId === s.userId ? "bg-muted/40" : ""}`} onClick={() => setSelected(s.userId)}>
                            <td className="py-1.5 font-medium">{s.name}</td>
                            <td className="text-right">{s.contracts.length}</td>
                            <td className="text-right">{formatCurrency(s.base)}</td>
                            <td className="text-right text-muted-foreground">{s.goal ? `${Math.round((s.base / s.goal) * 100)}% de ${formatCurrency(s.goal)}` : "—"}</td>
                            <td className="text-right">{s.tier ? fmtPct(s.tier.percent) : "—"}</td>
                            <td className="text-right">{formatCurrency(s.estimated)}</td>
                            <td className="text-right">{closed ? formatCurrency(s.settlement!.commissionTotal) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="text-right">{formatCurrency(s.paid)}</td>
                            <td className="pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                              {d.canManage && d.policy && month < d.currentMonth && !closed && (
                                <Button size="sm" variant="outline" className="h-7" disabled={consolidate.isPending} onClick={() => consolidate.mutate(s.userId)}>
                                  {s.settlement ? "Consolidar de novo" : "Consolidar"}
                                </Button>
                              )}
                              {closed && <Badge variant="success">Consolidada</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                      {d.sellers.length > 1 && (
                        <tr className="font-semibold">
                          <td className="py-1.5">Total</td>
                          <td className="text-right">{d.sellers.reduce((a, s) => a + s.contracts.length, 0)}</td>
                          <td className="text-right">{formatCurrency(d.sellers.reduce((a, s) => a + s.base, 0))}</td>
                          <td />
                          <td />
                          <td className="text-right">{formatCurrency(d.sellers.reduce((a, s) => a + s.estimated, 0))}</td>
                          <td className="text-right">{formatCurrency(d.sellers.reduce((a, s) => a + (s.settlement?.status === "CONSOLIDADA" ? s.settlement.commissionTotal : 0), 0))}</td>
                          <td className="text-right">{formatCurrency(d.sellers.reduce((a, s) => a + s.paid, 0))}</td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
                {d.canManage && d.policy && month >= d.currentMonth && <p className="mt-2 text-xs text-muted-foreground">A consolidação fica disponível quando o mês terminar.</p>}
              </CardContent>
            </Card>
          )}

          {focus && <SellerCard seller={focus} policy={d.policy} canManage={d.canManage} onAction={(kind) => setAction({ kind, seller: focus })} />}
          {!own && !focus && d.sellers.length > 0 && <p className="text-xs text-muted-foreground">Clique num consultor para ver os contratos considerados.</p>}

          {d.issues.length > 0 && (
            <Card className="border-warning/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> Contratos para conferir</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {d.issues.map((i) => (
                  <div key={`${i.quoteId}-${i.kind}`} className="flex flex-wrap gap-x-2">
                    <Link to={`/comercial/orcamentos/${i.quoteId}`} className="text-primary hover:underline">{i.number}</Link>
                    <span className="text-muted-foreground">{i.detail}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {d.canManage && <PolicySettings />}
        </>
      )}

      <QuoteCommissionsPanel />
      {action && <SettlementActionDialog action={action} onClose={() => setAction(null)} onDone={refresh} />}
    </div>
  );
}

function SellerCard({ seller: s, policy, canManage, onAction }: { seller: SellerMonth; policy: Policy | null; canManage: boolean; onAction: (k: "reopen" | "adjust") => void }) {
  const closed = s.settlement?.status === "CONSOLIDADA" ? s.settlement : null;
  const adjustments = closed ? closed.adjustments.reduce((a, x) => a + x.amount, 0) : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{s.name} — {monthLabel(s.month)}</CardTitle>
            {closed && <p className="text-xs text-muted-foreground">Consolidada em {formatDate(closed.consolidatedAt, true)}{closed.consolidatedBy ? ` por ${closed.consolidatedBy}` : ""}</p>}
            {s.settlement?.status === "REABERTA" && <p className="text-xs text-warning">Apuração reaberta — os valores abaixo são a estimativa atual até consolidar de novo.</p>}
          </div>
          {canManage && closed && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7" onClick={() => onAction("adjust")}>Ajuste</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => onAction("reopen")}>Reabrir</Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Vendido no mês" value={formatCurrency(s.base)} hint={s.goal ? `${Math.round((s.base / s.goal) * 1000) / 10}% da meta de ${formatCurrency(s.goal)}` : "Sem meta no mês"} />
          <Stat label={closed ? "Comissão consolidada" : "Comissão estimada"} value={formatCurrency(closed ? closed.commissionTotal : s.estimated)} hint={s.tier ? `faixa de ${fmtPct(s.tier.percent)}` : "pelos orçamentos"} />
          <Stat label="Já paga" value={formatCurrency(s.paid)} hint={`${formatCurrency(Math.max(0, s.scheduled - s.paid))} a pagar no financeiro`} />
          <Stat label="Contratos" value={String(s.contracts.length)} hint={s.contracts.length ? `ticket médio ${formatCurrency(s.base / s.contracts.length)}` : "nenhum no mês"} />
        </div>

        {s.tier && policy && !closed && <TierProgress tier={s.tier} tiers={policy.tiers} />}
        {closed && (closed.creditIn > 0 || closed.creditOut > 0 || adjustments !== 0) && (
          <p className="text-xs text-muted-foreground">
            {closed.creditIn > 0 && <>Descontado de apurações anteriores: {formatCurrency(closed.creditIn)}. </>}
            {closed.creditOut > 0 && <>A descontar na próxima: {formatCurrency(closed.creditOut)}. </>}
            {adjustments !== 0 && <>Ajustes: {formatCurrency(adjustments)}.</>}
          </p>
        )}

        {s.contracts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b"><th className="py-1.5 text-left">Contrato</th><th className="text-left">Cliente</th><th className="text-left">Data</th><th className="text-right">Valor considerado</th><th className="text-right">Comissão</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {s.contracts.map((c) => (
                  <tr key={c.quoteId} className="border-b last:border-0">
                    <td className="py-1.5">
                      <Link to={`/comercial/orcamentos/${c.quoteId}`} className="text-primary hover:underline">{c.number}{c.version > 1 ? ` v${c.version}` : ""}</Link>
                      {c.kind === "ADENDO" && <span className="text-xs text-muted-foreground"> adendo</span>}
                      {c.cancelledAfter && <Badge variant="danger" className="ml-2">cancelado depois</Badge>}
                    </td>
                    <td>{c.client}</td>
                    <td>{formatDate(c.day)}</td>
                    <td className="text-right">{formatCurrency(c.base)}{c.base !== c.total && <span className="text-xs text-muted-foreground"> de {formatCurrency(c.total)}</span>}</td>
                    <td className="text-right">{formatCurrency(c.tierAmount ?? c.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {closed && closed.adjustments.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Ajustes</p>
            {closed.adjustments.map((a) => (
              <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                <span>{a.reason} <span className="text-xs text-muted-foreground">· {formatDate(a.createdAt)}</span></span>
                <span className="tabular-nums">{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettlementActionDialog({ action, onClose, onDone }: { action: { kind: "reopen" | "adjust"; seller: SellerMonth }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const id = action.seller.settlement!.id;
  const m = useMutation({
    mutationFn: () =>
      action.kind === "reopen"
        ? apiPost<{ message?: string }>(`/commercial/commissions/settlements/${id}/reopen`, { reason })
        : apiPost<{ message?: string }>(`/commercial/commissions/settlements/${id}/adjustments`, { reason, amount: Number(amount.replace(",", ".")) }),
    onSuccess: (r) => { toast.success(r.message ?? "Feito"); onDone(); onClose(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível concluir")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{action.kind === "reopen" ? "Reabrir apuração" : "Ajuste de comissão"} — {action.seller.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {action.kind === "reopen" ? (
            <p className="text-sm text-muted-foreground">Reabrir não mexe no financeiro. Ao consolidar de novo, as parcelas ainda não pagas são refeitas pelo cálculo atual.</p>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="adj-amount">Valor (negativo desconta na próxima apuração)</Label>
              <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex.: 150,00 ou -80,00" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="adj-reason">Motivo</Label>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={m.isPending || reason.trim().length < 3 || (action.kind === "adjust" && !Number(amount.replace(",", ".")))} onClick={() => m.mutate()}>
            {action.kind === "reopen" ? "Reabrir" : "Registrar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ faixas (vigências)

type TierForm = { min: string; max: string; percent: string };
const toForm = (t: Tier): TierForm => ({ min: String(t.min), max: t.max == null ? "" : String(t.max), percent: String(t.percent) });
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const DEFAULT_TIERS: TierForm[] = [{ min: "0", max: "50000", percent: "1" }, { min: "50000", max: "100000", percent: "2" }, { min: "100000", max: "", percent: "3" }];

function PolicySettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["commercial", "commission-policies"], queryFn: () => apiGet<{ data: PolicyRow[] }>("/commercial/commissions/policies") });
  const [edit, setEdit] = useState<null | { id?: string; name: string; mode: Policy["mode"]; validFrom: string; notes: string; tiers: TierForm[] }>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: edit!.name,
        mode: edit!.mode,
        validFrom: edit!.validFrom,
        notes: edit!.notes || null,
        tiers: edit!.tiers.map((t) => ({ min: Number(t.min.replace(",", ".")), max: numOrNull(t.max), percent: Number(t.percent.replace(",", ".")) })),
      };
      return edit!.id ? apiPatch<{ message?: string }>(`/commercial/commissions/policies/${edit!.id}`, body) : apiPost<{ message?: string }>("/commercial/commissions/policies", body);
    },
    onSuccess: (r) => { toast.success(r.message ?? "Faixas salvas"); setEdit(null); qc.invalidateQueries({ queryKey: ["commercial"] }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar as faixas")),
  });
  const toggle = useMutation({
    mutationFn: (p: PolicyRow) => apiPatch(`/commercial/commissions/policies/${p.id}`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial"] }),
    onError: (e) => toast.error(errorMessage(e, "Não foi possível alterar")),
  });
  const rows = q.data?.data ?? [];
  const setTier = (i: number, k: keyof TierForm, v: string) =>
    setEdit((e) => {
      if (!e) return e;
      const tiers = e.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t));
      // o início da faixa seguinte acompanha o fim desta: sem buraco nem sobreposição
      if (k === "max" && tiers[i + 1]) tiers[i + 1] = { ...tiers[i + 1], min: v };
      return { ...e, tiers };
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Faixas de comissão do consultor</CardTitle>
            <p className="text-xs text-muted-foreground">Cada vigência vale a partir do mês indicado até a próxima. Depois de usada numa apuração, não se edita: crie outra vigência.</p>
          </div>
          <Button size="sm" onClick={() => setEdit({ name: "Comissão do consultor", mode: "PROGRESSIVE", validFrom: thisMonth(), notes: "", tiers: rows[0] ? rows[0].tiers.map(toForm) : DEFAULT_TIERS })}>
            <Plus className="mr-1 h-4 w-4" /> Nova vigência
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!rows.length && <p className="text-muted-foreground">Nenhuma faixa cadastrada — a comissão segue a de cada orçamento.</p>}
        {rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-0">
            <span className="font-medium">{p.name}</span>
            <Badge variant={p.active ? "success" : "muted"}>{p.active ? "ativa" : "inativa"}</Badge>
            <span className="text-xs text-muted-foreground">desde {monthLabel(p.validFrom)} · {p.mode === "PROGRESSIVE" ? "progressivo" : "% sobre o total"}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{p.tiers.map((t) => `${t.max == null ? `>${formatCurrency(t.min)}` : `≤${formatCurrency(t.max)}`} ${fmtPct(t.percent)}`).join(" · ")}</span>
            <span className="ml-auto flex gap-2">
              {!p.locked && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => setEdit({ id: p.id, name: p.name, mode: p.mode, validFrom: p.validFrom, notes: p.notes ?? "", tiers: p.tiers.map(toForm) })}>Editar</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7" disabled={toggle.isPending} onClick={() => toggle.mutate(p)}>{p.active ? "Desativar" : "Ativar"}</Button>
            </span>
          </div>
        ))}
      </CardContent>

      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{edit.id ? "Editar vigência" : "Nova vigência de faixas"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="pol-name">Nome</Label>
                  <Input id="pol-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pol-from">Vale a partir de</Label>
                  <Input id="pol-from" type="month" value={edit.validFrom} onChange={(e) => setEdit({ ...edit, validFrom: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Cálculo</Label>
                <Select value={edit.mode} onValueChange={(v) => setEdit({ ...edit, mode: v as Policy["mode"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROGRESSIVE">{MODE_LABEL.PROGRESSIVE}</SelectItem>
                    <SelectItem value="FLAT_ON_TOTAL">{MODE_LABEL.FLAT_ON_TOTAL}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ex.: vendeu R$ 60.000 com 1% até 50 mil e 2% acima — progressivo: 500 + 200 = R$ 700; sobre o total: 60.000 × 2% = R$ 1.200.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Faixas do total vendido no mês</Label>
                {edit.tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_90px_32px] items-center gap-2">
                    <Input aria-label={`Faixa ${i + 1}: acima de`} inputMode="decimal" value={t.min} disabled={i > 0} onChange={(e) => setTier(i, "min", e.target.value)} />
                    <Input aria-label={`Faixa ${i + 1}: até`} inputMode="decimal" placeholder={i === edit.tiers.length - 1 ? "sem teto" : "até"} value={t.max} onChange={(e) => setTier(i, "max", e.target.value)} />
                    <Input aria-label={`Faixa ${i + 1}: %`} inputMode="decimal" value={t.percent} onChange={(e) => setTier(i, "percent", e.target.value)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover faixa ${i + 1}`}
                      disabled={edit.tiers.length === 1}
                      onClick={() => {
                        const tiers = edit.tiers.filter((_, j) => j !== i).map((x, j, all) => (j > 0 ? { ...x, min: all[j - 1].max } : { ...x, min: "0" }));
                        setEdit({ ...edit, tiers });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Colunas: acima de · até (vazio = sem teto, só na última) · %. Um total exatamente no limite fica na faixa de baixo.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const last = edit.tiers[edit.tiers.length - 1];
                    setEdit({ ...edit, tiers: [...edit.tiers, { min: last.max || "", max: "", percent: "" }] });
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Faixa
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pol-notes">Observação</Label>
                <Textarea id="pol-notes" rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ comissões registradas nos orçamentos

type QuoteData = {
  from: string;
  to: string;
  scope: "all" | "own";
  sellers: { key: string; userId: string | null; name: string; prevista: number; aReceber: number; vendas: number }[];
  history: { id: string; name: string; role: string; percent: number; amount: number; quote: { id: string; number: string; version: number; total: number; approvedAt: string | null; competenceDate: string | null; client: { id: string; name: string } } }[];
};

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toLocaleDateString("en-CA");
};

/** Todas as comissões gravadas nos orçamentos (consultor, projetista, produção…): prevista, a receber e histórico. */
function QuoteCommissionsPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toLocaleDateString("en-CA"));
  const q = useQuery({ queryKey: ["commercial", "commissions", from, to], queryFn: () => apiGet<{ data: QuoteData }>("/commercial/commissions", { from: from || undefined, to: to || undefined }) });
  const d = q.data?.data;
  const total = (k: "prevista" | "aReceber") => (d?.sellers ?? []).reduce((a, s) => a + s[k], 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="text-base">Comissões registradas nos orçamentos</CardTitle>
              <p className="text-xs text-muted-foreground">Todos os papéis (consultor, projetista, produção…). Prevista: orçamentos em aberto. A receber: contratos com o mês da venda no período.</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input type="date" aria-label="De" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span>a</span>
              <Input type="date" aria-label="Até" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.isLoading || !d ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !d.sellers.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma comissão em aberto nem venda no período.</p>
          ) : (
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b"><th className="py-1.5 text-left">Pessoa</th><th className="text-right">Prevista</th><th className="text-right">Vendas no período</th><th className="text-right">A receber</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {d.sellers.map((s) => (
                  <tr key={s.key} className="border-b last:border-0">
                    <td className="py-1.5">{s.name}{!s.userId && <span className="text-xs text-muted-foreground"> (sem usuário)</span>}</td>
                    <td className="text-right text-muted-foreground">{formatCurrency(s.prevista)}</td>
                    <td className="text-right">{s.vendas}</td>
                    <td className="text-right font-medium">{formatCurrency(s.aReceber)}</td>
                  </tr>
                ))}
                {d.sellers.length > 1 && (
                  <tr className="font-semibold"><td className="py-1.5">Total</td><td className="text-right">{formatCurrency(total("prevista"))}</td><td /><td className="text-right">{formatCurrency(total("aReceber"))}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {d && d.history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Histórico do período</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {d.history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-x-3 border-b py-1.5 last:border-0">
                <span className="font-medium">{h.name}</span>
                <Link to={`/comercial/orcamentos/${h.quote.id}`} className="text-primary hover:underline">{h.quote.number}</Link>
                <span className="text-xs text-muted-foreground">{h.quote.client.name} · venda de {formatCurrency(h.quote.total)} em {formatDate(h.quote.competenceDate ?? h.quote.approvedAt)}</span>
                <span className="ml-auto tabular-nums">{String(h.percent).replace(".", ",")}% · <strong>{formatCurrency(h.amount)}</strong></span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
