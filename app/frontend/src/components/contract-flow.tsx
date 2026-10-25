import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ContractEditor, blocksToHtml, type DocBlock } from "@/components/contract-editor";
import { apiDownload, apiGet, apiPost, apiPut } from "@/services/api";
import { errorMessage } from "@/lib/errors";

/** Dados que montam o contrato (cliente, projeto, orçamento, pagamento). */
export type ContractPayload = { clientId: string; projectId?: string | null; quoteId?: string | null } & Record<string, unknown>;
type Preview = { title: string; html: string; meta: { clientId: string; projectId: string | null } };
type SavedText = { templateId: string; doc: DocBlock[]; savedAt: string; savedBy: string | null; documentId: string | null } | null;
type Generated = { id: string; fileName: string; requiresSignature: boolean; missing: string[]; version?: number };

type Draft = { title: string; html: string; savedAt: string | null; target: { clientId: string; projectId: string | null } };

/**
 * Abre o contrato no editor do jeito que a pessoa deixou: se já há texto
 * corrigido para este cliente/projeto, ele volta; senão o contrato é montado
 * pelo modelo. O texto é salvo enquanto se edita e o PDF sai dele.
 */
export function useContractFlow(opts: { templateId: string | null; payload: () => ContractPayload; onGenerated?: (doc: Generated) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const open = useMutation({
    mutationFn: async (fresh?: boolean) => {
      const preview = (await apiPost<{ data: Preview }>(`/templates/${opts.templateId}/contract/preview`, opts.payload())).data;
      const target = { clientId: preview.meta.clientId, projectId: preview.meta.projectId ?? null };
      const saved = fresh ? null : (await apiGet<{ data: SavedText }>("/templates/contract-text", { clientId: target.clientId, projectId: target.projectId ?? undefined })).data;
      return { title: preview.title, html: saved?.doc.length ? blocksToHtml(saved.doc) : preview.html, savedAt: saved?.savedAt ?? null, target };
    },
    onSuccess: (d) => setDraft(d),
    onError: (e) => toast.error(errorMessage(e, "Não foi possível abrir o contrato")),
  });

  const autosave = (doc: DocBlock[]) =>
    apiPut("/templates/contract-text", { ...draft!.target, templateId: opts.templateId, doc });

  const discard = useMutation({
    mutationFn: () => apiPost("/templates/contract-text/discard", draft!.target),
    onSuccess: () => {
      setDraft(null);
      open.mutate(true);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível descartar")),
  });

  const generate = useMutation({
    mutationFn: (doc: DocBlock[]) => apiPost<{ data: Generated }>(`/templates/${opts.templateId}/contract`, { ...opts.payload(), doc }),
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

  const editor = draft ? (
    <ContractEditor
      title={draft.title}
      html={draft.html}
      savedAt={draft.savedAt}
      description="Corrija o que precisar direto no texto: cláusulas, forma de pagamento, valores e datas das parcelas. Tudo é salvo sozinho; o PDF só muda quando você gerar de novo. O financeiro continua com as parcelas do orçamento."
      confirmLabel="Gerar PDF e enviar ao cliente"
      pending={generate.isPending || discard.isPending}
      onAutosave={autosave}
      onDiscard={() => discard.mutate()}
      onConfirm={(doc) => generate.mutate(doc)}
      onClose={() => setDraft(null)}
    />
  ) : null;

  return { start: () => open.mutate(false), opening: open.isPending, editor };
}
