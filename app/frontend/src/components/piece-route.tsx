import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ChevronDown, ChevronUp, Loader2, Route, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { apiGet, apiObjectUrl, apiPatch, apiPost, apiPostForm } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type PieceStep = {
  progressId: string | null;
  routeStepId: string;
  position: number;
  name: string;
  instruction: string | null;
  requirePhoto: boolean;
  status: "PENDING" | "DONE" | "NOT_APPLICABLE";
  statusLabel: string;
  doneBy: { id: string; name: string } | null;
  doneAt: string | null;
  hasPhoto: boolean;
  note: string | null;
};
/** A peça é o item de produção; o código da etiqueta é o code dele. */
export type PieceCard = {
  itemId: string;
  code: string | null;
  item: { id: string; descricao: string; ambiente: string | null; medidas: string | null; modulo: string | null; material: string | null; quantidade: number };
  project: { id: string; code: string; name: string };
  pieceType: { id: string; name: string } | null;
  pieceTypeSource: string | null;
  suggestedType: { id: string; name: string } | null;
  currentStepId: string | null;
  done: boolean;
  steps: PieceStep[];
};
type RouteConfig = { types: { id: string; name: string; active: boolean }[] };

const nn = (n: number) => String(n).padStart(2, "0");

/**
 * Roteiro por peça no detalhe da produção: um cartão por peça, etapas em
 * sequência (01 Corte … 09 Coleta). Quando todas as peças fecham uma etapa
 * ligada à etapa do pedido, a etapa do pedido conclui sozinha.
 */
