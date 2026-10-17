import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/services/api";
import { errorMessage, formatCurrency } from "@/lib/utils";

/** As mesmas categorias da leitura no servidor (card-invoice.rules.ts). */
export const CARD_CATEGORIES = [
  "Transporte (Uber/99)", "Alimentação", "Combustível", "Mercado", "Matéria-prima", "Ferragens", "Acabamento",
  "Ferramentas", "Software / assinaturas", "Marketing", "Viagem", "Manutenção", "Outros",
];

type Item = { date: string; description: string; amount: number; installment: string | null; category: string; already: boolean };
type Row = Item & { on: boolean };
const SOURCE: Record<string, string> = { IA_PDF: "lida pela IA", IA_TEXTO: "lida pela IA a partir do texto do PDF", LEITURA_SIMPLES: "lida pelo formato das linhas (sem IA)" };

/**
 * Lê as compras da fatura enviada (PDF) e mostra para conferir: cada compra com
 * a categoria sugerida (Uber, alimentação…). Só lança o que ficar marcado.
 */
export function CardInvoiceReader({ statementId, hasFile, onDone }: { statementId: string; hasFile: boolean; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState("");
  const read = useMutation({
    mutationFn: () => apiPost<{ data: { items: Item[]; source: string }; message?: string }>(`/finance/cards/statements/${statementId}/read`, {}),
    onSuccess: (r) => {
      setRows(r.data.items.map((i) => ({ ...i, on: !i.already })));
      setSource(r.data.source);
      (r.data.items.length ? toast.success : toast.warning)(r.message ?? "Fatura lida", { duration: 8000 });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível ler a fatura")),
  });
  const chosen = (rows ?? []).filter((r) => r.on);
  const save = useMutation({
    mutationFn: () => apiPost<{ message?: string }>(`/finance/cards/statements/${statementId}/expenses/bulk`, { items: chosen.map(({ date, description, amount, installment, category }) => ({ date, description, amount, installment, category })) }),
    onSuccess: (r) => { toast.success(r.message ?? "Compras lançadas"); setRows(null); onDone(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível lançar")),
  });
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  if (!hasFile) return <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Envie o PDF da fatura (botão Enviar fatura) para o sistema ler as compras sozinho.</p>;

  // resumo por categoria do que vai ser lançado
  const summary = [...chosen.reduce((m, r) => m.set(r.category, { n: (m.get(r.category)?.n ?? 0) + 1, v: (m.get(r.category)?.v ?? 0) + r.amount }), new Map<string, { n: number; v: number }>())].sort((a, b) => b[1].v - a[1].v);

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Ler as compras do PDF e separar por categoria (Uber, alimentação, combustível…).</p>
        <Button size="sm" variant={rows ? "outline" : "default"} disabled={read.isPending} onClick={() => read.mutate()}>
          {read.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanText className="mr-1 h-4 w-4" />}{read.isPending ? "Lendo (até 1 minuto)…" : rows ? "Ler de novo" : "Ler fatura"}
        </Button>
      </div>
      {rows && (
        <>
          <p className="text-xs text-muted-foreground">{rows.length} compras {SOURCE[source] ?? ""}. Confira a categoria; desmarque o que não deve entrar.</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className={`flex flex-wrap items-center gap-2 border-b py-1 last:border-0 ${r.already ? "opacity-50" : ""}`}>
                <input type="checkbox" className="h-4 w-4" checked={r.on} disabled={r.already} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Lançar ${r.description}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{r.description}</p>
                  <p className="text-xs text-muted-foreground">{r.date.split("-").reverse().join("/")}{r.installment ? ` · parcela ${r.installment}` : ""}{r.already ? " · já lançada" : ""}</p>
                </div>
                <select className="h-8 rounded-md border bg-background px-1 text-xs" value={r.category} disabled={r.already} onChange={(e) => set(i, { category: e.target.value })}>
                  {CARD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="w-24 text-right tabular-nums">{formatCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {summary.map(([cat, s]) => <span key={cat} className="rounded-md bg-background px-2 py-1">{cat}: {s.n} · {formatCurrency(s.v)}</span>)}
            </div>
          )}
          <Button size="sm" disabled={!chosen.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Lançar {chosen.length} {chosen.length === 1 ? "compra" : "compras"}
          </Button>
        </>
      )}
    </div>
  );
}
