import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PayDialog } from "@/components/pay-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage, formatCurrency } from "@/lib/utils";

type Item = {
  id: string; type: "RECEITA" | "DESPESA"; category: string; description: string | null; amount: number; paidAmount: number; dueDay: string | null;
  method: string | null; installment: string | null; client: string | null; quote: string | null; supplier: string | null; referrer: string | null;
  open: number; late: boolean;
};
type Group = { key: string; open: number; overdue: number; count: number; nextDue: string | null; items: Item[] };
type Balances = { today: string; commissions: Group[]; debts: Group[]; overdueBills: Group[]; totals: { commissions: number; debts: number; overdueBills: number } };
type CommissionForm = { payee: string; reference: string; total: string; installments: string; firstDue: string };
type DebtForm = { creditor: string; description: string; total: string; installments: string; firstDue: string; originDate: string };

const day = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const parseMoney = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });

/**
 * Comissões em aberto (por pessoa), dívidas anteriores (por credor) e contas a
 * pagar que venceram em meses anteriores. Pagar usa o mesmo "Marcar pago" dos lançamentos.
 */
export function FinanceOpenBalances({ canManage, canPay }: { canManage: boolean; canPay: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["finance", "open-balances"], queryFn: () => apiGet<{ data: Balances }>("/finance/open-balances") });
  const [paying, setPaying] = useState<Item | null>(null);
  const [debt, setDebt] = useState<DebtForm | null>(null);
  const [commission, setCommission] = useState<CommissionForm | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  const create = useMutation({
    mutationFn: (f: DebtForm) =>
      apiPost<{ message?: string }>("/finance/old-debts", {
        creditor: f.creditor, description: f.description || null, total: parseMoney(f.total), installments: Number(f.installments) || 1, firstDue: f.firstDue, originDate: f.originDate || null,
      }),
    onSuccess: (r) => { toast.success(r.message ?? "Dívida cadastrada"); setDebt(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível cadastrar a dívida")),
  });

  const launch = useMutation({
    mutationFn: (f: CommissionForm) =>
      apiPost<{ message?: string }>("/finance/old-commissions", { payee: f.payee, reference: f.reference, total: parseMoney(f.total), installments: Number(f.installments) || 1, firstDue: f.firstDue }),
    onSuccess: (r) => { toast.success(r.message ?? "Comissão lançada"); setCommission(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível lançar a comissão")),
  });

  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const d = q.data?.data;
  if (!d) return <p className="text-sm text-muted-foreground">Não foi possível carregar.</p>;
  const parcels = Math.max(1, Number(debt?.installments) || 1);
  const total = debt ? parseMoney(debt.total) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Comissões a pagar" value={d.totals.commissions} hint={`${d.commissions.length} ${d.commissions.length === 1 ? "pessoa" : "pessoas"}`} />
        <Kpi label="Dívidas anteriores" value={d.totals.debts} hint={`${d.debts.length} ${d.debts.length === 1 ? "credor" : "credores"}`} />
        <Kpi label="Contas vencidas de meses anteriores" value={d.totals.overdueBills} hint="ficaram sem pagar" warn={d.totals.overdueBills > 0} />
      </div>

      <Section
        title="Comissões em aberto"
        hint="Comissões de venda e reservas técnicas que ainda não foram pagas, por pessoa. As do aceite dos orçamentos entram sozinhas e vencem junto com a parcela do cliente; as de vendas antigas, lance aqui."
        groups={d.commissions}
        empty="Nenhuma comissão em aberto."
        detail={(i) => [i.quote, i.client].filter(Boolean).join(" · ") || i.description?.split(" — comissão")[0] || ""}
        canPay={canPay}
        onPay={setPaying}
        action={canManage && <Button size="sm" variant="outline" onClick={() => setCommission({ payee: "", reference: "", total: "", installments: "1", firstDue: today() })}><Plus className="mr-1 h-4 w-4" />Lançar comissão</Button>}
      />

      <Section
        title="Dívidas anteriores"
        hint="Dívidas de antes do sistema (empréstimo, fornecedor antigo, acordo), com as parcelas que faltam. Ficam também em Lançamentos, na categoria Dívida anterior."
        groups={d.debts}
        empty="Nenhuma dívida anterior cadastrada."
        detail={(i) => i.description?.split(" — ").slice(1).join(" — ") ?? ""}
        canPay={canPay}
        onPay={setPaying}
        action={canManage && <Button size="sm" onClick={() => setDebt({ creditor: "", description: "", total: "", installments: "1", firstDue: today(), originDate: "" })}><Plus className="mr-1 h-4 w-4" />Cadastrar dívida</Button>}
      />

      <Section
        title="Contas vencidas de meses anteriores"
        hint="Contas a pagar com vencimento antes deste mês que continuam em aberto, por fornecedor ou categoria."
        groups={d.overdueBills}
        empty="Nenhuma conta antiga em aberto."
        detail={(i) => [i.category, i.description].filter(Boolean).join(" · ")}
        canPay={canPay}
        onPay={setPaying}
      />

      <PayDialog tx={paying} onClose={() => setPaying(null)} onDone={refresh} />

      <Dialog open={commission !== null} onOpenChange={(o) => !o && setCommission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lançar comissão em aberto</DialogTitle>
            <DialogDescription>Para comissões de vendas feitas antes do sistema. As dos orçamentos aceitos aqui já entram sozinhas.</DialogDescription>
          </DialogHeader>
          {commission && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Quem recebe *</Label><Input value={commission.payee} placeholder="Ex.: Ana" onChange={(e) => setCommission({ ...commission, payee: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Venda (cliente ou contrato) *</Label><Input value={commission.reference} placeholder="Ex.: Maria Silva — cozinha" onChange={(e) => setCommission({ ...commission, reference: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Valor a pagar (R$) *</Label><Input inputMode="decimal" value={commission.total} placeholder="0,00" onChange={(e) => setCommission({ ...commission, total: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Parcelas</Label><Input type="number" min={1} max={60} value={commission.installments} onChange={(e) => setCommission({ ...commission, installments: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Vencimento *</Label><Input type="date" value={commission.firstDue} onChange={(e) => setCommission({ ...commission, firstDue: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommission(null)}>Cancelar</Button>
            <Button
              disabled={!commission || commission.payee.trim().length < 2 || commission.reference.trim().length < 2 || parseMoney(commission.total) <= 0 || !commission.firstDue || launch.isPending}
              onClick={() => commission && launch.mutate(commission)}
            >
              {launch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={debt !== null} onOpenChange={(o) => !o && setDebt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar dívida anterior</DialogTitle>
            <DialogDescription>Informe só o que ainda falta pagar. O sistema divide em parcelas mensais a partir do primeiro vencimento.</DialogDescription>
          </DialogHeader>
          {debt && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Credor *</Label><Input value={debt.creditor} placeholder="Ex.: Banco do Nordeste, Fornecedor X" onChange={(e) => setDebt({ ...debt, creditor: e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Do que é</Label><Input value={debt.description} placeholder="Ex.: empréstimo de capital de giro" onChange={(e) => setDebt({ ...debt, description: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Valor em aberto (R$) *</Label><Input inputMode="decimal" value={debt.total} placeholder="0,00" onChange={(e) => setDebt({ ...debt, total: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Parcelas que faltam</Label><Input type="number" min={1} max={240} value={debt.installments} onChange={(e) => setDebt({ ...debt, installments: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Vencimento da próxima parcela *</Label><Input type="date" value={debt.firstDue} onChange={(e) => setDebt({ ...debt, firstDue: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Quando a dívida foi feita</Label><Input type="date" value={debt.originDate} onChange={(e) => setDebt({ ...debt, originDate: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {total > 0 ? `${parcels} ${parcels > 1 ? "parcelas" : "parcela"} de cerca de ${formatCurrency(total / parcels)}. ` : ""}
                A data em que a dívida foi feita é o mês em que ela conta na DRE; sem ela, conta neste mês.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebt(null)}>Cancelar</Button>
            <Button disabled={!debt || debt.creditor.trim().length < 2 || total <= 0 || !debt.firstDue || create.isPending} onClick={() => debt && create.mutate(debt)}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: number; hint: string; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{formatCurrency(value)}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, hint, groups, empty, detail, canPay, onPay, action }: {
  title: string; hint: string; groups: Group[]; empty: string; detail: (i: Item) => string; canPay: boolean; onPay: (i: Item) => void; action?: React.ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-2">
        {!groups.length && <p className="text-sm text-muted-foreground">{empty}</p>}
        {groups.map((g) => (
          <div key={g.key} className="rounded-md border">
            <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left text-sm" onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })}>
              {open[g.key] ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="font-medium">{g.key}</span>
              <span className="text-muted-foreground">{g.count} {g.count === 1 ? "lançamento" : "lançamentos"}</span>
              {g.overdue > 0 && <Badge variant="danger">{formatCurrency(g.overdue)} vencido</Badge>}
              {g.nextDue && <span className="text-xs text-muted-foreground">próximo {day(g.nextDue)}</span>}
              <span className="ml-auto font-semibold">{formatCurrency(g.open)}</span>
            </button>
            {open[g.key] && (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                      {canPay && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className={i.late ? "font-medium text-destructive" : ""}>{day(i.dueDay)}</TableCell>
                        <TableCell className="max-w-[320px] truncate" title={i.description ?? ""}>{detail(i) || "—"}</TableCell>
                        <TableCell>{i.installment ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(i.open)}
                          {i.paidAmount > 0 && <span className="block text-xs text-muted-foreground">de {formatCurrency(i.amount)}</span>}
                        </TableCell>
                        {canPay && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onPay(i)}>Pagar</Button></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
