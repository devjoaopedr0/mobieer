import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Eye, FileText, Loader2, Plus, Save, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiObjectUrl, apiOpen, apiPost, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/utils";

type Kind = "MDF" | "METALURGIA" | "USINAGEM" | "OUTRO";
type Finish = { name: string; kind: Kind; color: string | null };
type Room = { room: string; include: boolean; finishes: Finish[]; text: string; renderIds: string[] };
type Data = { designer: string; note: string; rooms: Room[]; processes: { title: string; detail: string }[] };
type Payload = { saved: boolean; data: Data; renders: { id: string; room: string; createdAt: string }[]; ai: boolean; document: { id: string; version: number; createdAt: string } | null };

const KIND_LABEL: Record<Kind, string> = { MDF: "MDF", METALURGIA: "Metalurgia", USINAGEM: "Usinagem", OUTRO: "Outro" };

/** Miniatura do render (a imagem precisa do login). */
function Thumb({ projectId, id }: { projectId: string; id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    apiObjectUrl(`/production/projects/${projectId}/renders/${id}/result`).then((u) => { made = u; if (alive) setUrl(u); }).catch(() => undefined);
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [projectId, id]);
  return url ? <img src={url} alt="" className="h-20 w-28 rounded object-cover" /> : <div className="h-20 w-28 rounded bg-muted" />;
}

/**
 * Descritiva do projeto: a apresentação por ambiente (moodboard com os
 * acabamentos, imagens 3D com o texto dos móveis e os processos). Os dados vêm
 * do orçamento; a IA escreve o texto e sugere as cores; o PDF vai para os
 * documentos do projeto.
 */
