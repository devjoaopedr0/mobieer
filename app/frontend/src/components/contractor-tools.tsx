import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, FileSignature, Loader2, Plus, Send, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiObjectUrl, apiPost, apiPostForm } from "@/services/api";
import { compressImage } from "@/lib/image";
import { errorMessage } from "@/lib/utils";

type Tool = { id: string; name: string; quantity: number; notes: string | null; status: string; receivedAt: string; from: string | null; releasedAt: string | null; releasedTo: string | null; hasReleasedPhoto: boolean };
type ToolsView = { holding: Tool[]; history: Tool[]; term: { current: boolean; lastSignedAt: string | null; pendingDocumentId: string | null } };
type MyToolsView = ToolsView & { catalog: string[]; colleagues: { id: string; name: string }[] };

const selectCls = "h-10 w-full rounded-md border bg-background px-2 text-sm";
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");
const OTHER = "__outra__";

/** Foto protegida (precisa do login): baixa e mostra. */
function ToolPhoto({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    apiObjectUrl(path)
      .then((u) => { made = u; if (alive) setUrl(u); })
      .catch(() => undefined);
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className={className ?? "h-16 w-16 rounded-md object-cover"} /></a>
  ) : (
    <div className={`${className ?? "h-16 w-16"} flex items-center justify-center rounded-md bg-muted`}><Camera className="h-4 w-4 text-muted-foreground" /></div>
  );
}

/** Campo de foto: no celular abre a câmera. */
function PhotoField({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <Label className="text-xs">Foto *</Label>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" className="h-12 w-full" onClick={() => ref.current?.click()}>
        <Camera className="mr-2 h-4 w-4" />{file ? file.name : "Tirar foto"}
      </Button>
    </div>
  );
}

