import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRightLeft, Camera, CheckCircle2, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiPatch, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileAttachments } from "@/components/file-attachments";

export type RoomStatus = "NAO_VISTORIADO" | "APROVADO" | "COM_PENDENCIA" | "REPROVADO";
type PendencyKind = "PECA_FALTANTE" | "MUDANCA_AMBIENTE" | "OUTRA";
export type InspectionRoom = {
  id: string;
  name: string;
  status: RoomStatus;
  note: string | null;
  updatedBy: string | null;
  photoCount: number;
  pendencies: {
    id: string;
    kind: PendencyKind;
    description: string;
    targetRoomName: string | null;
    status: "ABERTA" | "RESOLVIDA";
    resolutionNote: string | null;
    createdAt: string;
    createdBy: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    transfers: { from: string; to: string; reason: string | null; by: string | null; at: string }[];
  }[];
};

const STATUS: { key: RoomStatus; label: string; cls: string }[] = [
  { key: "APROVADO", label: "Concluído", cls: "data-[on=true]:bg-success data-[on=true]:text-white" },
  { key: "COM_PENDENCIA", label: "Com pendência", cls: "data-[on=true]:bg-warning data-[on=true]:text-white" },
  { key: "REPROVADO", label: "Reprovado", cls: "data-[on=true]:bg-destructive data-[on=true]:text-white" },
];
const KIND: { key: PendencyKind; label: string }[] = [
  { key: "PECA_FALTANTE", label: "Peça faltante" },
  { key: "MUDANCA_AMBIENTE", label: "Mudança de ambiente" },
  { key: "OUTRA", label: "Outra" },
];
const kindLabel = (k: PendencyKind) => KIND.find((x) => x.key === k)?.label ?? "Pendência";
const selectCls = "h-8 rounded-md border bg-background px-2 text-xs";
const fail = (msg: string) => (e: unknown) => toast.error(errorMessage(e, msg));

/**
 * Vistoria por ambiente: situação, fotos pelo celular e pendências de cada um.
 * Peça faltante em aberto não deixa concluir o ambiente; uma pendência pode
 * passar para outro ambiente e a passagem fica registrada.
 */
export function InspectionRooms({ inspectionId, rooms, canEdit, draft, onChanged }: { inspectionId: string; rooms: InspectionRoom[]; canEdit: boolean; draft: boolean; onChanged: () => void }) {
  const [newRoom, setNewRoom] = useState("");
  const done = (r: { message?: string }) => { if (r.message) toast.success(r.message); onChanged(); };
  const add = useMutation({
    mutationFn: () => apiPost<{ message?: string }>(`/aftersales/inspections/${inspectionId}/rooms`, { name: newRoom.trim() }),
    onSuccess: (r) => { setNewRoom(""); done(r); },
    onError: fail("Não foi possível acrescentar o ambiente"),
  });
  const open = rooms.reduce((n, r) => n + r.pendencies.filter((p) => p.status === "ABERTA").length, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Ambientes</p>
        <span className="text-xs text-muted-foreground">
          {rooms.filter((r) => r.status === "APROVADO").length}/{rooms.length} concluído(s){open ? ` · ${open} pendência(s) em aberto` : ""}
        </span>
      </div>
      {!rooms.length && <p className="text-xs text-muted-foreground">Nenhum ambiente nesta vistoria. Acrescente abaixo para vistoriar ambiente por ambiente.</p>}
      {rooms.map((r) => (
        <RoomCard key={r.id} room={r} rooms={rooms} canEdit={canEdit} draft={draft} onDone={done} />
      ))}
      {canEdit && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newRoom.trim()) add.mutate(); }}>
          <Input className="h-8 text-sm" value={newRoom} placeholder="Acrescentar ambiente (ex.: Varanda)" onChange={(e) => setNewRoom(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" disabled={!newRoom.trim() || add.isPending}><Plus className="h-4 w-4" /> Ambiente</Button>
        </form>
      )}
    </div>
  );
}

