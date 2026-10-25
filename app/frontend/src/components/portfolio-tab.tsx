import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageCircle, PhoneCall, Target, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiGet } from "@/services/api";

type Client = { id: string; name: string; phone: string | null; email: string | null };
type QuoteRow = {
  kind: "ORCAMENTO";
  id: string;
  number: string;
  version: number;
  status: string;
  total: number;
  client: Client;
  seller: { id: string; name: string };
  project: { id: string; code: string; name: string } | null;
  issuedAt: string;
  updatedAt: string;
  validUntil: string | null;
  approvedAt: string | null;
  idleDays: number;
  reason: string | null;
};
type OppRow = { kind: "OPORTUNIDADE"; id: string; title: string; total: number; probability: number; expectedCloseAt: string | null; nextAction: string | null; nextActionAt: string | null; client: Client | null; seller: { id: string; name: string }; idleDays: number };
type Portfolio = {
  staleDays: number;
  scope: "own" | "store";
  totals: { open: number; openCount: number; won: number; wonCount: number; recontact: number; recontactCount: number };
  open: QuoteRow[];
  opportunities: OppRow[];
  won: QuoteRow[];
  recontact: QuoteRow[];
};

const STATUS: Record<string, string> = { DRAFT: "Rascunho", SENT: "Enviado", VIEWED: "Visto", NEGOTIATION: "Em negociação", APPROVED: "Aceito", REJECTED: "Recusado", EXPIRED: "Vencido" };
const idle = (d: number) => (d <= 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

/** Telefone vira link do WhatsApp (o número da loja é do Brasil). */
function Contact({ c }: { c: Client | null }) {
  if (!c) return <span className="text-muted-foreground">—</span>;
  const digits = (c.phone ?? "").replace(/\D/g, "");
  const wa = digits.length >= 10 ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}` : null;
  return (
    <div className="space-y-0.5 text-xs">
      {c.phone && (
        <p className="flex items-center gap-1">
          <PhoneCall className="h-3 w-3" /> {c.phone}
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"><MessageCircle className="h-3 w-3" /> WhatsApp</a>}
        </p>
      )}
      {c.email && <p className="text-muted-foreground">{c.email}</p>}
      {!c.phone && !c.email && <p className="text-muted-foreground">sem contato no cadastro</p>}
    </div>
  );
}

function QuoteTable({ rows, empty, showReason }: { rows: QuoteRow[]; empty: string; showReason?: boolean }) {
  if (!rows.length) return <p className="p-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Contato</TableHead>
          <TableHead>Orçamento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>{showReason ? "Por que recontatar" : "Situação"}</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Última movimentação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.client.name}</TableCell>
            <TableCell><Contact c={r.client} /></TableCell>
            <TableCell className="whitespace-nowrap">
              <Link to={`/comercial/orcamentos/${r.id}`} className="hover:underline">{r.number}{r.version > 1 ? ` v${r.version}` : ""}</Link>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCurrency(r.total)}</TableCell>
            <TableCell>{showReason ? <span className="text-sm">{r.reason}</span> : <Badge variant="secondary">{STATUS[r.status] ?? r.status}</Badge>}</TableCell>
            <TableCell>{r.seller.name}</TableCell>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.approvedAt && r.status === "APPROVED" ? `aceito em ${formatDate(r.approvedAt)}` : idle(r.idleDays)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Carteira / planejamento comercial: não só o que fechou. Em aberto são as
 * possibilidades de venda (orçamentos que ainda não foram aceitos nem recusados
 * e as oportunidades do funil); recontato são os clientes a procurar de novo
 * (recusou, venceu ou o orçamento parou). Tudo com o valor.
 */
export function PortfolioTab() {
  const q = useQuery({ queryKey: ["commercial", "portfolio"], queryFn: () => apiGet<{ data: Portfolio }>("/commercial/quotes/portfolio").then((r) => r.data) });
  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando a carteira…</p>;
  if (!q.data) return <p className="p-6 text-sm text-destructive">{errorMessage(q.error, "Não foi possível carregar a carteira")}</p>;
  const d = q.data;

  return (
    <div className="space-y-4">
      {d.scope === "own" && <p className="text-xs text-muted-foreground">Mostrando a sua carteira (os seus orçamentos e oportunidades).</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard title={`Em aberto (${d.totals.openCount})`} value={formatCurrency(d.totals.open)} icon={Target} />
        <KpiCard title={`Para recontato (${d.totals.recontactCount})`} value={formatCurrency(d.totals.recontact)} icon={PhoneCall} />
        <KpiCard title={`Fechados (${d.totals.wonCount})`} value={formatCurrency(d.totals.won)} icon={TrendingUp} iconBg="bg-success/10" />
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Possibilidades de venda</CardTitle>
          <p className="text-xs text-muted-foreground">Orçamentos em aberto, do maior valor para o menor. Parado há mais de {d.staleDays} dias, o orçamento passa para recontato.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <QuoteTable rows={d.open} empty="Nenhum orçamento em aberto." />
          {d.opportunities.length > 0 && (
            <div className="border-t">
              <p className="px-4 pt-3 text-xs font-semibold uppercase text-muted-foreground">Oportunidades do funil</p>
              <Table>
                <TableBody>
                  {d.opportunities.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.client?.name ?? "Sem cliente"}</TableCell>
                      <TableCell><Contact c={o.client} /></TableCell>
                      <TableCell>{o.title}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCurrency(o.total)}</TableCell>
                      <TableCell className="text-sm">{o.probability}%{o.nextAction ? ` · ${o.nextAction}` : ""}</TableCell>
                      <TableCell>{o.seller.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{idle(o.idleDays)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Clientes para recontato</CardTitle>
          <p className="text-xs text-muted-foreground">Quem não fechou ainda pode fechar: recusou, o orçamento venceu ou parou sem resposta.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <QuoteTable rows={d.recontact} empty="Ninguém para recontatar agora." showReason />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Fechados</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <QuoteTable rows={d.won} empty="Nenhuma venda fechada ainda." />
        </CardContent>
      </Card>
    </div>
  );
}