export function DescriptivePanel({ projectId, canManage, onPublished }: { projectId: string; canManage: boolean; onPublished: () => void }) {
  const qc = useQueryClient();
  const base = `/production/projects/${projectId}/descriptive`;
  const key = ["descriptive", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: Payload }>(base).then((r) => r.data) });
  const [form, setForm] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (q.data && !form) setForm(q.data.data); }, [q.data, form]);
  const edit = (f: Data) => { setForm(f); setDirty(true); };
  const setRoom = (i: number, r: Partial<Room>) => form && edit({ ...form, rooms: form.rooms.map((x, k) => (k === i ? { ...x, ...r } : x)) });

  const save = useMutation({
    mutationFn: () => apiPut<{ message?: string }>(base, form),
    onSuccess: (r) => { toast.success(r.message ?? "Descritiva salva"); setDirty(false); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível salvar")),
  });
  const ai = useMutation({
    mutationFn: () => apiPost<{ data: { data: Data; updated: number }; message?: string }>(`${base}/ai`, form),
    onSuccess: (r) => { edit(r.data.data); toast.success(r.message ?? "Texto escrito pela IA", { duration: 8000 }); },
    onError: (e) => toast.error(errorMessage(e, "A IA não conseguiu escrever agora")),
  });
  const publish = useMutation({
    mutationFn: async () => { if (dirty) await apiPut(base, form); return apiPost<{ message?: string }>(`${base}/publish`, {}); },
    onSuccess: (r) => { toast.success(r.message ?? "Descritiva publicada"); setDirty(false); qc.invalidateQueries({ queryKey: key }); onPublished(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível publicar")),
  });
  const preview = async () => {
    try {
      if (dirty) { await apiPut(base, form); setDirty(false); }
      await apiOpen(`${base}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível abrir o PDF"));
    }
  };

  if (q.isLoading || !form) return null;
  const d = q.data!;
  const busy = save.isPending || ai.isPending || publish.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Descritiva</CardTitle>
          <p className="text-xs text-muted-foreground">Apresentação por ambiente: acabamentos, imagens 3D com a descrição dos móveis e os processos. Vem do orçamento; a IA escreve o texto.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.document && <Badge variant="success">Publicada · versão {d.document.version}</Badge>}
          {!d.saved && <Badge variant="secondary">sugestão do orçamento</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!form.rooms.length && <p className="text-muted-foreground">O projeto ainda não tem orçamento com ambientes. Crie o orçamento para montar a descritiva.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label className="text-xs">Projetista</Label><Input value={form.designer} disabled={!canManage} onChange={(e) => edit({ ...form, designer: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Aviso em vermelho no moodboard</Label><Input value={form.note} disabled={!canManage} onChange={(e) => edit({ ...form, note: e.target.value })} /></div>
        </div>

        {form.rooms.map((r, i) => {
          const isOpen = open === r.room;
          const roomRenders = d.renders.filter((x) => x.room.trim().toLowerCase() === r.room.toLowerCase());
          const others = d.renders.filter((x) => !roomRenders.includes(x));
          return (
            <div key={r.room} className="rounded-md border">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button type="button" className="flex items-center gap-1 font-medium" onClick={() => setOpen(isOpen ? null : r.room)}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{r.room}
                </button>
                <span className="text-xs text-muted-foreground">{r.finishes.length} acabamentos · {r.renderIds.length} {r.renderIds.length === 1 ? "imagem" : "imagens"}{r.text.trim() ? "" : " · sem texto"}</span>
                <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={r.include} disabled={!canManage} onChange={(e) => setRoom(i, { include: e.target.checked })} />Entra na descritiva</label>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição dos móveis (uma peça por linha)</Label>
                    <Textarea rows={6} value={r.text} disabled={!canManage} onChange={(e) => setRoom(i, { text: e.target.value })} placeholder="ARMÁRIO ALTO COM 3 PORTAS DE GIRO EM MDF 15MM CINZA CRISTAL." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Acabamentos do moodboard</Label>
                    <div className="space-y-2">
                      {r.finishes.map((f, k) => (
                        <div key={k} className="flex flex-wrap items-center gap-2">
                          <input type="color" className="h-9 w-10 rounded border" value={f.color ?? "#EFEFEF"} disabled={!canManage} onChange={(e) => setRoom(i, { finishes: r.finishes.map((x, j) => (j === k ? { ...x, color: e.target.value.toUpperCase() } : x)) })} title="Cor do quadradinho" />
                          <Input className="h-9 min-w-40 flex-1" value={f.name} disabled={!canManage} onChange={(e) => setRoom(i, { finishes: r.finishes.map((x, j) => (j === k ? { ...x, name: e.target.value.toUpperCase() } : x)) })} />
                          <select className="h-9 rounded-md border bg-background px-2" value={f.kind} disabled={!canManage} onChange={(e) => setRoom(i, { finishes: r.finishes.map((x, j) => (j === k ? { ...x, kind: e.target.value as Kind } : x)) })}>
                            {(Object.keys(KIND_LABEL) as Kind[]).map((kk) => <option key={kk} value={kk}>{KIND_LABEL[kk]}</option>)}
                          </select>
                          {f.color && canManage && <Button size="sm" variant="ghost" onClick={() => setRoom(i, { finishes: r.finishes.map((x, j) => (j === k ? { ...x, color: null } : x)) })}>sem cor</Button>}
                          {canManage && <Button size="icon" variant="ghost" onClick={() => setRoom(i, { finishes: r.finishes.filter((_, j) => j !== k) })}><X className="h-4 w-4" /></Button>}
                        </div>
                      ))}
                      {canManage && r.finishes.length < 16 && <Button size="sm" variant="outline" onClick={() => setRoom(i, { finishes: [...r.finishes, { name: "", kind: "MDF", color: null }] })}><Plus className="mr-1 h-4 w-4" />Acabamento</Button>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Imagens 3D (renders do projeto)</Label>
                    {!d.renders.length && <p className="text-xs text-muted-foreground">O projeto ainda não tem imagens 3D. Gere na aba de renders com a IA e elas aparecem aqui.</p>}
                    <div className="flex flex-wrap gap-2">
                      {[...roomRenders, ...others].map((x) => {
                        const on = r.renderIds.includes(x.id);
                        return (
                          <label key={x.id} className={`cursor-pointer rounded-md border-2 p-1 ${on ? "border-primary" : "border-transparent"}`}>
                            <input type="checkbox" className="hidden" checked={on} disabled={!canManage} onChange={() => setRoom(i, { renderIds: on ? r.renderIds.filter((y) => y !== x.id) : [...r.renderIds, x.id].slice(0, 8) })} />
                            <Thumb projectId={projectId} id={x.id} />
                            <span className="block w-28 truncate text-[11px] text-muted-foreground">{x.room}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2">
          {canManage && d.ai && <Button variant="outline" disabled={busy || !form.rooms.some((r) => r.include)} onClick={() => ai.mutate()}>{ai.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Escrever com IA</Button>}
          {canManage && <Button variant="outline" disabled={busy || !dirty} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />Salvar</Button>}
          <Button variant="outline" disabled={busy || !form.rooms.length} onClick={() => void preview()}><Eye className="mr-1 h-4 w-4" />Conferir PDF</Button>
          {canManage && <Button disabled={busy || !form.rooms.some((r) => r.include)} onClick={() => publish.mutate()}>{publish.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{d.document ? "Publicar nova versão" : "Publicar nos documentos"}</Button>}
        </div>
        {canManage && !d.ai && <p className="text-xs text-muted-foreground">A IA de texto não está configurada no servidor: o texto vem do orçamento e pode ser escrito à mão.</p>}
      </CardContent>
    </Card>
  );
}
