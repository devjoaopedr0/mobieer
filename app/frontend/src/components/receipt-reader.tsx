import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSearch, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPostForm } from "@/services/api";
import { compressImage } from "@/lib/image";
import { errorMessage, formatCurrency } from "@/lib/utils";

type Kind = "NOTA_FISCAL" | "RECIBO" | "CUPOM";
type Receipt = { kind: Kind; supplier: string; supplierDocument: string | null; number: string | null; date: string | null; total: number; paid: boolean; method: string | null; category: string; items: { description: string; quantity: number | null; amount: number }[] };
type Draft = Omit<Receipt, "total" | "items"> & { total: string; dueDate: string; items: { description: string; quantity: string; amount: string }[] };

const CATEGORIES = ["Matéria-prima", "Ferragens", "Acabamento", "Ferramentas", "Material de escritório", "Limpeza", "Combustível", "Alimentação", "Mercado", "Transporte (Uber/99)", "Manutenção", "Software / assinaturas", "Marketing", "Outros"];
const KIND_LABEL: Record<Kind, string> = { NOTA_FISCAL: "Nota fiscal", RECIBO: "Recibo", CUPOM: "Cupom fiscal" };
const DOC_TYPE: Record<Kind, string> = { NOTA_FISCAL: "NOTA_FISCAL", RECIBO: "RECIBO", CUPOM: "OUTROS" };
const money = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const show = (n: number) => n.toFixed(2).replace(".", ",");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const sel = "h-10 w-full rounded-md border bg-background px-2 text-sm";

/**
 * Entrada de nota fiscal, recibo ou cupom: a IA lê a foto ou o PDF, a pessoa
 * confere e o sistema salva a despesa com os itens (e o arquivo anexado).
 * Já pago (cupom, recibo) entra pago; nota com prazo fica a pagar.
 */
