import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PenLine, Search } from "lucide-react";
import { MeasurementAttachments } from "@/components/measurement-attachments";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiObjectUrl } from "@/services/api";

type Drawing = {
  id: string; title: string; mimeType: string; updatedAt: string; createdAt: string; author: string | null;
  visitId: string; visitDate: string | null;
  project: { id: string; code: string; name: string }; client: { id: string; name: string } | null;
};
type Visit = { id: string; scheduledAt: string | null; project?: { id: string; code: string; name: string; clientName: string | null } };

function Thumb({ id, updatedAt }: { id: string; updatedAt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    apiObjectUrl(`/measurements/attachments/${id}/download`).then((u) => { made = u; if (alive) setUrl(u); }).catch(() => undefined);
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id, updatedAt]);
  return <div className="aspect-[16/11] w-full overflow-hidden rounded-md border bg-white">{url && <img src={url} alt="" className="h-full w-full object-contain" />}</div>;
}

const when = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * Os desenhos de todas as medições num lugar só, como os quadros do iPad:
 * busca por cliente, projeto ou nome; clicar abre a medição para continuar o
 * desenho; "Novo desenho" escolhe a medição e abre a prancheta.
 */
export function MeasurementDrawings({ visits, canManage }: { visits: Visit[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = useQuery({ queryKey: ["measurements", "drawings", term], queryFn: () => apiGet<{ data: Drawing[] }>("/measurements/drawings", term ? { q: term } : {}).then((r) => r.data) });
  const [open, setOpen] = useState<{ visitId: string; title: string } | null>(null);
  const [pick, setPick] = useState(false);
  const items = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por cliente, projeto ou nome do desenho" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canManage && (
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => setPick(true)}>
            <PenLine className="h-4 w-4" />Novo desenho
          </button>
        )}
      </div>
      {list.isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
      {!list.isLoading && !items.length && <p className="text-sm text-muted-foreground">{term ? "Nenhum desenho com essa busca." : "Nenhum desenho ainda. Use Novo desenho para escolher a medição e desenhar na prancheta."}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((d) => (
          <button key={d.id} type="button" className="space-y-1 rounded-lg border bg-card p-2 text-left hover:border-primary" onClick={() => setOpen({ visitId: d.visitId, title: `${d.client?.name ?? d.project.name} — ${d.project.code}` })}>
            <Thumb id={d.id} updatedAt={d.updatedAt} />
            <p className="truncate text-sm font-medium">{d.title}</p>
            <p className="truncate text-xs text-muted-foreground">{d.client?.name ?? "—"} · {d.project.name}</p>
            <p className="text-[11px] text-muted-foreground">{when(d.updatedAt)}{d.author ? ` · ${d.author}` : ""}</p>
          </button>
        ))}
      </div>

      <Dialog open={pick} onOpenChange={setPick}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo desenho</DialogTitle>
            <DialogDescription>Escolha a medição do cliente. Depois, na aba Desenho, clique em Novo desenho.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {!visits.length && <p className="text-muted-foreground">Nenhuma medição cadastrada. Crie a medição do cliente primeiro.</p>}
            {visits.map((v) => (
              <button key={v.id} type="button" className="flex w-full justify-between gap-2 rounded-md border px-3 py-2 text-left hover:border-primary" onClick={() => { setPick(false); setOpen({ visitId: v.id, title: `${v.project?.clientName ?? v.project?.name ?? "Medição"}${v.project ? ` — ${v.project.code}` : ""}` }); }}>
                <span className="truncate">{v.project?.clientName ? `${v.project.clientName} · ` : ""}{v.project?.name ?? "Medição"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{v.scheduledAt ? when(v.scheduledAt) : "sem data"}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>Desenhos e anexos desta medição. Clique no lápis para continuar um desenho.</DialogDescription>
          </DialogHeader>
          {open && <MeasurementAttachments visitId={open.visitId} canManage={canManage} initialTab="desenho" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
