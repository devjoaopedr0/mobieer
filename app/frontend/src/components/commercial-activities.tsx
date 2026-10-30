import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { formatCurrency } from "@/lib/utils";

type SellerRow = {
  sellerId: string; name: string; done: number; contacts: number; followUps: number; meetings: number; proposals: number;
  pending: number; overdue: number; opportunitiesMoved: number; contracts: number; contractsValue: number;
};
type Done = {
  id: string; type: string; summary: string; result: string | null; occurredAt: string; nextAction: string | null; nextActionAt: string | null;
  responsible: { id: string; name: string }; client: { id: string; name: string } | null; lead: { id: string; name: string } | null; opportunity: { id: string; title: string } | null;
};
type Pending = { kind: string; id: string; title: string; client: string | null; at: string; link: string; sellerName: string | null };
type Data = { from: string; to: string; scope: "all" | "own"; types: Record<string, string>; sellers: SellerRow[]; done: Done[]; pending: Pending[] };

const today = () => new Date().toLocaleDateString("en-CA");
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });

/**
 * Atividades comerciais da equipe: o que cada consultor registrou (contatos,
 * follow-ups, reuniões, propostas), o que está pendente ou atrasado e o que
 * fechou no período. É acompanhamento do fluxo, não ponto de ninguém.
 */
export function CommercialActivities() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [sellerId, setSellerId] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const q = useQuery({
    queryKey: ["commercial", "activities", from, to, sellerId, type, status],
    queryFn: () =>
      apiGet<{ data: Data }>("/commercial/activities", { from, to, sellerId: sellerId === "all" ? undefined : sellerId, type: type === "all" ? undefined : type, status }),
  });
  const d = q.data?.data;
  const sum = (k: keyof SellerRow) => (d?.sellers ?? []).reduce((a, s) => a + Number(s[k]), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Input type="date" aria-label="De" className="h-8 w-36" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <span>a</span>
        <Input type="date" aria-label="Até" className="h-8 w-36" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        {d?.scope === "all" && (
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger className="h-8 w-[200px]" aria-label="Consultor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os consultores</SelectItem>
              {(d?.sellers ?? []).map((s) => <SelectItem key={s.sellerId} value={s.sellerId}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-[160px]" aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(d?.types ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[150px]" aria-label="Situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Feitas e pendentes</SelectItem>
            <SelectItem value="done">Só feitas</SelectItem>
            <SelectItem value="pending">Só pendentes</SelectItem>
            <SelectItem value="overdue">Só atrasadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !d ? (
        <p className="text-sm text-destructive">{errorMessage(q.error, "Não foi possível carregar as atividades")}</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Por consultor</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {!d.sellers.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade no período.</p>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5 text-left">Consultor</th>
                      <th className="text-right">Feitas</th>
                      <th className="text-right">Contatos</th>
                      <th className="text-right">Follow-ups</th>
                      <th className="text-right">Reuniões</th>
                      <th className="text-right">Propostas</th>
                      <th className="text-right">Oport. movidas</th>
                      <th className="text-right">Pendentes</th>
                      <th className="text-right">Atrasadas</th>
                      <th className="text-right">Contratos</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {d.sellers.map((s) => (
                      <tr key={s.sellerId} className="border-b last:border-0">
                        <td className="py-1.5 font-medium">{s.name}</td>
                        <td className="text-right">{s.done}</td>
                        <td className="text-right">{s.contacts}</td>
                        <td className="text-right">{s.followUps}</td>
                        <td className="text-right">{s.meetings}</td>
                        <td className="text-right">{s.proposals}</td>
                        <td className="text-right">{s.opportunitiesMoved}</td>
                        <td className="text-right">{s.pending}</td>
                        <td className={`text-right ${s.overdue ? "font-medium text-destructive" : ""}`}>{s.overdue}</td>
                        <td className="text-right">{s.contracts}{s.contracts > 0 && <span className="text-xs text-muted-foreground"> · {formatCurrency(s.contractsValue)}</span>}</td>
                      </tr>
                    ))}
                    {d.sellers.length > 1 && (
                      <tr className="font-semibold">
                        <td className="py-1.5">Total</td>
                        {(["done", "contacts", "followUps", "meetings", "proposals", "opportunitiesMoved", "pending", "overdue"] as const).map((k) => <td key={k} className="text-right">{sum(k)}</td>)}
                        <td className="text-right">{sum("contracts")}<span className="text-xs text-muted-foreground"> · {formatCurrency(sum("contractsValue"))}</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {status !== "pending" && status !== "overdue" && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Feitas ({d.done.length})</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {d.done.map((a) => (
                    <div key={a.id} className="px-4 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{d.types[a.type] ?? a.type}</Badge>
                        <span className="font-medium">{a.client?.name ?? a.lead?.name ?? "—"}</span>
                        {a.opportunity && <span className="text-xs text-muted-foreground">{a.opportunity.title}</span>}
                        <span className="ml-auto text-xs text-muted-foreground">{fmt(a.occurredAt)}{d.scope === "all" ? ` · ${a.responsible.name}` : ""}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.summary}{a.result ? ` — ${a.result}` : ""}{a.nextAction ? ` · próxima: ${a.nextAction}` : ""}</p>
                    </div>
                  ))}
                  {!d.done.length && <p className="px-4 py-5 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>}
                </CardContent>
              </Card>
            )}
            {status !== "done" && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Pendentes e atrasadas ({d.pending.length})</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {d.pending.map((t) => {
                    const late = new Date(t.at).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }) < today();
                    return (
                      <Link key={`${t.kind}-${t.id}`} to={t.link} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                        <span className={`w-24 shrink-0 text-xs tabular-nums ${late ? "font-medium text-destructive" : "text-muted-foreground"}`}>{fmt(t.at)}</span>
                        <span className="min-w-0 flex-1 truncate">{t.title}<span className="text-xs text-muted-foreground"> · {t.client ?? "—"}</span></span>
                        {d.scope === "all" && <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{t.sellerName ?? "—"}</span>}
                      </Link>
                    );
                  })}
                  {!d.pending.length && <p className="px-4 py-5 text-center text-sm text-muted-foreground">Nada pendente.</p>}
                </CardContent>
              </Card>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Feitas: interações registradas no CRM (ligação, WhatsApp, reunião, follow-up…). Propostas também contam os orçamentos enviados. Pendentes: próxima ação do funil, retorno combinado do lead, agenda e tarefas ligadas ao comercial.
          </p>
        </>
      )}
    </div>
  );
}
