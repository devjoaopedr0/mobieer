import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Filter, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/states";
import { LeadDialog } from "@/components/lead-dialog";
import { originLabel } from "@/components/crm-parts";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPost } from "@/services/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Person = { id: string; name: string } | null;
type Ficha = {
  client: { id: string; name: string; document: string | null; email: string | null; phone: string | null; status: string; originLabel: string | null; leadSource: string | null; address: string | null; deliveryAddress: string | null; city: string | null; state: string | null; notes: string | null; createdAt: string; seller: Person; attendant: Person };
  interactions: { id: string; type: string; summary: string; result: string | null; occurredAt: string; nextAction: string | null; nextActionAt: string | null; responsible: Person; opportunity: { id: string; title: string } | null; lead: { id: string; name: string } | null }[];
  leads: { id: string; name: string; status: string; origin: string | null; source: string | null; interest: string | null; enteredAt: string; lastContactAt: string | null; nextContactAt: string | null; lostReasonCode: string | null; seller: Person }[];
  opportunities: { id: string; title: string; status: string; estimatedValue: number; createdAt: string; wonAt: string | null; lostReason: string | null; stage: { name: string }; seller: Person }[];
  quotes: { id: string; number: string; version: number; kind: string; status: string; total: number; createdAt: string; approvedAt: string | null; seller: Person }[];
  contracts: { id: string; number: string | null; title: string; version: number; signatureStatus: string; createdAt: string; project: { id: string; code: string } | null }[];
  assistances: { id: string; number: string; title: string; status: string; createdAt: string; resolvedAt: string | null; project: { id: string; code: string } | null }[];
};

