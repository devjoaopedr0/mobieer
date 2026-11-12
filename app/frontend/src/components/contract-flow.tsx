import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ContractEditor, blocksToHtml, serializeContract, type DocBlock } from "@/components/contract-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDownload, apiGet, apiPost, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";

/** Dados que montam o contrato (cliente, projeto, orçamento, pagamento). */
export type ContractPayload = { clientId: string; projectId?: string | null; quoteId?: string | null } & Record<string, unknown>;
type Options = { tipoPedido: string; prazoDias: number | null; preMontagem: boolean };
type Preview = {
  title: string;
  html: string;
  meta: { clientId: string; projectId: string | null; quoteUpdatedAt: string | null };
  values: Record<string, string>;
  fieldLabels: Record<string, string>;
  checklist: { key: string; label: string; where: string }[];
  /** contrato refeito: número com o sufixo (377-1) e o aviso que sai no início do PDF */
  revision?: { number: string; version: number; notice: string } | null;
  options: { chosen: Options; orderTypes: { code: string; label: string; days: number | null }[]; baseDays: number | null };
};
type SavedText = { templateId: string; doc: DocBlock[]; savedAt: string; savedBy: string | null; documentId: string | null; options?: Options | null } | null;
type Generated = { id: string; fileName: string; requiresSignature: boolean; missing: string[]; version?: number };
type Target = { clientId: string; projectId: string | null };
type Draft = { title: string; html: string; savedAt: string | null; target: Target; fields: { values: Record<string, string>; labels: Record<string, string> } };
/** o que mudou no sistema desde o texto salvo */
type Change = { label: string; from: string; to: string; edited: boolean };
type Step =
  | { kind: "prepare"; preview: Preview; target: Target; options: Options }
  | { kind: "changed"; preview: Preview; target: Target; saved: NonNullable<SavedText>; changes: Change[]; tables: string[]; legacy: boolean };

// a data do contrato muda todo dia: não conta como "mudou no sistema"
const VOLATILE = new Set(["contrato.data", "contrato.dataExtenso"]);
const stable = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([k]) => !VOLATILE.has(k)));

const sameOptions = (a: Options, b: Options) => a.tipoPedido === b.tipoPedido && (a.prazoDias ?? null) === (b.prazoDias ?? null) && a.preMontagem === b.preMontagem;

/** Tabelas do HTML do contrato, em blocos (para comparar o quadro salvo com o de agora). */
function tablesOf(html: string): Extract<DocBlock, { t: "table" }>[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  return serializeContract(div).filter((b): b is Extract<DocBlock, { t: "table" }> => b.t === "table");
}
const headOf = (t: Extract<DocBlock, { t: "table" }>) => (t.rows[0] ?? []).join("|");
function tableName(t: Extract<DocBlock, { t: "table" }>) {
  const h = headOf(t).toUpperCase();
  if (h.includes("PARCELA")) return "Parcelas e vencimentos";
  if (h.includes("CAIXARIA")) return "Acabamentos";
  if (h.includes("VALOR")) return "Quadro do pedido (ambientes e valores)";
  return "Tabela do contrato";
}

/** Compara o texto salvo com o de agora: campos do sistema e quadros que mudaram. */
function diffSaved(saved: NonNullable<SavedText>, preview: Preview) {
  const changes = new Map<string, Change>();
  const values = stable(preview.values);
  let marked = false;
  for (const b of saved.doc) {
    if (b.t === "table") continue;
    for (const r of b.runs) {
      if (!r.f) continue;
      marked = true;
      const now = values[r.f];
      if (now === undefined || (r.v ?? "") === now || changes.has(r.f)) continue;
      changes.set(r.f, { label: preview.fieldLabels[r.f] ?? r.f, from: r.v ?? "", to: now, edited: r.text !== (r.v ?? "") });
    }
  }
  const fresh = tablesOf(preview.html);
  const tables = saved.doc
    .filter((b): b is Extract<DocBlock, { t: "table" }> => b.t === "table")
    .flatMap((t) => {
      const f = fresh.find((x) => headOf(x) === headOf(t));
      return f && JSON.stringify(f.rows) !== JSON.stringify(t.rows) ? [tableName(t)] : [];
    });
  // adendo aceito depois do texto salvo: a cláusula dos adendos mudou
  const clause = preview.values["clausula.adendos"] ?? "";
  if (clause && !saved.doc.some((b) => b.t !== "table" && b.runs.map((r) => r.text).join("") === clause)) {
    changes.set("clausula.adendos", { label: preview.fieldLabels["clausula.adendos"] ?? "Cláusula dos adendos", from: addendaText(saved.doc), to: clause, edited: false });
  }
  // texto salvo antes das marcas de campo: só dá para avisar pela data
  const legacy = !marked && !!preview.meta.quoteUpdatedAt && preview.meta.quoteUpdatedAt > saved.savedAt;
  return { changes: [...changes.values()], tables: [...new Set(tables)], legacy };
}

