import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/utils";
import { portalPost } from "@/services/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

/** Primeiro acesso com a senha provisória enviada por e-mail: o cliente cria a senha dele. */
export function PortalChangePasswordPage() {
  const { account, refresh } = usePortalAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    setSubmitting(true);
    try {
      await portalPost("/auth/change-password", { currentPassword: current, newPassword: password });
      await refresh();
      toast.success("Senha criada. Bem-vindo ao portal!");
      navigate("/portal", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível trocar a senha"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <KeyRound className="h-5 w-5" /> Crie sua senha
        </h1>
        <p className="text-sm text-muted-foreground">
          {account?.name ? `Olá, ${account.name}. ` : ""}Você entrou com a senha provisória que enviamos por e-mail. Crie uma senha só sua para continuar.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="cur">Senha provisória (do e-mail)</Label>
          <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Nova senha</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw2">Confirmar nova senha</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar senha e entrar
        </Button>
      </form>
    </div>
  );
}
