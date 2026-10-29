import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn, formatCurrency } from "@/lib/utils";

/** Lista fixa de origem, a mesma em leads, clientes e negócios (o texto gravado é o rótulo). */
export const ORIGIN_OPTIONS = ["Instagram", "Indicação", "Google", "Site", "Arquiteto", "Parceiros", "Outro"];
/** A mesma lista com o código gravado em `origin` */
export const ORIGIN_CODES = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "INDICACAO", label: "Indicação" },
  { value: "GOOGLE", label: "Google" },
  { value: "SITE", label: "Site" },
  { value: "ARQUITETO", label: "Arquiteto" },
  { value: "PARCEIROS", label: "Parceiros" },
  { value: "OUTRO", label: "Outro" },
];
export const originLabel = (code: string | null | undefined) => ORIGIN_CODES.find((o) => o.value === code)?.label ?? null;

export type Temperature = "QUENTE" | "MORNO" | "FRIO";
export const TEMPERATURE_LABEL: Record<Temperature, string> = { QUENTE: "Quente", MORNO: "Morno", FRIO: "Frio" };
const TEMPERATURE_CLASS: Record<Temperature, string> = {
  QUENTE: "bg-destructive/10 text-destructive",
  MORNO: "bg-warning/15 text-warning",
  FRIO: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

export function TemperatureTag({ value, title, className }: { value: Temperature | null | undefined; title?: string; className?: string }) {
  if (!value) return null;
  return <span title={title} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", TEMPERATURE_CLASS[value], className)}>{TEMPERATURE_LABEL[value]}</span>;
}

/** Filtro por temperatura: "" = todas. */
export function TemperatureFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-muted-foreground">Temperatura:</span>
      {["", "QUENTE", "MORNO", "FRIO"].map((t) => (
        <button key={t || "ALL"} type="button" onClick={() => onChange(t)} className={cn("rounded-full border px-2 py-0.5", value === t ? "border-primary bg-primary/10" : "hover:bg-muted")}>
          {t ? TEMPERATURE_LABEL[t as Temperature] : "Todas"}
        </button>
      ))}
    </div>
  );
}

type ChannelRow = { origin: string; label: string; entrou: number; qualificou: number; converteu: number; perdeu: number; taxaConversao: number; oportunidades: number; ganhos: number; valorVendido: number };
type ChannelData = { from: string; to: string; rows: ChannelRow[]; total: { entrou: number; converteu: number; valorVendido: number; taxaConversao: number } };

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n, 1);
  return d.toLocaleDateString("en-CA");
};

/** Painel por canal (origem) na aba Conversão, com filtro de período. */
export function ChannelPanel() {
  const [from, setFrom] = useState(monthsAgo(5));
  const [to, setTo] = useState(new Date().toLocaleDateString("en-CA"));
  const q = useQuery({ queryKey: ["commercial", "channels", from, to], queryFn: () => apiGet<{ data: ChannelData }>("/commercial/channels", { from: from || undefined, to: to || undefined }) });
  const d = q.data?.data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">Por canal (origem)</CardTitle>
            <p className="text-xs text-muted-foreground">Leads que entraram no período e o que foi vendido nele, por origem.</p>
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
        ) : !d.rows.length ? (
          <p className="text-sm text-muted-foreground">Nenhum lead ou negócio no período.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left">Canal</th>
                <th className="text-right">Entrou</th>
                <th className="text-right">Qualificou</th>
                <th className="text-right">Converteu</th>
                <th className="text-right">Perdeu</th>
                <th className="text-right">Conversão</th>
                <th className="text-right">Negócios ganhos</th>
                <th className="text-right">Valor vendido</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {d.rows.map((r) => (
                <tr key={r.origin} className="border-b last:border-0">
                  <td className="py-1.5">{r.label}</td>
                  <td className="text-right">{r.entrou}</td>
                  <td className="text-right">{r.qualificou}</td>
                  <td className="text-right">{r.converteu}</td>
                  <td className="text-right">{r.perdeu}</td>
                  <td className="text-right">{r.taxaConversao}%</td>
                  <td className="text-right">{r.ganhos}</td>
                  <td className="text-right font-medium">{formatCurrency(r.valorVendido)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5">Total</td>
                <td className="text-right">{d.total.entrou}</td>
                <td />
                <td className="text-right">{d.total.converteu}</td>
                <td />
                <td className="text-right">{d.total.taxaConversao}%</td>
                <td />
                <td className="text-right">{formatCurrency(d.total.valorVendido)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Atualização rápida do lead na lista: registra o contato feito agora (como foi
 * e uma nota) e já marca o próximo, sem abrir a ficha.
 */
export function LeadQuickContact({ leadId, nextContactAt, onDone }: { leadId: string; nextContactAt: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("WHATSAPP");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const save = useMutation({
    mutationFn: () => apiPost<{ message?: string }>(`/commercial/leads/${leadId}/contact`, { type, summary: note || null, nextContactAt: next ? `${next}T12:00:00` : null }),
    onSuccess: (r) => { toast.success(r.message ?? "Contato registrado"); setOpen(false); setNote(""); setNext(""); onDone(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível registrar o contato")),
  });
  if (!open)
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {nextContactAt && <span>Próximo: {new Date(nextContactAt).toLocaleDateString("pt-BR")}</span>}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>Registrar contato</Button>
      </span>
    );
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 rounded-md bg-muted/50 p-2">
      <select className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Como foi o contato" value={type} onChange={(e) => setType(e.target.value)}>
        {[["WHATSAPP", "WhatsApp"], ["CALL", "Ligação"], ["EMAIL", "E-mail"], ["MEETING", "Reunião"], ["VISIT", "Visita"], ["OTHER", "Outro"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Input className="h-8 min-w-[10rem] flex-1 text-xs" placeholder="O que foi falado (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="flex items-center gap-1 text-xs">Próximo contato <Input type="date" className="h-8 w-36 text-xs" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <Button size="sm" className="h-8" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Salvar</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}