/** Parágrafo logo abaixo do título ADENDOS, se houver. */
const addendaAt = (doc: DocBlock[]) => {
  const h = doc.findIndex((b) => b.t === "h" && b.runs.map((r) => r.text).join("").trim().toUpperCase() === "ADENDOS");
  return h >= 0 && doc[h + 1]?.t === "p" ? h + 1 : -1;
};
function addendaText(doc: DocBlock[]) {
  const at = addendaAt(doc);
  const b = at >= 0 ? doc[at] : null;
  return b && b.t === "p" ? b.runs.map((r) => r.text).join("") : "";
}

/** Atualiza o texto salvo: campos não editados à mão recebem o valor de agora; os quadros e a cláusula dos adendos, os de agora. */
function applyUpdate(saved: NonNullable<SavedText>, preview: Preview): DocBlock[] {
  const fresh = tablesOf(preview.html);
  const values = stable(preview.values);
  const clause = preview.values["clausula.adendos"] ?? "";
  const doc = [...saved.doc];
  if (clause) {
    const at = addendaAt(doc);
    const para: DocBlock = { t: "p", runs: [{ text: clause }], align: "justify" };
    if (at >= 0) doc[at] = para;
    else {
      // sem a cláusula ainda: entra depois da tabela das parcelas (ou no fim)
      const pay = doc.map((b) => b.t === "table" && headOf(b).toUpperCase().includes("PARCELA")).lastIndexOf(true);
      doc.splice(pay >= 0 ? pay + 1 : doc.length, 0, { t: "h", runs: [{ text: "ADENDOS" }] }, para);
    }
  }
  return doc.map((b) => {
    if (b.t === "table") return fresh.find((x) => headOf(x) === headOf(b)) ?? b;
    return {
      ...b,
      runs: b.runs.map((r) => {
        const now = r.f ? values[r.f] : undefined;
        if (!r.f || now === undefined || r.text !== (r.v ?? "")) return r;
        return { ...r, text: now, v: now };
      }),
    } as DocBlock;
  });
}

/**
 * Abre o contrato no editor do jeito que a pessoa deixou: se já há texto
 * corrigido para este cliente/projeto, ele volta — e, se o orçamento ou o
 * cadastro mudou desde então, a diferença aparece antes, com a opção de
 * atualizar. Contrato novo passa antes pela lista do que falta cadastrar e
 * pelas opções das cláusulas (tipo de pedido e prazo, pré-montagem).
 */
