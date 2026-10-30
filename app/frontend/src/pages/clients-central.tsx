import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/states";
import { ORIGIN_CODES } from "@/components/crm-parts";
import { apiGet } from "@/services/api";
import { formatCurrency } from "@/lib/utils";

type Person = { id: string; name: string } | null;
type Row = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  originLabel: string | null;
  seller: Person;
  attendant: Person;
  openOpportunities: number;
  openValue: number;
  _count: { convertedLeads: number; opportunities: number; quotes: number; assistances: number };
};

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
const people = (rows: Row[], k: "seller" | "attendant") => [...new Map(rows.flatMap((r) => (r[k] ? [[r[k]!.id, r[k]!] as const] : []))).values()].sort((a, b) => a.name.localeCompare(b.name));

/** Central de clientes do CRM: busca, filtros e acesso à ficha de cada um. */
export function ClientsCentralPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [sellerId, setSellerId] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [origin, setOrigin] = useState("");
  const q = useQuery({
    queryKey: ["crm-clients", search, status, sellerId, attendantId, origin],
    queryFn: () => apiGet<{ data: Row[] }>("/commercial/clients", { search: search || undefined, status: status || undefined, sellerId: sellerId || undefined, attendantId: attendantId || undefined, origin: origin || undefined }),
    placeholderData: (prev) => prev,
  });
  // opções de carteira: quem aparece na lista sem o filtro daquele campo
  const all = useQuery({ queryKey: ["crm-clients", "carteira"], queryFn: () => apiGet<{ data: Row[] }>("/commercial/clients"), staleTime: 300_000 });
  const sellers = useMemo(() => people(all.data?.data ?? [], "seller"), [all.data]);
  const attendants = useMemo(() => people(all.data?.data ?? [], "attendant"), [all.data]);
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Central de clientes" description="Todos os clientes da sua carteira, com o histórico comercial de cada um." />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={search} placeholder="Nome, CPF/CNPJ, e-mail ou telefone" onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={selectCls} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </select>
          <select className={selectCls} aria-label="Vendedor" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {sellers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className={selectCls} aria-label="Atendente" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
            <option value="">Todos os atendentes</option>
            {attendants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className={selectCls} aria-label="Origem" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">Todas as origens</option>
            {ORIGIN_CODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="SEM_ORIGEM">Sem origem na lista</option>
          </select>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <PageSkeleton />
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{rows.length} cliente(s)</p>
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}{c.status === "INACTIVE" && <Badge variant="secondary" className="ml-2">inativo</Badge>}</p>
                <p className="truncate text-xs text-muted-foreground">{[c.phone, c.email, c.originLabel].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <span className="text-xs text-muted-foreground">Vendedor: {c.seller?.name ?? "—"}{c.attendant ? ` · Atendente: ${c.attendant.name}` : ""}</span>
              <span className="text-xs tabular-nums">{c._count.convertedLeads} lead(s) · {c._count.opportunities} oportunidade(s) · {c._count.quotes} orçamento(s)</span>
              {c.openOpportunities > 0 && <Badge variant="secondary">{c.openOpportunities} em aberto · {formatCurrency(c.openValue)}</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
