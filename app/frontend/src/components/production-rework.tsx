import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/utils";

type Reason = { code: string; label: string };
type Rework = {
  id: string; piece: string; reason: string; reasonLabel: string; note: string | null; person: string | null; dueDay: string | null;
  done: boolean; doneAt: string | null; createdAt: string; project: { id: string; code: string; name: string; client: string | null } | null;
};
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const sel = "h-10 w-full rounded-md border bg-background px-2 text-sm";

function Row({ r, onDone, busy, showProject }: { r: Rework; onDone: (id: string) => void; busy: boolean; showProject?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0 ${r.done ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{r.piece}</p>
        <p className="text-xs text-muted-foreground">
          {r.reasonLabel} · {r.person || "EQUIPE"} · para {br(r.dueDay)}
          {showProject && r.project ? ` · ${r.project.code}${r.project.client ? ` — ${r.project.client}` : ""}` : ""}
          {r.note ? ` · ${r.note}` : ""}
        </p>
      </div>
      {r.done ? (
        <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Refeita</Badge>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onDone(r.id)}>Marcar refeita</Button>
      )}
    </div>
  );
}

/** No pedido: pedir que uma peça seja refeita. Vira tarefa no planejamento da semana. */
export function ProductionReworkCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const key = ["production", "reworks", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: { reasons: Reason[]; items: Rework[] } }>(`/production/projects/${projectId}/reworks`).then((r) => r.data) });
  const empty = { piece: "", reason: "CORTE", note: "", person: "", dueDay: today() };
  const [form, setForm] = useState<typeof empty | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["production"] });
  const create = useMutation({
    mutationFn: (f: typeof empty) => apiPost<{ message?: string }>(`/production/projects/${projectId}/reworks`, f),
    onSuccess: (r) => { toast.success(r.message ?? "Peça registrada", { duration: 8000 }); setForm(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível registrar")),
  });
  const done = useMutation({
    mutationFn: (id: string) => apiPost<{ message?: string }>(`/production/reworks/${id}/done`, {}),
    onSuccess: (r) => { toast.success(r.message ?? "Peça refeita"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível marcar")),
  });
  const items = q.data?.items ?? [];
  const open = items.filter((r) => !r.done).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="h-4 w-4" /> Peças a refazer {open > 0 && <Badge variant="warning">{open} em aberto</Badge>}</CardTitle>
        {canManage && !form && <Button size="sm" variant="outline" onClick={() => setForm(empty)}><Plus className="mr-1 h-4 w-4" />Peça a refazer</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {form && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Qual peça *</Label><Input value={form.piece} placeholder="Ex.: porta do armário alto da cozinha" onChange={(e) => setForm({ ...form, piece: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Motivo</Label>
              <select className={sel} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {(q.data?.reasons ?? []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Quem vai refazer</Label><Input value={form.person} placeholder="Sem nome vai para a EQUIPE" onChange={(e) => setForm({ ...form, person: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Para quando</Label><Input type="date" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Observação</Label><Input value={form.note} placeholder="Ex.: medida certa 2,10 m" onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">A peça entra no Planejamento da semana, no dia e para quem vai refazer. Quando a tarefa for marcada como feita, a peça fica refeita aqui.</p>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" disabled={form.piece.trim().length < 2 || create.isPending} onClick={() => create.mutate(form)}>{create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registrar</Button>
              <Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </div>
        )}
        {!items.length && !form && <p className="text-xs text-muted-foreground">Nenhuma peça para refazer neste pedido. Quando uma peça sair com erro, registre aqui para ela entrar no planejamento.</p>}
        {items.map((r) => <Row key={r.id} r={r} onDone={(id) => done.mutate(id)} busy={done.isPending} />)}
      </CardContent>
    </Card>
  );
}

/** Na tela da Produção: as peças a refazer em aberto de todos os pedidos e os motivos do mês. */
export function ProductionReworkOverview() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["production", "reworks", "all"], queryFn: () => apiGet<{ data: { items: Rework[]; open: number; month: { count: number; reasons: { code: string; label: string; count: number }[] } } }>("/production/reworks", { open: "1" }).then((r) => r.data) });
  const done = useMutation({
    mutationFn: (id: string) => apiPost(`/production/reworks/${id}/done`, {}),
    onSuccess: () => { toast.success("Peça refeita"); qc.invalidateQueries({ queryKey: ["production"] }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível marcar")),
  });
  const d = q.data;
  if (!d || (!d.open && !d.month.count)) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base"><RotateCcw className="h-4 w-4" />Peças a refazer {d.open > 0 && <Badge variant="warning">{d.open} em aberto</Badge>}</CardTitle>
        {d.month.count > 0 && <p className="text-xs text-muted-foreground">Este mês: {d.month.count} {d.month.count === 1 ? "peça" : "peças"} — {d.month.reasons.map((r) => `${r.label} ${r.count}`).join(", ")}</p>}
      </CardHeader>
      <CardContent>
        {d.items.map((r) => <Row key={r.id} r={r} onDone={(id) => done.mutate(id)} busy={done.isPending} showProject />)}
      </CardContent>
    </Card>
  );
}
