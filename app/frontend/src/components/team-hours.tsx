import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type Row = {
  employee: { id: string; fullName: string; registration: string; status: string; weeklyHours?: number; terminatedAt?: string | null };
  workedMinutes: number; expectedMinutes: number; balanceMinutes: number; faltas: number; incompletos: number; atrasos: number; atrasoMinutos: number; diasTrabalhados: number;
  /** ajustes, compensações e pagamentos do banco de horas no mês (já somados ao saldo) */
  adjustmentMinutes?: number;
};
type Summary = { month: string; today: string; schedule: { start: string; tolerance: number }; rows: Row[] };

const hhmm = (min: number) => `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

/** A equipe inteira no mês: quem está devendo horas, quem tem crédito, faltas e atrasos. */
export function TeamHoursCard({ month, canManage, canEmployees = false, onPick }: { month: string; canManage: boolean; canEmployees?: boolean; onPick: (employeeId: string) => void }) {
  const [adjusting, setAdjusting] = useState<Row | null>(null);
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
                <th className="px-2 py-1.5 text-right" title="Ajustes, compensações e pagamentos lançados no banco de horas (já entram no saldo)">Lançamentos</th>
                <th className="px-2 py-1.5 text-right">Saldo</th>
                <th className="px-2 py-1.5 text-right">Faltas</th>
                <th className="px-2 py-1.5 text-right">Atrasos</th>
                <th className="px-2 py-1.5 text-right" title="Dias com número ímpar de batidas: faltou bater entrada ou saída">Batida faltando</th>
                {(canManage || canEmployees) && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id} className="cursor-pointer border-t hover:bg-muted/40" title="Abrir o espelho de ponto" onClick={() => onPick(r.employee.id)}>
                  <td className="px-2 py-1.5">{r.employee.fullName} <span className="text-xs text-muted-foreground">({r.employee.registration}){r.employee.status !== "ACTIVE" ? " · inativo" : ""}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{hhmm(r.workedMinutes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{hhmm(r.expectedMinutes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.adjustmentMinutes ? `${r.adjustmentMinutes > 0 ? "+" : ""}${hhmm(r.adjustmentMinutes)}` : "—"}</td>
                  <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${r.balanceMinutes < 0 ? "text-destructive" : r.balanceMinutes > 0 ? "text-success" : ""}`}>{r.balanceMinutes > 0 ? "+" : ""}{hhmm(r.balanceMinutes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.faltas || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.atrasos ? `${r.atrasos} (${hhmm(r.atrasoMinutos)})` : "—"}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.incompletos ? "text-warning" : ""}`}>{r.incompletos || "—"}</td>
                  {(canManage || canEmployees) && (
                    <td className="px-2 py-1 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(ev) => { ev.stopPropagation(); setAdjusting(r); }}>Ajustar</Button>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhum colaborador neste mês.</td></tr>}
            </tbody>
          </table>
        </div>
        {absent > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-3.5 w-3.5" checked={showAbsent} onChange={(e) => setShowAbsent(e.target.checked)} />
            Mostrar também {absent} {absent === 1 ? "pessoa que não bateu" : "pessoas que não bateram"} ponto neste mês (se já saíram da loja, desligue no cadastro)
          </label>
        )}
        <p className="text-xs text-muted-foreground">Saldo negativo: a pessoa trabalhou menos que a carga do período. Em dia com batida faltando as horas saem a menos — abra o espelho e lance a marcação que faltou. Os lançamentos do banco de horas (ajustes, compensações, pagamentos) já entram no saldo. Em Ajustar dá para mudar a jornada, creditar horas ou desligar a pessoa.</p>
      </CardContent>
      {adjusting && <AdjustEmployeeDialog row={adjusting} month={month} canManage={canManage} canEmployees={canEmployees} onClose={() => setAdjusting(null)} />}
    </Card>
  );
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "ON_LEAVE", label: "Afastado" },
  { value: "TERMINATED", label: "Desligado" },
];
const todayField = () => new Date().toLocaleDateString("en-CA");

/** "2", "1,5" ou "1:30" viram minutos. */
function toMinutes(text: string) {
  const t = text.trim();
  if (!t) return 0;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  const v = m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(Number(t.replace(",", ".")) * 60);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Ajustes de uma pessoa sem sair do ponto: a jornada semanal (que define as
 * horas esperadas), horas a creditar ou descontar no banco e o desligamento.
 */
function AdjustEmployeeDialog({ row, month, canManage, canEmployees, onClose }: { row: Row; month: string; canManage: boolean; canEmployees: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const e = row.employee;
  const [weeklyHours, setWeeklyHours] = useState(String(e.weeklyHours ?? 44));
  const [status, setStatus] = useState(e.status);
  const [terminatedAt, setTerminatedAt] = useState(e.terminatedAt ? e.terminatedAt.slice(0, 10) : todayField());
  const [deactivateUser, setDeactivateUser] = useState(true);
  const [hours, setHours] = useState("");
  const [sign, setSign] = useState<"+" | "-">("+");
  const [adjDate, setAdjDate] = useState(() => (todayField().startsWith(month) ? todayField() : `${month}-01`));
  const [reason, setReason] = useState("");
  const done = (msg?: string) => {
    toast.success(msg ?? "Salvo");
    void qc.invalidateQueries({ queryKey: ["hr"] });
    onClose();
  };
  const saveEmployee = useMutation({
    mutationFn: () =>
      apiPatch<{ message?: string }>(`/hr/employees/${e.id}`, {
        weeklyHours: Number(weeklyHours),
        status,
        ...(status === "TERMINATED" ? { terminatedAt: `${terminatedAt}T12:00:00.000Z`, deactivateUser } : {}),
      }),
    onSuccess: (r) => done(status === "TERMINATED" && e.status !== "TERMINATED" ? `${e.fullName}: desligamento registrado` : r.message),
    onError: (err) => toast.error(errorMessage(err, "Não foi possível salvar")),
  });
  const minutes = toMinutes(hours);
  const credit = useMutation({
    mutationFn: () =>
      apiPost<{ message?: string }>("/hr/timeclock/hour-bank/adjustments", {
        employeeId: e.id,
        date: adjDate,
        minutes: sign === "+" ? minutes : -minutes,
        kind: sign === "+" ? "ADJUSTMENT" : "COMPENSATION",
        reason: reason.trim() || null,
      }),
    onSuccess: () => done(`${sign === "+" ? "Crédito" : "Desconto"} de ${hhmm(minutes)} lançado no banco de horas`),
    onError: (err) => toast.error(errorMessage(err, "Não foi possível lançar as horas")),
  });
  const hoursValid = Number.isInteger(Number(weeklyHours)) && Number(weeklyHours) >= 1 && Number(weeklyHours) <= 60;
  const changedEmployee = Number(weeklyHours) !== (e.weeklyHours ?? 44) || status !== e.status || (status === "TERMINATED" && terminatedAt !== (e.terminatedAt ?? "").slice(0, 10));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Ajustar — {e.fullName}</DialogTitle></DialogHeader>
        {canEmployees && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Jornada e situação</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Jornada semanal (horas)</Label>
                <Input inputMode="numeric" value={weeklyHours} onChange={(ev) => setWeeklyHours(ev.target.value)} />
                <p className="text-xs text-muted-foreground">Horas esperadas por dia útil: {hoursValid ? hhmm(Math.round((Number(weeklyHours) / 5) * 60)) : "—"}.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Situação</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={status} onChange={(ev) => setStatus(ev.target.value)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {status === "TERMINATED" && (
              <div className="space-y-2 rounded-md bg-warning/10 p-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data do desligamento</Label>
                  <Input type="date" value={terminatedAt} onChange={(ev) => setTerminatedAt(ev.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="h-3.5 w-3.5" checked={deactivateUser} onChange={(ev) => setDeactivateUser(ev.target.checked)} />
                  Cortar também o acesso ao sistema (se a pessoa tiver usuário ligado)
                </label>
                <p className="text-xs text-muted-foreground">O ponto conta só até essa data. O histórico fica guardado.</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" disabled={!hoursValid || !changedEmployee || saveEmployee.isPending} onClick={() => saveEmployee.mutate()}>Salvar jornada e situação</Button>
            </div>
          </div>
        )}
        {canManage && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Horas no banco de horas</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Lançar</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={sign} onChange={(ev) => setSign(ev.target.value === "-" ? "-" : "+")}>
                  <option value="+">Creditar (+)</option>
                  <option value="-">Descontar (−)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Horas (ex.: 2 ou 1:30)</Label>
                <Input value={hours} onChange={(ev) => setHours(ev.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dia</Label>
                <Input type="date" value={adjDate} onChange={(ev) => setAdjDate(ev.target.value)} />
              </div>
            </div>
            <Input placeholder="Motivo (fica registrado)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
            <div className="flex justify-end">
              <Button size="sm" disabled={minutes <= 0 || credit.isPending} onClick={() => credit.mutate()}>
                {sign === "+" ? "Creditar" : "Descontar"}{minutes > 0 ? ` ${hhmm(minutes)}` : ""}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

