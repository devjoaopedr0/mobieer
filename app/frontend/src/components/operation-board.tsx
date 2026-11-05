import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { cn } from "@/lib/utils";

/**
 * Andamento da operação (montagens e assistências no mesmo padrão): os
 * indicadores em cima e, embaixo, cada situação com as suas linhas — cliente,
 * projeto, responsável, quando começa e a previsão de término/atendimento.
 */
export type BoardTone = "info" | "warning" | "danger" | "success" | "muted" | "primary";
export type BoardRow = {
  id: string;
  title: string;
  client?: string | null;
  project?: string | null;
  who?: string | null;
  start?: string | null;
  forecast?: string | null;
  duration?: string | null;
  status: string;
  tone: BoardTone;
  /** avisos curtos: "Atrasada", "Conflito com …" */
  alerts?: string[];
};
export type BoardGroup = { key: string; label: string; tone: BoardTone; rows: BoardRow[]; collapsed?: boolean; empty?: string };
export type BoardKpi = { title: string; value: number; icon: LucideIcon };

const TONE: Record<BoardTone, string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  muted: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  primary: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};
const BAR: Record<BoardTone, string> = {
  info: "bg-sky-500", warning: "bg-amber-500", danger: "bg-red-500", success: "bg-emerald-500", muted: "bg-slate-400", primary: "bg-blue-600",
};

export function OperationBoard({ kpis, groups, onOpen, loading, columns }: {
  kpis: BoardKpi[];
  groups: BoardGroup[];
  onOpen?: (id: string) => void;
  loading?: boolean;
  /** rótulos das colunas de data (montagem: início/término; assistência: visita/previsão) */
  columns?: { start: string; forecast: string };
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cols = columns ?? { start: "Início", forecast: "Previsão de término" };
  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3 sm:grid-cols-2", kpis.length >= 6 ? "lg:grid-cols-3 xl:grid-cols-6" : kpis.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        {kpis.map((k) => <KpiCard key={k.title} title={k.title} value={loading ? "…" : k.value} icon={k.icon} />)}
      </div>
      {groups.map((g) => {
        const isOpen = open[g.key] ?? !g.collapsed;
        return (
          <section key={g.key} className="overflow-hidden rounded-lg border bg-card">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/50" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} aria-expanded={isOpen}>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className={cn("h-2.5 w-2.5 rounded-full", BAR[g.tone])} />
              {g.label}
              <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">{g.rows.length}</span>
            </button>
            {isOpen && (
              g.rows.length === 0 ? (
                <p className="border-t px-3 py-3 text-xs text-muted-foreground">{loading ? "Carregando…" : g.empty ?? "Nada aqui."}</p>
              ) : (
                <div className="overflow-x-auto border-t">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Cliente / projeto</th>
                        <th className="px-3 py-1.5 font-medium">Responsável / equipe</th>
                        <th className="px-3 py-1.5 font-medium">{cols.start}</th>
                        <th className="px-3 py-1.5 font-medium">{cols.forecast}</th>
                        <th className="px-3 py-1.5 font-medium">Duração</th>
                        <th className="px-3 py-1.5 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {g.rows.map((r) => (
                        <tr key={r.id} className={cn("align-top", onOpen && "cursor-pointer hover:bg-muted/40")} onClick={() => onOpen?.(r.id)}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{r.client || r.title}</p>
                            <p className="text-xs text-muted-foreground">{[r.client ? r.title : null, r.project].filter(Boolean).join(" · ") || "—"}</p>
                            {r.alerts?.map((a) => (
                              <p key={a} className="mt-0.5 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />{a}</p>
                            ))}
                          </td>
                          <td className="px-3 py-2">{r.who || <span className="text-muted-foreground">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.start || <span className="text-muted-foreground">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.forecast || <span className="text-muted-foreground">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.duration || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2"><span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", TONE[r.tone])}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

const TZ = "America/Fortaleza";
/** "qua., 05/11 08:00" no fuso da loja. */
export const whenText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