export function useContractFlow(opts: { templateId: string | null; payload: () => ContractPayload; onGenerated?: (doc: Generated) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  const preview = async (o: Options | null) => (await apiPost<{ data: Preview }>(`/templates/${opts.templateId}/contract/preview`, { ...opts.payload(), opcoes: o })).data;
  const fieldsOf = (p: Preview) => ({ values: stable(p.values), labels: p.fieldLabels });
  const openEditor = (p: Preview, target: Target, html: string, savedAt: string | null, o: Options) => {
    setOptions(o);
    setStep(null);
    setDraft({ title: p.title, html, savedAt, target, fields: fieldsOf(p) });
  };

  const open = useMutation({
    mutationFn: async (fresh?: boolean) => {
      let p = await preview(null);
      const target = { clientId: p.meta.clientId, projectId: p.meta.projectId ?? null };
      const saved = fresh ? null : (await apiGet<{ data: SavedText }>("/templates/contract-text", { clientId: target.clientId, projectId: target.projectId ?? undefined })).data;
      // reabrir com as mesmas opções escolhidas da última vez
      if (saved?.options && !sameOptions(saved.options, p.options.chosen)) p = await preview(saved.options);
      return { p, target, saved };
    },
    onSuccess: ({ p, target, saved }) => {
      if (saved?.doc.length) {
        const d = diffSaved(saved, p);
        if (d.changes.length || d.tables.length || d.legacy) setStep({ kind: "changed", preview: p, target, saved, ...d });
        else openEditor(p, target, blocksToHtml(saved.doc), saved.savedAt, saved.options ?? p.options.chosen);
        return;
      }
      setStep({ kind: "prepare", preview: p, target, options: p.options.chosen });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível abrir o contrato")),
  });

  // contrato novo: opções mudaram → monta de novo com elas antes de abrir
  const prepare = useMutation({
    mutationFn: async (s: Extract<Step, { kind: "prepare" }>) => ({ s, p: sameOptions(s.options, s.preview.options.chosen) ? s.preview : await preview(s.options) }),
    onSuccess: ({ s, p }) => openEditor(p, s.target, p.html, null, s.options),
    onError: (e) => toast.error(errorMessage(e, "Não foi possível montar o contrato")),
  });

  // texto salvo + orçamento mudou: atualiza os campos e quadros e já salva
  const update = useMutation({
    mutationFn: async (s: Extract<Step, { kind: "changed" }>) => {
      const doc = applyUpdate(s.saved, s.preview);
      const o = s.saved.options ?? s.preview.options.chosen;
      await apiPut("/templates/contract-text", { ...s.target, templateId: opts.templateId, doc, options: o });
      return { s, doc, o };
    },
    onSuccess: ({ s, doc, o }) => {
      toast.success("Contrato atualizado com os dados de agora. Confira os campos editados à mão.");
      openEditor(s.preview, s.target, blocksToHtml(doc), new Date().toISOString(), o);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível atualizar o contrato")),
  });

  const autosave = (doc: DocBlock[]) => apiPut("/templates/contract-text", { ...draft!.target, templateId: opts.templateId, doc, options });

  const discard = useMutation({
    mutationFn: (target: Target) => apiPost("/templates/contract-text/discard", target),
    onSuccess: () => {
      setDraft(null);
      setStep(null);
      open.mutate(true);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível descartar")),
  });

  const generate = useMutation({
    mutationFn: (doc: DocBlock[]) => apiPost<{ data: Generated }>(`/templates/${opts.templateId}/contract`, { ...opts.payload(), opcoes: options, doc }),
    onSuccess: (r) => {
      const d = r.data;
      const again = (d.version ?? 1) > 1;
      toast.success(
        `${again ? `Contrato corrigido (versão ${d.version}) e enviado ao portal do cliente; o anterior saiu do portal.` : "Contrato gerado e enviado ao portal do cliente."}${d.requiresSignature ? " Falta a assinatura da loja e a do cliente." : ""}`,
        { duration: 9000 }
      );
      if (d.missing.length) toast.warning(`${d.missing.length} ${d.missing.length > 1 ? "campos do modelo ficaram" : "campo do modelo ficou"} sem valor: ${d.missing.slice(0, 6).join(", ")}. Confira o PDF.`, { duration: 14000 });
      void apiDownload(`/documents/${d.id}/download`, d.fileName).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ["contracts"] });
      setDraft(null);
      opts.onGenerated?.(d);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível gerar o contrato")),
  });

  const busy = prepare.isPending || update.isPending || discard.isPending;
  const stepDialog = step ? (
    <Dialog open onOpenChange={(o) => !o && !busy && setStep(null)}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {step.kind === "prepare" ? (
          <PrepareStep step={step} busy={busy} onChange={(o) => setStep({ ...step, options: o })} onCancel={() => setStep(null)} onOpen={() => prepare.mutate(step)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>O orçamento ou o cadastro mudou</DialogTitle>
              <DialogDescription>Desde a última edição do contrato ({new Date(step.saved.savedAt).toLocaleString("pt-BR")}), estes dados mudaram no sistema. O texto salvo ainda tem os valores antigos.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {step.changes.map((c) => (
                <div key={c.label} className="rounded-md border px-3 py-2">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs"><span className="text-muted-foreground line-through">{c.from || "(vazio)"}</span> → <span className="font-medium">{c.to || "(vazio)"}</span></p>
                  {c.edited && <p className="text-xs text-warning">Este campo foi editado à mão: atualizar não mexe nele (dá para voltar ao valor do sistema no editor).</p>}
                </div>
              ))}
              {step.tables.map((t) => <p key={t} className="rounded-md border px-3 py-2"><span className="font-medium">{t}</span> <span className="text-xs text-muted-foreground">mudou (valores, parcelas ou ambientes)</span></p>)}
              {step.legacy && (
                <p className="flex gap-2 rounded-md bg-warning/10 p-2 text-xs"><AlertTriangle className="h-4 w-4 shrink-0 text-warning" />O orçamento foi alterado depois deste texto. O texto é de antes das marcas de campo, então só os quadros podem ser atualizados; para os valores no texto, regenere do zero.</p>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => confirm("Regenerar do zero? O texto corrigido é descartado e o contrato é montado de novo pelo modelo.") && discard.mutate(step.target)}>Regenerar do zero</Button>
              <Button variant="outline" disabled={busy} onClick={() => openEditor(step.preview, step.target, blocksToHtml(step.saved.doc), step.saved.savedAt, step.saved.options ?? step.preview.options.chosen)}>Manter como está</Button>
              <Button disabled={busy} onClick={() => update.mutate(step)}>{update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Atualizar o texto</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  const editor = draft ? (
    <ContractEditor
      title={draft.title}
      html={draft.html}
      savedAt={draft.savedAt}
      fields={draft.fields}
      description="Corrija o que precisar direto no texto: cláusulas, forma de pagamento, valores e datas das parcelas. Campo do sistema editado à mão fica marcado em amarelo. Tudo é salvo sozinho; o PDF só muda quando você gerar de novo. O financeiro continua com as parcelas do orçamento."
      confirmLabel="Gerar PDF e enviar ao cliente"
      pending={generate.isPending || discard.isPending}
      onAutosave={autosave}
      onDiscard={() => discard.mutate(draft.target)}
      onConfirm={(doc) => generate.mutate(doc)}
      onClose={() => setDraft(null)}
    />
  ) : null;

  return {
    start: () => open.mutate(false),
    opening: open.isPending,
    editor: (
      <>
        {stepDialog}
        {editor}
      </>
    ),
  };
}

/** Antes de abrir um contrato novo: o que falta cadastrar e as opções das cláusulas. */
function PrepareStep({ step, busy, onChange, onCancel, onOpen }: { step: Extract<Step, { kind: "prepare" }>; busy: boolean; onChange: (o: Options) => void; onCancel: () => void; onOpen: () => void }) {
  const o = step.options;
  const types = step.preview.options.orderTypes;
  const suggested = types.find((t) => t.code === o.tipoPedido)?.days ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Conferir antes de abrir o contrato</DialogTitle>
        <DialogDescription>Os dados do cliente, do projeto e do orçamento entram sozinhos. Escolha as opções das cláusulas.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm">
        {step.preview.revision && (
          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="font-medium">Este contrato sai como Nº {step.preview.revision.number} e substitui o anterior</p>
            <p className="text-xs">No início do PDF, em negrito: <span className="italic">“{step.preview.revision.notice}”</span></p>
            <p className="text-xs text-muted-foreground">O texto do aviso é configurado em Modelos de documentos.</p>
          </div>
        )}
        {step.preview.checklist.length > 0 ? (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4 text-warning" /> Falta cadastrar</p>
            <ul className="space-y-0.5 text-xs">
              {step.preview.checklist.map((c) => <li key={c.key}><span className="font-medium">{c.label}</span> <span className="text-muted-foreground">— {c.where}</span></li>)}
            </ul>
            <p className="text-xs text-muted-foreground">Dá para abrir mesmo assim: o campo sai em branco ("____") para preencher no editor.</p>
          </div>
        ) : (
          <p className="text-xs text-success">Cadastro completo: nada falta para o contrato.</p>
        )}
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="ct-tipo">Tipo de pedido</Label>
          <select id="ct-tipo" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={o.tipoPedido} onChange={(e) => onChange({ ...o, tipoPedido: e.target.value, prazoDias: null })}>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}{t.days ? ` — ${t.days} dias úteis` : ""}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="ct-prazo">Prazo de fabricação (dias úteis)</Label>
          <Input id="ct-prazo" type="number" min={1} max={365} className="w-32" value={o.prazoDias ?? suggested ?? ""} onChange={(e) => onChange({ ...o, prazoDias: e.target.value ? Number(e.target.value) : null })} />
          <p className="text-xs text-muted-foreground">{step.preview.options.baseDays ? `O orçamento tem ${step.preview.options.baseDays} dias úteis.` : "O orçamento não tem prazo: informe aqui."}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Pré-montagem na fábrica</p>
          <div className="flex gap-4">
            {[true, false].map((v) => (
              <label key={String(v)} className="flex items-center gap-1.5"><input type="radio" name="ct-pre" checked={o.preMontagem === v} onChange={() => onChange({ ...o, preMontagem: v })} /> {v ? "Sim" : "Não"}</label>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button disabled={busy} onClick={onOpen}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Abrir o contrato</Button>
      </DialogFooter>
    </>
  );
}
