import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch } from "@/services/api";
import { errorMessage } from "@/lib/utils";
import type { EmployeeStatus, User } from "@/types";

type EmployeeFull = {
  id: string;
  registration: string;
  clockRegistration: string | null;
  fullName: string;
  document: string | null;
  role: string | null;
  sector: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  admittedAt: string;
  terminatedAt: string | null;
  weeklyHours: number;
  status: EmployeeStatus;
  userId: string | null;
};

const todayField = () => new Date().toLocaleDateString("en-CA");
const dateField = (v: string | null) => (v ? v.slice(0, 10) : "");
// meio-dia em UTC: a data não "volta um dia" no fuso de Fortaleza
const noonUtc = (d: string) => `${d}T12:00:00.000Z`;

/**
 * Gestão do colaborador: corrige os dados e muda a situação
 * (ativo, afastado ou desligado). Desligar guarda todo o histórico — o ponto
 * só passa a contar até a data do desligamento.
 */
export function EmployeeManagementDialog({ employeeId, users, onClose }: { employeeId: string; users: User[]; onClose: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["hr", "employee", employeeId],
    queryFn: () => apiGet<{ data: EmployeeFull }>(`/hr/employees/${employeeId}`),
  });
  const e = detail.data?.data;

  const [form, setForm] = useState({ fullName: "", document: "", role: "", sector: "", email: "", phone: "", address: "", admittedAt: "", weeklyHours: "44", userId: "" });
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminatedAt, setTerminatedAt] = useState(todayField());
  const [deactivateUser, setDeactivateUser] = useState(true);

  useEffect(() => {
    if (!e) return;
    setForm({
      fullName: e.fullName,
      document: e.document ?? "",
      role: e.role ?? "",
      sector: e.sector ?? "",
      email: e.email ?? "",
      phone: e.phone ?? "",
      address: e.address ?? "",
      admittedAt: dateField(e.admittedAt),
      weeklyHours: String(e.weeklyHours ?? 44),
      userId: e.userId ?? "",
    });
  }, [e]);

  const done = (msg?: string) => {
    toast.success(msg ?? "Colaborador atualizado");
    void qc.invalidateQueries({ queryKey: ["hr"] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      apiPatch<{ message?: string }>(`/hr/employees/${employeeId}`, {
        fullName: form.fullName,
        document: form.document,
        role: form.role,
        sector: form.sector,
        email: form.email,
        phone: form.phone,
        address: form.address,
        admittedAt: noonUtc(form.admittedAt),
        weeklyHours: Number(form.weeklyHours),
        userId: form.userId,
      }),
    onSuccess: (r) => done(r.message),
    onError: (err) => toast.error(errorMessage(err, "Não foi possível salvar")),
  });

  const changeStatus = useMutation({
    mutationFn: (status: EmployeeStatus) =>
      apiPatch<{ message?: string }>(`/hr/employees/${employeeId}`, {
        status,
        ...(status === "TERMINATED" ? { terminatedAt: noonUtc(terminatedAt), deactivateUser } : {}),
      }),
    onSuccess: (_r, status) =>
      done(
        status === "TERMINATED"
          ? `${e?.fullName}: desligamento registrado`
          : status === "ON_LEAVE"
            ? `${e?.fullName}: marcado como afastado`
            : `${e?.fullName}: reativado`
      ),
    onError: (err) => toast.error(errorMessage(err, "Não foi possível mudar a situação")),
  });

  const hoursValid = Number.isInteger(Number(form.weeklyHours)) && Number(form.weeklyHours) >= 1 && Number(form.weeklyHours) <= 60;
  const canSave = form.fullName.trim().length >= 2 && Boolean(form.admittedAt) && hoursValid;
  const busy = save.isPending || changeStatus.isPending;
  const set = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: ev.target.value });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestão do colaborador — {e ? `${e.fullName} · ${e.registration}` : "colaborador"}</DialogTitle>
        </DialogHeader>
        {!e ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Nome completo" className="sm:col-span-2"><Input value={form.fullName} onChange={set("fullName")} /></F>
              <F label="CPF"><Input inputMode="numeric" placeholder="000.000.000-00" value={form.document} onChange={set("document")} /></F>
              <F label="Telefone"><Input inputMode="tel" value={form.phone} onChange={set("phone")} /></F>
              <F label="Cargo"><Input value={form.role} onChange={set("role")} /></F>
              <F label="Setor"><Input value={form.sector} onChange={set("sector")} /></F>
              <F label="E-mail"><Input type="email" value={form.email} onChange={set("email")} /></F>
              <F label="Admissão"><Input type="date" value={form.admittedAt} onChange={set("admittedAt")} /></F>
              <F label="Endereço" className="sm:col-span-2"><Input value={form.address} onChange={set("address")} /></F>
              <F label="Jornada semanal (h)"><Input type="number" value={form.weeklyHours} onChange={set("weeklyHours")} /></F>
              <F label="Usuário do sistema vinculado">
                <Select value={form.userId || "NONE"} onValueChange={(v) => setForm({ ...form, userId: v === "NONE" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Nenhum</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            </div>
            <div className="flex justify-end">
              <Button disabled={!canSave || busy} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar dados
              </Button>
            </div>

            {/* ---- Situação: afastar, desligar (desativar) ou reativar ---- */}
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                Situação:{" "}
                {e.status === "TERMINATED"
                  ? `desligado desde ${new Date(e.terminatedAt ?? e.admittedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                  : e.status === "ON_LEAVE" ? "afastado" : "ativo"}
              </p>
              {e.status === "TERMINATED" ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Reativar volta a contar o ponto e as férias. O acesso ao sistema (se foi cortado) é liberado em Usuários.
                  </p>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus.mutate("ACTIVE")}>
                    <UserCheck className="mr-2 h-4 w-4" /> Reativar colaborador
                  </Button>
                </div>
              ) : confirmTerminate ? (
                <div className="space-y-2 rounded-md bg-warning/10 p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Data do desligamento</Label>
                    <Input type="date" className="max-w-[12rem]" value={terminatedAt} onChange={(ev) => setTerminatedAt(ev.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="h-3.5 w-3.5" checked={deactivateUser} onChange={(ev) => setDeactivateUser(ev.target.checked)} />
                    Cortar também o acesso ao sistema (se a pessoa tiver usuário ligado)
                  </label>
                  <p className="text-xs text-muted-foreground">O ponto conta só até essa data. Documentos, férias e marcações ficam guardados.</p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmTerminate(false)}>Voltar</Button>
                    <Button size="sm" variant="destructive" disabled={busy || !terminatedAt} onClick={() => changeStatus.mutate("TERMINATED")}>
                      {changeStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirmar desligamento
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  {e.status === "ON_LEAVE" ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus.mutate("ACTIVE")}>
                      <UserCheck className="mr-2 h-4 w-4" /> Retorno do afastamento
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus.mutate("ON_LEAVE")}>
                      Marcar afastado
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmTerminate(true)}>
                    <UserX className="mr-2 h-4 w-4" /> Desativar (desligar)
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
