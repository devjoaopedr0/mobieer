import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost, apiPostForm } from "@/services/api";
import { errorMessage } from "@/lib/utils";

type FileKind = "PLANO_CORTE" | "ETIQUETA" | "OUTRO";
type ProductionFile = { id: string; kind: FileKind; kindLabel: string; fileName: string; size: number | null; createdAt: string; uploadedBy: string | null; downloadUrl: string };

const KINDS: { kind: FileKind; label: string }[] = [
  { kind: "PLANO_CORTE", label: "Plano de corte" },
  { kind: "ETIQUETA", label: "Etiquetas" },
  { kind: "OUTRO", label: "Outro arquivo" },
];
const selectCls = "h-10 w-full rounded-md border bg-background px-2 text-sm";

async function upload(projectId: string, kind: FileKind, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  return apiPostForm<{ data: ProductionFile[]; message?: string }>(`/production/projects/${projectId}/files`, fd);
}

/** Planos de corte, etiquetas e outros arquivos do pedido, enviados direto (PDF, imagem, planilha…). */
export function ProductionFilesCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const key = ["production-files", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<{ data: ProductionFile[] }>(`/production/projects/${projectId}/files`).then((r) => r.data) });
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FileKind>("PLANO_CORTE");

  const send = useMutation({
    mutationFn: async (files: File[]) => {
      let last: { message?: string } = {};
      for (const f of files) last = await upload(projectId, kind, f);
      return { count: files.length, message: last.message };
    },
    onSuccess: (r) => { toast.success(r.count > 1 ? `${r.count} arquivos anexados` : r.message ?? "Arquivo anexado"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível anexar")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/production/files/${id}`),
    onSuccess: () => { toast.success("Arquivo removido"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível remover")),
  });
  const pick = (k: FileKind) => { setKind(k); setTimeout(() => input.current?.click(), 0); };
  const files = q.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Paperclip className="h-4 w-4" /> Planos de corte e etiquetas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { const list = [...(e.target.files ?? [])]; e.target.value = ""; if (list.length) send.mutate(list); }} />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Button key={k.kind} size="sm" variant="outline" disabled={send.isPending} onClick={() => pick(k.kind)}>
                {send.isPending && kind === k.kind ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}{k.label}
              </Button>
            ))}
          </div>
        )}
        {!files.length && <p className="text-xs text-muted-foreground">Nenhum arquivo. Anexe os planos de corte e as etiquetas (PDF, imagem ou planilha) para a fábrica ter tudo aqui.</p>}
        {files.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{f.fileName}</p>
              <p className="text-xs text-muted-foreground">{f.kindLabel} · {new Date(f.createdAt).toLocaleDateString("pt-BR")}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => apiDownload(f.downloadUrl.replace(/^\/api/, ""), f.fileName).catch((e) => toast.error(errorMessage(e, "Falha ao baixar")))}><Download className="mr-1 h-4 w-4" />Baixar</Button>
              {canManage && <Button size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => confirm(`Remover ${f.fileName}?`) && remove.mutate(f.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type Stage = "PRODUCAO" | "PRE_MONTAGEM" | "ENTREGA";
type LegacyForm = { clientId: string; newClient: string; projectName: string; stage: Stage; delivery: string; cut: File[]; labels: File[] };
const STAGES: { value: Stage; label: string }[] = [
  { value: "PRODUCAO", label: "Em produção" },
  { value: "PRE_MONTAGEM", label: "Pré-montagem" },
  { value: "ENTREGA", label: "Saindo para entrega" },
];
const NEW = "__novo__";

/**
 * Projeto antigo que já está na fábrica: entra direto na produção, sem passar
 * por lead, orçamento, contrato e projeto técnico (essas etapas ficam concluídas).
 */
export function LegacyProductionDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const clients = useQuery({ queryKey: ["business-clients", "picklist"], queryFn: () => apiGet<{ data: { id: string; name: string }[] }>("/business/clients"), enabled: open });
  const empty: LegacyForm = { clientId: "", newClient: "", projectName: "", stage: "PRODUCAO", delivery: "", cut: [], labels: [] };
  const [f, setF] = useState<LegacyForm>(empty);
  const save = useMutation({
    mutationFn: async (v: LegacyForm) => {
      const clientId = v.clientId === NEW ? (await apiPost<{ data: { id: string } }>("/business/clients", { name: v.newClient.trim() })).data.id : v.clientId;
      const project = (await apiPost<{ data: { id: string; code: string } }>("/business/projects", { clientId, name: v.projectName.trim() })).data;
      await apiPost(`/projects/${project.id}/timeline/start-at`, { stage: v.stage, note: "Projeto antigo incluído direto na produção" });
      if (v.delivery) await apiPatch(`/production/projects/${project.id}`, { estimatedDeliveryAt: `${v.delivery}T12:00:00` });
      for (const file of v.cut) await upload(project.id, "PLANO_CORTE", file);
      for (const file of v.labels) await upload(project.id, "ETIQUETA", file);
      return project;
    },
    onSuccess: (p) => { toast.success(`Projeto ${p.code} incluído na produção`); setF(empty); onDone(); onClose(); },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível incluir o projeto")),
  });
  const ready = (f.clientId === NEW ? f.newClient.trim().length >= 2 : Boolean(f.clientId)) && f.projectName.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Incluir projeto que já está em produção</DialogTitle>
          <DialogDescription>Para os projetos antigos que já estão andando na fábrica. Eles entram direto aqui, sem passar por orçamento, contrato e projeto técnico.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Cliente *</Label>
            <select className={selectCls} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              <option value="">Escolha</option>
              <option value={NEW}>+ Cliente novo</option>
              {(clients.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {f.clientId === NEW && <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Nome do cliente *</Label><Input value={f.newClient} onChange={(e) => setF({ ...f, newClient: e.target.value })} /></div>}
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Projeto *</Label><Input value={f.projectName} placeholder="Ex.: Cozinha e dormitórios" onChange={(e) => setF({ ...f, projectName: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Onde está agora</Label>
            <select className={selectCls} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}>
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Previsão de entrega</Label><Input type="date" value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Planos de corte</Label><Input type="file" multiple onChange={(e) => setF({ ...f, cut: [...(e.target.files ?? [])] })} /></div>
          <div className="space-y-1"><Label className="text-xs">Etiquetas</Label><Input type="file" multiple onChange={(e) => setF({ ...f, labels: [...(e.target.files ?? [])] })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ready || save.isPending} onClick={() => save.mutate(f)}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Incluir na produção</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