export function PieceRouteCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["production", "piece-routes", projectId];
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: PieceCard[] }>(`/production/projects/${projectId}/piece-routes`), enabled: open });
  const config = useQuery({ queryKey: ["production", "piece-route-config"], queryFn: () => apiGet<{ data: RouteConfig }>("/production/piece-route/config"), enabled: open && canEdit, staleTime: 60_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    // a etapa do pedido pode ter concluído junto
    void qc.invalidateQueries({ queryKey: ["production", "steps", projectId] });
  };
  const cards = (q.data?.data ?? []).filter((c) => !filter.trim() || [c.item.descricao, c.code, c.item.ambiente, c.pieceType?.name].some((v) => v?.toLowerCase().includes(filter.trim().toLowerCase())));
  const all = q.data?.data ?? [];
  return (
    <Card>
      <CardHeader className="cursor-pointer py-3" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2"><Route className="h-4 w-4" />Roteiro por peça{q.data && <span className="font-normal text-muted-foreground">· {all.filter((c) => c.done).length} de {all.length} peças terminadas</span>}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-xs" placeholder="Filtrar por peça, código, ambiente ou tipo" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Link to="/producao/roteiro" className="text-xs text-primary underline">Ver roteiro base e tipos de peça</Link>
          </div>
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando peças…</p>}
          {q.data && !all.length && <p className="text-sm text-muted-foreground">Nenhuma peça neste pedido. Cadastre os itens de produção abaixo (ou importe do Promob).</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {cards.map((c) => <PieceCardView key={c.itemId} card={c} canEdit={canEdit} types={(config.data?.data.types ?? []).filter((t) => t.active)} onChange={refresh} />)}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function PieceCardView({ card, canEdit, types, onChange }: { card: PieceCard; canEdit: boolean; types: { id: string; name: string }[]; onChange: () => void }) {
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setType = useMutation({
    mutationFn: (v: { pieceTypeId: string | null; source: "LABEL" | "MANUAL" }) => apiPatch(`/production/piece-routes/${card.itemId}/type`, v),
    onSuccess: () => { toast.success("Tipo da peça confirmado"); onChange(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar o tipo")),
  });
  const done = useMutation({
    mutationFn: ({ stepId, photo }: { stepId: string; photo?: File }) => {
      const fd = new FormData();
      if (photo) fd.append("photo", photo);
      return apiPostForm<{ message?: string }>(`/production/piece-routes/${card.itemId}/steps/${stepId}/done`, fd);
    },
    onMutate: ({ stepId }) => setBusyStep(stepId),
    onSettled: () => setBusyStep(null),
    onSuccess: (r) => { toast.success(r.message ?? "Etapa feita"); onChange(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível marcar a etapa")),
  });
  const undo = useMutation({
    mutationFn: (stepId: string) => apiPost(`/production/piece-routes/${card.itemId}/steps/${stepId}/undo`, {}),
    onSuccess: () => { toast.success("Etapa desfeita"); onChange(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível desfazer")),
  });
  const lastDone = [...card.steps].filter((s) => s.status === "DONE").sort((a, b) => b.position - a.position)[0];
  return (
    <div className={cn("rounded-lg border p-3", card.done && "border-emerald-300 bg-emerald-50/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{card.item.quantidade > 1 ? `${card.item.quantidade}x ` : ""}{card.item.descricao}</p>
          <p className="text-xs text-muted-foreground">{[card.code && <span key="c" className="font-mono">{card.code}</span>, card.item.ambiente, card.item.medidas, card.item.modulo && `Mód. ${card.item.modulo}`].filter(Boolean).reduce<React.ReactNode[]>((acc, v, i) => (i ? [...acc, " · ", v] : [v]), [])}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {card.pieceType ? <Badge variant="secondary">{card.pieceType.name}</Badge> : <Badge variant="outline">Sem tipo</Badge>}
        </div>
      </div>
      {canEdit && !card.pieceType && card.suggestedType && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-primary/10 p-2 text-xs">
          Pela etiqueta parece <strong>{card.suggestedType.name}</strong>.
          <Button size="sm" variant="outline" className="h-7" disabled={setType.isPending} onClick={() => setType.mutate({ pieceTypeId: card.suggestedType!.id, source: "LABEL" })}>Confirmar</Button>
        </div>
      )}
      {canEdit && types.length > 0 && (
        <select className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs" value={card.pieceType?.id ?? ""} disabled={setType.isPending} onChange={(e) => setType.mutate({ pieceTypeId: e.target.value || null, source: "MANUAL" })}>
          <option value="">Tipo da peça: roteiro base</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f && photoFor) done.mutate({ stepId: photoFor, photo: f }); setPhotoFor(null); e.target.value = ""; }} />
      <ol className="mt-3 space-y-1.5">
        {card.steps.map((s) => {
          const isCurrent = s.routeStepId === card.currentStepId;
          return (
            <li key={s.routeStepId} className={cn("flex items-start gap-2 rounded-md px-2 py-1 text-sm", isCurrent && "bg-primary/5 ring-1 ring-primary/30", s.status === "NOT_APPLICABLE" && "opacity-50")}>
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", s.status === "DONE" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")}>{s.status === "DONE" ? <Check className="h-3 w-3" /> : nn(s.position)}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", s.status === "NOT_APPLICABLE" && "line-through")}>{s.name}{s.requirePhoto && <Camera className="ml-1 inline h-3 w-3 text-muted-foreground" />}</p>
                {s.instruction && <p className="text-xs text-muted-foreground">{s.instruction}</p>}
                {s.status === "DONE" && <p className="text-[11px] text-muted-foreground">{s.doneBy?.name ?? "—"} · {s.doneAt ? new Date(s.doneAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}{s.hasPhoto && s.progressId && <> · <StepPhotoLink id={s.progressId} /></>}</p>}
                {s.status === "NOT_APPLICABLE" && <p className="text-[11px] text-muted-foreground">não se aplica a este tipo de peça</p>}
              </div>
              {canEdit && isCurrent && (
                <div className="flex shrink-0 gap-1">
                  {!s.requirePhoto && <Button size="sm" className="h-7" disabled={busyStep === s.routeStepId} onClick={() => done.mutate({ stepId: s.routeStepId })}>{busyStep === s.routeStepId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Feita"}</Button>}
                  <Button size="sm" variant={s.requirePhoto ? "default" : "outline"} className="h-7" title="Marcar como feita com foto" disabled={busyStep === s.routeStepId} onClick={() => { setPhotoFor(s.routeStepId); fileRef.current?.click(); }}><Camera className="h-3 w-3" />{s.requirePhoto ? "Foto e feita" : ""}</Button>
                </div>
              )}
              {canEdit && lastDone?.routeStepId === s.routeStepId && (
                <Button size="sm" variant="ghost" className="h-7 shrink-0" title="Desfazer" disabled={undo.isPending} onClick={() => undo.mutate(s.routeStepId)}><Undo2 className="h-3 w-3" /></Button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepPhotoLink({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="text-primary underline" disabled={busy} onClick={() => { setBusy(true); apiObjectUrl(`/production/piece-steps/${id}/photo`).then((u) => window.open(u, "_blank")).catch((e) => toast.error(errorMessage(e, "Foto indisponível"))).finally(() => setBusy(false)); }}>
      ver foto
    </button>
  );
}
