import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/services/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Data = {
  from: string;
  to: string;
  scope: "all" | "own";
  sellers: { key: string; userId: string | null; name: string; prevista: number; aReceber: number; vendas: number }[];
  history: { id: string; name: string; role: string; percent: number; amount: number; quote: { id: string; number: string; version: number; total: number; approvedAt: string | null; client: { id: string; name: string } } }[];
};

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toLocaleDateString("en-CA");
};

/** Comissões por vendedor: prevista (orçamentos em aberto), a receber (vendas do período) e histórico. */
export function CommissionsPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toLocaleDateString("en-CA"));
  const q = useQuery({ queryKey: ["commercial", "commissions", from, to], queryFn: () => apiGet<{ data: Data }>("/commercial/commissions", { from: from || undefined, to: to || undefined }) });
  const d = q.data?.data;
  const total = (k: "prevista" | "aReceber") => (d?.sellers ?? []).reduce((a, s) => a + s[k], 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="text-base">{d?.scope === "own" ? "Suas comissões" : "Comissões por vendedor"}</CardTitle>
              <p className="text-xs text-muted-foreground">As comissões registradas nos orçamentos. Prevista: orçamentos em aberto. A receber: vendas fechadas no período.</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span>a</span>
              <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
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
                <tr className="border-b"><th className="py-1.5 text-left">Vendedor</th><th className="text-right">Prevista</th><th className="text-right">Vendas no período</th><th className="text-right">A receber</th></tr>
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
                <span className="text-xs text-muted-foreground">{h.quote.client.name} · venda de {formatCurrency(h.quote.total)} em {formatDate(h.quote.approvedAt)}</span>
                <span className="ml-auto tabular-nums">{String(h.percent).replace(".", ",")}% · <strong>{formatCurrency(h.amount)}</strong></span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
