import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORIGIN_CODES } from "@/components/crm-parts";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";

type ClientRef = { id: string; name: string };
const ENTRY_STATUS = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
];
const blank = { name: "", phone: "", email: "", origin: "", interest: "", status: "NEW" };
const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/**
 * Cadastro manual de lead: entra como lead, sem criar oportunidade. "Já é
 * cliente" liga o lead a um cadastro existente (a conversão usa esse cliente).
 * Aberto pela ficha do cliente, já vem ligado a ele.
 */
export function LeadDialog({ open, onClose, onCreated, client }: { open: boolean; onClose: () => void; onCreated: () => void; client?: ClientRef | null }) {
  const [f, setF] = useState(blank);
  const [isClient, setIsClient] = useState(false);
  const [picked, setPicked] = useState<ClientRef | null>(null);
  const [term, setTerm] = useState("");
  const linked = client ?? (isClient ? picked : null);
  const found = useQuery({
    queryKey: ["lead-client-search", term],
    queryFn: () => apiGet<{ data: ClientRef[] }>("/business/clients", { search: term }),
    enabled: open && isClient && !client && !picked && term.trim().length >= 2,
  });
  const reset = () => { setF(blank); setIsClient(false); setPicked(null); setTerm(""); };
  const create = useMutation({
    mutationFn: () => apiPost("/commercial/leads", { name: f.name, phone: f.phone || null, email: f.email || null, origin: f.origin || null, interest: f.interest || null, status: f.status, clientId: linked?.id ?? null }),
    onSuccess: () => { toast.success("Lead criado"); reset(); onCreated(); onClose(); },
    onError: (e) => toast.error(errorMessage(e, "Falha ao criar o lead")),
  });
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lead{client ? ` — ${client.name}` : ""}</DialogTitle>
          <DialogDescription>O lead entra no funil como lead. A oportunidade só é criada quando ele for convertido.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="ld-name">Nome</Label><Input id="ld-name" value={f.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label className="text-xs" htmlFor="ld-phone">Telefone</Label><Input id="ld-phone" value={f.phone} onChange={set("phone")} /></div>
          <div className="space-y-1"><Label className="text-xs" htmlFor="ld-email">E-mail</Label><Input id="ld-email" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ld-origin">Origem</Label>
            <select id="ld-origin" className={selectCls} value={f.origin} onChange={set("origin")}>
              <option value="">—</option>
              {ORIGIN_CODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ld-status">Etapa inicial</Label>
            <select id="ld-status" className={selectCls} value={f.status} onChange={set("status")}>
              {ENTRY_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="ld-int">Interesse</Label><Input id="ld-int" value={f.interest} placeholder="Ex.: cozinha e closet" onChange={set("interest")} /></div>
          {!client && (
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={isClient} onChange={(e) => { setIsClient(e.target.checked); setPicked(null); }} /> Já é cliente</label>
              {isClient && (picked ? (
                <div className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{picked.name}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Trocar cliente" onClick={() => setPicked(null)}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" value={term} placeholder="Buscar cliente por nome, CPF/CNPJ ou e-mail" onChange={(e) => setTerm(e.target.value)} />
                  </div>
                  {(found.data?.data ?? []).slice(0, 8).map((c) => (
                    <button key={c.id} type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => { setPicked({ id: c.id, name: c.name }); if (!f.name) setF({ ...f, name: c.name }); }}>{c.name}</button>
                  ))}
                  {found.data && !found.data.data.length && <p className="text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={create.isPending || f.name.trim().length < 2 || (isClient && !client && !picked)} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
