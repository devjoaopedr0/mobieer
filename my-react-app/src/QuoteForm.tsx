import { useState, type FormEvent } from "react";
import { PROJECT_TYPES } from "./content";

type Status = { text: string; error?: boolean } | null;

/**
 * Pedido de orçamento. Vai para /api/orcamento no próprio Worker, que repassa
 * ao sistema da Mobieer (vira lead "Site" no Comercial). Assim o navegador não
 * fala direto com o sistema e não depende de liberação de CORS.
 */
export function QuoteForm() {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    if (!data.name || !data.email || !data.phone || !data.projectType || !data.hasProject) {
      return setStatus({ text: "Preencha todos os campos obrigatórios.", error: true });
    }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) return setStatus({ text: "Confira o e-mail.", error: true });

    setSending(true);
    setStatus({ text: "Enviando…" });
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message || "Não foi possível enviar.");
      form.reset();
      setStatus({ text: body.message || "Recebemos seu pedido! Em breve entraremos em contato." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Não foi possível enviar. Tente pelo WhatsApp.", error: true });
    } finally {
      setSending(false);
    }
  }

  return (
    <form id="formmob" className="quote-form" noValidate onSubmit={onSubmit}>
      <label htmlFor="f-name">Nome <span>*</span></label>
      <input id="f-name" name="name" placeholder="Nome" autoComplete="name" required />
      <label htmlFor="f-email">E-mail <span>*</span></label>
      <input id="f-email" name="email" type="email" placeholder="E-mail" autoComplete="email" required />
      <label htmlFor="f-phone">Telefone <span>*</span></label>
      <input id="f-phone" name="phone" type="tel" placeholder="Telefone" autoComplete="tel" required />
      <label htmlFor="f-type">Tipo de Projeto <span>*</span></label>
      <select id="f-type" name="projectType" required defaultValue="">
        <option value="">Selecione</option>
        {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <label htmlFor="f-has">Já Possui Projeto? <span>*</span></label>
      <select id="f-has" name="hasProject" required defaultValue="">
        <option value="">Selecione</option>
        <option>Sim</option>
        <option>Não</option>
      </select>
      {/* campo invisível contra robôs */}
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button type="submit" disabled={sending}>Enviar</button>
      <p className={status?.error ? "form-msg error" : "form-msg"} role="status">{status?.text}</p>
    </form>
  );
}
