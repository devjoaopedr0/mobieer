import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Package, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiOpen, apiPatch, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, localIsoDate } from "@/lib/utils";

type Item = { id: string; kind: string; kindLabel: string; description: string; quantity: number; unitPrice: number; charged: boolean; total: number; product: { id: string; code: string; name: string; stock: number } | null; stockMovedAt: string | null };
type Product = { id: string; code: string; name: string; stock: number; unitValue: string | number | null };
type Data = {
  internal: boolean;
  items: Item[];
  totals: { garantia: number; cobrado: number; total: number };
  finance: { id: string; amount: number; status: string; dueDate: string | null } | null;
  kinds: { code: string; label: string }[];
};

const selectCls = "h-8 rounded-md border bg-background px-2 text-xs";
const money = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * Itens da assistência. A assistência é na garantia: o item entra como garantia e só
 * o que for marcado como cobrado vai para o financeiro. No registro interno (erro,
 * retrabalho) os valores são o custo para a loja.
 */
export function AssistanceItemsPanel({ ticketId, canEdit, canCharge }: { ticketId: string; canEdit: boolean; canCharge: boolean }) {
  const qc = useQueryClient();
  const key = ["assistance-items", ticketId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Data }>(`/business/assistances/${ticketId}/items`) });
  const { can } = useAuth();
  const [draft, setDraft] = useState({ kind: "FERRAGEM", description: "", quantity: "1", unitPrice: "", charged: false, product: null as Product | null });
  // produto do almoxarifado (opcional): com ele dá para dar baixa no estoque
  const [search, setSearch] = useState("");
  const found = useQuery({ queryKey: ["assist-products", search], queryFn: () => apiGet<{ data: Product[] }>("/products", { search, perPage: 8 }), enabled: search.trim().length >= 2 && can("products.read") });
  const [due, setDue] = useState(localIsoDate(new Date()));
  const apply = (r: { data: Data; message?: string }) => {
    qc.setQueryData(key, { data: r.data });
    qc.invalidateQueries({ queryKey: ["business-assistances"] });
    if (r.message) toast.success(r.message);
  };
  const fail = (msg: string) => (e: unknown) => toast.error(errorMessage(e, msg));
  const add = useMutation({
    mutationFn: () => apiPost<{ data: Data; message?: string }>(`/business/assistances/${ticketId}/items`, { kind: draft.kind, description: draft.description.trim(), quantity: money(draft.quantity) || 1, unitPrice: money(draft.unitPrice) || 0, charged: draft.charged, productId: draft.product?.id ?? null }),
    onSuccess: (r) => { apply(r); setDraft((d) => ({ ...d, description: "", quantity: "1", unitPrice: "", charged: false, product: null })); setSearch(""); },
    onError: fail("Não foi possível acrescentar o item"),
  });
  const patch = useMutation({ mutationFn: (v: { id: string; body: Partial<Item> }) => apiPatch<{ data: Data }>(`/business/assistance-items/${v.id}`, v.body), onSuccess: apply, onError: fail("Não foi possível alterar o item") });
  const remove = useMutation({ mutationFn: (id: string) => apiDelete<{ data: Data }>(`/business/assistance-items/${id}`), onSuccess: apply, onError: fail("Não foi possível remover o item") });
  const charge = useMutation({ mutationFn: () => apiPost<{ data: Data; message?: string }>(`/business/assistances/${ticketId}/charge`, { dueDate: due }), onSuccess: apply, onError: fail("Não foi possível lançar no financeiro") });
  const stockExit = useMutation({ mutationFn: () => apiPost<{ data: Data; message?: string }>(`/business/assistances/${ticketId}/stock-exit`, {}), onSuccess: (r) => { apply(r); qc.invalidateQueries({ queryKey: ["assist-products"] }); }, onError: fail("Não foi possível dar baixa no estoque") });
  const order = useMutation({ mutationFn: () => apiOpen(`/business/assistances/${ticketId}/service-order.pdf`), onError: fail("Não foi possível gerar a ordem de serviço") });

  const d = q.data?.data;
  if (!d) return <p className="text-xs text-muted-foreground">Carregando itens…</p>;
  const internal = d.internal;
  // a cobrança lançada não bate com o que está marcado agora: avisa para atualizar
  const pendingStock = d.items.filter((i) => i.product && !i.stockMovedAt).length;
  const outdated = d.finance && d.finance.status !== "PAGO" && Math.abs(d.finance.amount - d.totals.cobrado) > 0.004;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{internal ? "Material e horas do retrabalho (custo para a loja)" : "Itens da assistência"}</p>
        <Button size="sm" variant="outline" disabled={order.isPending} onClick={() => order.mutate()}>
          {order.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
          {internal ? "Ordem interna (PDF)" : "Ordem de serviço (PDF)"}
        </Button>
      </div>
      {!internal && <p className="text-xs text-muted-foreground">A assistência é na garantia. Marque <span className="font-medium">Cobrar</span> só no que o cliente vai pagar (ex.: um acessório novo).</p>}

      {d.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 text-left font-medium">Item</th><th className="py-1 text-right font-medium">Qtd.</th><th className="py-1 text-right font-medium">Valor</th><th className="py-1 text-right font-medium">Total</th>{!internal && <th className="py-1 text-center font-medium">Cobrar</th>}<th /></tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="py-1.5">
                    {i.description} <span className="text-muted-foreground">({i.kindLabel})</span>
                    {i.product && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Package className="h-3 w-3" />{i.product.code}{i.stockMovedAt ? ` · baixado do estoque em ${new Date(i.stockMovedAt).toLocaleDateString("pt-BR")}` : ` · no estoque: ${i.product.stock}`}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{String(i.quantity).replace(".", ",")}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(i.unitPrice)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(i.total)}</td>
                  {!internal && (
                    <td className="py-1.5 text-center">
                      <input type="checkbox" className="h-4 w-4" aria-label={`Cobrar ${i.description}`} checked={i.charged} disabled={!canEdit || patch.isPending} onChange={(e) => patch.mutate({ id: i.id, body: { charged: e.target.checked } })} />
                    </td>
                  )}
                  <td className="py-1.5 text-right">
                    {canEdit && <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Remover ${i.description}`} disabled={remove.isPending} onClick={() => remove.mutate(i.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="Tipo do item" className={selectCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            {d.kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
          </select>
          <Input className="h-8 min-w-40 flex-1 text-xs" placeholder="Descrição (ex.: dobradiça com amortecedor)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          {can("products.read") && (
            <div className="relative">
              {draft.product ? (
                <button type="button" className="flex h-8 items-center gap-1 rounded-md border px-2 text-xs" title="Tirar o produto" onClick={() => setDraft({ ...draft, product: null })}><Package className="h-3.5 w-3.5" />{draft.product.code} ✕</button>
              ) : (
                <Input className="h-8 w-44 text-xs" placeholder="Produto do almoxarifado" aria-label="Buscar produto do almoxarifado" value={search} onChange={(e) => setSearch(e.target.value)} />
              )}
              {!draft.product && search.trim().length >= 2 && (found.data?.data ?? []).length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow">
                  {(found.data?.data ?? []).map((p) => (
                    <button key={p.id} type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { setDraft({ ...draft, product: p, description: draft.description.trim() || p.name, unitPrice: draft.unitPrice || (p.unitValue != null ? String(p.unitValue).replace(".", ",") : "") }); setSearch(""); }}>
                      <span className="font-medium">{p.code}</span> {p.name} <span className="text-muted-foreground">· estoque {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Input className="h-8 w-16 text-right text-xs" inputMode="decimal" aria-label="Quantidade" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          <Input className="h-8 w-24 text-right text-xs" inputMode="decimal" placeholder="Valor R$" aria-label="Valor unitário" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} />
          {!internal && <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="h-4 w-4" checked={draft.charged} onChange={(e) => setDraft({ ...draft, charged: e.target.checked })} /> Cobrar</label>}
          <Button size="sm" variant="outline" className="h-8" disabled={!draft.description.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="mr-1 h-3.5 w-3.5" />Acrescentar</Button>
        </div>
      )}

      {pendingStock > 0 && can("stock.exit") && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-xs">
          <span>{pendingStock} {pendingStock > 1 ? "itens ligados" : "item ligado"} ao almoxarifado ainda no estoque.</span>
          <Button size="sm" variant="outline" className="h-7" disabled={stockExit.isPending} onClick={() => stockExit.mutate()}><Package className="mr-1 h-3.5 w-3.5" />Dar baixa no estoque</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
        {internal ? (
          <span>Custo do retrabalho: <strong>{formatCurrency(d.totals.total)}</strong></span>
        ) : (
          <>
            <span>Em garantia: <strong>{formatCurrency(d.totals.garantia)}</strong></span>
            <span>· A cobrar: <strong className={d.totals.cobrado > 0 ? "text-primary" : ""}>{formatCurrency(d.totals.cobrado)}</strong></span>
            {d.finance && <Badge variant={d.finance.status === "PAGO" ? "success" : "secondary"}>No financeiro: {formatCurrency(d.finance.amount)} · {d.finance.status === "PAGO" ? "recebido" : "a receber"}</Badge>}
            {canCharge && (d.totals.cobrado > 0 || d.finance) && d.finance?.status !== "PAGO" && (!d.finance || outdated) && (
              <span className="ml-auto flex items-center gap-1.5">
                <Input type="date" className="h-8 w-36 text-xs" aria-label="Vencimento da cobrança" value={due} onChange={(e) => setDue(e.target.value)} />
                <Button size="sm" disabled={charge.isPending || !due} onClick={() => charge.mutate()}>
                  <Wallet className="mr-1 h-3.5 w-3.5" />
                  {!d.finance ? `Lançar ${formatCurrency(d.totals.cobrado)} no financeiro` : d.totals.cobrado > 0 ? "Atualizar a cobrança" : "Retirar a cobrança"}
                </Button>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
