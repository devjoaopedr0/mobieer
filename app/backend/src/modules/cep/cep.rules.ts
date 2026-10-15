/**
 * Busca de endereço pelo CEP: regras puras. Quem consulta é cep.routes.ts,
 * no ViaCEP e, se ele falhar, na BrasilAPI. Só o CEP sai do sistema.
 */

export type CepAddress = { cep: string; street: string; district: string; city: string; state: string };

/** Só os 8 números; nulo quando não é um CEP. */
export function normalizeCep(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 8 && !/^0{8}$/.test(digits) ? digits : null;
}

/** 60000000 -> 60000-000 */
export const formatCep = (digits: string) => `${digits.slice(0, 5)}-${digits.slice(5)}`;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Resposta do ViaCEP ({ logradouro, bairro, localidade, uf } ou { erro: true }). */
export function fromViaCep(cep: string, body: unknown): CepAddress | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.erro === true || b.erro === "true") return null;
  const city = text(b.localidade);
  const state = text(b.uf).toUpperCase();
  if (!city || !state) return null;
  return { cep: formatCep(cep), street: text(b.logradouro), district: text(b.bairro), city, state };
}

/** Resposta da BrasilAPI ({ street, neighborhood, city, state }). */
export function fromBrasilApi(cep: string, body: unknown): CepAddress | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const city = text(b.city);
  const state = text(b.state).toUpperCase();
  if (!city || !state) return null;
  return { cep: formatCep(cep), street: text(b.street), district: text(b.neighborhood), city, state };
}
