import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type Front = { id: string; front: string; label: string; status: "PENDING" | "IN_PROGRESS" | "DONE"; statusLabel: string; responsible: { id: string; name: string } | null; dueAt: string | null; notes: string | null; daysLate: number };
type Data = { fronts: Front[]; available: { code: string; label: string }[]; statuses: { code: string; label: string }[] };
type Person = { id: string; name: string };

const TONE: Record<Front["status"], string> = { PENDING: "bg-slate-500/10 text-slate-700", IN_PROGRESS: "bg-blue-500/10 text-blue-700", DONE: "bg-emerald-500/10 text-emerald-700" };
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

/** Frentes que correm em paralelo à marcenaria no mesmo pedido (metalon, peças especiais, portas de vidro). */
export function ProductionFrontsCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["production", "fronts", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Data }>(`/production/projects/${projectId}/fronts`) });
  const people = useQuery({ queryKey: ["kanban-people"], queryFn: () => apiGet<{ data: Person[] }>("/organization/people"), enabled: canEdit });
  const refresh = () => qc.invalidateQueries({ queryKey: ["production"] });
  const save = useMutation({
    mutationFn: (v: { front: string; body: Record<string, unknown> }) => apiPut<{ message?: string }>(`/production/projects/${projectId}/fronts/${v.front}`, v.body),
    onSuccess: (r) => { if (r.message) toast.success(r.message); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar a frente")),
  });
  const remove = useMutation({
    mutationFn: (front: string) => apiDelete<{ message?: string }>(`/production/projects/${projectId}/fronts/${front}`),
    onSuccess: (r) => { toast.success(r.message ?? "Frente retirada"); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível retirar a frente")),
  });

  const d = q.data?.data;
  if (!d) return null;
  if (!d.fronts.length && !canEdit) return null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Frentes de produção
          <span className="text-xs font-normal text-muted-foreground">andam em paralelo à marcenaria, cada uma no seu ritmo</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!d.fronts.length && <p className="text-sm text-muted-foreground">Este pedido só tem marcenaria. Acrescente uma frente se ele também tiver metalon, peças especiais ou portas de vidro.</p>}
        {d.fronts.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
            <span className="w-36 font-medium">{f.label}</span>
            {canEdit ? (
              <select aria-label={`Situação de ${f.label}`} className={`${selectCls} font-medium ${TONE[f.status]}`} value={f.status} disabled={save.isPending} onChange={(e) => save.mutate({ front: f.front, body: { status: e.target.value } })}>
                {d.statuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            ) : (
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${TONE[f.status]}`}>{f.statusLabel}</span>
            )}
            {canEdit ? (
              <>
                <select aria-label={`Responsável por ${f.label}`} className={selectCls} value={f.responsible?.id ?? ""} disabled={save.isPending} onChange={(e) => save.mutate({ front: f.front, body: { responsibleId: e.target.value || null } })}>
                  <option value="">Sem responsável</option>
                  {(people.data?.data ?? (f.responsible ? [f.responsible] : [])).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Input type="date" aria-label={`Prazo de ${f.label}`} className="h-9 w-40" defaultValue={toDateInput(f.dueAt)} key={f.dueAt ?? "sem-prazo"} onBlur={(e) => { if (e.target.value !== toDateInput(f.dueAt)) save.mutate({ front: f.front, body: { dueAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : null } }); }} />
                <Input aria-label={`Observação de ${f.label}`} className="h-9 min-w-40 flex-1" placeholder="Observação" defaultValue={f.notes ?? ""} key={`n-${f.notes ?? ""}`} onBlur={(e) => { if (e.target.value.trim() !== (f.notes ?? "")) save.mutate({ front: f.front, body: { notes: e.target.value.trim() || null } }); }} />
                <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Retirar ${f.label}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Retirar a frente ${f.label} deste pedido?`)) remove.mutate(f.front); }}><Trash2 className="h-4 w-4" /></Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{[f.responsible?.name, f.dueAt ? `prazo ${new Date(f.dueAt).toLocaleDateString("pt-BR")}` : null, f.notes].filter(Boolean).join(" · ")}</span>
            )}
            {f.daysLate > 0 && <Badge variant="danger"><AlertTriangle className="mr-1 h-3 w-3" />{f.daysLate} dia(s) de atraso</Badge>}
          </div>
        ))}
        {canEdit && d.available.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Acrescentar:</span>
            {d.available.map((a) => (
              <Button key={a.code} size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ front: a.code, body: {} })}><Plus className="mr-1 h-3.5 w-3.5" />{a.label}</Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
