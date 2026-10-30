import { useQuery } from "@tanstack/react-query";
import { Camera, ImageUp, Loader2, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/camera-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiObjectUrl, apiPostForm } from "@/services/api";
import type { RequisitionLabelSuggestion, RequisitionProjectOption } from "@/types";

/** coluna TIPO da folha (o valor gravado não muda quando o rótulo muda) */
export const SUPPLY_TYPES = [
  { value: "INSUMO", label: "Insumo" },
  { value: "FERRAGEM", label: "Ferragem" },
  { value: "FERRAMENTA", label: "Ferramenta" },
  { value: "PERFIL", label: "Perfil" },
  { value: "PUXADOR", label: "Puxador" },
  { value: "ACESSORIOS", label: "Acessórios" },
  { value: "OUTRO", label: "Outro" },
];
export const SUPPLY_TYPE_LABEL: Record<string, string> = Object.fromEntries(SUPPLY_TYPES.map((t) => [t.value, t.label]));

const mm = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
/** "C 2119 × L 181 × A 6 mm": comprimento, largura e altura (espessura da chapa) */
export function pieceSize(i: { length: number | null; width: number | null; thickness: number | null }) {
  const parts = [i.length != null ? `C ${mm(i.length)}` : "", i.width != null ? `L ${mm(i.width)}` : "", i.thickness != null ? `A ${mm(i.thickness)}` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" × ")} mm` : "";
}

/**
 * Obra: busca os projetos cadastrados. Escolher um preenche cliente e projeto;
 * o texto livre continua valendo para quem não tem projeto no sistema.
 */
export function ProjectPicker({ value, onChange, endpoint = "/requisitions/projects" }: { value: Pick<RequisitionProjectOption, "id" | "code" | "name" | "client"> | null; onChange: (p: RequisitionProjectOption | null) => void; endpoint?: string }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["requisition-projects", endpoint, term],
    queryFn: () => apiGet<{ data: RequisitionProjectOption[] }>(endpoint, { search: term || undefined }),
    enabled: open,
    staleTime: 60_000,
  });
  if (value) {
    return (
      <div className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{value.code} — {value.name}{value.client ? ` · ${value.client.name}` : ""}</span>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Tirar obra" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" value={term} placeholder="Buscar projeto cadastrado (opcional)" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setTerm(e.target.value); setOpen(true); }} />
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {q.isLoading && <p className="p-2 text-xs text-muted-foreground">Buscando…</p>}
          {!q.isLoading && !(q.data?.data ?? []).length && <p className="p-2 text-xs text-muted-foreground">Nenhum projeto. Use os campos Cliente e Projeto/pedido em texto livre.</p>}
          {(q.data?.data ?? []).map((p) => (
            <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p); setTerm(""); setOpen(false); }}>
              <span className="font-medium">{p.code} — {p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.client?.name ?? "Sem cliente"}{p.rooms.length ? ` · ${p.rooms.length} ambiente(s)` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ambiente: os do projeto escolhido aparecem na lista; dá para digitar outro. */
export function RoomInput({ id, value, rooms, onChange }: { id: string; value: string; rooms: string[]; onChange: (v: string) => void }) {
  return (
    <>
      <Input list={rooms.length ? id : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={rooms.length ? "Escolha ou digite" : "Cozinha, quarto…"} />
      {rooms.length > 0 && <datalist id={id}>{rooms.map((r) => <option key={r} value={r} />)}</datalist>}
    </>
  );
}

/** Foto da requisição (rota com login: a imagem vem pelo fetch com o token). */
export function RequisitionPhoto({ id, alt, className = "h-24 w-24" }: { id: string; alt: string; className?: string }) {
  const q = useQuery({ queryKey: ["requisition-photo", id], queryFn: () => apiObjectUrl(`/requisitions/photos/${id}/file`), staleTime: 300_000 });
  if (!q.data) return <div className={`${className} animate-pulse rounded bg-muted`} />;
  return (
    <a href={q.data} target="_blank" rel="noreferrer">
      <img src={q.data} alt={alt} className={`${className} rounded object-cover`} />
    </a>
  );
}

/** Foto escolhida pela câmera do celular ou pelo arquivo (fallback do navegador). */
export function PhotoInput({ file, onFile, label = "Foto (opcional)" }: { file: File | null; onFile: (f: File | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}><Camera className="h-4 w-4" />{file ? "Trocar foto" : label}</Button>
      {file && <p className="truncate text-xs text-muted-foreground">{file.name} <button type="button" className="text-destructive underline" onClick={() => onFile(null)}>tirar</button></p>}
    </div>
  );
}

const SUGGESTION_FIELDS: { key: keyof RequisitionLabelSuggestion; label: string }[] = [
  { key: "clientName", label: "Cliente" },
  { key: "room", label: "Ambiente (projeto da etiqueta)" },
  { key: "pieceCode", label: "Código da peça" },
  { key: "description", label: "Descrição" },
  { key: "length", label: "Comprimento (mm)" },
  { key: "width", label: "Largura (mm)" },
  { key: "thickness", label: "Altura (mm), espessura da chapa" },
  { key: "material", label: "Cor / material" },
  { key: "edgeFinish", label: "Fita" },
  { key: "moduleRef", label: "Módulo" },
  { key: "cutPlanRef", label: "Plano de corte" },
];

/**
 * Foto da etiqueta: abre a câmera (ou escolhe a foto), a IA lê e devolve uma
 * sugestão. O montador confere e só então os campos da peça são preenchidos;
 * o item é gravado quando ele salva a requisição.
 */
export function LabelPhotoDialog({ open, onOpenChange, onUse }: { open: boolean; onOpenChange: (v: boolean) => void; onUse: (r: { photoId: string; suggestion: RequisitionLabelSuggestion | null }) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ photoId: string; suggestion: RequisitionLabelSuggestion | null; message?: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const send = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const r = await apiPostForm<{ data: { photoId: string; suggestion: RequisitionLabelSuggestion | null }; message?: string }>("/requisitions/label-photo", fd);
      setResult({ ...r.data, message: r.message });
      setDraft(Object.fromEntries(SUGGESTION_FIELDS.map((f) => [f.key, r.data.suggestion?.[f.key] == null ? "" : String(r.data.suggestion[f.key])])));
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar a foto");
    } finally {
      setBusy(false);
    }
  };
  const close = (v: boolean) => { if (!v) { setResult(null); setDraft({}); } onOpenChange(v); };
  const num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) || null : null);
  const confirm = () => {
    if (!result) return;
    const t = (k: string) => draft[k]?.trim() || null;
    onUse({
      photoId: result.photoId,
      suggestion: {
        clientName: t("clientName"), room: t("room"), description: t("description"), pieceCode: t("pieceCode"),
        width: num(draft.width ?? ""), length: num(draft.length ?? ""), thickness: num(draft.thickness ?? ""),
        material: t("material"), edgeFinish: t("edgeFinish"), moduleRef: t("moduleRef"), cutPlanRef: t("cutPlanRef"),
      },
    });
    close(false);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Foto da etiqueta da peça</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-3">
            {busy ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Lendo a etiqueta…</div>
            ) : (
              <>
                <CameraScanner onPhoto={(f) => void send(f)} />
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }} />
                <Button type="button" variant="ghost" className="w-full" onClick={() => fileRef.current?.click()}><ImageUp className="h-4 w-4" />Escolher foto do aparelho</Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className={result.suggestion ? "rounded-md bg-primary/10 p-2 text-xs" : "rounded-md bg-warning/10 p-2 text-xs"}>{result.message ?? "Confira os campos antes de usar."}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTION_FIELDS.map((f) => (
                <div key={f.key} className={f.key === "description" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
                  <label className="text-xs font-medium">{f.label}</label>
                  <Input value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Os campos da peça só são preenchidos quando você confirma, e a peça só é gravada ao salvar a requisição.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          {result && <Button onClick={confirm}>Conferi, usar na peça</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