export function ReceiptReader({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const close = () => { setFile(null); setD(null); onClose(); };

  const read = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f.type.startsWith("image/") ? await compressImage(f) : f);
      return apiPostForm<{ data: Receipt; message?: string }>("/finance/receipts/read", fd);
    },
    onSuccess: (r) => {
      const x = r.data;
      setD({ ...x, total: show(x.total), dueDate: x.date ?? today(), date: x.date ?? today(), items: x.items.map((i) => ({ description: i.description, quantity: i.quantity ? String(i.quantity) : "", amount: show(i.amount) })) });
      toast.success(r.message ?? "Documento lido");
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível ler o documento"), { duration: 9000 }),
  });

  const save = useMutation({
    mutationFn: async (x: Draft) => {
      const total = money(x.total);
      const items = x.items.filter((i) => i.description.trim() && money(i.amount) > 0);
      const created = await apiPost<{ data: { id: string } }>("/finance/documents", {
        type: "DESPESA",
        docType: DOC_TYPE[x.kind],
        docNumber: x.number || null,
        category: x.category,
        amount: total,
        issueDate: x.date,
        date: x.date,
        dueDate: x.paid ? x.date : x.dueDate,
        method: x.method || null,
        description: `${KIND_LABEL[x.kind]} — ${x.supplier}${x.supplierDocument ? ` (${x.supplierDocument})` : ""}`,
        items: items.map((i) => ({ date: x.date, store: x.supplier, description: `${i.quantity ? `${i.quantity} × ` : ""}${i.description}`, amount: money(i.amount) })),
      });
      const id = created.data.id;
      // já pago: registra o pagamento do valor todo
      if (x.paid) {
        const fd = new FormData();
        fd.append("amount", String(total));
        fd.append("paidAt", x.date ?? today());
        if (x.method) fd.append("method", x.method);
        await apiPostForm(`/finance/documents/${id}/payments`, fd);
      }
      // o arquivo fica anexado ao documento
      if (file) {
        const fd = new FormData();
        fd.append("file", file.type.startsWith("image/") ? await compressImage(file) : file);
        fd.append("kind", "DOCUMENTO");
        await apiPostForm(`/finance/documents/${id}/attachments`, fd).catch(() => undefined);
      }
      return id;
    },
    onSuccess: () => { toast.success("Compra registrada no financeiro"); onCreated(); close(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar")),
  });

  const sum = d ? d.items.reduce((s, i) => s + money(i.amount), 0) : 0;
  const setItem = (k: number, p: Partial<Draft["items"][number]>) => d && setD({ ...d, items: d.items.map((x, j) => (j === k ? { ...x, ...p } : x)) });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ler nota fiscal, recibo ou cupom</DialogTitle>
          <DialogDescription>Tire a foto ou envie o PDF. A IA lê o fornecedor, a data, o total e os itens; você confere e salva.</DialogDescription>
        </DialogHeader>
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; if (f) { setFile(f); setD(null); read.mutate(f); } }} />
        {!d && (
          <Button variant="outline" className="h-16 w-full" disabled={read.isPending} onClick={() => input.current?.click()}>
            {read.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Lendo (até 1 minuto)…</> : <><FileSearch className="mr-2 h-5 w-5" />{file ? "Escolher outro arquivo" : "Tirar foto ou escolher arquivo"}</>}
          </Button>
        )}
        {d && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-xs">Tipo</Label><select className={sel} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Kind })}>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Fornecedor</Label><Input value={d.supplier} onChange={(e) => setD({ ...d, supplier: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Número</Label><Input value={d.number ?? ""} onChange={(e) => setD({ ...d, number: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Data da compra</Label><Input type="date" value={d.date ?? ""} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Total (R$)</Label><Input inputMode="decimal" value={d.total} onChange={(e) => setD({ ...d, total: e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Categoria</Label><select className={sel} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>{[...new Set([d.category, ...CATEGORIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="space-y-1"><Label className="text-xs">Forma de pagamento</Label><Input value={d.method ?? ""} onChange={(e) => setD({ ...d, method: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={d.paid} onChange={(e) => setD({ ...d, paid: e.target.checked })} />Já está pago</label>
            {!d.paid && <div className="max-w-xs space-y-1"><Label className="text-xs">Vencimento</Label><Input type="date" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} /></div>}
            <div className="space-y-1">
              <p className="text-xs font-semibold">Itens comprados</p>
              {d.items.map((it, k) => (
                <div key={k} className="grid grid-cols-[1fr_70px_100px_32px] items-center gap-2">
                  <Input value={it.description} onChange={(e) => setItem(k, { description: e.target.value })} />
                  <Input value={it.quantity} placeholder="qtd" onChange={(e) => setItem(k, { quantity: e.target.value })} />
                  <Input inputMode="decimal" value={it.amount} onChange={(e) => setItem(k, { amount: e.target.value })} />
                  <Button variant="ghost" size="icon" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== k) })}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setD({ ...d, items: [...d.items, { description: "", quantity: "", amount: "" }] })}><Plus className="mr-1 h-4 w-4" />Item</Button>
              {d.items.length > 0 && Math.abs(sum - money(d.total)) > 0.05 && <p className="text-xs text-warning">A soma dos itens ({formatCurrency(sum)}) é diferente do total ({formatCurrency(money(d.total))}). Pode ser desconto ou frete; confira.</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          {d && <Button disabled={save.isPending || !d.supplier.trim() || money(d.total) <= 0 || !d.date} onClick={() => save.mutate(d)}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar compra</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Summary = { from: string; to: string; total: number; byCategory: { key: string; total: number; count: number }[]; bySupplier: { key: string; total: number; count: number }[]; topItems: { key: string; total: number; count: number }[]; documents: number; cardExpenses: number };

/** "O que compramos": notas, recibos, cupons e as compras dos cartões, por categoria, fornecedor e item. */
export function PurchasesSummary() {
  const t = today();
  const [range, setRange] = useState({ from: `${t.slice(0, 7)}-01`, to: t });
  const q = useQuery({ queryKey: ["finance", "purchases", range], queryFn: () => apiGet<{ data: Summary }>("/finance/purchases", range).then((r) => r.data) });
  const d = q.data;
  const List = ({ title, rows, unit }: { title: string; rows: Summary["byCategory"]; unit: string }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {!rows.length && <p className="text-muted-foreground">Nada no período.</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{r.key} <span className="text-xs text-muted-foreground">· {r.count} {r.count === 1 ? unit : `${unit}s`}</span></span>
            <span className="shrink-0 font-medium tabular-nums">{formatCurrency(r.total)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1"><span className="block text-xs">De</span><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="space-y-1"><span className="block text-xs">Até</span><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        {d && <p className="pb-2">Total comprado: <strong>{formatCurrency(d.total)}</strong> · {d.documents} notas, recibos e cupons · {d.cardExpenses} compras no cartão</p>}
      </div>
      {q.isLoading || !d ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : (
        <div className="grid gap-3 lg:grid-cols-3">
          <List title="Por categoria" rows={d.byCategory} unit="compra" />
          <List title="Por fornecedor" rows={d.bySupplier} unit="compra" />
          <List title="Itens que mais pesam" rows={d.topItems} unit="vez" />
        </div>
      )}
    </div>
  );
}