function RoomCard({ room: r, rooms, canEdit, draft, onDone }: { room: InspectionRoom; rooms: InspectionRoom[]; canEdit: boolean; draft: boolean; onDone: (r: { message?: string }) => void }) {
  const [note, setNote] = useState(r.note ?? "");
  const [photos, setPhotos] = useState(false);
  const [adding, setAdding] = useState<{ kind: PendencyKind; description: string; target: string } | null>(null);
  const [moving, setMoving] = useState<{ id: string; to: string; reason: string } | null>(null);
  const missing = r.pendencies.filter((p) => p.status === "ABERTA" && p.kind === "PECA_FALTANTE").length;

  const patch = useMutation({ mutationFn: (body: { status?: RoomStatus; note?: string | null }) => apiPatch<{ message?: string }>(`/aftersales/inspection-rooms/${r.id}`, body), onSuccess: onDone, onError: fail("Não foi possível salvar o ambiente") });
  const remove = useMutation({ mutationFn: () => apiDelete<{ message?: string }>(`/aftersales/inspection-rooms/${r.id}`), onSuccess: onDone, onError: fail("Não foi possível retirar o ambiente") });
  const addPendency = useMutation({
    mutationFn: (v: { kind: PendencyKind; description: string; target: string }) =>
      apiPost<{ message?: string }>(`/aftersales/inspection-rooms/${r.id}/pendencies`, { kind: v.kind, description: v.description.trim(), targetRoomName: v.target.trim() || null }),
    onSuccess: (res) => { setAdding(null); onDone(res); },
    onError: fail("Não foi possível registrar a pendência"),
  });
  const setPendency = useMutation({
    mutationFn: (v: { id: string; status: "ABERTA" | "RESOLVIDA" }) => apiPatch<{ message?: string }>(`/aftersales/inspection-pendencies/${v.id}`, { status: v.status }),
    onSuccess: onDone,
    onError: fail("Não foi possível alterar a pendência"),
  });
  const transfer = useMutation({
    mutationFn: (v: { id: string; to: string; reason: string }) => apiPost<{ message?: string }>(`/aftersales/inspection-pendencies/${v.id}/transfer`, { toRoomId: v.to, reason: v.reason.trim() || null }),
    onSuccess: (res) => { setMoving(null); onDone(res); },
    onError: fail("Não foi possível passar a pendência"),
  });

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">{r.name}</span>
        <span className="flex flex-wrap gap-1">
          {STATUS.map((s) => {
            const blocked = s.key === "APROVADO" && missing > 0;
            return (
              <button
                key={s.key}
                type="button"
                disabled={!canEdit || patch.isPending || blocked}
                title={blocked ? "Há peça faltante em aberto neste ambiente" : undefined}
                data-on={r.status === s.key}
                aria-pressed={r.status === s.key}
                onClick={() => r.status !== s.key && patch.mutate({ status: s.key })}
                className={cn("h-7 rounded-md border px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50", s.cls)}
              >
                {s.label}
              </button>
            );
          })}
          {canEdit && draft && !r.pendencies.length && (
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Retirar ${r.name}`} disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="h-3.5 w-3.5" /></Button>
          )}
        </span>
      </div>
      <div className="space-y-2 px-3 py-2">
        {missing > 0 && <p className="text-xs text-warning">{missing} peça(s) faltante(s) em aberto: a montagem pode seguir, mas o ambiente só é concluído depois.</p>}
        <div className="flex gap-2">
          <Input className="h-8 text-xs" disabled={!canEdit} placeholder="Observação do ambiente" value={note} onChange={(e) => setNote(e.target.value)} />
          {canEdit && note !== (r.note ?? "") && <Button size="sm" variant="outline" className="h-8" disabled={patch.isPending} onClick={() => patch.mutate({ note: note || null })}>Salvar</Button>}
        </div>

        {r.pendencies.length > 0 && (
          <ul className="space-y-1.5">
            {r.pendencies.map((p) => (
              <li key={p.id} className={cn("rounded-md border px-2 py-1.5 text-xs", p.status === "RESOLVIDA" && "opacity-60")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className={p.status === "RESOLVIDA" ? "line-through" : ""}>
                    <Badge variant={p.kind === "PECA_FALTANTE" ? "warning" : "secondary"} className="mr-1">{kindLabel(p.kind)}</Badge>
                    {p.description}
                    {p.kind === "MUDANCA_AMBIENTE" && p.targetRoomName && <span className="text-muted-foreground"> → {p.targetRoomName}</span>}
                  </span>
                  {canEdit && (
                    <span className="flex gap-1">
                      {p.status === "ABERTA" && rooms.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setMoving({ id: p.id, to: "", reason: "" })}><ArrowRightLeft className="h-3 w-3" /> Outro ambiente</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={setPendency.isPending} onClick={() => setPendency.mutate({ id: p.id, status: p.status === "ABERTA" ? "RESOLVIDA" : "ABERTA" })}>
                        {p.status === "ABERTA" ? <><CheckCircle2 className="h-3 w-3" /> Resolver</> : <><RotateCcw className="h-3 w-3" /> Reabrir</>}
                      </Button>
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Aberta em {formatDate(p.createdAt)}{p.createdBy ? ` por ${p.createdBy}` : ""}
                  {p.resolvedAt ? ` · resolvida em ${formatDate(p.resolvedAt)}${p.resolvedBy ? ` por ${p.resolvedBy}` : ""}` : ""}
                </p>
                {p.transfers.map((t, k) => (
                  <p key={k} className="text-muted-foreground">Passada de {t.from} para {t.to} em {formatDate(t.at)}{t.by ? ` por ${t.by}` : ""}{t.reason ? ` — ${t.reason}` : ""}</p>
                ))}
                {moving?.id === p.id && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <select className={selectCls} aria-label="Para qual ambiente" value={moving.to} onChange={(e) => setMoving({ ...moving, to: e.target.value })}>
                      <option value="">Para qual ambiente?</option>
                      {rooms.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <Input className="h-8 min-w-[10rem] flex-1 text-xs" placeholder="Motivo (opcional)" value={moving.reason} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} />
                    <Button size="sm" className="h-8" disabled={!moving.to || transfer.isPending} onClick={() => transfer.mutate(moving)}>{transfer.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Passar</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setMoving(null)}>Cancelar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (adding ? (
          <div className="flex flex-wrap gap-1.5">
            <select className={selectCls} aria-label="Tipo da pendência" value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as PendencyKind })}>
              {KIND.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <Input className="h-8 min-w-[12rem] flex-1 text-xs" autoFocus placeholder={adding.kind === "PECA_FALTANTE" ? "Qual peça (ex.: porta do aéreo 2)" : "Descreva a pendência"} value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} />
            {adding.kind === "MUDANCA_AMBIENTE" && (
              <>
                <Input className="h-8 w-40 text-xs" list={`rooms-${r.id}`} placeholder="Vai para qual ambiente" value={adding.target} onChange={(e) => setAdding({ ...adding, target: e.target.value })} />
                <datalist id={`rooms-${r.id}`}>{rooms.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.name} />)}</datalist>
              </>
            )}
            <Button size="sm" className="h-8" disabled={adding.description.trim().length < 2 || (adding.kind === "MUDANCA_AMBIENTE" && !adding.target.trim()) || addPendency.isPending} onClick={() => addPendency.mutate(adding)}>
              {addPendency.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Registrar
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(null)}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding({ kind: "PECA_FALTANTE", description: "", target: "" })}><Plus className="h-3 w-3" /> Pendência</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPhotos((v) => !v)}><Camera className="h-3 w-3" /> Fotos ({r.photoCount})</Button>
          </div>
        ))}
        {!canEdit && r.photoCount > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPhotos((v) => !v)}><Camera className="h-3 w-3" /> Fotos ({r.photoCount})</Button>}
        {photos && <FileAttachments entity="SiteInspectionRoom" entityId={r.id} canWrite={canEdit} category="FOTO" onChange={() => onDone({})} />}
        {r.updatedBy && <p className="text-[11px] text-muted-foreground">Última alteração por {r.updatedBy}</p>}
      </div>
    </div>
  );
}