/** Área do montador: o que está comigo, com foto, e o termo para assinar. */
export function MyTools({ onOpenDocuments }: { onOpenDocuments: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me", "tools"], queryFn: () => apiGet<{ data: MyToolsView }>("/me/contractor/tools").then((r) => r.data) });
  const [adding, setAdding] = useState<{ pick: string; other: string; quantity: string; notes: string; photo: File | null } | null>(null);
  const [releasing, setReleasing] = useState<{ tool: Tool; to: string; toName: string; photo: File | null } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["me", "tools"] });
    qc.invalidateQueries({ queryKey: ["me-contractor-documents"] });
  };

  const add = useMutation({
    mutationFn: async (f: NonNullable<typeof adding>) => {
      const fd = new FormData();
      fd.append("name", f.pick === OTHER ? f.other.trim() : f.pick);
      fd.append("quantity", f.quantity || "1");
      if (f.notes.trim()) fd.append("notes", f.notes.trim());
      fd.append("photo", await compressImage(f.photo!));
      return apiPostForm<{ message?: string }>("/me/contractor/tools", fd);
    },
    onSuccess: (r) => { toast.success(r.message ?? "Ferramenta registrada"); setAdding(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível registrar")),
  });
  const release = useMutation({
    mutationFn: async (f: NonNullable<typeof releasing>) => {
      const fd = new FormData();
      if (f.to === OTHER) fd.append("toName", f.toName.trim());
      else if (f.to === "EMPRESA") fd.append("toName", "Devolvida à empresa");
      else fd.append("toContractorId", f.to);
      fd.append("photo", await compressImage(f.photo!));
      return apiPostForm<{ message?: string }>(`/me/contractor/tools/${f.tool.id}/release`, fd);
    },
    onSuccess: (r) => { toast.success(r.message ?? "Retirada registrada"); setReleasing(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível registrar a retirada")),
  });
  const term = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/me/contractor/tools/term", {}),
    onSuccess: (r) => { toast.success(r.message ?? "Termo gerado"); refresh(); onOpenDocuments(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível gerar o termo")),
  });

  if (q.isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const d = q.data;
  if (!d) return <p className="text-sm text-muted-foreground">Não foi possível carregar.</p>;
  const addName = adding ? (adding.pick === OTHER ? adding.other.trim() : adding.pick) : "";

  return (
    <div className="space-y-4">
      <Card className={d.term.current ? "" : "border-warning"}>
        <CardContent className="space-y-3 pt-6 text-sm">
          {d.holding.length === 0 ? (
            <p className="text-muted-foreground">Marque as ferramentas da empresa que estão com você, com uma foto de cada. Depois assine o termo.</p>
          ) : d.term.current ? (
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />Termo assinado em {day(d.term.lastSignedAt)}. Está tudo em dia.</p>
          ) : d.term.pendingDocumentId ? (
            <p>Seu termo está esperando a assinatura em <strong>Documentos</strong>. Se você mudou alguma ferramenta depois, gere de novo.</p>
          ) : (
            <p>{d.term.lastSignedAt ? "Você mudou as ferramentas depois da última assinatura. Assine o termo de novo." : "Confira a lista abaixo e assine o termo com as ferramentas que estão com você."}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => setAdding({ pick: d.catalog[0] ?? OTHER, other: "", quantity: "1", notes: "", photo: null })}><Plus className="mr-1 h-4 w-4" />Marcar ferramenta</Button>
            {d.holding.length > 0 && !d.term.current && (
              <Button className="h-11" variant={d.term.pendingDocumentId ? "outline" : "default"} disabled={term.isPending} onClick={() => term.mutate()}>
                {term.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}{d.term.pendingDocumentId ? "Gerar o termo de novo" : "Gerar e assinar o termo"}
              </Button>
            )}
            {d.term.pendingDocumentId && <Button className="h-11" onClick={onOpenDocuments}>Ir para Documentos</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Estão comigo ({d.holding.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!d.holding.length && <p className="text-sm text-muted-foreground">Nenhuma ferramenta marcada.</p>}
          {d.holding.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-md border p-2">
              <ToolPhoto path={`/me/contractor/tools/${t.id}/photo`} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{t.name}{t.quantity > 1 ? ` (${t.quantity})` : ""}</p>
                <p className="text-xs text-muted-foreground">desde {day(t.receivedAt)}{t.from ? ` · recebida de ${t.from}` : ""}{t.notes ? ` · ${t.notes}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" className="h-10" onClick={() => setReleasing({ tool: t, to: d.colleagues[0]?.id ?? "EMPRESA", toName: "", photo: null })}><Send className="mr-1 h-4 w-4" />Retirar</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {d.history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Retiradas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {d.history.map((t) => <p key={t.id} className="text-muted-foreground">{day(t.releasedAt)} · {t.name} → {t.releasedTo}</p>)}
          </CardContent>
        </Card>
      )}

      <Dialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar ferramenta</DialogTitle>
            <DialogDescription>Escolha a ferramenta que está com você e tire uma foto dela.</DialogDescription>
          </DialogHeader>
          {adding && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1"><Label className="text-xs">Ferramenta</Label>
                <select className={selectCls} value={adding.pick} onChange={(e) => setAdding({ ...adding, pick: e.target.value })}>
                  {d.catalog.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value={OTHER}>Outra…</option>
                </select>
              </div>
              {adding.pick === OTHER && <div className="space-y-1"><Label className="text-xs">Qual?</Label><Input value={adding.other} onChange={(e) => setAdding({ ...adding, other: e.target.value })} /></div>}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><Label className="text-xs">Quantidade</Label><Input type="number" min={1} max={99} value={adding.quantity} onChange={(e) => setAdding({ ...adding, quantity: e.target.value })} /></div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Observação</Label><Input value={adding.notes} placeholder="Ex.: marca, estado" onChange={(e) => setAdding({ ...adding, notes: e.target.value })} /></div>
              </div>
              <PhotoField file={adding.photo} onChange={(photo) => setAdding({ ...adding, photo })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>Cancelar</Button>
            <Button disabled={!adding || addName.length < 2 || !adding.photo || add.isPending} onClick={() => adding && add.mutate(adding)}>{add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={releasing !== null} onOpenChange={(o) => !o && setReleasing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retirar: {releasing?.tool.name}</DialogTitle>
            <DialogDescription>Diga para quem a ferramenta vai e tire a foto dela saindo. Se for para outro montador, ela entra na lista dele.</DialogDescription>
          </DialogHeader>
          {releasing && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1"><Label className="text-xs">Para quem</Label>
                <select className={selectCls} value={releasing.to} onChange={(e) => setReleasing({ ...releasing, to: e.target.value })}>
                  {d.colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="EMPRESA">Devolver à empresa</option>
                  <option value={OTHER}>Outra pessoa…</option>
                </select>
              </div>
              {releasing.to === OTHER && <div className="space-y-1"><Label className="text-xs">Nome</Label><Input value={releasing.toName} onChange={(e) => setReleasing({ ...releasing, toName: e.target.value })} /></div>}
              <PhotoField file={releasing.photo} onChange={(photo) => setReleasing({ ...releasing, photo })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleasing(null)}>Cancelar</Button>
            <Button disabled={!releasing || !releasing.photo || (releasing.to === OTHER && releasing.toName.trim().length < 2) || release.isPending} onClick={() => releasing && release.mutate(releasing)}>{release.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar retirada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Gestão: ferramentas que estão com o montador e a situação do termo. */
export function ContractorToolsCard({ contractorId }: { contractorId: string }) {
  const q = useQuery({ queryKey: ["contractor-tools", contractorId], queryFn: () => apiGet<{ data: ToolsView }>(`/contractors/${contractorId}/tools`).then((r) => r.data), enabled: Boolean(contractorId) });
  const d = q.data;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Ferramentas com o montador</CardTitle>
        {d && d.holding.length > 0 && (d.term.current ? <Badge variant="success">Termo assinado em {day(d.term.lastSignedAt)}</Badge> : <Badge variant="warning">Termo sem assinatura atualizada</Badge>)}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {q.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {d && !d.holding.length && <p className="text-muted-foreground">Nenhuma ferramenta marcada. O montador marca na área dele, aba Ferramentas, com foto.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {d?.holding.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-md border p-2">
              <ToolPhoto path={`/contractors/tools/${t.id}/photo`} />
              <div className="min-w-0">
                <p className="font-medium">{t.name}{t.quantity > 1 ? ` (${t.quantity})` : ""}</p>
                <p className="text-xs text-muted-foreground">desde {day(t.receivedAt)}{t.from ? ` · de ${t.from}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
        {d && d.history.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">Retiradas ({d.history.length})</summary>
            <div className="mt-2 space-y-2">
              {d.history.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  {t.hasReleasedPhoto && <ToolPhoto path={`/contractors/tools/${t.id}/photo?kind=released`} className="h-12 w-12 rounded-md object-cover" />}
                  <span className="text-xs">{day(t.releasedAt)} · {t.name} → {t.releasedTo}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** Gestão: gerar contrato, código de conduta etc. a partir de um modelo, já com os dados do montador. */
export function GenerateContractorDocument({ contractorId, open, onClose, onDone }: { contractorId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const templates = useQuery({
    queryKey: ["templates", "com-texto"],
    queryFn: () => apiGet<{ data: { id: string; name: string; hasBody: boolean; active: boolean }[] }>("/templates"),
    enabled: open,
    select: (r) => r.data.filter((t) => t.active && t.hasBody),
  });
  const [templateId, setTemplateId] = useState("");
  const [kind, setKind] = useState("REGRAS_EMPRESA");
  const list = templates.data ?? [];
  const chosen = list.find((t) => t.id === templateId) ?? null;
  useEffect(() => {
    if (!chosen) return;
    const n = chosen.name.toLowerCase();
    setKind(n.includes("contrato") ? "CONTRATO" : n.includes("ferrament") ? "TERMO_RESPONSABILIDADE" : n.includes("regulamento") ? "REGULAMENTO_INTERNO" : "REGRAS_EMPRESA");
  }, [chosen]);
  const gen = useMutation({
    mutationFn: () => apiPost<{ message?: string }>(`/contractors/${contractorId}/documents/from-template`, { templateId, kind, send: true }),
    onSuccess: (r) => { toast.success(r.message ?? "Documento gerado", { duration: 9000 }); onDone(); onClose(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível gerar")),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar documento para assinar</DialogTitle>
          <DialogDescription>O sistema preenche o modelo com o nome e o CPF do montador, gera o PDF e envia para ele assinar na área dele.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1"><Label className="text-xs">Modelo</Label>
            <select className={selectCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Escolha</option>
              {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Tipo</Label>
            <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="CONTRATO">Contrato</option>
              <option value="REGRAS_EMPRESA">Código de conduta / regras</option>
              <option value="REGULAMENTO_INTERNO">Regulamento interno</option>
              <option value="TERMO_RESPONSABILIDADE">Termo de responsabilidade</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">O modelo do contrato do montador ainda precisa ser cadastrado em Modelos de documentos. O termo de ferramentas é gerado pelo próprio montador, com as fotos.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!templateId || gen.isPending} onClick={() => gen.mutate()}>{gen.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar e enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