const LEAD_STATUS: Record<string, string> = { NEW: "Novo", CONTACTED: "Contatado", QUALIFIED: "Qualificado", CONVERTED: "Convertido", LOST: "Perdido" };
const OPP_STATUS: Record<string, string> = { OPEN: "Em aberto", WON: "Ganha", LOST: "Perdida" };
const QUOTE_STATUS: Record<string, string> = { DRAFT: "Rascunho", SENT: "Enviado", VIEWED: "Visto", NEGOTIATION: "Em negociação", APPROVED: "Aceito", REJECTED: "Recusado", EXPIRED: "Vencido", CANCELLED: "Cancelado" };
const SIGN_STATUS: Record<string, string> = { NOT_REQUIRED: "Sem assinatura", PENDING: "Aguardando assinatura", PARTIAL: "Assinado em parte", SIGNED: "Assinado" };
const AT_STATUS: Record<string, string> = { OPEN: "Aberta", TRIAGE: "Triagem", SCHEDULED: "Visita marcada", IN_PROGRESS: "Em atendimento", WAITING_CLIENT: "Aguardando cliente", RESOLVED: "Resolvida", CANCELLED: "Cancelada" };
const CONTACT: Record<string, string> = { CALL: "Ligação", WHATSAPP: "WhatsApp", EMAIL: "E-mail", MEETING: "Reunião", VISIT: "Visita", FOLLOW_UP: "Follow-up", PROPOSAL: "Proposta", NEGOTIATION: "Negociação", INTERNAL_MESSAGE: "Mensagem interna", OTHER: "Outro" };

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} <span className="text-sm font-normal text-muted-foreground">({count})</span></CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-sm">{count ? children : <p className="text-xs text-muted-foreground">Nada registrado.</p>}</CardContent>
    </Card>
  );
}
const Line = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 last:border-0">{children}</div>;
const Muted = ({ children }: { children: ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>;

/** Ficha do cliente no CRM: dados e todo o histórico comercial num lugar só. */
export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [leadOpen, setLeadOpen] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const q = useQuery({ queryKey: ["crm-client", id], queryFn: () => apiGet<{ data: Ficha }>(`/commercial/clients/${id}`), enabled: !!id });
  if (q.isLoading) return <PageSkeleton />;
  const d = q.data?.data;
  if (!d) return <p className="p-6 text-sm text-muted-foreground">Cliente não encontrado na sua carteira.</p>;
  const c = d.client;

  return (
    <div className="space-y-4">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Central de clientes</Link>
      <PageHeader title={c.name} description={`Cliente desde ${formatDate(c.createdAt)}${c.status === "INACTIVE" ? " · inativo" : ""}`}>
        <div className="flex flex-wrap gap-2">
          {(can("commercial.manage") || can("commercial.leads.manage")) && <Button size="sm" variant="outline" onClick={() => setFunnelOpen(true)}><Filter className="mr-2 h-4 w-4" /> Adicionar ao funil</Button>}
          {can("commercial.leads.manage") && <Button size="sm" onClick={() => setLeadOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Novo lead</Button>}
        </div>
      </PageHeader>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dados</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p><Muted>CPF/CNPJ</Muted> {c.document ?? "—"}</p>
          <p><Muted>Telefone</Muted> {c.phone ?? "—"}</p>
          <p><Muted>E-mail</Muted> {c.email ?? "—"}</p>
          <p><Muted>Origem</Muted> {c.originLabel ?? "—"}{c.originLabel === "Sem origem na lista" && c.leadSource ? ` (${c.leadSource})` : ""}</p>
          <p><Muted>Vendedor</Muted> {c.seller?.name ?? "—"}</p>
          <p><Muted>Atendente</Muted> {c.attendant?.name ?? "—"}</p>
          <p className="sm:col-span-2"><Muted>Endereço</Muted> {c.address ?? ([c.city, c.state].filter(Boolean).join("/") || "—")}</p>
          {c.deliveryAddress && <p className="sm:col-span-2"><Muted>Entrega</Muted> {c.deliveryAddress}</p>}
          {c.notes && <p className="sm:col-span-2 whitespace-pre-line"><Muted>Observações</Muted> {c.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Histórico de contatos" count={d.interactions.length}>
          {d.interactions.map((i) => (
            <Line key={i.id}>
              <span className="font-medium">{CONTACT[i.type] ?? i.type}</span>
              <Muted>{formatDate(i.occurredAt, true)}{i.responsible ? ` · ${i.responsible.name}` : ""}{i.opportunity ? ` · ${i.opportunity.title}` : i.lead ? ` · lead ${i.lead.name}` : ""}</Muted>
              <span className="w-full text-xs">{i.summary}{i.result ? ` — ${i.result}` : ""}{i.nextActionAt ? ` · próximo: ${formatDate(i.nextActionAt)}` : ""}</span>
            </Line>
          ))}
        </Section>

        <Section title="Leads" count={d.leads.length}>
          {d.leads.map((l) => (
            <Line key={l.id}>
              <span className="font-medium">{l.interest || l.name}</span>
              <Badge variant="secondary">{LEAD_STATUS[l.status] ?? l.status}</Badge>
              <Muted>entrou em {formatDate(l.enteredAt)}{originLabel(l.origin) ? ` · ${originLabel(l.origin)}` : ""}{l.seller ? ` · ${l.seller.name}` : ""}{l.nextContactAt ? ` · próximo contato ${formatDate(l.nextContactAt)}` : ""}</Muted>
            </Line>
          ))}
        </Section>

        <Section title="Oportunidades" count={d.opportunities.length}>
          {d.opportunities.map((o) => (
            <Line key={o.id}>
              <span className="font-medium">{o.title}</span>
              <Badge variant={o.status === "WON" ? "success" : o.status === "LOST" ? "danger" : "secondary"}>{OPP_STATUS[o.status] ?? o.status}</Badge>
              <Muted>{o.stage.name} · {formatCurrency(o.estimatedValue)}{o.wonAt ? ` · ganha em ${formatDate(o.wonAt)}` : ""}{o.lostReason ? ` · ${o.lostReason}` : ""}</Muted>
            </Line>
          ))}
        </Section>

        <Section title="Orçamentos" count={d.quotes.length}>
          {d.quotes.map((qt) => (
            <Line key={qt.id}>
              <Link to={`/comercial/orcamentos/${qt.id}`} className="font-medium text-primary hover:underline">{qt.number}{qt.version > 1 ? ` v${qt.version}` : ""}{qt.kind === "ADENDO" ? " (adendo)" : ""}</Link>
              <Badge variant="secondary">{QUOTE_STATUS[qt.status] ?? qt.status}</Badge>
              <Muted>{formatCurrency(qt.total)} · {formatDate(qt.createdAt)}{qt.approvedAt ? ` · aceito em ${formatDate(qt.approvedAt)}` : ""}</Muted>
            </Line>
          ))}
        </Section>

        <Section title="Contratos" count={d.contracts.length}>
          {d.contracts.map((ct) => (
            <Line key={ct.id}>
              <span className="font-medium">{ct.number ? `Contrato Nº ${ct.number}` : ct.title}{ct.version > 1 ? ` (versão ${ct.version})` : ""}</span>
              <Badge variant={ct.signatureStatus === "SIGNED" ? "success" : "secondary"}>{SIGN_STATUS[ct.signatureStatus] ?? ct.signatureStatus}</Badge>
              <Muted>{formatDate(ct.createdAt)}{ct.project ? <> · <Link to={`/clientes-projetos/${ct.project.id}`} className="hover:underline">{ct.project.code}</Link></> : null}</Muted>
            </Line>
          ))}
        </Section>

        <Section title="Chamados de assistência" count={d.assistances.length}>
          {d.assistances.map((a) => (
            <Line key={a.id}>
              <span className="font-medium">{a.number} — {a.title}</span>
              <Badge variant={a.status === "RESOLVED" ? "success" : "secondary"}>{AT_STATUS[a.status] ?? a.status}</Badge>
              <Muted>aberto em {formatDate(a.createdAt)}{a.project ? ` · ${a.project.code}` : ""}</Muted>
            </Line>
          ))}
        </Section>
      </div>

      {funnelOpen && <FunnelDialog client={{ id: c.id, name: c.name }} onClose={() => setFunnelOpen(false)} onDone={() => qc.invalidateQueries({ queryKey: ["crm-client", id] })} />}
      <LeadDialog open={leadOpen} client={{ id: c.id, name: c.name }} onClose={() => setLeadOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["crm-client", id] })} />
    </div>
  );
}

/** Põe o cliente no funil: cria a oportunidade ligada a ele, na etapa escolhida. */
function FunnelDialog({ client, onClose, onDone }: { client: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const stages = useQuery({ queryKey: ["commercial", "stages"], queryFn: () => apiGet<{ data: { id: string; name: string; isWon: boolean; isLost: boolean; active: boolean }[] }>("/commercial/stages") });
  const open = (stages.data?.data ?? []).filter((s) => !s.isWon && !s.isLost && s.active);
  const [title, setTitle] = useState(client.name);
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState("");
  const stage = stageId || open[0]?.id || "";
  const create = useMutation({
    mutationFn: () => apiPost("/commercial/opportunities", { title: title.trim(), clientId: client.id, stageId: stage, estimatedValue: Number(value.replace(/\./g, "").replace(",", ".")) || 0 }),
    onSuccess: () => { toast.success("Cliente colocado no funil"); onDone(); onClose(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível colocar no funil")),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar ao funil — {client.name}</DialogTitle>
          <DialogDescription>Cria uma oportunidade para este cliente. A origem vem do cadastro dele.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="fn-title">Negócio</Label><Input id="fn-title" value={title} placeholder="Ex.: Cozinha e closet" onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="fn-stage">Etapa</Label>
            <select id="fn-stage" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => setStageId(e.target.value)}>
              {open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label className="text-xs" htmlFor="fn-value">Valor estimado</Label><Input id="fn-value" inputMode="decimal" value={value} placeholder="0,00" onChange={(e) => setValue(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={create.isPending || title.trim().length < 2 || !stage} onClick={() => create.mutate()}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Colocar no funil</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
