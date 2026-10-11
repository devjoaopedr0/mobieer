import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiDownload, apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type Template = { id: string; name: string; type: string; hasBody: boolean; active: boolean; requiresSignature: boolean };
type QuoteForContract = {
  number: string;
  total: number;
  paymentTerms: string | null;
  deliveryDays?: number | null;
  client: { id: string; name: string };
  project: { id: string; code: string; name: string } | null;
  payment: { installments: number; downPayment: number };
};

/**
 * Contrato a partir do orçamento aceito, sem sair do comercial: escolhe o modelo,
 * o sistema preenche com os dados do orçamento e manda para o portal do cliente,
 * pedindo a assinatura da loja e do cliente.
 */
export function QuoteContractButton({ quote }: { quote: QuoteForContract }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const templates = useQuery({
    queryKey: ["templates", "contrato"],
    queryFn: () => apiGet<{ data: Template[] }>("/templates"),
    enabled: open,
    select: (r) => r.data.filter((t) => t.active && t.hasBody),
  });
  const list = templates.data ?? [];
  const chosen = list.find((t) => t.id === templateId) ?? (list.length === 1 ? list[0] : null);

  const generate = useMutation({
    mutationFn: () => {
      const rest = Math.max(0, quote.total - quote.payment.downPayment);
      return apiPost<{ data: { id: string; fileName: string; requiresSignature: boolean; missing: string[] }; message?: string }>(`/templates/${chosen!.id}/contract`, {
        clientId: quote.client.id,
        projectId: quote.project?.id ?? null,
        totalOverride: quote.total,
        entrada: quote.payment.downPayment || null,
        parcelas: quote.payment.installments || null,
        valorParcela: quote.payment.installments > 0 ? Math.round((rest / quote.payment.installments) * 100) / 100 : null,
        condicaoPagamento: quote.paymentTerms || null,
        prazoEntregaDias: quote.deliveryDays ?? null,
        title: `Contrato — ${quote.client.name} (${quote.number})`,
        visibleToClient: true,
      });
    },
    onSuccess: (r) => {
      const d = r.data;
      toast.success(d.requiresSignature ? "Contrato gerado e enviado ao portal do cliente. Falta a assinatura da loja e a do cliente." : "Contrato gerado e enviado ao portal do cliente.", { duration: 9000 });
      if (d.missing.length) toast.warning(`${d.missing.length} ${d.missing.length > 1 ? "campos do modelo ficaram" : "campo do modelo ficou"} sem valor: ${d.missing.slice(0, 6).join(", ")}. Confira o PDF.`, { duration: 14000 });
      void apiDownload(`/documents/${d.id}/download`, d.fileName).catch(() => undefined);
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível gerar o contrato")),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSignature className="mr-1 h-4 w-4" /> Gerar contrato
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar contrato — {quote.number}</DialogTitle>
            <DialogDescription>O contrato sai do modelo escolhido, com o cliente, o valor, a entrada, as parcelas e o prazo deste orçamento.</DialogDescription>
          </DialogHeader>
          {templates.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há modelo de contrato com texto. Cadastre em <Link to="/modelos" className="text-primary underline">Modelos de documentos</Link> (um modelo com o corpo do contrato e os marcadores) e volte aqui.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs">Modelo</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={chosen?.id ?? ""} onChange={(e) => setTemplateId(e.target.value)}>
                  {list.length > 1 && <option value="">Selecione</option>}
                  {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {!quote.project && <p className="rounded-md bg-warning/15 p-2 text-xs">Este orçamento não está ligado a um projeto: o contrato fica nos documentos do cliente, mas não aparece dentro de um projeto no portal.</p>}
              <p className="text-xs text-muted-foreground">
                Depois de gerado: {chosen?.requiresSignature === false ? "este modelo não pede assinatura." : "a loja assina em Documentos do projeto (botão Assinar) e o cliente assina no portal."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!chosen || generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar e enviar ao cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
