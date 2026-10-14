import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type Row = {
  employee: { id: string; fullName: string; registration: string; status: string };
  workedMinutes: number; expectedMinutes: number; balanceMinutes: number; faltas: number; incompletos: number; atrasos: number; atrasoMinutos: number; diasTrabalhados: number;
};
type Summary = { month: string; today: string; schedule: { start: string; tolerance: number }; rows: Row[] };

const hhmm = (min: number) => `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

/** A equipe inteira no mês: quem está devendo horas, quem tem crédito, faltas e atrasos. */
export function TeamHoursCard({ month, canManage, onPick }: { month: string; canManage: boolean; onPick: (employeeId: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr", "team-summary", month], queryFn: () => apiGet<{ data: Summary }>("/hr/timeclock/team-summary", { month }), enabled: /^\d{4}-\d{2}$/.test(month) });
  const [start, setStart] = useState("08:00");
  const [tolerance, setTolerance] = useState("10");
  // quem não bateu ponto nenhuma vez no mês (em geral, quem já saiu e segue ativo no cadastro) fica recolhido
  const [showAbsent, setShowAbsent] = useState(false);
  const d = q.data?.data;
  useEffect(() => { if (d) { setStart(d.schedule.start); setTolerance(String(d.schedule.tolerance)); } }, [d?.schedule.start, d?.schedule.tolerance]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => apiPut<{ message?: string }>("/hr/timeclock/schedule", { start, tolerance: Number(tolerance) || 0 }),
    onSuccess: (r) => { toast.success(r.message ?? "Horário salvo"); qc.invalidateQueries({ queryKey: ["hr", "team-summary"] }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar o horário")),
  });

  if (!d) return null;
  const absent = d.rows.filter((r) => r.diasTrabalhados === 0).length;
  const rows = d.rows.filter((r) => r.diasTrabalhados > 0 || showAbsent);
  const owing = rows.filter((r) => r.balanceMinutes < 0).length;
  const changed = start !== d.schedule.start || Number(tolerance) !== d.schedule.tolerance;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Horas da equipe no mês
          <Badge variant="secondary">{rows.length} pessoas</Badge>
          {owing > 0 && <Badge variant="warning">{owing} devendo horas</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Entrada</span><Input type="time" className="h-8 w-28" value={start} disabled={!canManage} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Tolerância (min)</span><Input inputMode="numeric" className="h-8 w-24" value={tolerance} disabled={!canManage} onChange={(e) => setTolerance(e.target.value)} /></label>
          {canManage && changed && <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</Button>}
          <p className="text-xs text-muted-foreground">Atraso é a primeira batida do dia depois da entrada mais a tolerância. Conta até hoje; dia que ainda não chegou não entra.</p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="px-2 py-1.5 text-left">Colaborador</th>
                <th className="px-2 py-1.5 text-right">Trabalhadas</th>
                <th className="px-2 py-1.5 text-right">Esperadas</th>
                <th className="px-2 py-1.5 text-right">Saldo</th>
                <th className="px-2 py-1.5 text-right">Faltas</th>
                <th className="px-2 py-1.5 text-right">Atrasos</th>
                <th className="px-2 py-1.5 text-right" title="Dias com número ímpar de batidas: faltou bater entrada ou saída">Batida faltando</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id} className="cursor-pointer border-t hover:bg-muted/40" title="Abrir o espelho de ponto" onClick={() => onPick(r.employee.id)}>
                  <td className="px-2 py-1.5">{r.employee.fullName} <span className="text-xs text-muted-foreground">({r.employee.registration}){r.employee.status !== "ACTIVE" ? " · inativo" : ""}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{hhmm(r.workedMinutes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{hhmm(r.expectedMinutes)}</td>
                  <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${r.balanceMinutes < 0 ? "text-destructive" : r.balanceMinutes > 0 ? "text-success" : ""}`}>{r.balanceMinutes > 0 ? "+" : ""}{hhmm(r.balanceMinutes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.faltas || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.atrasos ? `${r.atrasos} (${hhmm(r.atrasoMinutos)})` : "—"}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.incompletos ? "text-warning" : ""}`}>{r.incompletos || "—"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhum colaborador neste mês.</td></tr>}
            </tbody>
          </table>
        </div>
        {absent > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-3.5 w-3.5" checked={showAbsent} onChange={(e) => setShowAbsent(e.target.checked)} />
            Mostrar também {absent} {absent === 1 ? "pessoa que não bateu" : "pessoas que não bateram"} ponto neste mês (se já saíram da loja, desligue no cadastro)
          </label>
        )}
        <p className="text-xs text-muted-foreground">Saldo negativo: a pessoa trabalhou menos que a carga do período. Em dia com batida faltando as horas saem a menos — abra o espelho e lance a marcação que faltou. Compensações lançadas à mão aparecem em Banco de horas.</p>
      </CardContent>
    </Card>
  );
}
