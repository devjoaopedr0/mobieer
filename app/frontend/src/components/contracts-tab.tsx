import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileDown, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { useContractFlow, type ContractPayload } from "@/components/contract-flow";
import { quoteContractPayload, type QuoteForContract } from "@/components/quote-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiGet, apiOpen } from "@/services/api";

type Ref = { id: string; name: string };
type Contract = {
  id: string;
  number: string | null;
  title: string;
  version: number;
  createdAt: string;
  signatureStatus: "NOT_REQUIRED" | "PENDING" | "SIGNED";
  signatures: number;
  visibleToClient: boolean;
  templateId: string | null;
  client: Ref;
  project: { id: string; code: string; name: string } | null;
  quote: { id: string; number: string; version: number; status: string } | null;
  edited: boolean;
};
type Pending = { id: string; number: string; version: number; total: number; approvedAt: string | null; client: Ref; project: { id: string; code: string; name: string } | null };

function Signature({ c }: { c: Contract }) {
  if (c.signatureStatus === "SIGNED") return <Badge variant="success">Assinado</Badge>;
  if (c.signatureStatus === "PENDING") return <Badge variant="warning">{c.signatures ? `${c.signatures} assinatura(s), falta(m) outra(s)` : "Aguardando assinaturas"}</Badge>;
  return <Badge variant="muted">Sem assinatura</Badge>;
}

/** Reabre o contrato no editor (do jeito que ficou) e gera a versão corrigida, com o mesmo número. */
function EditContract({ c }: { c: Contract }) {
  // contrato de orçamento: o pagamento e o total saem do orçamento, como na hora de gerar
  const payload = useRef<ContractPayload>({ clientId: c.client.id, projectId: c.project?.id ?? null, visibleToClient: true });
  const flow = useContractFlow({ templateId: c.templateId, payload: () => payload.current });
  const start = async () => {
    try {
      if (c.quote) payload.current = quoteContractPayload((await apiGet<{ data: QuoteForContract }>(`/commercial/quotes/${c.quote.id}`)).data);
      flow.start();
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível abrir o orçamento deste contrato"));
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={!c.templateId || flow.opening} title={c.templateId ? undefined : "O modelo deste contrato foi apagado"} onClick={() => void start()}>
        {flow.opening ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PencilLine className="mr-1 h-4 w-4" />} Editar
      </Button>
      {flow.editor}
    </>
  );
}

/**
 * Aba Contratos do comercial: o passo "Contrato" do caminho do cliente abre
 * aqui. Lista o contrato atual de cada cliente/projeto, para abrir o PDF ou
 * corrigir (pagamento, cláusulas) e gerar de novo, e os aceites ainda sem contrato.
 */
export function ContractsTab() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["contracts"], queryFn: () => apiGet<{ data: { contracts: Contract[]; pending: Pending[] } }>("/templates/contracts").then((r) => r.data) });
  const open = (c: Contract) => apiOpen(`/documents/${c.id}/download`).catch((e) => toast.error(errorMessage(e, "Não foi possível abrir o PDF")));
  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando contratos…</p>;
  if (!q.data) return <p className="p-6 text-sm text-destructive">{errorMessage(q.error, "Não foi possível carregar os contratos")}</p>;
  const { contracts, pending } = q.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Contratos gerados</CardTitle>
          <p className="text-xs text-muted-foreground">Editar reabre o texto do jeito que ficou (forma de pagamento, parcelas, cláusulas). Ao gerar de novo, o número continua o mesmo e a versão anterior sai do portal do cliente.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {contracts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum contrato gerado ainda. No orçamento aceito, use "Gerar ou editar contrato".</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Orçamento</TableHead>
                  <TableHead>Gerado em</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {c.number ?? "—"}
                      {c.version > 1 && <span className="ml-1 text-xs text-muted-foreground">v{c.version}</span>}
                    </TableCell>
                    <TableCell>
                      <p>{c.client.name}</p>
                      {c.project && <p className="text-xs text-muted-foreground">{c.project.code} · {c.project.name}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.quote ? <Link to={`/comercial/orcamentos/${c.quote.id}`} className="hover:underline">{c.quote.number}{c.quote.version > 1 ? ` v${c.quote.version}` : ""}</Link> : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(c.createdAt)}
                      {c.edited && <p className="text-xs text-muted-foreground">texto corrigido salvo</p>}
                    </TableCell>
                    <TableCell><Signature c={c} /></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => void open(c)}><FileDown className="mr-1 h-4 w-4" /> Abrir PDF</Button>
                        {can("documents.manage") && <EditContract c={c} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Aceitos ainda sem contrato</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orçamento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Aceito em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.number}{p.version > 1 ? ` v${p.version}` : ""}</TableCell>
                    <TableCell>{p.client.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.total)}</TableCell>
                    <TableCell>{p.approvedAt ? formatDate(p.approvedAt) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild><Link to={`/comercial/orcamentos/${p.id}`}>Gerar contrato</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
