import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Duração do agendamento (mesma regra de assembly-board.rules.ts no backend):
 * N dias de montagem = (N − 1) dias corridos + um expediente de 8 h — "2 dias"
 * começando segunda às 8h termina terça às 16h. "Outro" aceita horas ou dias.
 */
export const WORKDAY_MINUTES = 8 * 60;
const DAY = 24 * 60;
export const MAX_DURATION_MINUTES = 60 * DAY;
export const daysToMinutes = (days: number) => (days - 1) * DAY + WORKDAY_MINUTES;

const PRESETS: { minutes: number; label: string; assembly?: boolean }[] = [
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
  { minutes: 90, label: "1h30" },
  { minutes: 120, label: "2 horas" },
  { minutes: 180, label: "3 horas" },
  { minutes: 240, label: "4 horas (meio período)" },
  { minutes: WORKDAY_MINUTES, label: "1 dia (8h)" },
  { minutes: daysToMinutes(2), label: "2 dias", assembly: true },
  { minutes: daysToMinutes(3), label: "3 dias", assembly: true },
  { minutes: daysToMinutes(4), label: "4 dias", assembly: true },
  { minutes: daysToMinutes(5), label: "5 dias", assembly: true },
];

export function durationLabel(minutes: number): string {
  if (!(minutes > 0)) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < DAY) {
    if (minutes === WORKDAY_MINUTES) return "1 dia (8h)";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  if ((minutes - WORKDAY_MINUTES) % DAY === 0) return `${(minutes - WORKDAY_MINUTES) / DAY + 1} dias`;
  if (minutes % DAY === 0) return `${minutes / DAY} ${minutes === DAY ? "dia" : "dias"} corridos`;
  const d = Math.floor(minutes / DAY);
  const h = Math.round((minutes % DAY) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const minutesBetween = (start: string | Date, end: string | Date) => Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);

/** Valida o "Outro": devolve os minutos ou a mensagem do problema. */
export function customMinutes(amount: string, unit: "HORAS" | "DIAS"): { minutes: number } | { error: string } {
  const n = Number(amount.replace(",", "."));
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) return { error: "Informe uma duração maior que zero" };
  const minutes = unit === "DIAS" ? (Number.isInteger(n) ? daysToMinutes(n) : Math.round(n * WORKDAY_MINUTES)) : Math.round(n * 60);
  if (minutes < 15) return { error: "A duração mínima é de 15 minutos" };
  if (minutes > MAX_DURATION_MINUTES) return { error: "A duração máxima é de 60 dias" };
  return { minutes };
}

/** "qua., 05/11 às 16:00" — o término previsto, com o dia quando passa para outro. */
export function endText(start: string | Date, end: string | Date) {
  const s = new Date(start);
  const e = new Date(end);
  const time = e.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (s.toDateString() === e.toDateString()) return `às ${time}`;
  return `${e.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} às ${time}`;
}

/**
 * Select com as durações mais usadas e "Outro". `assembly` mostra também as
 * opções em dias. O valor é em minutos; um valor fora das opções (agendamento
 * antigo ou arrastado na linha do tempo) abre já em "Outro".
 */
export function DurationField({ minutes, onChange, onError, assembly }: { minutes: number; onChange: (minutes: number) => void; onError?: (error: string | null) => void; assembly?: boolean }) {
  const options = PRESETS.filter((p) => assembly || !p.assembly);
  const preset = options.find((p) => p.minutes === minutes);
  const [other, setOther] = useState(!preset);
  const [amount, setAmount] = useState(() => (preset ? "" : initial(minutes).amount));
  const [unit, setUnit] = useState<"HORAS" | "DIAS">(() => initial(minutes).unit);
  const [error, setError] = useState<string | null>(null);

  // trocou de agendamento (ou a duração mudou fora daqui): reabre no modo certo
  useEffect(() => {
    const p = options.find((x) => x.minutes === minutes);
    if (p && !other) return;
    if (!p && !other) {
      setOther(true);
      setAmount(initial(minutes).amount);
      setUnit(initial(minutes).unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);

  const report = (e: string | null) => {
    setError(e);
    onError?.(e);
  };
  const applyCustom = (a: string, u: "HORAS" | "DIAS") => {
    setAmount(a);
    setUnit(u);
    const r = customMinutes(a, u);
    if ("error" in r) return report(r.error);
    report(null);
    onChange(r.minutes);
  };

  return (
    <div className="space-y-1.5">
      <Select
        value={other ? "OUTRO" : String(minutes)}
        onValueChange={(v) => {
          if (v === "OUTRO") {
            setOther(true);
            const i = initial(minutes);
            applyCustom(i.amount, i.unit);
            return;
          }
          setOther(false);
          report(null);
          onChange(Number(v));
        }}
      >
        <SelectTrigger aria-label="Duração"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((p) => <SelectItem key={p.minutes} value={String(p.minutes)}>{p.label}</SelectItem>)}
          <SelectItem value="OUTRO">Outro…</SelectItem>
        </SelectContent>
      </Select>
      {other && (
        <div className="flex gap-2">
          <Input inputMode="decimal" aria-label="Quanto tempo" className="w-24" value={amount} onChange={(e) => applyCustom(e.target.value, unit)} placeholder="Ex.: 6" />
          <select aria-label="Unidade" className="h-9 rounded-md border bg-background px-2 text-sm" value={unit} onChange={(e) => applyCustom(amount, e.target.value as "HORAS" | "DIAS")}>
            <option value="HORAS">horas</option>
            <option value="DIAS">dias de montagem</option>
          </select>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Como reabrir o "Outro": em dias de montagem quando a duração bate com a regra; senão, em horas. */
function initial(minutes: number): { amount: string; unit: "HORAS" | "DIAS" } {
  if (!(minutes > 0)) return { amount: "", unit: "HORAS" };
  if (minutes >= DAY && (minutes - WORKDAY_MINUTES) % DAY === 0) return { amount: String((minutes - WORKDAY_MINUTES) / DAY + 1), unit: "DIAS" };
  return { amount: String(Math.round((minutes / 60) * 100) / 100).replace(".", ","), unit: "HORAS" };
}
