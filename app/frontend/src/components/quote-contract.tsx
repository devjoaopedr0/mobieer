import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContractFlow, type ContractPayload } from "@/components/contract-flow";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/services/api";

type Template = { id: string; name: string; type: string; hasBody: boolean; active: boolean; requiresSignature: boolean };
export type QuoteForContract = {
  id: string;
  number: string;
  total: number;
  paymentTerms: string | null;
  deliveryDays?: number | null;
  client: { id: string; name: string };
  project: { id: string; code: string; name: string } | null;
  payment: { installments: number; downPayment: number };
};

/** O que o contrato do orçamento leva: cliente, projeto, total e o pagamento combinado. */
export function quoteContractPayload(quote: QuoteForContract): ContractPayload {
  const rest = Math.max(0, quote.total - quote.payment.downPayment);
  return {
    clientId: quote.client.id,
    quoteId: quote.id,
    projectId: quote.project?.id ?? null,
    totalOverride: quote.total,
    entrada: quote.payment.downPayment || null,
    parcelas: quote.payment.installments || null,
    valorParcela: quote.payment.installments > 0 ? Math.round((rest / quote.payment.installments) * 100) / 100 : null,
    condicaoPagamento: quote.paymentTerms || null,
    prazoEntregaDias: quote.deliveryDays ?? null,
    title: `Contrato — ${quote.client.name} (${quote.number})`,
    visibleToClient: true,
  };
}

/**
 * Contrato a partir do orçamento aceito, sem sair do comercial: escolhe o modelo,
 * o sistema preenche com os dados do orçamento, a pessoa corrige o texto no
 * editor (cláusulas, pagamento, parcelas) e o PDF vai para o portal do cliente,
 * pedindo a assinatura da loja e do cliente.
 */
export function QuoteContractButton({ quote }: { quote: QuoteForContract }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const templates = useQuery({
    queryKey: ["templates", "contrato"],
    queryFn: () => apiGet<{ data: Template[] }>("/templates"),
    enabled: open,
    // os modelos do tipo contrato vêm primeiro; sem nenhum, qualquer modelo com texto
    select: (r) => {
      const usable = r.data.filter((t) => t.active && t.hasBody);
      const contracts = usable.filter((t) => t.type === "CONTRATO");
      return contracts.length ? contracts : usable;
    },
  });
  const list = templates.data ?? [];
  const chosen = list.find((t) => t.id === templateId) ?? (list.length === 1 ? list[0] : null);

  const flow = useContractFlow({ templateId: chosen?.id ?? null, payload: () => quoteContractPayload(quote) });

  return (
    <>
      <Button size="sm" variant="outline" disabled={flow.opening} onClick={() => setOpen(true)}>
        {flow.opening ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSignature className="mr-1 h-4 w-4" />} Gerar ou editar contrato
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar contrato — {quote.number}</DialogTitle>
            <DialogDescription>O contrato sai do modelo escolhido, com o cliente, os ambientes e acabamentos, o valor e as parcelas com vencimento deste orçamento. Ele abre no editor para você corrigir o que precisar (inclusive a forma de pagamento) antes de gerar o PDF. Se já foi corrigido antes, abre do jeito que ficou; gerar de novo mantém o número e substitui o anterior.</DialogDescription>
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
            <Button
              disabled={!chosen || flow.opening}
              onClick={() => {
                flow.start();
                setOpen(false);
              }}
            >
              {flow.opening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Abrir no editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.editor}
    </>
  );
}
