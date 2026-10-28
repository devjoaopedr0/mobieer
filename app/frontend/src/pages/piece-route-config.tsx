import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { errorMessage } from "@/lib/errors";
import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api";

type RouteStep = { id: string; position: number; name: string; instruction: string | null; requirePhoto: boolean; productionStep: string | null; active: boolean };
type Override = { id: string; routeStepId: string; action: "SKIP" | "APPEND" | "REPLACE"; instruction: string | null };
type PieceType = { id: string; name: string; active: boolean; overrides: Override[] };
type Config = { steps: RouteStep[]; types: PieceType[]; productionSteps: { key: string; label: string }[] };

const nn = (n: number) => String(n).padStart(2, "0");
const ACTION_LABEL: Record<string, string> = { "": "Segue o roteiro base", SKIP: "Pular (não se aplica)", APPEND: "Acrescentar à instrução", REPLACE: "Trocar a instrução" };

/**
 * Roteiro de produção por peça: as 9 etapas base e os ajustes por tipo de
 * peça. Todo mundo da produção vê; só o administrador edita.
 */
export function PieceRouteConfigPage() {
  const { can } = useAuth();
  const canManage = can("production.route.manage");
  const qc = useQueryClient();
  const key = ["production", "piece-route-config"];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Config }>("/production/piece-route/config") });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["production"] });
  const [typeId, setTypeId] = useState<string>("");
  const [newType, setNewType] = useState("");

  const addType = useMutation({
    mutationFn: () => apiPost("/production/piece-route/types", { name: newType.trim() }),
    onSuccess: () => { toast.success("Tipo de peça criado"); setNewType(""); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível criar o tipo")),
  });
  const toggleType = useMutation({
    mutationFn: (t: PieceType) => apiPatch(`/production/piece-route/types/${t.id}`, { active: !t.active }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar")),
  });

  const cfg = q.data?.data;
  const type = cfg?.types.find((t) => t.id === typeId) ?? null;
  return (
    <div className="space-y-6">
      <PageHeader title="Roteiro de produção por peça" description={canManage ? "Etapas base, instruções e o que muda por tipo de peça." : "Etapas base e o que muda por tipo de peça. Só o administrador edita."} />
      {q.isLoading || !cfg ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Roteiro base</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cfg.steps.map((s) => <StepEditor key={s.id} step={s} canManage={canManage} productionSteps={cfg.productionSteps} onSaved={refresh} />)}
              <p className="text-xs text-muted-foreground">"Fecha a etapa do pedido": quando todas as peças do pedido passarem por esta etapa, a etapa do pedido escolhida é concluída (se estiver aberta e não bloqueada).</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tipos de peça</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {cfg.types.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTypeId(t.id)} className={`rounded-full border px-3 py-1 text-sm ${typeId === t.id ? "border-primary bg-primary/10" : ""} ${t.active ? "" : "opacity-50 line-through"}`}>
                    {t.name}{t.overrides.length ? ` · ${t.overrides.length} ajuste(s)` : ""}
                  </button>
                ))}
              </div>
              {canManage && (
                <div className="flex max-w-md gap-2">
                  <Input placeholder="Novo tipo (ex.: tamponamento)" value={newType} onChange={(e) => setNewType(e.target.value)} />
                  <Button disabled={newType.trim().length < 2 || addType.isPending} onClick={() => addType.mutate()}><Plus className="h-4 w-4" />Adicionar</Button>
                </div>
              )}
              {type && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{type.name}: o que muda no roteiro</p>
                    {canManage && <Button size="sm" variant="ghost" onClick={() => toggleType.mutate(type)}>{type.active ? "Desativar tipo" : "Reativar tipo"}</Button>}
                  </div>
                  {cfg.steps.map((s) => <OverrideEditor key={`${type.id}-${s.id}`} type={type} step={s} canManage={canManage} onSaved={refresh} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StepEditor({ step, canManage, productionSteps, onSaved }: { step: RouteStep; canManage: boolean; productionSteps: Config["productionSteps"]; onSaved: () => void }) {
  const [form, setForm] = useState({ name: step.name, instruction: step.instruction ?? "", requirePhoto: step.requirePhoto, productionStep: step.productionStep ?? "", active: step.active });
  const dirty = form.name !== step.name || form.instruction !== (step.instruction ?? "") || form.requirePhoto !== step.requirePhoto || form.productionStep !== (step.productionStep ?? "") || form.active !== step.active;
  const save = useMutation({
    mutationFn: () => apiPut<{ message?: string }>(`/production/piece-route/steps/${step.id}`, { ...form, instruction: form.instruction || null, productionStep: form.productionStep || null }),
    onSuccess: (r) => { toast.success(r.message ?? "Etapa salva"); onSaved(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar a etapa")),
  });
  if (!canManage) {
    return (
      <div className={`flex gap-3 text-sm ${step.active ? "" : "opacity-50"}`}>
        <span className="font-mono text-muted-foreground">{nn(step.position)}</span>
        <div><p className="font-medium">{step.name}{step.requirePhoto ? " · exige foto" : ""}</p><p className="text-xs text-muted-foreground">{step.instruction ?? "Sem instrução (a definir)"}</p></div>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-md border p-2 md:grid-cols-[2rem_10rem_1fr_auto]">
      <span className="pt-2 font-mono text-sm text-muted-foreground">{nn(step.position)}</span>
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Textarea rows={1} placeholder="Instrução (a definir)" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.requirePhoto} onChange={(e) => setForm({ ...form, requirePhoto: e.target.checked })} />Exige foto</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Ativa</label>
        <select className="rounded-md border border-input bg-background px-1 py-1" value={form.productionStep} onChange={(e) => setForm({ ...form, productionStep: e.target.value })} title="Fecha a etapa do pedido">
          <option value="">Não fecha etapa do pedido</option>
          {productionSteps.map((p) => <option key={p.key} value={p.key}>Fecha: {p.label}</option>)}
        </select>
        <Button size="sm" disabled={!dirty || save.isPending || form.name.trim().length < 2} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}</Button>
      </div>
    </div>
  );
}

function OverrideEditor({ type, step, canManage, onSaved }: { type: PieceType; step: RouteStep; canManage: boolean; onSaved: () => void }) {
  const cur = type.overrides.find((o) => o.routeStepId === step.id);
  const [action, setAction] = useState<string>(cur?.action ?? "");
  const [instruction, setInstruction] = useState(cur?.instruction ?? "");
  const dirty = action !== (cur?.action ?? "") || instruction !== (cur?.instruction ?? "");
  const save = useMutation({
    mutationFn: () => apiPut<{ message?: string }>("/production/piece-route/overrides", { pieceTypeId: type.id, routeStepId: step.id, action: action || null, instruction: instruction || null }),
    onSuccess: (r) => { toast.success(r.message ?? "Ajuste salvo"); onSaved(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar o ajuste")),
  });
  if (!canManage) {
    if (!cur) return null;
    return <p className="text-sm"><span className="font-mono text-muted-foreground">{nn(step.position)}</span> {step.name}: {ACTION_LABEL[cur.action]}{cur.instruction ? ` — ${cur.instruction}` : ""}</p>;
  }
  return (
    <div className="grid items-center gap-2 text-sm md:grid-cols-[2rem_8rem_12rem_1fr_auto]">
      <span className="font-mono text-muted-foreground">{nn(step.position)}</span>
      <span>{step.name}</span>
      <select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={action} onChange={(e) => setAction(e.target.value)}>
        {Object.entries(ACTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Input className="h-8" disabled={action !== "APPEND" && action !== "REPLACE"} placeholder={action === "REPLACE" ? "Instrução deste tipo" : action === "APPEND" ? "O que acrescentar" : step.instruction ?? ""} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
      <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}</Button>
    </div>
  );
}
